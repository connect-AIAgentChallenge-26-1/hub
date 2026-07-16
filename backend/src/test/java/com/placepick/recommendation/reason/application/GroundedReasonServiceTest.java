package com.placepick.recommendation.reason.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class GroundedReasonServiceTest {

    @Test
    void validatesTheExactBatchAndRestoresRankingOrder() {
        CandidateRankingResult ranking = ranking(false, true);
        GroundedReasonService service = new GroundedReasonService(command -> generated(
            command,
            index -> statement(command, index, command.places().get(index)
                .evidence().get(1).evidenceId(), ReasonStatementPolicy.BLOG_STATEMENT_TEXT),
            List.of(2, 0, 1)
        ));

        ReasonEnrichmentResult result = service.enrich(condition(), ranking);

        assertThat(result.fallbackUsed()).isFalse();
        assertThat(result.places()).extracting(EnrichedPlaceReason::placeId)
            .containsExactlyElementsOf(ranking.places().stream().map(RankedPlace::placeId).toList());
        assertThat(result.places()).allSatisfy(place -> {
            assertThat(place.cautions()).containsExactly(GroundedReasonService.BUDGET_CAUTION);
            assertThat(place.shareText()).startsWith("추천 후보:");
        });
    }

    @Test
    void oneCrossPlaceEvidenceReferenceFallsBackForAllThree() {
        CandidateRankingResult ranking = ranking(false, true);
        RecordingTraceSink trace = new RecordingTraceSink();
        GroundedReasonService service = new GroundedReasonService(
            command -> generated(
                command,
                index -> index == 0
                    ? statement(
                        command,
                        index,
                        command.places().get(1).evidence().get(0).evidenceId(),
                        ReasonStatementPolicy.LOCAL_STATEMENT_TEXT
                    )
                    : statement(
                        command,
                        index,
                        command.places().get(index).evidence().get(0).evidenceId(),
                        ReasonStatementPolicy.LOCAL_STATEMENT_TEXT
                    ),
                List.of(0, 1, 2)
            ),
            trace
        );

        ReasonEnrichmentResult result = service.enrich(condition(), ranking);

        assertAllFallback(result);
        assertThat(trace.validationCode).isEqualTo(ReasonBatchValidationCode.UNKNOWN_EVIDENCE);
    }

    @Test
    void placeNameOverlapCannotGroundAnInventedRooftopClaim() {
        CandidateRankingResult ranking = ranking(false, true);
        GroundedReasonService service = new GroundedReasonService(command -> generated(
            command,
            index -> statement(
                command,
                index,
                command.places().get(index).evidence().get(0).evidenceId(),
                index == 1
                    ? "카페 2에는 루프탑이 있습니다"
                    : ReasonStatementPolicy.LOCAL_STATEMENT_TEXT
            ),
            List.of(0, 1, 2)
        ));

        assertAllFallback(service.enrich(condition(), ranking));
    }

    @Test
    void providerFailureUsesLocalEvidenceForAnAllThreeFallback() {
        CandidateRankingResult ranking = ranking(true, false);
        GroundedReasonService service = new GroundedReasonService(command ->
            ReasonGenerationOutcome.providerFailure(
                ReasonGenerationErrorCode.PROVIDER_UNAVAILABLE
            )
        );

        ReasonEnrichmentResult result = service.enrich(condition(), ranking);

        assertAllFallback(result);
        assertThat(result.places()).allSatisfy(place ->
            assertThat(place.cautions()).contains(
                GroundedReasonService.BLOG_CAUTION,
                GroundedReasonService.FALLBACK_CAUTION
            )
        );
    }

    @Test
    void unexpectedAdapterFailureIsNotHiddenByFallback() {
        GroundedReasonService service = new GroundedReasonService(command -> {
            throw new IllegalStateException("synthetic internal failure");
        });

        assertThatThrownBy(() -> service.enrich(condition(), ranking(false, true)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic internal failure");
    }

    @Test
    void nullPortOutcomeIsAnInternalContractFailure() {
        GroundedReasonService service = new GroundedReasonService(command -> null);

        assertThatThrownBy(() -> service.enrich(condition(), ranking(false, true)))
            .isInstanceOf(IllegalStateException.class)
            .hasMessage("Reason generation port returned no outcome.");
    }

    @Test
    void supportsTheTemporaryOneToThreePlaceReasonContractForPartialResults() {
        CandidateRankingResult ranking = ranking(false, true, 1);
        GroundedReasonService service = new GroundedReasonService(command -> generated(
            command,
            index -> statement(
                command,
                index,
                command.places().get(index).evidence().get(0).evidenceId(),
                ReasonStatementPolicy.LOCAL_STATEMENT_TEXT
            ),
            List.of(0)
        ));

        ReasonEnrichmentResult result = service.enrich(condition(), ranking);

        assertThat(result.fallbackUsed()).isFalse();
        assertThat(result.places()).singleElement();
    }

    private void assertAllFallback(ReasonEnrichmentResult result) {
        assertThat(result.fallbackUsed()).isTrue();
        assertThat(result.places()).hasSize(3).allSatisfy(place -> {
            assertThat(place.statements()).singleElement()
                .satisfies(statement -> {
                    assertThat(statement.text()).startsWith("검색 후보:");
                    assertThat(statement.evidenceIds()).singleElement()
                        .asString().startsWith("local:");
                });
            assertThat(place.cautions()).contains(GroundedReasonService.FALLBACK_CAUTION);
        });
    }

    private ReasonGenerationOutcome generated(
        ReasonGenerationCommand command,
        Function<Integer, PlaceReasonStatements> factory,
        List<Integer> order
    ) {
        return ReasonGenerationOutcome.generated(new GeneratedReasonBatch(
            GeneratedReasonBatch.SCHEMA_VERSION,
            order.stream().map(factory).toList()
        ));
    }

    private PlaceReasonStatements statement(
        ReasonGenerationCommand command,
        int index,
        String evidenceId,
        String text
    ) {
        return new PlaceReasonStatements(
            command.places().get(index).placeId(),
            List.of(new ReasonStatement(text, List.of(evidenceId)))
        );
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

        private ReasonBatchValidationCode validationCode;

        @Override
        public void reasonValidationFailed(ReasonBatchValidationCode code) {
            validationCode = code;
        }
    }
}
