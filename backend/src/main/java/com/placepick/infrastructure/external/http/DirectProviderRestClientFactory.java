package com.placepick.infrastructure.external.http;

import java.time.Duration;
import java.util.Objects;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.context.Context;
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
        return baseBuilder(connectTimeout, responseTimeout);
    }

    public static RestClient.Builder jsonBuilder(
        Duration connectTimeout,
        Duration responseTimeout,
        OpenTelemetry openTelemetry
    ) {
        requirePositive(connectTimeout, "connectTimeout");
        requirePositive(responseTimeout, "responseTimeout");
        Objects.requireNonNull(openTelemetry, "openTelemetry");
        return baseBuilder(connectTimeout, responseTimeout)
            .requestInterceptor((request, body, execution) -> {
                openTelemetry.getPropagators().getTextMapPropagator().inject(
                    Context.current(),
                    request.getHeaders(),
                    HttpHeaders::set
                );
                return execution.execute(request, body);
            });
    }

    public static RestClient bearerJson(
        String bearerToken,
        Duration connectTimeout,
        Duration responseTimeout
    ) {
        requireBearer(bearerToken);
        return jsonBuilder(connectTimeout, responseTimeout)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
            .build();
    }

    public static RestClient bearerJson(
        String bearerToken,
        Duration connectTimeout,
        Duration responseTimeout,
        OpenTelemetry openTelemetry
    ) {
        requireBearer(bearerToken);
        return jsonBuilder(connectTimeout, responseTimeout, openTelemetry)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken)
            .build();
    }

    private static RestClient.Builder baseBuilder(
        Duration connectTimeout,
        Duration responseTimeout
    ) {
        return RestClient.builder()
            .requestFactory(NoRetryHttpRequestFactory.create(connectTimeout, responseTimeout))
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);
    }

    private static void requireBearer(String bearerToken) {
        Objects.requireNonNull(bearerToken, "bearerToken");
        if (bearerToken.isBlank()) {
            throw new IllegalArgumentException("Bearer token must not be blank.");
        }
    }

    private static void requirePositive(Duration value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive.");
        }
    }
}
