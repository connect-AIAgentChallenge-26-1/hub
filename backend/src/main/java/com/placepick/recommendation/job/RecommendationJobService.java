package com.placepick.recommendation.job;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.draft.DraftStatus;
import com.placepick.draft.RecommendationDraft;
import com.placepick.draft.RecommendationDraftRepository;
import com.placepick.outbox.OutboxEvent;
import com.placepick.outbox.OutboxRepository;
import com.placepick.outbox.RecommendationRequestedEnvelope;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RecommendationJobService {

    private static final Duration MINIMUM_IDEMPOTENCY_TTL = Duration.ofHours(24);

    private final RecommendationDraftRepository draftRepository;
    private final RecommendationJobRepository jobRepository;
    private final OutboxRepository outboxRepository;
    private final RecommendationJobEventPublisher eventPublisher;
    private final TransactionTemplate transactions;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final Duration jobTtl;

    @Autowired
    public RecommendationJobService(
        RecommendationDraftRepository draftRepository,
        RecommendationJobRepository jobRepository,
        OutboxRepository outboxRepository,
        RecommendationJobEventPublisher eventPublisher,
        TransactionTemplate transactions,
        ObjectMapper objectMapper,
        Clock clock,
        @Value("${placepick.job.ttl:PT24H}") String jobTtl
    ) {
        this(
            draftRepository,
            jobRepository,
            outboxRepository,
            eventPublisher,
            transactions,
            objectMapper,
            clock,
            Duration.parse(jobTtl)
        );
    }

    RecommendationJobService(
        RecommendationDraftRepository draftRepository,
        RecommendationJobRepository jobRepository,
        OutboxRepository outboxRepository,
        RecommendationJobEventPublisher eventPublisher,
        TransactionTemplate transactions,
        ObjectMapper objectMapper,
        Clock clock,
        Duration jobTtl
    ) {
        this.draftRepository = Objects.requireNonNull(draftRepository, "draftRepository");
        this.jobRepository = Objects.requireNonNull(jobRepository, "jobRepository");
        this.outboxRepository = Objects.requireNonNull(outboxRepository, "outboxRepository");
        this.eventPublisher = Objects.requireNonNull(eventPublisher, "eventPublisher");
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.clock = Objects.requireNonNull(clock, "clock");
        if (jobTtl == null || jobTtl.compareTo(Duration.ofMinutes(1)) < 0) {
            throw new IllegalArgumentException("Recommendation job TTL is invalid.");
        }
        this.jobTtl = jobTtl;
    }

    public RecommendationJobSubmission create(CreateRecommendationJobCommand command) {
        Objects.requireNonNull(command, "command");
        return Objects.requireNonNull(transactions.execute(status -> createInTransaction(command)));
    }

    public RecommendationJobSnapshot get(UUID jobId, UUID sessionId) {
        Instant now = clock.instant();
        RecommendationJobSnapshot snapshot = jobRepository.findOwned(jobId, sessionId)
            .orElseThrow(() -> failure(
                RecommendationJobErrorCode.JOB_NOT_FOUND,
                "The requested recommendation job was not found."
            ));
        if (!snapshot.expiresAt().isAfter(now)) {
            throw failure(
                RecommendationJobErrorCode.JOB_EXPIRED,
                "The recommendation job has expired."
            );
        }
        return snapshot;
    }

    public RecommendationJobSubscriptionState subscriptionState(
        UUID jobId,
        UUID sessionId
    ) {
        RecommendationJobSubscriptionState state = jobRepository
            .findSubscriptionState(jobId, sessionId)
            .orElseThrow(() -> failure(
                RecommendationJobErrorCode.JOB_NOT_FOUND,
                "The requested recommendation job was not found."
            ));
        if (!state.snapshot().expiresAt().isAfter(clock.instant())) {
            throw failure(
                RecommendationJobErrorCode.JOB_EXPIRED,
                "The recommendation job has expired."
            );
        }
        return state;
    }

    private RecommendationJobSubmission createInTransaction(
        CreateRecommendationJobCommand command
    ) {
        String keyHash = sha256(command.idempotencyKey());
        String requestHash = sha256("{\"draftId\":\"" + command.draftId() + "\"}");
        jobRepository.lockIdempotencyScope(command.sessionId(), keyHash);
        var existing = jobRepository.findIdempotency(command.sessionId(), keyHash);
        if (existing.isPresent()) {
            IdempotencyReplay replay = existing.orElseThrow();
            if (!requestHash.equals(replay.requestHash())) {
                throw failure(
                    RecommendationJobErrorCode.IDEMPOTENCY_KEY_REUSED,
                    "The idempotency key was already used for a different request."
                );
            }
            RecommendationJobSnapshot snapshot = jobRepository
                .findOwned(replay.jobId(), command.sessionId())
                .orElseThrow(() -> failure(
                    RecommendationJobErrorCode.INVALID_STATE,
                    "The idempotent recommendation response is unavailable."
                ));
            return new RecommendationJobSubmission(
                snapshot.jobId(),
                RecommendationJobStatus.ACCEPTED,
                true
            );
        }

        Instant now = clock.instant();
        RecommendationDraft draft = draftRepository
            .findOwnedForUpdate(command.draftId(), command.sessionId())
            .orElseThrow(() -> failure(
                RecommendationJobErrorCode.DRAFT_NOT_FOUND,
                "The requested recommendation draft was not found."
            ));
        validateDraft(draft, now);
        ConfirmedRecommendationCondition condition = confirmed(draft.condition());
        UUID jobId = UUID.randomUUID();
        UUID eventId = UUID.randomUUID();
        Instant jobExpiresAt = now.plus(jobTtl);

        jobRepository.insertJob(
            jobId,
            command.sessionId(),
            draft.id(),
            condition,
            now,
            jobExpiresAt
        );
        if (!draftRepository.consume(draft.id(), command.sessionId(), jobId, now)) {
            throw failure(
                RecommendationJobErrorCode.INVALID_STATE,
                "The draft state changed before the job was created."
            );
        }

        RecommendationRequestedEnvelope envelope = new RecommendationRequestedEnvelope(
            eventId,
            RecommendationRequestedEnvelope.EVENT_TYPE,
            1,
            jobId,
            keyHash,
            now,
            command.traceId(),
            new RecommendationRequestedEnvelope.Payload(jobId)
        );
        outboxRepository.insert(new OutboxEvent(
            eventId,
            "recommendation_job",
            jobId,
            RecommendationRequestedEnvelope.EVENT_TYPE,
            writeJson(envelope),
            now,
            0
        ));
        jobRepository.insertIdempotency(
            UUID.randomUUID(),
            command.sessionId(),
            keyHash,
            requestHash,
            jobId,
            now,
            now.plus(maximum(jobTtl, MINIMUM_IDEMPOTENCY_TTL))
        );
        UUID snapshotEventId = UUID.randomUUID();
        RecommendationJobSnapshot snapshot = jobRepository.lockJob(jobId)
            .orElseThrow(() -> failure(
                RecommendationJobErrorCode.INVALID_STATE,
                "The recommendation job snapshot is unavailable."
            ));
        RecommendationJobEvent accepted = jobRepository.appendEvent(
            snapshotEventId,
            jobId,
            "snapshot",
            writeJson(new RecommendationJobStreamPayload(
                snapshotEventId.toString(),
                now,
                jobId,
                RecommendationJobView.from(snapshot)
            )),
            now
        );
        eventPublisher.publishAfterCommit(accepted);
        return new RecommendationJobSubmission(jobId, RecommendationJobStatus.ACCEPTED, false);
    }

    private static void validateDraft(RecommendationDraft draft, Instant now) {
        if (!draft.expiresAt().isAfter(now)) {
            throw failure(
                RecommendationJobErrorCode.DRAFT_EXPIRED,
                "The recommendation draft has expired."
            );
        }
        if (draft.status() == DraftStatus.CONSUMED) {
            throw failure(
                RecommendationJobErrorCode.DRAFT_ALREADY_CONSUMED,
                "The recommendation draft was already consumed."
            );
        }
        if (draft.status() != DraftStatus.CONFIRMED) {
            throw failure(
                RecommendationJobErrorCode.DRAFT_NOT_CONFIRMED,
                "The recommendation draft must be confirmed first."
            );
        }
    }

    private static ConfirmedRecommendationCondition confirmed(
        DraftRecommendationCondition source
    ) {
        return new ConfirmedRecommendationCondition(
            source.locationQuery(),
            source.placeType(),
            source.placeTypeDetail(),
            source.partySize(),
            source.budgetPerPersonMin(),
            source.budgetPerPersonMax(),
            source.preferences(),
            source.exclusions()
        );
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Recommendation event JSON could not be encoded.", exception);
        }
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static Duration maximum(Duration first, Duration second) {
        return first.compareTo(second) >= 0 ? first : second;
    }

    private static RecommendationJobException failure(
        RecommendationJobErrorCode code,
        String message
    ) {
        return new RecommendationJobException(code, message);
    }
}
