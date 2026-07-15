package com.placepick.infrastructure.external.http;

import java.time.Duration;
import java.util.Objects;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/** Shared no-retry JSON transport defaults for direct provider adapters. */
public final class DirectProviderRestClientFactory {

    private DirectProviderRestClientFactory() {
    }

    public static RestClient.Builder jsonBuilder(
        Duration connectTimeout,
        Duration responseTimeout
    ) {
        requirePositive(connectTimeout, "connectTimeout");
        requirePositive(responseTimeout, "responseTimeout");
        return RestClient.builder()
            .requestFactory(NoRetryHttpRequestFactory.create(connectTimeout, responseTimeout))
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);
    }

    public static RestClient bearerJson(
        String bearerToken,
        Duration connectTimeout,
        Duration responseTimeout
    ) {
        Objects.requireNonNull(bearerToken, "bearerToken");
        if (bearerToken.isBlank()) {
            throw new IllegalArgumentException("Bearer token must not be blank.");
        }
        return jsonBuilder(connectTimeout, responseTimeout)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
            .build();
    }

    private static void requirePositive(Duration value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive.");
        }
    }
}
