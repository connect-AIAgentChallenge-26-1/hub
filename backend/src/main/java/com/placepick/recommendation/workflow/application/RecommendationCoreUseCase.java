package com.placepick.recommendation.workflow.application;

import com.placepick.recommendation.application.scoring.CandidateRankingResult;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.reason.application.EnrichedPlaceReason;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.reason.application.ReasonEnrichmentResult;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Synchronous recommendation core invoked after explicit user confirmation.
 *
 * <p>Draft extraction is intentionally absent from this type. PP-017 can invoke this use case from
 * the asynchronous worker without bypassing the confirmation boundary.</p>
 */
public final class RecommendationCoreUseCase {

    public static final String LLM_REASON_FALLBACK = "LLM_REASON_FALLBACK";

    private final CandidateRankingService rankingService;
    private final GroundedReasonService reasonService;

    public RecommendationCoreUseCase(
        CandidateRankingService rankingService,
        GroundedReasonService reasonService
    ) {
        this.rankingService = Objects.requireNonNull(rankingService, "rankingService");
        this.reasonService = Objects.requireNonNull(reasonService, "reasonService");
    }

    public RecommendationCoreResult recommend(ConfirmedRecommendationCondition condition) {
        return recommend(condition, RecommendationExecutionContext.initial());
    }

    public RecommendationCoreResult recommend(
        ConfirmedRecommendationCondition condition,
        RecommendationExecutionContext context
    ) {
        Objects.requireNonNull(condition, "condition");
        Objects.requireNonNull(context, "context");
        CandidateRankingResult ranking = rankingService.rank(condition, context);
        ReasonEnrichmentResult reasons = reasonService.enrich(condition, ranking);
        Map<UUID, EnrichedPlaceReason> reasonsByPlace = reasons.places().stream()
            .collect(Collectors.toUnmodifiableMap(
                EnrichedPlaceReason::placeId,
                Function.identity()
            ));

        List<RecommendationCorePlace> places = ranking.places().stream().map(place -> {
            EnrichedPlaceReason reason = Objects.requireNonNull(
                reasonsByPlace.get(place.placeId()),
                "reason for ranked place"
            );
            return new RecommendationCorePlace(
                place,
                reason.statements(),
                reason.cautions(),
                reason.shareText(),
                place.evidence().isEmpty()
                    ? EvidenceLevel.LOCAL_ONLY
                    : EvidenceLevel.LOCAL_AND_BLOG,
                reasons.fallbackUsed() ? ReasonSource.TEMPLATE : ReasonSource.GENERATED
            );
        }).toList();

        LinkedHashSet<String> warnings = ranking.warnings().stream()
            .map(Enum::name)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (reasons.fallbackUsed()) {
            warnings.add(LLM_REASON_FALLBACK);
        }
        return new RecommendationCoreResult(
            places,
            ranking.degraded() || reasons.fallbackUsed(),
            new ArrayList<>(warnings),
            reasons.fallbackUsed(),
            ranking.relaxed(),
            ranking.placeSearchCalls(),
            ranking.blogSearchCalls(),
            1,
            ranking.explorationRound(),
            ranking.usedVariantIds(),
            ranking.searchExhausted()
        );
    }
}
