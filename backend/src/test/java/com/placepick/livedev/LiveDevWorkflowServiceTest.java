package com.placepick.livedev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.condition.infrastructure.mock.DeterministicConditionExtractionAdapter;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class LiveDevWorkflowServiceTest {

    @Test
    void expiresDraftsAfterTheConfiguredThirtyMinuteBoundary() {
        MutableClock clock = new MutableClock(Instant.parse("2026-07-16T00:00:00Z"));
        InProcessLiveDevProvider provider = new InProcessLiveDevProvider();
        LiveDevWorkflowService service = service(provider, provider, clock, 2);
        try {
            var draft = service.createDraft("서울 성수동에서 조용한 카페");
            clock.advance(Duration.ofMinutes(30));

            assertThatThrownBy(() -> service.confirmDraft(draft.draftId(), condition()))
                .isInstanceOfSatisfying(LiveDevWorkflowException.class, exception -> {
                    assertThat(exception.status()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(exception.errorCode()).isEqualTo("DRAFT_NOT_FOUND");
                });
        } finally {
            service.close();
        }
    }

    @Test
    void deletingARunImmediatelyRemovesItsResultAndOriginalDraft() {
        InProcessLiveDevProvider provider = new InProcessLiveDevProvider();
        LiveDevWorkflowService service = service(provider, provider, Clock.systemUTC(), 2);
        try {
            var draft = service.createDraft("서울 성수동에서 조용한 카페");
            service.confirmDraft(draft.draftId(), condition());
            var run = service.startRun(draft.draftId());

            service.deleteRun(run.runId());

            assertThatThrownBy(() -> service.getRun(run.runId()))
                .isInstanceOfSatisfying(LiveDevWorkflowException.class, exception ->
                    assertThat(exception.errorCode()).isEqualTo("RUN_NOT_FOUND")
                );
            assertThatThrownBy(() -> service.confirmDraft(draft.draftId(), condition()))
                .isInstanceOfSatisfying(LiveDevWorkflowException.class, exception ->
                    assertThat(exception.errorCode()).isEqualTo("DRAFT_NOT_FOUND")
                );
        } finally {
            service.close();
        }
    }

    @Test
    void neverExecutesMoreThanTheConfiguredTwoWorkflowsConcurrently() throws Exception {
        InProcessLiveDevProvider provider = new InProcessLiveDevProvider();
        CountDownLatch twoRunning = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();
        PlaceSearchPort blockingPlaceSearch = query -> {
            int now = active.incrementAndGet();
            maximum.accumulateAndGet(now, Math::max);
            twoRunning.countDown();
            try {
                if (!release.await(3, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Test search release timed out.");
                }
                return provider.searchPlaces(query);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Test search was interrupted.", exception);
            } finally {
                active.decrementAndGet();
            }
        };
        LiveDevWorkflowService service = service(
            blockingPlaceSearch,
            provider,
            Clock.systemUTC(),
            2
        );
        try {
            var draft = service.createDraft("서울 성수동에서 조용한 카페");
            service.confirmDraft(draft.draftId(), condition());
            var first = service.startRun(draft.draftId());
            var second = service.startRun(draft.draftId());
            var third = service.startRun(draft.draftId());

            assertThat(twoRunning.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(maximum).hasValue(2);
            release.countDown();

            assertThat(awaitTerminal(service, first.runId())).isEqualTo("COMPLETED");
            assertThat(awaitTerminal(service, second.runId())).isEqualTo("COMPLETED");
            assertThat(awaitTerminal(service, third.runId())).isEqualTo("COMPLETED");
            assertThat(maximum).hasValue(2);
        } finally {
            release.countDown();
            service.close();
        }
    }

    private static LiveDevWorkflowService service(
        PlaceSearchPort placeSearch,
        InProcessLiveDevProvider provider,
        Clock clock,
        int concurrency
    ) {
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        LiveDevCoreFactory coreFactory = trace -> new RecommendationCoreUseCase(
            new CandidateRankingService(
                placeSearch,
                provider,
                new CandidateQueryPlanner(taxonomy),
                new CandidateNormalizer(taxonomy, new LocationMatcher()),
                new CandidateRanker(new CandidateScoringPolicy()),
                trace
            ),
            new GroundedReasonService(provider, trace)
        );
        return new LiveDevWorkflowService(
            new DeterministicConditionExtractionAdapter(),
            coreFactory,
            clock,
            Duration.ofMinutes(30),
            concurrency
        );
    }

    private static ConfirmedRecommendationCondition condition() {
        return new ConfirmedRecommendationCondition(
            "서울 성수동",
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            List.of(new Preference("조용한", 8)),
            List.of()
        );
    }

    private static String awaitTerminal(
        LiveDevWorkflowService service,
        java.util.UUID runId
    ) throws InterruptedException {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        String status;
        do {
            status = service.getRun(runId).status();
            if (System.nanoTime() >= deadline) {
                throw new AssertionError("The workflow did not reach a terminal state.");
            }
            TimeUnit.MILLISECONDS.sleep(10);
        } while (!List.of("COMPLETED", "FAILED", "CANCELLED").contains(status));
        return status;
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            if (!ZoneOffset.UTC.equals(zone)) {
                throw new IllegalArgumentException("This test clock only supports UTC.");
            }
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }

        private void advance(Duration duration) {
            instant = instant.plus(duration);
        }
    }
}
