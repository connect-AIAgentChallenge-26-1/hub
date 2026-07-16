package com.placepick.recommendation.job;

import java.util.UUID;

public record IdempotencyReplay(String requestHash, UUID jobId, int responseStatus) {
}
