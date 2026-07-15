package com.placepick.recommendation.job.infrastructure;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Provides the single network-free recommendation provider shared by the mock playground and
 * worker. It is intentionally independent of the API/worker role because the developer surface
 * can run while the formal worker role is disabled.
 */
@Configuration(proxyBeanMethods = false)
public class MockRecommendationProviderConfiguration {

    @Bean
    @ConditionalOnMissingBean(DeterministicRecommendationProvider.class)
    @ConditionalOnProperty(
        prefix = "placepick.external",
        name = "mode",
        havingValue = "mock",
        matchIfMissing = true
    )
    DeterministicRecommendationProvider deterministicRecommendationProvider() {
        return new DeterministicRecommendationProvider();
    }
}
