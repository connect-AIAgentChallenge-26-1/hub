package com.placepick.room;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class VotingRoomEventPublisher {

    private final List<VotingRoomEventListener> listeners = new CopyOnWriteArrayList<>();

    public void addListener(VotingRoomEventListener listener) {
        listeners.add(listener);
    }

    public void removeListener(VotingRoomEventListener listener) {
        listeners.remove(listener);
    }

    public void publishAfterCommit(VotingRoomEvent event) {
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

    private void publish(VotingRoomEvent event) {
        for (VotingRoomEventListener listener : listeners) {
            try {
                listener.onEvent(event);
            } catch (RuntimeException ignored) {
                // Persisted voting_room_event history remains the replay authority.
            }
        }
    }
}
