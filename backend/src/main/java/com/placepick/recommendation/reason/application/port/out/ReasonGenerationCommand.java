package com.placepick.recommendation.reason.application.port.out;

import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.reason.domain.ReasonClaim;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public record ReasonGenerationCommand(
    ConfirmedRecommendationCondition condition,
    String slot,
    ReasonPlaceContext place,
    List<ReasonClaim> claims
) {

    public ReasonGenerationCommand {
        condition = Objects.requireNonNull(condition, "condition");
        slot = Objects.requireNonNull(slot, "slot");
        if (!slot.matches("p[1-3]")) {
            throw new IllegalArgumentException("Reason generation slot must be p1, p2, or p3.");
        }
        place = Objects.requireNonNull(place, "place");
        claims = List.copyOf(claims);
        if (claims.size() != place.evidence().size()) {
            throw new IllegalArgumentException(
                "Reason claims must exactly represent the place evidence."
            );
        }
        for (int index = 0; index < claims.size(); index++) {
            ReasonClaim claim = claims.get(index);
            ReasonEvidence evidence = place.evidence().get(index);
            if (!claim.claimId().equals(slot + "-c" + (index + 1)) ||
                !claim.evidenceId().equals(evidence.evidenceId()) ||
                claim.type() != evidence.type() ||
                !claim.title().equals(evidence.title()) ||
                !claim.summary().equals(evidence.summary())) {
                throw new IllegalArgumentException(
                    "Reason claims must preserve evidence order and content."
                );
            }
        }
    }

    public static ReasonGenerationCommand forPlace(
        ConfirmedRecommendationCondition condition,
        int oneBasedPlaceIndex,
        ReasonPlaceContext place
    ) {
        if (oneBasedPlaceIndex < 1 || oneBasedPlaceIndex > 3) {
            throw new IllegalArgumentException("Reason place index must be between one and three.");
        }
        Objects.requireNonNull(place, "place");
        String slot = "p" + oneBasedPlaceIndex;
        List<ReasonClaim> claims = new ArrayList<>();
        for (int index = 0; index < place.evidence().size(); index++) {
            ReasonEvidence evidence = place.evidence().get(index);
            claims.add(new ReasonClaim(
                slot + "-c" + (index + 1),
                evidence.evidenceId(),
                evidence.type(),
                evidence.title(),
                evidence.summary()
            ));
        }
        return new ReasonGenerationCommand(condition, slot, place, claims);
    }

    @Override
    public String toString() {
        return "ReasonGenerationCommand[condition=<redacted>, slot=" + slot +
            ", place=<redacted>, claims=<redacted>]";
    }
}
