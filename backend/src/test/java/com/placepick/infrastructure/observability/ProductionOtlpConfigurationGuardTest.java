package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import org.junit.jupiter.api.Test;

class ProductionOtlpConfigurationGuardTest {

    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Test
    void acceptsOnlyTheGrafanaCloudOtlpBaseAndClosedProductionIdentity() {
        var guard = new ProductionOtlpConfigurationGuard(
            URI.create("https://otlp-gateway-prod-ap-northeast-0.grafana.net/otlp"),
            "Basic MTIzNDU2OnNlY3JldA==",
            SHA,
            "all"
        );

        assertThatCode(guard::afterPropertiesSet).doesNotThrowAnyException();
    }

    @Test
    void rejectsLookalikeEndpointsCredentialsAndReleaseIdentity() {
        assertInvalid("https://grafana.net.evil.example/otlp", "Basic MTIzNDU2OnNlY3JldA==", SHA);
        assertInvalid("http://tenant.grafana.net/otlp", "Basic MTIzNDU2OnNlY3JldA==", SHA);
        assertInvalid("https://tenant.grafana.net/otlp?token=x", "Basic MTIzNDU2OnNlY3JldA==", SHA);
        assertInvalid("https://tenant.grafana.net/otlp", "Bearer secret", SHA);
        assertInvalid("https://tenant.grafana.net/otlp", "Basic short", "main");
    }

    private static void assertInvalid(String endpoint, String authorization, String sha) {
        var guard = new ProductionOtlpConfigurationGuard(
            URI.create(endpoint),
            authorization,
            sha,
            "all"
        );
        assertThatThrownBy(guard::afterPropertiesSet)
            .isInstanceOf(IllegalStateException.class);
    }
}
