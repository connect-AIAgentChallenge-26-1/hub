package com.placepick.recommendation.reason.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.port.out.LlmFailureStage;
import com.placepick.recommendation.application.scoring.CandidateRankingResult;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.CandidateKey;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationDiagnosticCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.GeneratedReasonResult;
import com.placepick.recommendation.reason.domain.GeneratedReasonStatement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class GroundedReasonServiceTest {

    @Test
    void generatesEachPlaceIndependentlyAndPreservesRankingOrder() {
        List<String> slots = java.util.Collections.synchronizedList(new ArrayList<>());
        GroundedReasonService service = service(command -> {
            slots.add(command.slot());
            return generated(command);
        });

        ReasonEnrichmentResult result = service.enrich(condition(), ranking(false, true));

        assertThat(result.generationCalls()).isEqualTo(3);
        assertThat(result.fallbackUsed()).isFalse();
        assertThat(result.places()).extracting(EnrichedPlaceReason::placeId)
            .containsExactlyElementsOf(
                ranking(false, true).places().stream().map(RankedPlace::placeId).toList()
            );
        assertThat(result.places()).allSatisfy(place -> {
            assertThat(place.fallbackUsed()).isFalse();
            assertThat(place.cautions()).containsExactly(GroundedReasonService.BUDGET_CAUTION);
        });
        assertThat(slots).containsExactlyInAnyOrder("p1", "p2", "p3");
    }

    @Test
    void retriesOneInvalidCandidateThenFallsBackOnlyThatCandidate() {
        Map<String, AtomicInteger> calls = new ConcurrentHashMap<>();
        RecordingTraceSink trace = new RecordingTraceSink();
        GroundedReasonService service = new GroundedReasonService(
            command -> {
                int attempt = calls.computeIfAbsent(
                    command.slot(),
                    ignored -> new AtomicInteger()
                ).incrementAndGet();
                if ("p2".equals(command.slot())) {
                    return invalidClaim(command);
                }
                return generated(command);
            },
            trace,
            ignored -> {
            }
        );

        ReasonEnrichmentResult result = service.enrich(condition(), ranking(false, true));

        assertThat(result.generationCalls()).isEqualTo(4);
        assertThat(result.fallbackUsed()).isTrue();
        assertThat(result.places()).extracting(EnrichedPlaceReason::fallbackUsed)
            .containsExactly(false, true, false);
        assertThat(result.places().get(1).cautions())
            .contains(GroundedReasonService.FALLBACK_CAUTION);
        assertThat(result.places().get(1).statements()).hasSize(2);
        assertThat(result.places().get(1).statements().get(1).text())
            .contains("블로그 검색 결과");
        assertThat(calls.get("p2")).hasValue(2);
        assertThat(trace.validationFailures).hasValue(2);
    }

    @Test
    void retriesTransientFailureAndHonorsBoundedRetryAfter() {
        Map<String, AtomicInteger> calls = new ConcurrentHashMap<>();
        List<Duration> waits = java.util.Collections.synchronizedList(new ArrayList<>());
        GroundedReasonService service = new GroundedReasonService(
            command -> {
                int attempt = calls.computeIfAbsent(
                    command.slot(),
                    ignored -> new AtomicInteger()
                ).incrementAndGet();
                if ("p1".equals(command.slot()) && attempt == 1) {
                    return ReasonGenerationOutcome.providerFailure(
                        ReasonGenerationErrorCode.PROVIDER_RATE_LIMITED,
                        ReasonGenerationDiagnosticCode.UPSTREAM_RATE_LIMITED,
                        LlmFailureStage.HTTP_STATUS,
                        Duration.ofSeconds(9)
                    );
                }
                return generated(command);
            },
            RecommendationTraceSink.none(),
            waits::add
        );

        ReasonEnrichmentResult result = service.enrich(condition(), ranking(false, true));

        assertThat(result.generationCalls()).isEqualTo(4);
        assertThat(result.fallbackUsed()).isFalse();
        assertThat(waits).containsExactly(Duration.ofSeconds(5));
    }

    @Test
    void invalidRequestAndAuthenticationFailuresAreNotRetried() {
        AtomicInteger calls = new AtomicInteger();
        GroundedReasonService service = service(command -> {
            calls.incrementAndGet();
            return "p1".equals(command.slot())
                ? ReasonGenerationOutcome.providerFailure(
                    ReasonGenerationErrorCode.PROVIDER_INVALID_REQUEST
                )
                : ReasonGenerationOutcome.providerFailure(
                    ReasonGenerationErrorCode.PROVIDER_AUTHENTICATION_FAILED
                );
        });

        ReasonEnrichmentResult result = service.enrich(condition(), ranking(false, true, 2));

        assertThat(calls).hasValue(2);
        assertThat(result.generationCalls()).isEqualTo(2);
        assertThat(result.places()).allMatch(EnrichedPlaceReason::fallbackUsed);
    }

    @Test
    void rootFailureTurnsOtherwiseGeneratedCandidatesIntoAllPlaceFallback() {
        GroundedReasonService service = service(command ->
            "p2".equals(command.slot())
                ? ReasonGenerationOutcome.providerFailure(
                    ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE,
                    ReasonGenerationDiagnosticCode.REASON_CONTENT_ROOT_SCHEMA,
                    LlmFailureStage.CHAT_CONTENT_SCHEMA
                )
                : generated(command)
        );

        ReasonEnrichmentResult result = service.enrich(condition(), ranking(false, true));

        assertThat(result.generationCalls()).isEqualTo(3);
        assertThat(result.places()).allMatch(EnrichedPlaceReason::fallbackUsed);
    }

    @Test
    void runsAtMostThreePlaceRequestsInParallel() {
        CountDownLatch entered = new CountDownLatch(3);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();
        GroundedReasonService service = service(command -> {
            int current = active.incrementAndGet();
            maximum.accumulateAndGet(current, Math::max);
            entered.countDown();
            try {
                if (!entered.await(2, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("all three requests did not enter");
                }
                release.countDown();
                if (!release.await(2, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("parallel release timed out");
                }
                return generated(command);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            } finally {
                active.decrementAndGet();
            }
        });

        ReasonEnrichmentResult result = service.enrich(condition(), ranking(false, true));

        assertThat(result.fallbackUsed()).isFalse();
        assertThat(maximum).hasValue(3);
    }

    @Test
    void unexpectedRuntimeAndNullOutcomeAreNotHiddenByFallback() {
        GroundedReasonService unexpected = service(command -> {
            throw new IllegalStateException("synthetic internal failure");
        });
        GroundedReasonService nullOutcome = service(command -> null);

        assertThatThrownBy(() -> unexpected.enrich(condition(), ranking(false, true, 1)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic internal failure");
        assertThatThrownBy(() -> nullOutcome.enrich(condition(), ranking(false, true, 1)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Reason generation port returned no outcome.");
    }

    private GroundedReasonService service(
        com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort port
    ) {
        return new GroundedReasonService(
            port,
            RecommendationTraceSink.none(),
            ignored -> {
            }
        );
    }

    private ReasonGenerationOutcome generated(ReasonGenerationCommand command) {
        return ReasonGenerationOutcome.generated(new GeneratedReasonResult(
            GeneratedReasonResult.SCHEMA_VERSION,
            command.slot(),
            List.of(new GeneratedReasonStatement(
                "장소 검색 정보에서 조용한 공간을 확인했습니다.",
                List.of(command.claims().get(0).claimId())
            ))
        ));
    }

    private ReasonGenerationOutcome invalidClaim(ReasonGenerationCommand command) {
        return ReasonGenerationOutcome.generated(new GeneratedReasonResult(
            GeneratedReasonResult.SCHEMA_VERSION,
            command.slot(),
            List.of(new GeneratedReasonStatement(
                "장소 검색 정보에서 조용한 공간을 확인했습니다.",
                List.of(command.slot() + "-c4")
            ))
        ));
    }

    private CandidateRankingResult ranking(boolean degraded, boolean withBlog) {
        return ranking(degraded, withBlog, 3);
    }

    private CandidateRankingResult ranking(boolean degraded, boolean withBlog, int count) {
        List<RankedPlace> places = new ArrayList<>();
        for (int index = 1; index <= count; index++) {
            List<CandidateEvidence> evidence = withBlog
                ? List.of(new CandidateEvidence(
                    "e-blog-" + index,
                    "카페 " + index + " 방문 기록",
                    "카페 " + index + " 조용한 공간",
                    "https://blog.test/" + index
                ))
                : List.of();
            places.add(new RankedPlace(
                UUID.fromString("00000000-0000-4000-8000-00000000000" + index),
                new NormalizedCandidate(
                    CandidateKey.fromIdentity("candidate-" + index),
                    "카페 " + index,
                    "카페>디저트",
                    "조용한 공간",
                    "서울특별시 강남구 " + index,
                    "서울특별시 강남구 " + index,
                    "https://place.test/" + index,
                    "카페 " + index + " 조용한 공간"
                ),
                evidence,
                new ScoreBreakdown(30, 25, 0, 8, withBlog ? 3 : 0)
            ));
        }
        List<RecommendationWarning> warnings = degraded
            ? List.of(
                RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE,
                RecommendationWarning.BLOG_EVIDENCE_UNAVAILABLE
            )
            : List.of(RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE);
        return new CandidateRankingResult(
            places,
            degraded ? EvidenceLevel.LOCAL_ONLY : EvidenceLevel.LOCAL_AND_BLOG,
            degraded,
            warnings,
            false,
            1,
            withBlog ? 3 : 1
        );
    }

    private ConfirmedRecommendationCondition condition() {
        return new ConfirmedRecommendationCondition(
            "서울 강남구",
            PlaceType.CAFE,
            null,
            4,
            10_000,
            30_000,
            List.of(new Preference("조용한", 8)),
            List.of("흡연")
        );
    }

    private static final class RecordingTraceSink implements RecommendationTraceSink {

        private final AtomicInteger validationFailures = new AtomicInteger();

        @Override
        public void reasonValidationFailed(ReasonBatchValidationCode code) {
            validationFailures.incrementAndGet();
        }
    }
}
