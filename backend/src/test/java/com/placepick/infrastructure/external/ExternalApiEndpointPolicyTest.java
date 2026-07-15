package com.placepick.infrastructure.external;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.util.Set;
import org.junit.jupiter.api.Test;

class ExternalApiEndpointPolicyTest {

    private final ExternalApiEndpointPolicy policy = new ExternalApiEndpointPolicy();

    @Test
    void acceptsLoopbackAndComposeMocksForGuardedProfiles() {
        ExternalApiProperties properties = properties(
            "mock",
            "http://localhost:8089",
            "http://mock-llm:8080"
        );

        assertThatCode(() -> policy.requireSafe(Set.of("local"), properties))
            .doesNotThrowAnyException();
    }

    @Test
    void rejectsNonMockModeForGuardedProfiles() {
        ExternalApiProperties properties = properties(
            "real",
            "http://localhost:8089",
            "http://localhost:8090"
        );

        assertThatThrownBy(() -> policy.requireSafe(Set.of("load"), properties))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("PLACEPICK_EXTERNAL_MODE=mock");
    }

    @Test
    void rejectsRealExternalHostsEvenWhenModeSaysMock() {
        ExternalApiProperties properties = properties(
            "mock",
            "https://openapi.naver.com",
            "https://api.openai.com"
        );

        assertThatThrownBy(() -> policy.requireSafe(Set.of("test"), properties))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("approved local mock host");
    }

    @Test
    void allowsDirectModeOnlyWhenTheExplicitLiveDevProfileIsAlsoActive() {
        ExternalApiProperties properties = properties(
            "live-dev",
            "https://naverapihub.apigw.ntruss.com",
            "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1"
        );

        assertThatCode(() -> policy.requireSafe(Set.of("local", "live-dev"), properties))
            .doesNotThrowAnyException();
        assertThatThrownBy(() -> policy.requireSafe(Set.of("local"), properties))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("PLACEPICK_EXTERNAL_MODE=mock");
    }

    @Test
    void productionRequiresTheProductionModeAndApprovedNaverOrigin() {
        ExternalApiProperties properties = properties(
            "production",
            "https://naverapihub.apigw.ntruss.com",
            "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1"
        );

        assertThatCode(() -> policy.requireSafe(Set.of("production"), properties))
            .doesNotThrowAnyException();

        assertThatThrownBy(() -> policy.requireSafe(
            Set.of("production"),
            properties("mock", "https://naverapihub.apigw.ntruss.com", "http://localhost:8090")
        ))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("PLACEPICK_EXTERNAL_MODE=production");

        assertThatThrownBy(() -> policy.requireSafe(
            Set.of("production"),
            properties("production", "https://openapi.naver.com", properties.llmBaseUrl().toString())
        ))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("approved API HUB origin");
    }

    @Test
    void productionCannotBeCombinedWithDevelopmentProfiles() {
        ExternalApiProperties properties = properties(
            "production",
            "https://naverapihub.apigw.ntruss.com",
            "https://mlapi.run/11111111-1111-4111-8111-111111111111/v1"
        );

        assertThatThrownBy(() -> policy.requireSafe(Set.of("production", "live-dev"), properties))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("cannot be combined");
    }

    private ExternalApiProperties properties(String mode, String naverUrl, String llmUrl) {
        return new ExternalApiProperties(mode, URI.create(naverUrl), URI.create(llmUrl));
    }
}
