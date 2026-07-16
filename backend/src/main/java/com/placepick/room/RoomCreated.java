package com.placepick.room;

import java.time.Instant;

public record RoomCreated(String shareToken, String shareUrl, Instant expiresAt) {
}
