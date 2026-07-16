package com.placepick.recommendation.domain.candidate;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Objects;

final class SourceUrlPolicy {

    private SourceUrlPolicy() {
    }

    static String requireValid(String value) {
        Objects.requireNonNull(value, "sourceUrl");
        String candidate = value.trim();
        if (candidate.isBlank()) {
            throw new IllegalArgumentException("sourceUrl must not be blank.");
        }
        try {
            URI uri = new URI(candidate);
            String scheme = uri.getScheme() == null
                ? ""
                : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!("http".equals(scheme) || "https".equals(scheme)) ||
                uri.getHost() == null || uri.getHost().isBlank() ||
                uri.getUserInfo() != null) {
                throw invalid();
            }
            return candidate;
        } catch (URISyntaxException exception) {
            throw invalid();
        }
    }

    static String nullableValid(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return requireValid(value);
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("sourceUrl must be a valid HTTP(S) URL.");
    }
}
