package com.placepick.recommendation.job;

import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import com.placepick.recommendation.workflow.application.RecommendationCorePlace;
import java.util.List;
import java.util.UUID;

/** Public-safe persisted place projection; internal CandidateKey/searchable text are excluded. */
public record RecommendationJobPlace(
    UUID placeId,
    String name,
    String category,
    String roadAddress,
    String address,
    String sourceUrl,
    int score,
    ScoreBreakdown scoreBreakdown,
    List<ReasonStatement> reasonStatements,
    List<String> cautions,
    String shareText,
    EvidenceLevel evidenceLevel,
    List<String> warnings
) {
    public RecommendationJobPlace {
        reasonStatements = List.copyOf(reasonStatements);
        cautions = List.copyOf(cautions);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    public RecommendationJobPlace(
        UUID placeId,
        String name,
        String category,
        String roadAddress,
        String address,
        String sourceUrl,
        int score,
        ScoreBreakdown scoreBreakdown,
        List<ReasonStatement> reasonStatements,
        List<String> cautions,
        String shareText,
        EvidenceLevel evidenceLevel
    ) {
        this(
            placeId,
            name,
            category,
            roadAddress,
            address,
            sourceUrl,
            score,
            scoreBreakdown,
            reasonStatements,
            cautions,
            shareText,
            evidenceLevel,
            List.of()
        );
    }

    public static RecommendationJobPlace from(
        RecommendationCorePlace source,
        List<String> warnings
    ) {
        var ranked = source.rankedPlace();
        var candidate = ranked.candidate();
        return new RecommendationJobPlace(
            ranked.placeId(),
            candidate.name(),
            candidate.category(),
            candidate.roadAddress(),
            candidate.address(),
            candidate.sourceUrl(),
            ranked.scoreBreakdown().total(),
            ranked.scoreBreakdown(),
            source.reasonStatements(),
            source.cautions(),
            source.shareText(),
            source.evidenceLevel(),
            warnings
        );
    }
}
