package com.placepick.lifecycle;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
final class DataRetentionCleanupJob {

    private final DataRetentionService retentionService;

    DataRetentionCleanupJob(DataRetentionService retentionService) {
        this.retentionService = retentionService;
    }

    @Scheduled(fixedDelayString = "${placepick.retention.cleanup-delay:PT1H}")
    void cleanupExpiredData() {
        retentionService.cleanupExpired();
    }
}
