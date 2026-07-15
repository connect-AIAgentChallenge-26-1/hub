package com.placepick.draft;

import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.session.SessionTokenCodec;
import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecommendationDraftService {

    private final RecommendationDraftRepository repository;
    private final ConditionExtractionPort extractionPort;
    private final SessionTokenCodec tokenCodec;
    private final Clock clock;
    private final Duration draftTtl;

    @Autowired
    public RecommendationDraftService(
        RecommendationDraftRepository repository,
        ConditionExtractionPort extractionPort,
        SessionTokenCodec tokenCodec,
        Clock clock,
        @Value("${placepick.draft.ttl:PT30M}") String draftTtl
    ) {
        this(repository, extractionPort, tokenCodec, clock, Duration.parse(draftTtl));
    }

    RecommendationDraftService(
        RecommendationDraftRepository repository,
        ConditionExtractionPort extractionPort,
        SessionTokenCodec tokenCodec,
        Clock clock,
        Duration draftTtl
    ) {
        this.repository = repository;
        this.extractionPort = extractionPort;
        this.tokenCodec = tokenCodec;
        this.clock = clock;
        this.draftTtl = draftTtl;
    }

    /** Provider work is intentionally completed before the single DB insert. */
    public DraftView create(UUID sessionId, String requestText) {
        ExtractionCommand command = new ExtractionCommand(
            requestText,
            tokenCodec.safetyIdentifier(sessionId)
        );
        ExtractionOutcome outcome;
        try {
            outcome = extractionPort.extract(command);
        } catch (RuntimeException exception) {
            throw providerUnavailable();
        }
        if (!outcome.extracted()) {
            throw extractionFailure(outcome.errorCode());
        }

        Instant now = databaseTime();
        RecommendationDraft draft = new RecommendationDraft(
            UUID.randomUUID(),
            sessionId,
            DraftStatus.EXTRACTED,
            command.requestText(),
            outcome.condition(),
            outcome.warnings(),
            null,
            now,
            now,
            now.plus(draftTtl)
        );
        repository.insert(draft);
        return DraftView.from(draft);
    }

    public DraftView get(UUID draftId, UUID sessionId) {
        return DraftView.from(requireAccessible(draftId, sessionId, databaseTime()));
    }

    @Transactional
    public DraftView confirm(
        UUID draftId,
        UUID sessionId,
        ConfirmedRecommendationCondition condition
    ) {
        Instant now = databaseTime();
        RecommendationDraft current = requireAccessible(draftId, sessionId, now);
        if (current.status() == DraftStatus.CONSUMED) {
            throw new ApiException(
                HttpStatus.CONFLICT,
                ApiErrorCode.INVALID_STATE,
                "A consumed draft cannot be changed."
            );
        }

        DraftRecommendationCondition storedCondition = asDraft(condition);
        if (!repository.confirm(draftId, sessionId, storedCondition, now)) {
            throw new ApiException(
                HttpStatus.CONFLICT,
                ApiErrorCode.INVALID_STATE,
                "The draft state changed before it could be confirmed."
            );
        }
        return DraftView.from(new RecommendationDraft(
            current.id(),
            current.sessionId(),
            DraftStatus.CONFIRMED,
            current.requestText(),
            storedCondition,
            current.warnings(),
            current.consumedJobId(),
            current.createdAt(),
            now,
            current.expiresAt()
        ));
    }

    private RecommendationDraft requireAccessible(UUID draftId, UUID sessionId, Instant now) {
        RecommendationDraft draft = repository.findOwned(draftId, sessionId)
            .orElseThrow(() -> new ApiException(
                HttpStatus.NOT_FOUND,
                ApiErrorCode.RESOURCE_NOT_FOUND,
                "The requested draft was not found."
            ));
        if (draft.expiredAt(now)) {
            throw new ApiException(
                HttpStatus.GONE,
                ApiErrorCode.DRAFT_EXPIRED,
                "The recommendation draft has expired."
            );
        }
        return draft;
    }

    private DraftRecommendationCondition asDraft(ConfirmedRecommendationCondition condition) {
        return new DraftRecommendationCondition(
            condition.locationQuery(),
            condition.placeType(),
            condition.placeTypeDetail(),
            condition.partySize(),
            condition.budgetPerPersonMin(),
            condition.budgetPerPersonMax(),
            condition.preferences(),
            condition.exclusions()
        );
    }

    private ApiException extractionFailure(ConditionExtractionErrorCode errorCode) {
        return switch (errorCode) {
            case UNPROCESSABLE_CONDITION -> new ApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                ApiErrorCode.UNPROCESSABLE_CONDITION,
                "A safe recommendation condition could not be extracted."
            );
            case PROVIDER_INVALID_REQUEST, PROVIDER_INVALID_RESPONSE -> new ApiException(
                HttpStatus.BAD_GATEWAY,
                ApiErrorCode.PROVIDER_RESPONSE_INVALID,
                "The condition provider returned an invalid response."
            );
            case PROVIDER_AUTHENTICATION_FAILED, PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE ->
                providerUnavailable();
            case NONE -> throw new IllegalStateException("Failed extraction has no error code.");
        };
    }

    private ApiException providerUnavailable() {
        return new ApiException(
            HttpStatus.SERVICE_UNAVAILABLE,
            ApiErrorCode.PROVIDER_UNAVAILABLE,
            "The condition provider is temporarily unavailable."
        );
    }

    private Instant databaseTime() {
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }
}
