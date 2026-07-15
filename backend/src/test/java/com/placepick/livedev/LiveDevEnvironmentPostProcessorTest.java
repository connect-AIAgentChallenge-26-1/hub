package com.placepick.livedev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.core.env.MapPropertySource;

class LiveDevEnvironmentPostProcessorTest {

    @TempDir
    private Path temporaryDirectory;

    private String originalUserDirectory;

    @BeforeEach
    void useIsolatedWorkingDirectory() {
        originalUserDirectory = System.getProperty("user.dir");
        System.setProperty("user.dir", temporaryDirectory.toString());
    }

    @AfterEach
    void restoreWorkingDirectory() {
        System.setProperty("user.dir", originalUserDirectory);
    }

    @Test
    void mockModeNeverReadsTheLocalLiveFile() throws IOException {
        Files.writeString(temporaryDirectory.resolve(".env.live.local"), "not an assignment");
        MockEnvironment environment = environment("live-dev", "mock");

        assertThatCode(() -> process(environment)).doesNotThrowAnyException();

        assertThat(environment.getPropertySources().contains("placepickLiveDevLocalFile"))
            .isFalse();
    }

    @Test
    void nonLiveDevProfileNeverReadsTheLocalLiveFile() throws IOException {
        Files.writeString(temporaryDirectory.resolve(".env.live.local"), "not an assignment");
        MockEnvironment environment = environment("local", "live-dev");

        assertThatCode(() -> process(environment)).doesNotThrowAnyException();

        assertThat(environment.getPropertySources().contains("placepickLiveDevLocalFile"))
            .isFalse();
    }

    @Test
    void directLiveModeReadsOnlyRequiredValuesAndPreservesEnvironmentPriority()
        throws IOException {
        Files.writeString(
            temporaryDirectory.resolve(".env.live.local"),
            """
                PLACEPICK_EXTERNAL_MODE=live-contract
                NAVER_API_HUB_KEY_ID=fake-local-id
                NAVER_API_HUB_KEY=fake-local-key
                PROXY_TOKEN=fake-file-token
                CHAT_PROXY_URL=https://mlapi.run/11111111-1111-4111-8111-111111111111/v1
                OPENAI_MODEL=openai/gpt-4.1-mini
                EMBEDDING_PROXY_URL=https://mlapi.run/22222222-2222-4222-8222-222222222222/v1
                UNKNOWN_FUTURE_SETTING=ignored
                """
        );
        MockEnvironment environment = environment("live-dev", "live-dev");
        environment.getPropertySources().addFirst(new MapPropertySource(
            "operatingSystemOverride",
            Map.of("PROXY_TOKEN", "fake-environment-token")
        ));

        process(environment);

        assertThat(environment.getProperty("NAVER_API_HUB_KEY_ID")).isEqualTo("fake-local-id");
        assertThat(environment.getProperty("PROXY_TOKEN")).isEqualTo("fake-environment-token");
        assertThat(environment.containsProperty("UNKNOWN_FUTURE_SETTING")).isFalse();
        assertThat(environment.containsProperty("EMBEDDING_PROXY_URL")).isFalse();
    }

    private static MockEnvironment environment(String profile, String mode) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        environment.setProperty("PLACEPICK_EXTERNAL_MODE", mode);
        return environment;
    }

    private static void process(MockEnvironment environment) {
        new LiveDevEnvironmentPostProcessor().postProcessEnvironment(
            environment,
            new SpringApplication(Object.class)
        );
    }
}
