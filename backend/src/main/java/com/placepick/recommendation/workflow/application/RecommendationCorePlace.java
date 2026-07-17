package com.placepick.recommendation.workflow.application;

import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.List;
import java.util.Objects;

public record RecommendationCorePlace(
    RankedPlace rankedPlace,
    List<ReasonStatement> reasonStatements,
    List<String> cautions,
    String shareText,
    EvidenceLevel evidenceLevel,
    ReasonSource reasonSource
) {

    public RecommendationCorePlace {
        rankedPlace = Objects.requireNonNull(rankedPlace, "rankedPlace");
        reasonStatements = List.copyOf(reasonStatements);
        if (reasonStatements.isEmpty() || reasonStatements.size() > 3) {
            throw new IllegalArgumentException("A core place requires one to three reason statements.");
        }
        cautions = List.copyOf(cautions);
        shareText = Objects.requireNonNull(shareText, "shareText");
        evidenceLevel = Objects.requireNonNull(evidenceLevel, "evidenceLevel");
        reasonSource = Objects.requireNonNull(reasonSource, "reasonSource");
    }

    public RecommendationCorePlace(
        RankedPlace rankedPlace,
        List<ReasonStatement> reasonStatements,
        List<String> cautions,
        String shareText,
        EvidenceLevel evidenceLevel
    ) {
        this(
            rankedPlace,
            reasonStatements,
            cautions,
            shareText,
            evidenceLevel,
            ReasonSource.GENERATED
        );
    }
}
