package com.placepick.room;

import com.placepick.recommendation.job.RecommendationJobPlace;
import java.time.Instant;

public record FinalResultView(RecommendationJobPlace place, Instant finalizedAt) {
}
