package com.placepick.room;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class OrganizerCookieFactoryTest {

    private static final Instant NOW = Instant.parse("2026-07-16T00:00:00Z");

    @Test
    void productionCookieKeepsCapabilityOutOfJavaScriptAndCrossSiteRequests() {
        OrganizerCookieFactory factory = new OrganizerCookieFactory(
            true,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );

        String shareToken = "share-token-cookie-path-0000000000000000";
        String cookie = factory.create(
            shareToken,
            "opaque-capability",
            NOW.plusSeconds(3_600)
        ).toString();

        assertThat(cookie).contains("PLACEPICK_ORGANIZER=opaque-capability");
        assertThat(cookie).contains("Path=/api/v1/rooms/" + shareToken);
        assertThat(cookie).contains("Max-Age=3600");
        assertThat(cookie).contains("Secure");
        assertThat(cookie).contains("HttpOnly");
        assertThat(cookie).contains("SameSite=Lax");
    }

    @Test
    void roomSpecificPathsKeepMultipleOrganizerCapabilitiesIndependent() {
        OrganizerCookieFactory factory = new OrganizerCookieFactory(
            true,
            Clock.fixed(NOW, ZoneOffset.UTC)
        );
        String firstToken = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        String secondToken = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

        String first = factory.create(
            firstToken,
            "first-capability",
            NOW.plusSeconds(3_600)
        ).toString();
        String second = factory.create(
            secondToken,
            "second-capability",
            NOW.plusSeconds(3_600)
        ).toString();

        assertThat(first).contains("Path=/api/v1/rooms/" + firstToken)
            .doesNotContain("Path=/api/v1/rooms/" + secondToken);
        assertThat(second).contains("Path=/api/v1/rooms/" + secondToken)
            .doesNotContain("Path=/api/v1/rooms/" + firstToken);
    }
}
