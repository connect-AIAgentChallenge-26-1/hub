package com.placepick.room;

import com.placepick.recommendation.job.RecommendationJobPlace;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface VotingRoomRepository {

    void lockScope(String scope);

    Optional<RoomIdempotencyReplay> findIdempotency(
        UUID sessionId,
        String resourcePath,
        String keyHash
    );

    void insertIdempotency(
        UUID recordId,
        UUID sessionId,
        String resourcePath,
        String keyHash,
        String requestHash,
        UUID roomId,
        UUID placeId,
        int responseStatus,
        Instant responseExpiresAt,
        Instant createdAt,
        Instant expiresAt
    );

    Optional<VotingRoom> findByJobId(UUID jobId);

    Optional<VotingRoom> findByShareTokenHash(String shareTokenHash, boolean forUpdate);

    Optional<VotingRoom> findById(UUID roomId);

    void insertRoom(VotingRoom room, List<RecommendationJobPlace> places);

    List<VotingRoomPlace> findPlaces(UUID roomId);

    boolean hasPlace(UUID roomId, UUID placeId);

    List<VoteAggregate> findAggregate(UUID roomId);

    Map<UUID, VoteValue> findVotes(UUID roomId, UUID sessionId);

    VoteWriteResult putVote(
        UUID roomId,
        UUID placeId,
        UUID sessionId,
        VoteValue value,
        Instant updatedAt
    );

    boolean deleteVote(UUID roomId, UUID placeId, UUID sessionId, Instant updatedAt);

    void finalizeRoom(UUID roomId, UUID placeId, Instant finalizedAt);

    VotingRoomEvent appendEvent(
        UUID eventId,
        UUID roomId,
        String eventType,
        Instant occurredAt
    );

    List<VotingRoomEvent> findEventsAfter(UUID roomId, long sequenceId, int limit);

    long latestEventSequence(UUID roomId);

    record VoteWriteResult(boolean changed, Instant updatedAt) {
    }
}
