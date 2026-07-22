package com.placepick.web;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.ConditionExtractionRecoveryService;
import com.placepick.recommendation.condition.infrastructure.mock.DeterministicConditionExtractionAdapter;
import com.placepick.infrastructure.observability.LlmProviderDiagnosticMetrics;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ServiceApiConfiguration {

    @Bean
    @ConditionalOnMissingBean
    Clock placepickClock() {
        return Clock.systemUTC();
    }

    @Bean
    @ConditionalOnMissingBean(ConditionExtractionPort.class)
    @ConditionalOnProperty(
        prefix = "placepick.external",
        name = "mode",
        havingValue = "mock",
        matchIfMissing = true
    )
    ConditionExtractionPort mockConditionExtractionPort() {
        return new DeterministicConditionExtractionAdapter();
    }

    @Bean
    @ConditionalOnMissingBean(ConditionExtractionRecoveryService.class)
    ConditionExtractionRecoveryService conditionExtractionRecoveryService(
        ConditionExtractionPort extractionPort,
        LlmProviderDiagnosticMetrics metrics
    ) {
        return new ConditionExtractionRecoveryService(extractionPort, metrics);
    }

    @Bean
    Jackson2ObjectMapperBuilderCustomizer rejectUnknownApiFields() {
        return builder -> builder.featuresToEnable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }
}
