package com.placepick.recommendation.workflow.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.port.out.SearchProviderFailure;
import com.placepick.recommendation.application.port.out.SearchProviderFailureStage;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.application.scoring.InsufficientCandidatesException;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.infrastructure.mock.DeterministicConditionExtractionAdapter;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.reason.application.ReasonStatementPolicy;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

class RecommendationCoreLinkedMockIntegrationTest {

    @Test
    void linksTheAdaptiveSyntheticWorkflowOnlyAfterExplicitConfirmation() throws Exception {
        WorkflowFixture fixture = fixture(List.of(places(1, 5), places(6, 10)));

        ExtractionOutcome extracted = fixture.extractionPort.extract(extractionCommand());
        assertThat(extracted.extracted()).isTrue();
        assertThat(extracted.condition()).isInstanceOf(DraftRecommendationCondition.class);
        ConfirmedRecommendationCondition confirmed = confirm(extracted.condition());

        RecommendationCoreResult result = fixture.core.recommend(confirmed);

        assertThat(result.places()).hasSize(3);
        assertThat(result.reasonFallback()).isFalse();
        assertThat(result.degraded()).isFalse();
        assertThat(result.providerCalls()).isEqualTo(11);
        assertThat(fixture.extractionCalls.get() + result.providerCalls()).isEqualTo(12);
        assertThat(fixture.placePort.queries).hasSize(2);
        assertThat(fixture.blogPort.queries).hasSize(8);
        assertThat(fixture.reasonPort.calls.get()).isEqualTo(1);
        assertConfirmedOnlyBoundary();
    }

    @Test
    void expandedVariantsStayWithinTheConfiguredCallBudget() {
        WorkflowFixture fixture = fixture(List.of(
            places(1, 2),
            places(3, 5)
        ));
        ExtractionOutcome extracted = fixture.extractionPort.extract(extractionCommand());

        RecommendationCoreResult result = fixture.core.recommend(confirm(extracted.condition()));

        assertThat(result.relaxed()).isTrue();
        assertThat(result.placeSearchCalls()).isEqualTo(6);
        assertThat(result.blogSearchCalls()).isEqualTo(5);
        assertThat(result.providerCalls()).isEqualTo(12);
        assertThat(fixture.extractionCalls.get() + result.providerCalls()).isEqualTo(13);
        assertThat(fixture.placePort.queries).hasSize(6);
        assertThat(fixture.reasonPort.calls.get()).isEqualTo(1);
    }

    @Test
    void insufficientCandidatesStopTheFullWorkflowBeforeBlogAndReasonGeneration() {
        WorkflowFixture fixture = fixture(List.of(List.of()));
        ExtractionOutcome extracted = fixture.extractionPort.extract(extractionCommand());

        assertThatThrownBy(() -> fixture.core.recommend(confirm(extracted.condition())))
            .isInstanceOf(InsufficientCandidatesException.class)
            .hasMessage("INSUFFICIENT_CANDIDATES");

        assertThat(fixture.placePort.queries).hasSize(6);
        assertThat(fixture.blogPort.queries).isEmpty();
        assertThat(fixture.reasonPort.calls.get()).isZero();
    }

    @Test
    void blogProviderFailureCompletesLocalOnlyWithoutReasonFallback() {
        WorkflowFixture fixture = fixture(
            List.of(places(1, 5), places(6, 10)),
            2,
            false
        );
        ExtractionOutcome extracted = fixture.extractionPort.extract(extractionCommand());

        RecommendationCoreResult result = fixture.core.recommend(confirm(extracted.condition()));

        assertThat(result.places()).hasSize(3);
        assertThat(result.places()).anySatisfy(place ->
            assertThat(place.evidenceLevel()).isEqualTo(EvidenceLevel.LOCAL_AND_BLOG)
        );
        assertThat(result.places()).allSatisfy(place ->
            assertThat(place.cautions()).doesNotContain(GroundedReasonService.FALLBACK_CAUTION)
        );
        assertThat(result.degraded()).isTrue();
        assertThat(result.reasonFallback()).isFalse();
        assertThat(result.warnings()).containsExactly(
            "BUDGET_EVIDENCE_UNAVAILABLE",
            "BLOG_EVIDENCE_UNAVAILABLE",
            "EXCLUSION_UNVERIFIED"
        );
        assertThat(result.blogSearchCalls()).isEqualTo(8);
        assertThat(fixture.blogPort.queries).hasSize(8);
        assertThat(fixture.reasonPort.calls.get()).isEqualTo(1);
    }

