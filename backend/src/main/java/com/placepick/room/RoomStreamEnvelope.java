package com.placepick.room;

import java.time.Instant;
import java.util.UUID;

public record RoomStreamEnvelope(
    String eventId,
    Instant occurredAt,
    UUID aggregateId,
    RoomView snapshot
) {
}
