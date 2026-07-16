package com.placepick.room;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record VotingRoom(
    UUID id,
    UUID recommendationJobId,
    String shareTokenHash,
    String organizerCapabilityHash,
    RoomStatus status,
    UUID finalPlaceId,
    Instant finalizedAt,
    Instant createdAt,
    Instant updatedAt,
    Instant expiresAt,
    long version
) {
    public VotingRoom {
        id = Objects.requireNonNull(id, "id");
        recommendationJobId = Objects.requireNonNull(recommendationJobId, "recommendationJobId");
        shareTokenHash = Objects.requireNonNull(shareTokenHash, "shareTokenHash");
        organizerCapabilityHash = Objects.requireNonNull(
            organizerCapabilityHash,
            "organizerCapabilityHash"
        );
        status = Objects.requireNonNull(status, "status");
        createdAt = Objects.requireNonNull(createdAt, "createdAt");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt");
        expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
    }

    public boolean expiredAt(Instant instant) {
        return !expiresAt.isAfter(instant);
    }

    @Override
    public String toString() {
        return "VotingRoom[id=" + id + ", recommendationJobId=" + recommendationJobId +
            ", shareTokenHash=<redacted>, organizerCapabilityHash=<redacted>, status=" +
            status + ", expiresAt=" + expiresAt + "]";
    }
}
