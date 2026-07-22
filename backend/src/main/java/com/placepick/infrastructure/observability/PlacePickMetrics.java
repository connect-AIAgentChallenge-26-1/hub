package com.placepick.infrastructure.observability;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Component;

/** Low-cardinality domain metrics. Resource IDs, tokens, queries, and provider payloads are banned. */
@Component
public class PlacePickMetrics {

    private final MeterRegistry registry;

    public PlacePickMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    public void rateLimitRejected(String scope) {
        registry.counter(
            "placepick.rate.limit.rejected",
            "scope", closedRateLimitScope(scope)
        ).increment();
    }

    public void securityRejected(String reason) {
        registry.counter(
            "placepick.security.rejections",
            "reason", closedSecurityReason(reason)
        ).increment();
    }

    public void jobStage(String stage) {
        registry.counter(
            "placepick.job.stage.events",
            "stage", closedJobStage(stage)
        ).increment();
    }

    public void jobStageDuration(String stage, Duration duration) {
        Timer.builder("placepick.job.stage.duration")
            .description("Elapsed time spent in one closed recommendation job stage")
            .tag("stage", closedJobStage(stage))
            .publishPercentileHistogram()
            .register(registry)
            .record(duration.isNegative() ? Duration.ZERO : duration);
    }

    public void jobOutcome(String outcome, boolean degraded) {
        registry.counter(
            "placepick.job.outcomes",
            "outcome", closedJobOutcome(outcome),
            "degraded", Boolean.toString(degraded)
        ).increment();
    }

    public void jobResult(boolean partial, boolean degraded, List<Integer> scores) {
        registry.counter(
            "placepick.recommendation.results",
            "partial", Boolean.toString(partial),
            "degraded", Boolean.toString(degraded)
        ).increment();
        DistributionSummary.builder("placepick.recommendation.result.count")
            .description("Number of places in one completed recommendation job")
            .tag("partial", Boolean.toString(partial))
            .register(registry)
            .record(scores.size());
        DistributionSummary score = DistributionSummary.builder(
                "placepick.recommendation.result.score"
            )
            .description("Evidence-based score of a persisted recommendation place")
            .tag("partial", Boolean.toString(partial))
            .register(registry);
        scores.forEach(score::record);
        if (scores.size() >= 2) {
            DistributionSummary.builder("placepick.recommendation.result.score.margin")
                .description("Score difference between the first and second result")
                .register(registry)
                .record(Math.max(0, scores.get(0) - scores.get(1)));
        }
    }

    public void deadLetter(String reason) {
        registry.counter(
            "placepick.stream.dlq",
            "reason", closedDeadLetterReason(reason)
        ).increment();
    }

    public void candidateZero() {
        registry.counter("placepick.recommendation.candidate.zero").increment();
    }

    public void outboxPublish(boolean success) {
        registry.counter(
            "placepick.outbox.publish",
            "outcome", success ? "success" : "failure"
        ).increment();
    }

    public void streamOperation(String operation) {
        registry.counter(
            "placepick.stream.operations",
            "operation", closedStreamOperation(operation)
        ).increment();
    }

    public void workerProcessing(Duration duration, String outcome) {
        Timer.builder("placepick.worker.processing")
            .description("Worker processing duration by closed outcome")
            .tag("outcome", closedWorkerOutcome(outcome))
            .publishPercentileHistogram()
            .register(registry)
            .record(duration);
    }

    public void voteWrite(Duration duration, boolean contended) {
        Timer.builder("placepick.vote.write")
            .description("Database vote upsert/delete duration without room or session labels")
            .register(registry)
            .record(duration);
        if (contended) {
            registry.counter("placepick.vote.contention").increment();
        }
    }

    private static String closedRateLimitScope(String value) {
        return switch (value) {
            case "session", "ip" -> value;
            default -> "unknown";
        };
    }

    private static String closedSecurityReason(String value) {
        return switch (value) {
            case "session", "csrf", "origin", "organizer", "idempotency" -> value;
            default -> "unknown";
        };
    }

    private static String closedJobStage(String value) {
        return switch (value) {
            case "queued", "local_search", "blog_search", "scoring",
                 "reason_generation", "persisting", "finished" -> value;
            default -> "unknown";
        };
    }

    private static String closedJobOutcome(String value) {
        return switch (value) {
            case "success", "failure" -> value;
            default -> "unknown";
        };
    }

    private static String closedDeadLetterReason(String value) {
        return switch (value) {
            case "retry_exhausted", "invalid_envelope" -> value;
            default -> "unknown";
        };
    }

    private static String closedStreamOperation(String value) {
        return switch (value) {
            case "publish", "read", "claim", "ack", "retry", "dlq" -> value;
            default -> "unknown";
        };
    }

    private static String closedWorkerOutcome(String value) {
        return switch (value) {
            case "success", "failure" -> value;
            default -> "unknown";
        };
    }
}
