package com.placepick.infrastructure.observability;

import java.net.URI;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Fails production startup for unsafe or incomplete Grafana Cloud exporter configuration. */
@Component
@Profile("production")
public final class ProductionOtlpConfigurationGuard implements InitializingBean {

    private static final Pattern RELEASE_SHA = Pattern.compile("[0-9a-f]{40}");
    private static final Pattern BASIC_AUTHORIZATION = Pattern.compile(
        "Basic [A-Za-z0-9+/]+={0,2}"
    );
    private static final Set<String> ROLES = Set.of("api", "worker", "all");

    private final URI endpoint;
    private final String authorization;
    private final String releaseSha;
    private final String role;

    public ProductionOtlpConfigurationGuard(
        @Value("${GRAFANA_OTLP_ENDPOINT}") URI endpoint,
        @Value("${GRAFANA_OTLP_AUTHORIZATION}") String authorization,
        @Value("${RENDER_GIT_COMMIT}") String releaseSha,
        @Value("${PLACEPICK_ROLE:all}") String role
    ) {
        this.endpoint = endpoint;
        this.authorization = authorization;
        this.releaseSha = releaseSha;
        this.role = role;
    }

    @Override
    public void afterPropertiesSet() {
        requireSafeEndpoint(endpoint);
        requireAuthorization(authorization);
        if (releaseSha == null || !RELEASE_SHA.matcher(
            releaseSha.toLowerCase(Locale.ROOT)
        ).matches()) {
            throw new IllegalStateException("RENDER_GIT_COMMIT must be an exact 40-digit SHA.");
        }
        if (!ROLES.contains(role)) {
            throw new IllegalStateException("PLACEPICK_ROLE must be api, worker, or all.");
        }
    }

    static void requireSafeEndpoint(URI endpoint) {
        if (endpoint == null || !"https".equalsIgnoreCase(endpoint.getScheme())
            || endpoint.getHost() == null || endpoint.getUserInfo() != null
            || endpoint.getPort() != -1 || endpoint.getQuery() != null
            || endpoint.getFragment() != null || endpoint.getPath() == null
            || !endpoint.getPath().endsWith("/otlp")
            || !endpoint.getHost().toLowerCase(Locale.ROOT).endsWith(".grafana.net")) {
            throw new IllegalStateException(
                "GRAFANA_OTLP_ENDPOINT must be the HTTPS Grafana Cloud /otlp base endpoint."
            );
        }
    }

    static void requireAuthorization(String authorization) {
        if (authorization == null || !BASIC_AUTHORIZATION.matcher(authorization).matches()
            || authorization.length() < 16 || authorization.length() > 2_048
            || authorization.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalStateException(
                "GRAFANA_OTLP_AUTHORIZATION must contain the generated Basic credential."
            );
        }
    }
}
