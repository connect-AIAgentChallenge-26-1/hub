package com.placepick.infrastructure.observability;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ObservabilityConfiguration {

    @Bean
    ProviderCallMetrics providerCallMetrics(
        MeterRegistry registry,
        @Value("${placepick.provider.maximum-concurrency:2}") int maximumConcurrency,
        @Value("${placepick.provider.acquire-timeout:PT0.1S}") String acquireTimeout
    ) {
        return new ProviderCallMetrics(
            registry,
            maximumConcurrency,
            Duration.parse(acquireTimeout)
        );
    }
}
