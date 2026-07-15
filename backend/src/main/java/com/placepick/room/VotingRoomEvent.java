package com.placepick.room;

import java.time.Instant;
import java.util.UUID;

public record VotingRoomEvent(
    long sequenceId,
    UUID eventId,
    UUID roomId,
    String eventType,
    Instant occurredAt
) {
}
