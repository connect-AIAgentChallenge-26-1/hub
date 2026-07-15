package com.placepick.infrastructure.observability;

import com.placepick.recommendation.job.RecommendationJobEmitterRegistry;
import com.placepick.room.VotingRoomEmitterRegistry;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public final class SseMetricsBinder implements MeterBinder {

    private final ObjectProvider<RecommendationJobEmitterRegistry> jobs;
    private final ObjectProvider<VotingRoomEmitterRegistry> rooms;

    public SseMetricsBinder(
        ObjectProvider<RecommendationJobEmitterRegistry> jobs,
        ObjectProvider<VotingRoomEmitterRegistry> rooms
    ) {
        this.jobs = jobs;
        this.rooms = rooms;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        Gauge.builder("placepick.sse.connections", jobs, provider -> {
                RecommendationJobEmitterRegistry value = provider.getIfAvailable();
                return value == null ? 0 : value.activeConnectionCount();
            })
            .tag("stream", "recommendation")
            .register(registry);
        Gauge.builder("placepick.sse.connections", rooms, provider -> {
                VotingRoomEmitterRegistry value = provider.getIfAvailable();
                return value == null ? 0 : value.activeConnectionCount();
            })
            .tag("stream", "room")
            .register(registry);
    }
}
