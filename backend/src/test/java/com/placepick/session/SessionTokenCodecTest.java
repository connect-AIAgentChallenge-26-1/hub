package com.placepick.session;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SessionTokenCodecTest {

    private final SessionTokenCodec codec = new SessionTokenCodec();

    @Test
    void issuesOpaqueTokensAndOnlyMatchesTheirSha256Hashes() {
        String first = codec.issue();
        String second = codec.issue();
        String hash = codec.hash(first);

        assertThat(first).hasSize(43).doesNotContain("=");
        assertThat(second).isNotEqualTo(first);
        assertThat(hash).hasSize(64).doesNotContain(first);
        assertThat(codec.matches(first, hash)).isTrue();
        assertThat(codec.matches(second, hash)).isFalse();
        assertThat(codec.matches("invalid", hash)).isFalse();
    }

    @Test
    void derivesAProviderSafeIdentifierWithoutExposingTheSessionId() {
        UUID sessionId = UUID.randomUUID();

        String identifier = codec.safetyIdentifier(sessionId);

        assertThat(identifier).matches("[A-Za-z0-9_-]{43}");
        assertThat(identifier).doesNotContain(sessionId.toString());
    }

    @Test
    void productionCookieIsHttpOnlySameSiteLaxAndSecure() {
        String cookie = new SessionCookieFactory(true, Duration.ofHours(24))
            .create(codec.issue())
            .toString();

        assertThat(cookie)
            .contains("PLACEPICK_SESSION=")
            .contains("Path=/")
            .contains("Max-Age=86400")
            .contains("HttpOnly")
            .contains("Secure")
            .contains("SameSite=Lax");
    }
}
