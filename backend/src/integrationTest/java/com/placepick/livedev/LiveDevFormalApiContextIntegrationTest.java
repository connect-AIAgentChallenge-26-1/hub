package com.placepick.livedev;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.draft.RecommendationDraftController;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.room.VotingRoomController;
import com.placepick.session.AnonymousSessionController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
@ActiveProfiles("live-dev")
@SpringBootTest
class LiveDevFormalApiContextIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
        DockerImageName.parse(
            "postgres:16.14-bookworm@sha256:da788743d2060767375896de4d646f7576f5911461444b372616f19ea61db2ec"
        ).asCompatibleSubstituteFor("postgres")
    )
        .withDatabaseName("placepick_live_dev_context_test")
        .withUsername("placepick")
        .withPassword("placepick-test");

    @Autowired
    private ApplicationContext context;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("placepick.external.mode", () -> "mock");
        registry.add("placepick.role", () -> "api");
    }

    @Test
    void loadsPlaygroundAndFormalApiWithOneProviderPerPort() {
        assertThat(context.getBeansOfType(LiveDevController.class)).hasSize(1);
        assertThat(context.getBeansOfType(AnonymousSessionController.class)).hasSize(1);
        assertThat(context.getBeansOfType(RecommendationDraftController.class)).hasSize(1);
        assertThat(context.getBeansOfType(VotingRoomController.class)).hasSize(1);
        assertThat(context.getBeansOfType(ConditionExtractionPort.class)).hasSize(1);
        assertThat(context.getBeansOfType(PlaceSearchPort.class)).hasSize(1);
        assertThat(context.getBeansOfType(BlogSearchPort.class)).hasSize(1);
        assertThat(context.getBeansOfType(GroundedReasonGenerationPort.class)).hasSize(1);
    }
}
