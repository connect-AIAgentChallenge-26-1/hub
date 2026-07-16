package com.placepick.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
@Profile("production")
public class ProductionWebSecurityConfiguration implements WebMvcConfigurer {

    private final ProductionOriginPolicy originPolicy;

    public ProductionWebSecurityConfiguration(
        @Value("${APP_PUBLIC_ORIGIN}") String publicOrigin
    ) {
        this.originPolicy = new ProductionOriginPolicy(publicOrigin);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/**")
            .allowedOrigins(originPolicy.allowedOrigin())
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders(
                "Content-Type",
                "X-CSRF-Token",
                "Idempotency-Key",
                "Last-Event-ID"
            )
            .exposedHeaders("Location", "Retry-After", "X-Trace-Id")
            .allowCredentials(true)
            .maxAge(600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ProductionOriginInterceptor(originPolicy))
            .addPathPatterns("/api/v1/**");
    }
}
