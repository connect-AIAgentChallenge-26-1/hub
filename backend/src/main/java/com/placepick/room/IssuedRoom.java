package com.placepick.room;

import java.time.Instant;

public record IssuedRoom(
    String shareToken,
    String organizerCapability,
    Instant expiresAt
) {
    @Override
    public String toString() {
        return "IssuedRoom[shareToken=<redacted>, organizerCapability=<redacted>, expiresAt=" +
            expiresAt + "]";
    }
}
