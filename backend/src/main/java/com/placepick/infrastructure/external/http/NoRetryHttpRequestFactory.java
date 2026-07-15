package com.placepick.infrastructure.external.http;

import java.time.Duration;
import java.util.Objects;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.Timeout;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;

/**
 * Creates a synchronous HTTP transport with redirects and every Apache-managed retry disabled.
 */
public final class NoRetryHttpRequestFactory {

    private NoRetryHttpRequestFactory() {
    }

    public static ClientHttpRequestFactory create(
        Duration connectTimeout,
        Duration responseTimeout
    ) {
        requirePositive(connectTimeout, "connectTimeout");
        requirePositive(responseTimeout, "responseTimeout");

        PoolingHttpClientConnectionManager connectionManager =
            PoolingHttpClientConnectionManagerBuilder.create()
                .setMaxConnTotal(4)
                .setMaxConnPerRoute(4)
                .setDefaultConnectionConfig(ConnectionConfig.custom()
                    .setConnectTimeout(Timeout.of(connectTimeout))
                    .setSocketTimeout(Timeout.of(responseTimeout))
                    .build())
                .build();

        RequestConfig requestConfig = RequestConfig.custom()
            .setConnectionRequestTimeout(Timeout.of(connectTimeout))
            .setResponseTimeout(Timeout.of(responseTimeout))
            .setRedirectsEnabled(false)
            .build();
        CloseableHttpClient httpClient = HttpClients.custom()
            .setConnectionManager(connectionManager)
            .setDefaultRequestConfig(requestConfig)
            .disableAutomaticRetries()
            .disableRedirectHandling()
            .build();
        return new HttpComponentsClientHttpRequestFactory(httpClient);
    }

    private static void requirePositive(Duration value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(name + " must be positive.");
        }
    }
}
