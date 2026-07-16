package com.placepick.security;

import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import java.net.URI;
import java.util.Locale;
import org.springframework.http.HttpStatus;

final class ProductionOriginPolicy {

    private final String allowedOrigin;

    ProductionOriginPolicy(String configuredOrigin) {
        this.allowedOrigin = canonicalOrigin(configuredOrigin);
    }

    String allowedOrigin() {
        return allowedOrigin;
    }

    void requireAllowed(String presentedOrigin) {
        if (presentedOrigin == null || presentedOrigin.isBlank()) {
            return;
        }
        String candidate;
        try {
            candidate = canonicalOrigin(presentedOrigin);
        } catch (IllegalArgumentException exception) {
            throw rejected();
        }
        if (!allowedOrigin.equals(candidate)) {
            throw rejected();
        }
    }

    private static String canonicalOrigin(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("APP_PUBLIC_ORIGIN is required in production.");
        }
        URI uri = URI.create(value);
        if (!"https".equalsIgnoreCase(uri.getScheme())
            || uri.getHost() == null
            || uri.getUserInfo() != null
            || uri.getQuery() != null
            || uri.getFragment() != null
            || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))
            || (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw new IllegalArgumentException(
                "APP_PUBLIC_ORIGIN must be one canonical HTTPS origin."
            );
        }
        return "https://" + uri.getHost().toLowerCase(Locale.ROOT);
    }

    private static ApiException rejected() {
        return new ApiException(
            HttpStatus.FORBIDDEN,
            ApiErrorCode.ORIGIN_NOT_ALLOWED,
            "The request origin is not allowed."
        );
    }
}
