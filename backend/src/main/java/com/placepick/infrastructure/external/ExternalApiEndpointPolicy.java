package com.placepick.infrastructure.external;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

public final class ExternalApiEndpointPolicy {

    private static final Set<String> GUARDED_PROFILES = Set.of("local", "test", "load");
    private static final URI NAVER_API_HUB = URI.create(
        "https://naverapihub.apigw.ntruss.com"
    );
    private static final Set<String> SAFE_HOSTS = Set.of(
        "localhost",
        "127.0.0.1",
        "::1",
        "mock-naver",
        "mock-llm",
        "wiremock"
    );

    public void requireSafe(Set<String> activeProfiles, ExternalApiProperties properties) {
        if (activeProfiles.contains("production")) {
            requireProductionMode(activeProfiles, properties);
            return;
        }
        if (activeProfiles.contains("live-dev") && "live-dev".equals(properties.mode())) {
            // The direct adapters independently enforce their exact approved HTTPS origins.
            // This exception is limited to the explicit local live-development profile.
            return;
        }
        if (activeProfiles.stream().noneMatch(GUARDED_PROFILES::contains)) {
            return;
        }

        if (!"mock".equals(properties.mode())) {
            throw new IllegalStateException(
                "Profiles local/test/load require PLACEPICK_EXTERNAL_MODE=mock."
            );
        }

        requireMockEndpoint("Naver", properties.naverBaseUrl());
        requireMockEndpoint("LLM", properties.llmBaseUrl());
    }

    private void requireProductionMode(
        Set<String> activeProfiles,
        ExternalApiProperties properties
    ) {
        if (activeProfiles.stream().anyMatch(profile ->
            GUARDED_PROFILES.contains(profile) || "live-dev".equals(profile))) {
            throw new IllegalStateException(
                "The production profile cannot be combined with development or test profiles."
            );
        }
        if (!"production".equals(properties.mode())) {
            throw new IllegalStateException(
                "The production profile requires PLACEPICK_EXTERNAL_MODE=production."
            );
        }
        if (!NAVER_API_HUB.equals(properties.naverBaseUrl())) {
            throw new IllegalStateException(
                "The production Naver base URL must match the approved API HUB origin."
            );
        }
    }

    private void requireMockEndpoint(String provider, URI endpoint) {
        String scheme = endpoint.getScheme();
        String host = endpoint.getHost();

        boolean safeScheme = scheme != null &&
            ("http".equals(scheme.toLowerCase(Locale.ROOT)) ||
             "https".equals(scheme.toLowerCase(Locale.ROOT)));
        boolean safeHost = host != null && SAFE_HOSTS.contains(host.toLowerCase(Locale.ROOT));
        boolean noCredentials = endpoint.getUserInfo() == null;

        if (!endpoint.isAbsolute() || !safeScheme || !safeHost || !noCredentials) {
            throw new IllegalStateException(
                provider + " base URL must target an approved local mock host for local/test/load profiles."
            );
        }
    }
}
