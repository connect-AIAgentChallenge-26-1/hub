package com.placepick.room;

import com.placepick.recommendation.job.RecommendationJobPlace;
import com.placepick.recommendation.job.RecommendationJobRepository;
import com.placepick.recommendation.job.RecommendationJobSnapshot;
import com.placepick.recommendation.job.RecommendationJobStatus;
import com.placepick.session.SessionTokenCodec;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class VotingRoomService {

    private static final int DEFAULT_EXPIRY_HOURS = 72;
    private static final int MAXIMUM_EXPIRY_HOURS = 168;
    private static final Duration IDEMPOTENCY_TTL = Duration.ofHours(24);

    private final VotingRoomRepository roomRepository;
    private final RecommendationJobRepository jobRepository;
    private final VotingRoomEventPublisher eventPublisher;
    private final SessionTokenCodec tokenCodec;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public VotingRoomService(
        VotingRoomRepository roomRepository,
        RecommendationJobRepository jobRepository,
        VotingRoomEventPublisher eventPublisher,
        SessionTokenCodec tokenCodec,
        TransactionTemplate transactions,
        Clock clock
    ) {
        this.roomRepository = Objects.requireNonNull(roomRepository, "roomRepository");
        this.jobRepository = Objects.requireNonNull(jobRepository, "jobRepository");
        this.eventPublisher = Objects.requireNonNull(eventPublisher, "eventPublisher");
        this.tokenCodec = Objects.requireNonNull(tokenCodec, "tokenCodec");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public IssuedRoom create(
        UUID jobId,
        UUID sessionId,
        Integer requestedExpiryHours,
        String idempotencyKey
    ) {
        int expiryHours = requestedExpiryHours == null
            ? DEFAULT_EXPIRY_HOURS
            : requestedExpiryHours;
        if (expiryHours < 1 || expiryHours > MAXIMUM_EXPIRY_HOURS) {
            throw invalidRequest("expiresInHours must be between 1 and 168.");
        }
        String key = requireIdempotencyKey(idempotencyKey);
        return Objects.requireNonNull(transactions.execute(status -> createInTransaction(
            jobId,
            sessionId,
            expiryHours,
            key
        )));
    }

    public RoomView get(String shareToken, UUID sessionId, String organizerCapability) {
        return Objects.requireNonNull(transactions.execute(status -> {
            VotingRoom room = requireRoom(shareToken, true);
            requireNotExpired(room, now());
            return view(room, shareToken, sessionId, organizerCapability);
        }));
    }

    public VoteMutationResult putVote(
        String shareToken,
        UUID sessionId,
        UUID placeId,
        VoteValue value
    ) {
        Objects.requireNonNull(value, "value");
        return Objects.requireNonNull(transactions.execute(status -> {
            Instant now = now();
            VotingRoom room = requireMutableRoom(shareToken, now);
            requireCandidate(room.id(), placeId);
            VotingRoomRepository.VoteWriteResult write = roomRepository.putVote(
                room.id(),
                placeId,
                sessionId,
                value,
                now
            );
            if (write.changed()) {
                publish(roomRepository.appendEvent(
                    UUID.randomUUID(),
                    room.id(),
                    "voteUpdated",
                    now
                ));
            }
            return new VoteMutationResult(
                placeId,
                value,
                roomRepository.findAggregate(room.id()),
                write.updatedAt()
            );
        }));
    }

    public void deleteVote(String shareToken, UUID sessionId, UUID placeId) {
        transactions.executeWithoutResult(status -> {
            Instant now = now();
            VotingRoom room = requireMutableRoom(shareToken, now);
            requireCandidate(room.id(), placeId);
            if (roomRepository.deleteVote(room.id(), placeId, sessionId, now)) {
                publish(roomRepository.appendEvent(
                    UUID.randomUUID(),
                    room.id(),
                    "voteRemoved",
                    now
                ));
            }
        });
    }

    public FinalResultView finalizeRoom(
        String shareToken,
        UUID sessionId,
        String organizerCapability,
        UUID placeId,
        String idempotencyKey
    ) {
        String key = requireIdempotencyKey(idempotencyKey);
        return Objects.requireNonNull(transactions.execute(status -> finalizeInTransaction(
            shareToken,
            sessionId,
            organizerCapability,
            placeId,
            key
        )));
    }

    public FinalResultView getResult(String shareToken) {
        return Objects.requireNonNull(transactions.execute(status -> {
            VotingRoom room = requireRoom(shareToken, true);
            requireNotExpired(room, now());
            if (room.status() != RoomStatus.FINALIZED) {
                throw new ApiException(
                    HttpStatus.CONFLICT,
                    ApiErrorCode.RESULT_NOT_FINALIZED,
                    "The voting room does not have a final result yet."
                );
            }
            return finalResult(room);
        }));
    }

    RoomSubscriptionContext subscription(
        String shareToken,
        UUID sessionId,
        String organizerCapability
    ) {
        return Objects.requireNonNull(transactions.execute(status -> {
            VotingRoom room = requireRoom(shareToken, true);
            requireNotExpired(room, now());
            boolean canFinalize = capabilityMatches(room, organizerCapability);
            return new RoomSubscriptionContext(
                room.id(),
                shareToken,
                sessionId,
                canFinalize,
                room.expiresAt(),
                roomRepository.latestEventSequence(room.id()),
                view(room, shareToken, sessionId, canFinalize)
            );
        }));
    }

    RoomView refreshSubscription(RoomSubscriptionContext context) {
        return Objects.requireNonNull(transactions.execute(status -> {
            VotingRoom room = roomRepository.findById(context.roomId())
                .orElseThrow(() -> notFound());
            requireNotExpired(room, now());
            return view(
                room,
                context.shareToken(),
                context.sessionId(),
                context.canFinalize()
            );
        }));
    }

    private IssuedRoom createInTransaction(
        UUID jobId,
        UUID sessionId,
        int expiryHours,
        String idempotencyKey
    ) {
        String resourcePath = "/api/v1/recommendations/" + jobId + "/rooms";
        String keyHash = sha256Hex(idempotencyKey);
        String requestHash = sha256Hex("{\"expiresInHours\":" + expiryHours + "}");
        roomRepository.lockScope("room-create:" + jobId);

        String shareToken = deriveToken("share", sessionId, jobId, idempotencyKey);
        String organizerCapability = deriveToken(
            "organizer",
            sessionId,
            jobId,
            idempotencyKey
        );
        var replay = roomRepository.findIdempotency(sessionId, resourcePath, keyHash);
        if (replay.isPresent()) {
            RoomIdempotencyReplay stored = replay.orElseThrow();
            if (!requestHash.equals(stored.requestHash())) {
                throw idempotencyConflict();
            }
            VotingRoom existing = roomRepository.findById(stored.roomId())
                .orElseThrow(() -> invalidState("The idempotent room is unavailable."));
            if (!tokenCodec.matches(shareToken, existing.shareTokenHash()) ||
                !tokenCodec.matches(
                    organizerCapability,
                    existing.organizerCapabilityHash()
                )) {
                throw invalidState("The idempotent room credentials are unavailable.");
            }
            return new IssuedRoom(shareToken, organizerCapability, existing.expiresAt());
        }

        RecommendationJobSnapshot job = jobRepository.findOwned(jobId, sessionId)
            .orElseThrow(() -> notFound());
        Instant now = now();
        if (!job.expiresAt().isAfter(now)) {
            throw new ApiException(
                HttpStatus.GONE,
                ApiErrorCode.JOB_EXPIRED,
                "The recommendation job has expired."
            );
        }
        if (job.status() != RecommendationJobStatus.COMPLETED) {
            throw invalidState("Only a completed recommendation job can create a voting room.");
        }
        if (job.places().size() != 3) {
            throw invalidState("A completed recommendation must contain exactly three places.");
        }
        if (roomRepository.findByJobId(jobId).isPresent()) {
            throw invalidState("A voting room already exists for this recommendation job.");
        }

        UUID roomId = UUID.randomUUID();
        Instant expiresAt = now.plus(Duration.ofHours(expiryHours));
        VotingRoom room = new VotingRoom(
            roomId,
            jobId,
            tokenCodec.hash(shareToken),
            tokenCodec.hash(organizerCapability),
            RoomStatus.OPEN,
            null,
            null,
            now,
            now,
            expiresAt,
            0L
        );
        roomRepository.insertRoom(room, job.places());
        publish(roomRepository.appendEvent(
            UUID.randomUUID(),
            roomId,
            "snapshot",
            now
        ));
        roomRepository.insertIdempotency(
            UUID.randomUUID(),
            sessionId,
            resourcePath,
            keyHash,
            requestHash,
            roomId,
            null,
            201,
            expiresAt,
            now,
            latest(now.plus(IDEMPOTENCY_TTL), expiresAt)
        );
        return new IssuedRoom(shareToken, organizerCapability, expiresAt);
    }

    private FinalResultView finalizeInTransaction(
        String shareToken,
        UUID sessionId,
        String organizerCapability,
        UUID placeId,
        String idempotencyKey
    ) {
        Instant now = now();
        VotingRoom room = requireRoom(shareToken, true);
        requireNotExpired(room, now);
        if (!capabilityMatches(room, organizerCapability)) {
            throw new ApiException(
                HttpStatus.FORBIDDEN,
                ApiErrorCode.ORGANIZER_REQUIRED,
                "A valid organizer capability is required."
            );
        }
        requireCandidate(room.id(), placeId);

        String resourcePath = "/api/v1/rooms/" + room.id() + "/final-result";
        String keyHash = sha256Hex(idempotencyKey);
        String requestHash = sha256Hex("{\"placeId\":\"" + placeId + "\"}");
        roomRepository.lockScope("room-finalize:" + room.id() + ':' + keyHash);
        var replay = roomRepository.findIdempotency(sessionId, resourcePath, keyHash);
        if (replay.isPresent() && !requestHash.equals(replay.orElseThrow().requestHash())) {
            throw idempotencyConflict();
        }

        if (room.status() == RoomStatus.FINALIZED) {
            if (!placeId.equals(room.finalPlaceId())) {
                throw finalResultConflict();
            }
            if (replay.isEmpty()) {
                insertFinalIdempotency(
                    room,
                    sessionId,
                    resourcePath,
                    keyHash,
                    requestHash,
                    placeId,
                    room.finalizedAt(),
                    now
                );
            }
            return finalResult(room);
        }

        roomRepository.finalizeRoom(room.id(), placeId, now);
        VotingRoom finalized = new VotingRoom(
            room.id(),
            room.recommendationJobId(),
            room.shareTokenHash(),
            room.organizerCapabilityHash(),
            RoomStatus.FINALIZED,
            placeId,
            now,
            room.createdAt(),
            now,
            room.expiresAt(),
            room.version() + 1
        );
        publish(roomRepository.appendEvent(
            UUID.randomUUID(),
            room.id(),
            "finalized",
            now
        ));
        if (replay.isEmpty()) {
            insertFinalIdempotency(
                room,
                sessionId,
                resourcePath,
                keyHash,
                requestHash,
                placeId,
                now,
                now
            );
        }
        return finalResult(finalized);
    }

    private void insertFinalIdempotency(
        VotingRoom room,
        UUID sessionId,
        String resourcePath,
        String keyHash,
        String requestHash,
        UUID placeId,
        Instant finalizedAt,
        Instant now
    ) {
        roomRepository.insertIdempotency(
            UUID.randomUUID(),
            sessionId,
            resourcePath,
            keyHash,
            requestHash,
            room.id(),
            placeId,
            200,
            finalizedAt,
            now,
            latest(now.plus(IDEMPOTENCY_TTL), room.expiresAt())
        );
    }

    private VotingRoom requireMutableRoom(String shareToken, Instant now) {
        VotingRoom room = requireRoom(shareToken, true);
        requireNotExpired(room, now);
        if (room.status() != RoomStatus.OPEN) {
            throw invalidState("A finalized voting room cannot be changed.");
        }
        return room;
    }

    private VotingRoom requireRoom(String shareToken, boolean forUpdate) {
        if (!tokenCodec.hasValidFormat(shareToken)) {
            throw notFound();
        }
        return roomRepository.findByShareTokenHash(tokenCodec.hash(shareToken), forUpdate)
            .orElseThrow(() -> notFound());
    }

    private void requireNotExpired(VotingRoom room, Instant now) {
        if (room.expiredAt(now)) {
            throw new ApiException(
                HttpStatus.GONE,
                ApiErrorCode.ROOM_EXPIRED,
                "The voting room has expired."
            );
        }
    }

    private void requireCandidate(UUID roomId, UUID placeId) {
        if (placeId == null || !roomRepository.hasPlace(roomId, placeId)) {
            throw invalidRequest("The place is not a candidate in this voting room.");
        }
    }

    private RoomView view(
        VotingRoom room,
        String shareToken,
        UUID sessionId,
        String organizerCapability
    ) {
        return view(
            room,
            shareToken,
            sessionId,
            capabilityMatches(room, organizerCapability)
        );
    }

    private RoomView view(
        VotingRoom room,
        String shareToken,
        UUID sessionId,
        boolean canFinalize
    ) {
        List<RecommendationJobPlace> places = roomRepository.findPlaces(room.id()).stream()
            .map(VotingRoomPlace::place)
            .toList();
        return new RoomView(
            room.id(),
            shareToken,
            room.status(),
            places,
            roomRepository.findAggregate(room.id()),
            roomRepository.findVotes(room.id(), sessionId),
            canFinalize,
            room.finalPlaceId(),
            room.expiresAt()
        );
    }

    private boolean capabilityMatches(VotingRoom room, String organizerCapability) {
        return tokenCodec.matches(organizerCapability, room.organizerCapabilityHash());
    }

    private FinalResultView finalResult(VotingRoom room) {
        RecommendationJobPlace place = roomRepository.findPlaces(room.id()).stream()
            .filter(candidate -> candidate.placeId().equals(room.finalPlaceId()))
            .map(VotingRoomPlace::place)
            .findFirst()
            .orElseThrow(() -> invalidState("The finalized place snapshot is unavailable."));
        return new FinalResultView(place, room.finalizedAt());
    }

    private void publish(VotingRoomEvent event) {
        eventPublisher.publishAfterCommit(event);
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static String requireIdempotencyKey(String value) {
        if (value == null || value.isBlank() || value.length() > 128 ||
            value.codePoints().anyMatch(Character::isISOControl)) {
            throw invalidRequest("A valid Idempotency-Key header is required.");
        }
        return value;
    }

    private static String deriveToken(
        String purpose,
        UUID sessionId,
        UUID resourceId,
        String idempotencyKey
    ) {
        byte[] digest = sha256(
            purpose + '|' + sessionId + '|' + resourceId + '|' + idempotencyKey
        );
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }

    private static String sha256Hex(String value) {
        return HexFormat.of().formatHex(sha256(value));
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static Instant latest(Instant first, Instant second) {
        return first.isAfter(second) ? first : second;
    }

    private static ApiException invalidRequest(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.INVALID_REQUEST, detail);
    }

    private static ApiException notFound() {
        return new ApiException(
            HttpStatus.NOT_FOUND,
            ApiErrorCode.RESOURCE_NOT_FOUND,
            "The requested resource was not found."
        );
    }

    private static ApiException invalidState(String detail) {
        return new ApiException(HttpStatus.CONFLICT, ApiErrorCode.INVALID_STATE, detail);
    }

    private static ApiException idempotencyConflict() {
        return new ApiException(
            HttpStatus.CONFLICT,
            ApiErrorCode.IDEMPOTENCY_KEY_REUSED,
            "The idempotency key was already used for a different request."
        );
    }

    private static ApiException finalResultConflict() {
        return new ApiException(
            HttpStatus.CONFLICT,
            ApiErrorCode.FINAL_RESULT_CONFLICT,
            "The voting room was already finalized with another place."
        );
    }

    record RoomSubscriptionContext(
        UUID roomId,
        String shareToken,
        UUID sessionId,
        boolean canFinalize,
        Instant expiresAt,
        long latestSequenceId,
        RoomView snapshot
    ) {
    }
}