    @Test
    void reasonProviderFailureFallsBackForAllThreeWithoutChangingScoreOrOrder() {
        WorkflowFixture successfulFixture = fixture(List.of(places(1, 5), places(6, 10)));
        WorkflowFixture failedFixture = fixture(
            List.of(places(1, 5), places(6, 10)),
            -1,
            true
        );
        ConfirmedRecommendationCondition confirmed = confirm(
            successfulFixture.extractionPort.extract(extractionCommand()).condition()
        );

        RecommendationCoreResult successful = successfulFixture.core.recommend(confirmed);
        RecommendationCoreResult failed = failedFixture.core.recommend(confirmed);

        assertThat(failed.places()).extracting(
            place -> place.rankedPlace().candidate().candidateKey()
        )
            .containsExactlyElementsOf(successful.places().stream()
                .map(place -> place.rankedPlace().candidate().candidateKey())
                .toList());
        assertThat(failed.places()).extracting(place -> place.rankedPlace().score())
            .containsExactlyElementsOf(successful.places().stream()
                .map(place -> place.rankedPlace().score())
                .toList());
        assertThat(failed.places()).hasSize(3).allSatisfy(place -> {
            assertThat(place.reasonStatements()).singleElement().satisfies(statement -> {
                assertThat(statement.text()).startsWith("검색 후보:");
                assertThat(statement.evidenceIds()).singleElement()
                    .asString().startsWith("local:");
            });
            assertThat(place.cautions()).contains(GroundedReasonService.FALLBACK_CAUTION)
                .doesNotContain(GroundedReasonService.BLOG_CAUTION);
            assertThat(place.evidenceLevel()).isEqualTo(EvidenceLevel.LOCAL_AND_BLOG);
        });
        assertThat(failed.degraded()).isTrue();
        assertThat(failed.reasonFallback()).isTrue();
        assertThat(failed.warnings()).containsExactly(
            "BUDGET_EVIDENCE_UNAVAILABLE",
            "EXCLUSION_UNVERIFIED",
            RecommendationCoreUseCase.LLM_REASON_FALLBACK
        );
        assertThat(failedFixture.reasonPort.calls.get()).isEqualTo(1);
    }

    private static void assertConfirmedOnlyBoundary() throws Exception {
        Method method = RecommendationCoreUseCase.class.getMethod(
            "recommend",
            ConfirmedRecommendationCondition.class
        );
        assertThat(method.getParameterTypes()).containsExactly(ConfirmedRecommendationCondition.class);
        assertThat(java.util.Arrays.stream(RecommendationCoreUseCase.class.getMethods())
            .filter(value -> value.getName().equals("recommend")))
            .hasSize(2)
            .allSatisfy(value -> assertThat(value.getParameterTypes())
                .contains(ConfirmedRecommendationCondition.class)
                .doesNotContain(DraftRecommendationCondition.class));
    }

    private WorkflowFixture fixture(List<List<PlaceSearchItem>> localResponses) {
        return fixture(localResponses, -1, false);
    }

    private WorkflowFixture fixture(
        List<List<PlaceSearchItem>> localResponses,
        int blogFailureCall,
        boolean reasonProviderFailure
    ) {
        AtomicInteger extractionCalls = new AtomicInteger();
        DeterministicConditionExtractionAdapter extraction =
            new DeterministicConditionExtractionAdapter();
        ConditionExtractionPort extractionPort = command -> {
            extractionCalls.incrementAndGet();
            return extraction.extract(command);
        };
        RecordingPlacePort placePort = new RecordingPlacePort(localResponses);
        RecordingBlogPort blogPort = new RecordingBlogPort(blogFailureCall);
        RecordingReasonPort reasonPort = new RecordingReasonPort(reasonProviderFailure);
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        CandidateRankingService ranking = new CandidateRankingService(
            placePort,
            blogPort,
            new CandidateQueryPlanner(taxonomy),
            new CandidateNormalizer(taxonomy, new LocationMatcher()),
            new CandidateRanker(new CandidateScoringPolicy()),
            uuidSupplier()
        );
        RecommendationCoreUseCase core = new RecommendationCoreUseCase(
            ranking,
            new GroundedReasonService(reasonPort)
        );
        return new WorkflowFixture(
            extractionPort,
            extractionCalls,
            placePort,
            blogPort,
            reasonPort,
            core
        );
    }

