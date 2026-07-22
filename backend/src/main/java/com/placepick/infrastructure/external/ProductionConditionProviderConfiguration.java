package com.placepick.infrastructure.external;

import com.placepick.infrastructure.external.llm.EliceConditionExtractionClient;
import com.placepick.infrastructure.observability.ObservedProviderPorts;
import com.placepick.infrastructure.observability.LlmProviderDiagnosticMetrics;
import com.placepick.infrastructure.observability.ProviderCallMetrics;
import com.placepick.infrastructure.observability.SafeProviderTracing;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import java.net.URI;
import io.opentelemetry.api.OpenTelemetry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Direct Elice condition extraction used by the deployed product runtime. */
@Configuration(proxyBeanMethods = false)
@Profile("production")
public class ProductionConditionProviderConfiguration {

    @Bean
    @ConditionalOnProperty(
        prefix = "placepick.external",
        name = "mode",
        havingValue = "production"
    )
    ConditionExtractionPort productionConditionExtractionPort(
        @Value("${CHAT_PROXY_URL}") URI chatBaseUrl,
        @Value("${PROXY_TOKEN}") String token,
        @Value("${OPENAI_MODEL:openai/gpt-4.1-mini}") String model,
        ProviderCallMetrics metrics,
        LlmProviderDiagnosticMetrics diagnosticMetrics,
        OpenTelemetry openTelemetry,
        SafeProviderTracing tracing
    ) {
        return ObservedProviderPorts.condition(
            EliceConditionExtractionClient.createObserved(
                chatBaseUrl,
                token,
                model,
                openTelemetry,
                diagnosticMetrics
            ),
            metrics,
            diagnosticMetrics,
            "elice",
            EliceConditionExtractionClient.RESPONSE_TIMEOUT,
            tracing
        );
    }
}
