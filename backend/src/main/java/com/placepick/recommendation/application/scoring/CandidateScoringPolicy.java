package com.placepick.recommendation.application.scoring;

import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.domain.scoring.ScoredCandidate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class CandidateScoringPolicy {

    private static final int RRF_K = 60;
    private static final int MAX_SEARCH_SCORE = 30;
    private static final int MAX_PREFERENCE_SCORE = 30;
    private static final DateTimeFormatter NAVER_DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private final PreferenceEvidenceMatcher preferenceMatcher;
    private final Clock clock;

    public CandidateScoringPolicy() {
        this(new PreferenceEvidenceMatcher(), Clock.systemUTC());
    }

    CandidateScoringPolicy(PreferenceEvidenceMatcher preferenceMatcher, Clock clock) {
        this.preferenceMatcher = preferenceMatcher;
        this.clock = clock;
    }

    public ScoredCandidate score(
        ConfirmedRecommendationCondition condition,
        NormalizedCandidate candidate,
        List<CandidateEvidence> evidence
    ) {
        return score(condition, candidate, evidence, List.of());
    }

    public ScoredCandidate score(
        ConfirmedRecommendationCondition condition,
        NormalizedCandidate candidate,
        List<CandidateEvidence> evidence,
        List<CandidateQueryPlan> plannedVariants
    ) {
        String evidenceText = candidate.searchableText() + " " + evidence.stream()
            .map(value -> value.title() + " " + value.summary())
            .reduce("", (left, right) -> left + " " + right);
        int preferenceScore = preferenceScore(condition, evidenceText);
        int searchScore = searchScore(candidate, plannedVariants);
        int evidenceScore = evidenceQuality(evidence);
        return new ScoredCandidate(
            candidate,
            evidence,
            new ScoreBreakdown(
                candidate.locationConfidence().score(),
                searchScore,
                preferenceScore,
                evidenceScore
            ),
            100
        );
    }

    private int searchScore(
        NormalizedCandidate candidate,
        List<CandidateQueryPlan> plannedVariants
    ) {
        if (candidate.searchObservations().isEmpty()) {
            return 0;
        }
        double raw = candidate.searchObservations().stream()
            .mapToDouble(value -> value.weightBasisPoints() /
                (double) (RRF_K + value.providerRank()))
            .sum();
        double maximum = plannedVariants.stream()
            .mapToDouble(value -> value.weightBasisPoints() / (double) (RRF_K + 1))
            .sum();
        if (maximum <= 0) {
            maximum = candidate.searchObservations().stream()
                .mapToDouble(value -> value.weightBasisPoints() / (double) (RRF_K + 1))
                .sum();
        }
        return boundedRound(MAX_SEARCH_SCORE * raw / maximum, MAX_SEARCH_SCORE);
    }

    private int preferenceScore(
        ConfirmedRecommendationCondition condition,
        String evidenceText
    ) {
        int totalPriority = condition.preferences().stream()
            .mapToInt(value -> value.priority())
            .sum();
        if (totalPriority == 0) {
            return 0;
        }
        int matchedPriority = condition.preferences().stream()
            .filter(value -> preferenceMatcher.matches(value.value(), evidenceText))
            .mapToInt(value -> value.priority())
            .sum();
        return BigDecimal.valueOf(MAX_PREFERENCE_SCORE)
            .multiply(BigDecimal.valueOf(matchedPriority))
            .divide(BigDecimal.valueOf(totalPriority), 0, RoundingMode.HALF_UP)
            .intValueExact();
    }

    private int evidenceQuality(List<CandidateEvidence> evidence) {
        if (evidence.isEmpty()) {
            return 0;
        }
        int count = Math.min(9, evidence.size() * 3);
        int confidence = boundedRound(evidence.stream()
            .mapToInt(CandidateEvidence::entityConfidence)
            .average()
            .orElse(0) * 8 / 100, 8);
        Set<String> sources = new HashSet<>();
        evidence.forEach(value -> sources.add(
            value.authorLink() != null ? value.authorLink() : value.authorName()
        ));
        sources.remove("");
        int diversity = Math.min(5, sources.size() * 2);
        int freshness = evidence.stream().mapToInt(this::freshness).max().orElse(0);
        return Math.min(25, count + confidence + diversity + freshness);
    }

    private int freshness(CandidateEvidence evidence) {
        if (evidence.publishedDate().isBlank()) {
            return 0;
        }
        try {
            LocalDate published = LocalDate.parse(evidence.publishedDate(), NAVER_DATE);
            long days = ChronoUnit.DAYS.between(
                published,
                LocalDate.now(clock.withZone(ZoneOffset.UTC))
            );
            if (days < 0) {
                return 0;
            }
            if (days <= 365) {
                return 3;
            }
            return days <= 1_095 ? 1 : 0;
        } catch (DateTimeParseException exception) {
            return 0;
        }
    }

    private static int boundedRound(double value, int maximum) {
        return Math.max(0, Math.min(maximum, (int) Math.round(value)));
    }
}
