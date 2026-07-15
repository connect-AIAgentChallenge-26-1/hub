package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import com.placepick.recommendation.domain.scoring.ScoredCandidate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Pure application orchestration for PP-014/PP-015. Provider implementations are supplied through
 * ports; this service has no Spring, persistence, or HTTP dependency.
 */
public final class CandidateRankingService {

    private static final int REQUIRED_RESULT_SIZE = 3;
    private static final int PRELIMINARY_POOL_SIZE = 5;

    private final PlaceSearchPort placeSearchPort;
    private final BlogSearchPort blogSearchPort;
    private final CandidateQueryPlanner queryPlanner;
    private final CandidateNormalizer normalizer;
    private final CandidateRanker ranker;
    private final Supplier<UUID> placeIdSupplier;
    private final RecommendationTraceSink traceSink;

    public CandidateRankingService(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        CandidateQueryPlanner queryPlanner,
        CandidateNormalizer normalizer,
        CandidateRanker ranker
    ) {
        this(
            placeSearchPort,
            blogSearchPort,
            queryPlanner,
            normalizer,
            ranker,
            UUID::randomUUID,
            RecommendationTraceSink.none()
        );
    }

    public CandidateRankingService(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        CandidateQueryPlanner queryPlanner,
        CandidateNormalizer normalizer,
        CandidateRanker ranker,
        RecommendationTraceSink traceSink
    ) {
        this(
            placeSearchPort,
            blogSearchPort,
            queryPlanner,
            normalizer,
            ranker,
            UUID::randomUUID,
            traceSink
        );
    }

    public CandidateRankingService(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        CandidateQueryPlanner queryPlanner,
        CandidateNormalizer normalizer,
        CandidateRanker ranker,
        Supplier<UUID> placeIdSupplier
    ) {
        this(
            placeSearchPort,
            blogSearchPort,
            queryPlanner,
            normalizer,
            ranker,
            placeIdSupplier,
            RecommendationTraceSink.none()
        );
    }

    public CandidateRankingService(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        CandidateQueryPlanner queryPlanner,
        CandidateNormalizer normalizer,
        CandidateRanker ranker,
        Supplier<UUID> placeIdSupplier,
        RecommendationTraceSink traceSink
    ) {
        this.placeSearchPort = Objects.requireNonNull(placeSearchPort, "placeSearchPort");
        this.blogSearchPort = Objects.requireNonNull(blogSearchPort, "blogSearchPort");
        this.queryPlanner = Objects.requireNonNull(queryPlanner, "queryPlanner");
        this.normalizer = Objects.requireNonNull(normalizer, "normalizer");
        this.ranker = Objects.requireNonNull(ranker, "ranker");
        this.placeIdSupplier = Objects.requireNonNull(placeIdSupplier, "placeIdSupplier");
        this.traceSink = Objects.requireNonNull(traceSink, "traceSink");
    }

    public CandidateRankingResult rank(ConfirmedRecommendationCondition condition) {
        Objects.requireNonNull(condition, "condition");
        CandidateQueryPlan initialPlan = queryPlanner.initial(condition);
        traceSink.queryPlanned(initialPlan, false);
        List<PlaceSearchItem> localItems = new ArrayList<>(searchPlaces(initialPlan, false));
        int placeSearchCalls = 1;
        boolean relaxed = false;

        List<NormalizedCandidate> eligible = normalizer.normalizeEligible(localItems, condition);
        traceSink.candidatesNormalized(eligible, false);
        if (eligible.size() < REQUIRED_RESULT_SIZE) {
            CandidateQueryPlan relaxedPlan = queryPlanner.relax(initialPlan)
                .orElseThrow(InsufficientCandidatesException::new);
            traceSink.queryPlanned(relaxedPlan, true);
            localItems.addAll(searchPlaces(relaxedPlan, true));
            placeSearchCalls++;
            relaxed = true;
            eligible = normalizer.normalizeEligible(localItems, condition);
            traceSink.candidatesNormalized(eligible, true);
        }
        if (eligible.size() < REQUIRED_RESULT_SIZE) {
            throw new InsufficientCandidatesException();
        }

        List<ScoredCandidate> preliminaryRanking = ranker.rank(
            condition,
            eligible,
            Map.of()
        );
        traceSink.preliminaryRankingCompleted(preliminaryRanking);
        List<NormalizedCandidate> preliminaryPool = preliminaryRanking.stream()
            .limit(PRELIMINARY_POOL_SIZE)
            .map(ScoredCandidate::candidate)
            .toList();

        Map<NormalizedCandidate, List<CandidateEvidence>> evidenceByCandidate = new HashMap<>();
        boolean degraded = false;
        int blogSearchCalls = 0;
        for (NormalizedCandidate candidate : preliminaryPool) {
            try {
                blogSearchCalls++;
                BlogSearchQuery query = new BlogSearchQuery(
                    queryPlanner.blogQuery(candidate.name(), condition.locationQuery()),
                    3
                );
                var searchResult = blogSearchPort.searchBlogs(query);
                traceSink.blogSearchCompleted(candidate, query, searchResult);
                List<CandidateEvidence> evidence = normalizer.normalizeEvidence(
                    candidate,
                    searchResult.items()
                );
                evidenceByCandidate.put(candidate, evidence);
            } catch (SearchProviderException exception) {
                traceSink.blogSearchFailed(candidate, exception.failure().name());
                evidenceByCandidate.clear();
                degraded = true;
                break;
            }
        }

        List<ScoredCandidate> topThree = ranker.rank(
            condition,
            preliminaryPool,
            evidenceByCandidate
        ).stream().limit(REQUIRED_RESULT_SIZE).toList();
        List<RankedPlace> places = topThree.stream()
            .map(candidate -> new RankedPlace(
                placeIdSupplier.get(),
                candidate.candidate(),
                candidate.evidence(),
                candidate.scoreBreakdown()
            ))
            .toList();
        traceSink.finalRankingCompleted(places, degraded);

        Set<RecommendationWarning> warnings = EnumSet.noneOf(RecommendationWarning.class);
        if (condition.budgetPerPersonMin() != null || condition.budgetPerPersonMax() != null) {
            warnings.add(RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE);
        }
        if (degraded) {
            warnings.add(RecommendationWarning.BLOG_EVIDENCE_UNAVAILABLE);
        }
        return new CandidateRankingResult(
            places,
            degraded ? EvidenceLevel.LOCAL_ONLY : EvidenceLevel.LOCAL_AND_BLOG,
            degraded,
            List.copyOf(warnings),
            relaxed,
            placeSearchCalls,
            blogSearchCalls
        );
    }

    private List<PlaceSearchItem> searchPlaces(CandidateQueryPlan plan, boolean relaxed) {
        PlaceSearchQuery query = new PlaceSearchQuery(plan.query(), 5);
        var result = placeSearchPort.searchPlaces(query);
        traceSink.localSearchCompleted(query, result, relaxed);
        return result.items();
    }
}
