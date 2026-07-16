package com.placepick.room;

import java.time.Instant;
import java.util.UUID;

public record RoomIdempotencyReplay(
    String requestHash,
    UUID roomId,
    UUID placeId,
    Instant expiresAt,
    int responseStatus
) {
}
