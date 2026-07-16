package com.placepick.analytics;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
final class ProductEventRetentionJob {

    private final ProductEventService eventService;

    ProductEventRetentionJob(ProductEventService eventService) {
        this.eventService = eventService;
    }

    @Scheduled(fixedDelayString = "${placepick.analytics.cleanup-delay:PT1H}")
    void deleteExpiredEvents() {
        eventService.deleteExpired();
    }
}