    private ExtractionCommand extractionCommand() {
        return new ExtractionCommand(
            "서울 강남구에서 4명이 조용한 주차 카페를 1만원~3만원으로 찾고 흡연 제외",
            "synthetic-session-confirmation-0001"
        );
    }

    private ConfirmedRecommendationCondition confirm(DraftRecommendationCondition draft) {
        return new ConfirmedRecommendationCondition(
            draft.locationQuery(),
            draft.placeType(),
            draft.placeTypeDetail(),
            draft.partySize(),
            draft.budgetPerPersonMin(),
            draft.budgetPerPersonMax(),
            draft.preferences(),
            draft.exclusions()
        );
    }

    private static List<PlaceSearchItem> places(int start, int end) {
        return java.util.stream.IntStream.rangeClosed(start, end)
            .mapToObj(index -> new PlaceSearchItem(
                "카페 " + index,
                "https://place.test/" + index,
                "카페>디저트",
                index % 2 == 0 ? "조용한 주차" : "조용한 공간",
                "서울특별시 강남구 테헤란로 " + index,
                "서울특별시 강남구 테헤란로 " + index,
                "",
                ""
            ))
            .toList();
    }

    private Supplier<UUID> uuidSupplier() {
        Iterator<UUID> values = List.of(
            UUID.fromString("00000000-0000-4000-8000-000000000001"),
            UUID.fromString("00000000-0000-4000-8000-000000000002"),
            UUID.fromString("00000000-0000-4000-8000-000000000003")
        ).iterator();
        return values::next;
    }

    private static final class RecordingPlacePort implements PlaceSearchPort {
        private final List<List<PlaceSearchItem>> responses;
        private final List<PlaceSearchQuery> queries = new ArrayList<>();

        private RecordingPlacePort(List<List<PlaceSearchItem>> responses) {
            this.responses = responses;
        }

        @Override
        public PlaceSearchResult searchPlaces(PlaceSearchQuery query) {
            int index = queries.size();
            queries.add(query);
            List<PlaceSearchItem> items = responses.get(Math.min(index, responses.size() - 1));
            return new PlaceSearchResult(items.size(), items);
        }
    }

    private static final class RecordingBlogPort implements BlogSearchPort {
        private final int failureCall;
        private final List<BlogSearchQuery> queries = new ArrayList<>();

        private RecordingBlogPort(int failureCall) {
            this.failureCall = failureCall;
        }

        @Override
        public BlogSearchResult searchBlogs(BlogSearchQuery query) {
            queries.add(query);
            if (queries.size() == failureCall) {
                throw new SearchProviderException(
                    SearchProviderFailure.PROVIDER_UNAVAILABLE,
                    503,
                    SearchProviderFailureStage.HTTP_STATUS,
                    "Search provider unavailable.",
                    null
                );
            }
            String name = query.query().substring(0, query.query().indexOf(" 서울"));
            return new BlogSearchResult(1, List.of(new BlogSearchItem(
                name + " 방문 기록",
                "https://blog.test/" + queries.size(),
                name + " 서울 강남구 조용한 공간",
                "작성자",
                "",
                "20260715"
            )));
        }
    }

    private static final class RecordingReasonPort implements GroundedReasonGenerationPort {
        private final boolean providerFailure;
        private final AtomicInteger calls = new AtomicInteger();

        private RecordingReasonPort(boolean providerFailure) {
            this.providerFailure = providerFailure;
        }

        @Override
        public ReasonGenerationOutcome generate(ReasonGenerationCommand command) {
            calls.incrementAndGet();
            if (providerFailure) {
                return ReasonGenerationOutcome.providerFailure(
                    ReasonGenerationErrorCode.PROVIDER_UNAVAILABLE
                );
            }
            return ReasonGenerationOutcome.generated(new GeneratedReasonBatch(
                GeneratedReasonBatch.SCHEMA_VERSION,
                command.places().stream().map(place -> new PlaceReasonStatements(
                    place.placeId(),
                    List.of(new ReasonStatement(
                        ReasonStatementPolicy.expectedText(place.evidence().get(0).type()),
                        List.of(place.evidence().get(0).evidenceId())
                    ))
                )).toList()
            ));
        }
    }

    private record WorkflowFixture(
        ConditionExtractionPort extractionPort,
        AtomicInteger extractionCalls,
        RecordingPlacePort placePort,
        RecordingBlogPort blogPort,
        RecordingReasonPort reasonPort,
        RecommendationCoreUseCase core
    ) {
    }
}
