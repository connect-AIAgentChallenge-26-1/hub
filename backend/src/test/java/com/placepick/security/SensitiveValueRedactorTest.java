package com.placepick.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SensitiveValueRedactorTest {

    @Test
    void removesBearerCookiesProviderKeysAndSessionTokensFromFormattedLogs() {
        String session = "A".repeat(43);
        String organizer = "B".repeat(43);
        String message = "Authorization: Bearer secret.jwt.value "
            + "Cookie=PLACEPICK_SESSION=" + session + " "
            + "Set-Cookie: PLACEPICK_ORGANIZER=" + organizer + "; HttpOnly "
            + "PROXY_TOKEN=proxy-secret X-NCP-APIGW-API-KEY: naver-secret "
            + "X-NCP-APIGW-API-KEY-ID: naver-id csrfToken=csrf-secret";

        String redacted = SensitiveValueRedactor.redact(message);

        assertThat(redacted)
            .doesNotContain(
                "secret.jwt.value",
                session,
                organizer,
                "proxy-secret",
                "naver-secret",
                "naver-id",
                "csrf-secret"
            )
            .contains("<redacted>");
    }

    @Test
    void removesUriUserInfoWithoutLoggingTheCredentialBearingValue() {
        String redisPassword = "redis-password-never-log";
        String databasePassword = "database-password-never-log";
        String message = "Redis connection failed at rediss://default:" + redisPassword
            + "@redis.example:6379 and postgresql://app:" + databasePassword
            + "@database.example/placepick";

        String redacted = SensitiveValueRedactor.redact(message);

        assertThat(redacted)
            .doesNotContain(redisPassword, databasePassword, "default:", "app:")
            .contains(
                "rediss://<redacted>@redis.example:6379",
                "postgresql://<redacted>@database.example/placepick"
            );
    }

    @Test
    void removesProviderRoutingIdentifiersFromAssignmentsAndBareUrls() {
        String route = "11111111-1111-4111-8111-111111111111";
        String message = "CHAT_PROXY_URL=https://mlapi.run/" + route + "/v1 "
            + "request failed at https://mlapi.run/" + route + "/v1/chat/completions";

        String redacted = SensitiveValueRedactor.redact(message);

        assertThat(redacted)
            .doesNotContain(route)
            .contains("CHAT_PROXY_URL=<redacted>", "https://mlapi.run/<redacted-route>");
    }
}
