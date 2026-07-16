package com.placepick.infrastructure.scheduling;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Enables production scheduling while allowing deterministic tests to invoke workers directly. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
    prefix = "placepick.scheduling",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = true
)
public class PlacePickSchedulingConfiguration {
}
