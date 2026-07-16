package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.ScoredCandidate;
import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class CandidateRanker {

    private static final Comparator<ScoredCandidate> ORDER = Comparator
        .comparingInt(ScoredCandidate::score).reversed()
        .thenComparing(Comparator.comparingInt(
            (ScoredCandidate value) -> value.scoreBreakdown().preferenceEvidence()
        ).reversed())
        .thenComparing(Comparator.comparingInt(
            (ScoredCandidate value) -> value.scoreBreakdown().evidenceQuality()
        ).reversed())
        .thenComparing(Comparator.comparingInt(
            (ScoredCandidate value) -> value.scoreBreakdown().searchRelevance()
        ).reversed())
        .thenComparing(value -> value.candidate().candidateKey());

    private final CandidateScoringPolicy scoringPolicy;

    public CandidateRanker(CandidateScoringPolicy scoringPolicy) {
        this.scoringPolicy = scoringPolicy;
    }

    public List<ScoredCandidate> rank(
        ConfirmedRecommendationCondition condition,
        List<NormalizedCandidate> candidates,
        Map<NormalizedCandidate, List<CandidateEvidence>> evidenceByCandidate
    ) {
        return rank(condition, candidates, evidenceByCandidate, List.of());
    }

    public List<ScoredCandidate> rank(
        ConfirmedRecommendationCondition condition,
        List<NormalizedCandidate> candidates,
        Map<NormalizedCandidate, List<CandidateEvidence>> evidenceByCandidate,
        List<CandidateQueryPlan> plannedVariants
    ) {
        return candidates.stream()
            .map(candidate -> scoringPolicy.score(
                condition,
                candidate,
                evidenceByCandidate.getOrDefault(candidate, List.of()),
                plannedVariants
            ))
            .sorted(ORDER)
            .toList();
    }
}
