package com.placepick.recommendation.job;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class RecommendationJobEventPublisher {

    private final List<RecommendationJobEventListener> listeners = new CopyOnWriteArrayList<>();

    public void addListener(RecommendationJobEventListener listener) {
        listeners.add(listener);
    }

    public void removeListener(RecommendationJobEventListener listener) {
        listeners.remove(listener);
    }

    public void publishAfterCommit(RecommendationJobEvent event) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        publish(event);
                    }
                }
            );
        } else {
            publish(event);
        }
    }

    private void publish(RecommendationJobEvent event) {
        for (RecommendationJobEventListener listener : listeners) {
            try {
                listener.onEvent(event);
            } catch (RuntimeException ignored) {
                // Database event history remains authoritative when an in-memory listener fails.
            }
        }
    }
}
