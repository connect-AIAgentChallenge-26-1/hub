package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.application.candidate.CandidateNormalizationResult;
import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.PlaceSearchHit;
import com.placepick.recommendation.application.candidate.SearchObservation;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchSort;
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
import com.placepick.recommendation.workflow.application.RecommendationExecutionContext;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/** Deterministic multi-query retrieval, evidence linking and ranking core. */
public final class CandidateRankingService {

    private static final int MAXIMUM_RESULT_SIZE = 3;

    private final PlaceSearchPort placeSearchPort;
    private final BlogSearchPort blogSearchPort;
    private final CandidateQueryPlanner queryPlanner;
    private final CandidateNormalizer normalizer;
    private final CandidateRanker ranker;
    private final Supplier<UUID> placeIdSupplier;
    private final RecommendationTraceSink traceSink;
    private final RetrievalPolicy retrievalPolicy;

    public CandidateRankingService(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        CandidateQueryPlanner queryPlanner,
        CandidateNormalizer normalizer,
        CandidateRanker ranker
    ) {
        this(
            placeSearchPort, blogSearchPort, queryPlanner, normalizer, ranker,
            UUID::randomUUID, RecommendationTraceSink.none(), RetrievalPolicy.qualityDefaults()
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
            placeSearchPort, blogSearchPort, queryPlanner, normalizer, ranker,
            UUID::randomUUID, traceSink, RetrievalPolicy.qualityDefaults()
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
            placeSearchPort, blogSearchPort, queryPlanner, normalizer, ranker,
            placeIdSupplier, RecommendationTraceSink.none(), RetrievalPolicy.qualityDefaults()
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
        this(
            placeSearchPort, blogSearchPort, queryPlanner, normalizer, ranker,
            placeIdSupplier, traceSink, RetrievalPolicy.qualityDefaults()
        );
    }

    public CandidateRankingService(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        CandidateQueryPlanner queryPlanner,
        CandidateNormalizer normalizer,
        CandidateRanker ranker,
        Supplier<UUID> placeIdSupplier,
        RecommendationTraceSink traceSink,
        RetrievalPolicy retrievalPolicy
    ) {
        this.placeSearchPort = Objects.requireNonNull(placeSearchPort, "placeSearchPort");
        this.blogSearchPort = Objects.requireNonNull(blogSearchPort, "blogSearchPort");
        this.queryPlanner = Objects.requireNonNull(queryPlanner, "queryPlanner");
        this.normalizer = Objects.requireNonNull(normalizer, "normalizer");
        this.ranker = Objects.requireNonNull(ranker, "ranker");
        this.placeIdSupplier = Objects.requireNonNull(placeIdSupplier, "placeIdSupplier");
        this.traceSink = Objects.requireNonNull(traceSink, "traceSink");
        this.retrievalPolicy = Objects.requireNonNull(retrievalPolicy, "retrievalPolicy");
    }

    public CandidateRankingResult rank(ConfirmedRecommendationCondition condition) {
        return rank(condition, RecommendationExecutionContext.initial());
    }

    public CandidateRankingResult rank(
        ConfirmedRecommendationCondition condition,
        RecommendationExecutionContext context
    ) {
        Objects.requireNonNull(condition, "condition");
        Objects.requireNonNull(context, "context");
        List<CandidateQueryPlan> available = queryPlanner.variants(
            condition, context, retrievalPolicy
        );
        int maximumCalls = retrievalPolicy.maximumLocalCalls(context.alternative());
        List<CandidateQueryPlan> planned = available.stream().limit(maximumCalls).toList();
        if (planned.isEmpty()) {
            throw new InsufficientCandidatesException();
        }

        List<PlaceSearchHit> hits = new ArrayList<>();
        CandidateNormalizationResult normalization = null;
        List<NormalizedCandidate> eligible = List.of();
        List<CandidateQueryPlan> executed = new ArrayList<>();
        for (int index = 0; index < planned.size(); index++) {
            CandidateQueryPlan plan = planned.get(index);
            boolean expanded = index >= 2 || context.alternative();
            traceSink.queryPlanned(plan, expanded);
            PlaceSearchQuery query = new PlaceSearchQuery(plan.query(), 5, plan.sort());
            com.placepick.recommendation.application.port.out.PlaceSearchResult result;
            try {
                result = placeSearchPort.searchPlaces(query);
                traceSink.localSearchCompleted(query, result, expanded);
            } catch (SearchProviderException exception) {
                traceSink.localSearchFailed(query, exception.failure().name(), expanded);
                throw exception;
            }
            addHits(hits, result.items(), plan);
            executed.add(plan);
            normalization = normalizer.normalizeSearchHitsWithFunnel(hits, condition);
            eligible = normalization.candidates().stream()
                .filter(value -> !context.excludedCandidateKeys().contains(value.candidateKey()))
                .toList();
            traceSink.candidatesNormalized(
                normalization.candidates(),
                normalization.funnel(),
                expanded
            );
            if (executed.size() >= Math.min(2, planned.size()) &&
                eligible.size() >= retrievalPolicy.targetCandidatePoolSize()) {
                break;
            }
        }
        if (normalization == null) {
            throw new InsufficientCandidatesException();
        }
        boolean expanded = executed.size() > 2 || context.alternative();
        traceSink.candidateFunnelCompleted(normalization.funnel(), expanded);
        if (context.alternative()) {
            traceSink.previouslyExposedCandidatesExcluded(
                normalization.candidates().size() - eligible.size()
            );
        }
        if (eligible.isEmpty()) {
            throw new InsufficientCandidatesException();
        }

        List<ScoredCandidate> preliminaryRanking = ranker.rank(
            condition,
            eligible,
            Map.of(),
            planned
        );
        traceSink.preliminaryRankingCompleted(preliminaryRanking);
        List<NormalizedCandidate> preliminaryPool = preliminaryRanking.stream()
            .limit(retrievalPolicy.preliminaryBlogPoolSize())
            .map(ScoredCandidate::candidate)
            .toList();

        Map<NormalizedCandidate, List<CandidateEvidence>> evidenceByCandidate = new HashMap<>();
        boolean degraded = false;
        int blogSearchCalls = 0;
        for (NormalizedCandidate candidate : preliminaryPool) {
            BlogSearchQuery query = new BlogSearchQuery(
                queryPlanner.blogQuery(candidate.name(), condition.locationQuery()),
                retrievalPolicy.blogDisplayLimit(),
                BlogSearchSort.SIMILARITY
            );
            try {
                blogSearchCalls++;
                var searchResult = blogSearchPort.searchBlogs(query);
                traceSink.blogSearchCompleted(candidate, query, searchResult);
                evidenceByCandidate.put(
                    candidate,
                    normalizer.normalizeEvidence(
                        candidate,
                        searchResult.items(),
                        condition.locationQuery()
                    )
                );
            } catch (SearchProviderException exception) {
                traceSink.blogSearchFailed(candidate, exception.failure().name());
                evidenceByCandidate.put(candidate, List.of());
                degraded = true;
            }
        }

        List<ScoredCandidate> selected = ranker.rank(
            condition,
            preliminaryPool,
            evidenceByCandidate,
            planned
        ).stream().limit(MAXIMUM_RESULT_SIZE).toList();
        List<RankedPlace> places = selected.stream()
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
        if (!condition.exclusions().isEmpty()) {
            warnings.add(RecommendationWarning.EXCLUSION_UNVERIFIED);
        }
        if (degraded) {
            warnings.add(RecommendationWarning.BLOG_EVIDENCE_UNAVAILABLE);
        }
        if (places.size() < MAXIMUM_RESULT_SIZE) {
            warnings.add(RecommendationWarning.PARTIAL_RECOMMENDATION);
        }
        if (places.stream().anyMatch(value ->
            value.candidate().locationConfidence() ==
                com.placepick.recommendation.application.candidate.LocationConfidence.APPROXIMATE
        )) {
            warnings.add(RecommendationWarning.LOCATION_APPROXIMATE);
        }
        LinkedHashSet<String> usedVariantIds = new LinkedHashSet<>(context.usedVariantIds());
        executed.stream().map(CandidateQueryPlan::variantId).forEach(usedVariantIds::add);
        boolean searchExhausted = executed.size() == available.size();
        return new CandidateRankingResult(
            places,
            degraded ? EvidenceLevel.LOCAL_ONLY : EvidenceLevel.LOCAL_AND_BLOG,
            degraded,
            List.copyOf(warnings),
            expanded,
            executed.size(),
            blogSearchCalls,
            context.explorationRound(),
            usedVariantIds,
            searchExhausted
        );
    }

    private static void addHits(
        List<PlaceSearchHit> target,
        List<PlaceSearchItem> items,
        CandidateQueryPlan plan
    ) {
        for (int index = 0; index < items.size(); index++) {
            target.add(new PlaceSearchHit(
                items.get(index),
                new SearchObservation(
                    plan.variantId(),
                    plan.sort(),
                    index + 1,
                    plan.weightBasisPoints()
                )
            ));
        }
    }
}
