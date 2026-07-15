package com.placepick;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("test")
@AutoConfigureObservability(metrics = true, tracing = false)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PlacepickInfrastructureIntegrationTest {

    private static final WireMockServer WIRE_MOCK = startWireMock();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>(
        DockerImageName.parse(
            "redis:7.4.9-bookworm@sha256:b2b95679e3b46fb51864949ed25ea976fc3a6bcc00a40a1bc00d568cb2822e50"
        )
    )
        .withExposedPorts(6379)
        .waitingFor(Wait.forLogMessage(".*Ready to accept connections.*\\n", 1))
        .withStartupTimeout(Duration.ofMinutes(2));

    @LocalServerPort
    private int serverPort;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @AfterAll
    static void stopWireMock() {
        WIRE_MOCK.stop();
    }

    @DynamicPropertySource
    static void infrastructureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", REDIS::getFirstMappedPort);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.external.naver-base-url", WIRE_MOCK::baseUrl);
        registry.add("placepick.external.llm-base-url", WIRE_MOCK::baseUrl);
    }

    @Test
    void exposesThePlannedActuatorHealthSurface() {
        ResponseEntity<String> response = restTemplate.getForEntity(
            "http://localhost:" + serverPort + "/actuator/health",
            String.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("UP");
    }

    @Test
    void exposesPrometheusAndSafeRevisionInfoAndRejectsUnsupportedCollectionGet() {
        ResponseEntity<String> prometheus = restTemplate.getForEntity(
            "http://localhost:" + serverPort + "/actuator/prometheus",
            String.class
        );
        ResponseEntity<String> info = restTemplate.getForEntity(
            "http://localhost:" + serverPort + "/actuator/info",
            String.class
        );
        ResponseEntity<String> recommendation = restTemplate.getForEntity(
            "http://localhost:" + serverPort + "/api/v1/recommendations",
            String.class
        );

        assertThat(prometheus.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(prometheus.getBody()).contains("# HELP");
        assertThat(info.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(info.getBody()).contains("git", "commit", "local");
        assertThat(recommendation.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(recommendation.getHeaders().getAllow())
            .containsExactly(org.springframework.http.HttpMethod.POST);
    }

    @Test
    void connectsToRedisManagedByTestcontainers() {
        redisTemplate.opsForValue().set("placepick:integration:probe", "ok", Duration.ofSeconds(30));

        assertThat(redisTemplate.opsForValue().get("placepick:integration:probe")).isEqualTo("ok");
    }

    @Test
    void usesWireMockInsteadOfARealProvider() {
        ResponseEntity<String> response = new TestRestTemplate().getForEntity(
            WIRE_MOCK.baseUrl() + "/health",
            String.class
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("mock-ok");
    }

    private static WireMockServer startWireMock() {
        WireMockServer server = new WireMockServer(WireMockConfiguration.options().dynamicPort());
        server.start();
        server.stubFor(get(urlEqualTo("/health"))
            .willReturn(aResponse()
                .withHeader("Content-Type", "application/json")
                .withBody("{\"status\":\"mock-ok\"}")));
        return server;
    }
}
