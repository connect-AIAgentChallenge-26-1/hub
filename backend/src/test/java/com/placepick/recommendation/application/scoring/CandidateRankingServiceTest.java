package com.placepick.recommendation.application.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateFunnel;
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
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.domain.scoring.EvidenceLevel;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

class CandidateRankingServiceTest {

    @Test
    void tracesCountOnlyCandidateFunnelsBeforeAndAfterRelaxation() {
        RecordingPlacePort placePort = new RecordingPlacePort(List.of(
            List.of(place(1), new PlaceSearchItem(
                "식별 불가",
                "",
                "카페",
                "",
                "서울 강남구",
                "서울 강남구",
                "",
                ""
            )),
            List.of(place(1), place(2), place(3))
        ));
        RecordingCandidateTrace trace = new RecordingCandidateTrace();
        CandidateRankingService service = service(
            placePort,
            new RecordingBlogPort(-1),
            trace
        );

        service.rank(condition(false));

        assertThat(trace.funnels).hasSize(2);
        assertThat(trace.funnels.get(0)).satisfies(funnel -> {
            assertThat(funnel.receivedCount()).isEqualTo(2);
            assertThat(funnel.eligibleCount()).isEqualTo(1);
            assertThat(funnel.rejectedCount()).isEqualTo(1);
        });
        assertThat(trace.funnels.get(1)).satisfies(funnel -> {
            assertThat(funnel.receivedCount()).isEqualTo(5);
            assertThat(funnel.eligibleCount()).isEqualTo(3);
            assertThat(funnel.rejectedCount()).isEqualTo(2);
        });
        assertThat(trace.completedFunnel).isEqualTo(trace.funnels.get(1));
    }

    @Test
    void usesAFiveCandidatePreliminaryPoolAndAssignsUuidV4OnlyToTopThree() {
        RecordingPlacePort placePort = new RecordingPlacePort(List.of(
            places(1, 6)
        ));
        RecordingBlogPort blogPort = new RecordingBlogPort(-1);
        CandidateRankingService service = service(placePort, blogPort);

        CandidateRankingResult result = service.rank(condition(true));

        assertThat(placePort.queries).singleElement().satisfies(query -> {
            assertThat(query.limit()).isEqualTo(5);
            assertThat(query.query()).startsWith("서울 강남구 카페");
        });
        assertThat(blogPort.queries).hasSize(5).allSatisfy(query -> assertThat(query.limit()).isEqualTo(3));
        assertThat(result.places()).hasSize(3)
            .allSatisfy(place -> assertThat(place.placeId().version()).isEqualTo(4));
        assertThat(result.blogSearchCalls()).isEqualTo(5);
        assertThat(result.placeSearchCalls()).isEqualTo(1);
        assertThat(result.relaxed()).isFalse();
        assertThat(result.degraded()).isFalse();
        assertThat(result.evidenceLevel()).isEqualTo(EvidenceLevel.LOCAL_AND_BLOG);
        assertThat(result.warnings()).containsExactly(
            RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE
        );
        assertThat(result.places()).allSatisfy(place -> {
            assertThat(place.evidence()).hasSize(1);
            assertThat(place.score()).isBetween(55, 80);
        });
    }

    @Test
    void searchesOnceMoreAfterRemovingOnlyTheLowestLastPreference() {
        RecordingPlacePort placePort = new RecordingPlacePort(List.of(
            places(1, 2),
            List.of(place(2), place(3), place(4))
        ));
        RecordingBlogPort blogPort = new RecordingBlogPort(-1);
        CandidateRankingService service = service(placePort, blogPort);

        CandidateRankingResult result = service.rank(condition(false));

        assertThat(placePort.queries).hasSize(2);
        assertThat(placePort.queries.get(0).query()).endsWith("조용함 창가 주차");
        assertThat(placePort.queries.get(1).query()).endsWith("조용함 창가");
        assertThat(placePort.queries.get(1).query()).startsWith("서울 강남구 카페");
        assertThat(result.relaxed()).isTrue();
        assertThat(result.placeSearchCalls()).isEqualTo(2);
        assertThat(result.places()).hasSize(3);
    }

    @Test
    void failsWithoutBlogCallsWhenOneRelaxationStillCannotProduceThreeCandidates() {
        RecordingPlacePort placePort = new RecordingPlacePort(List.of(
            places(1, 2),
            List.of(place(1), place(2))
        ));
        RecordingBlogPort blogPort = new RecordingBlogPort(-1);
        CandidateRankingService service = service(placePort, blogPort);

        assertThatThrownBy(() -> service.rank(condition(false)))
            .isInstanceOf(InsufficientCandidatesException.class)
            .hasMessage("INSUFFICIENT_CANDIDATES");
        assertThat(placePort.queries).hasSize(2);
        assertThat(blogPort.queries).isEmpty();
    }

    @Test
    void discardsAllBlogEvidenceAndStopsAfterTheFirstProviderFailure() {
        RecordingPlacePort placePort = new RecordingPlacePort(List.of(
            places(1, 4)
        ));
        RecordingBlogPort blogPort = new RecordingBlogPort(2);
        CandidateRankingService service = service(placePort, blogPort);

        CandidateRankingResult result = service.rank(condition(true));

        assertThat(blogPort.queries).hasSize(2);
        assertThat(result.blogSearchCalls()).isEqualTo(2);
        assertThat(result.degraded()).isTrue();
        assertThat(result.evidenceLevel()).isEqualTo(EvidenceLevel.LOCAL_ONLY);
        assertThat(result.warnings()).containsExactly(
            RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE,
            RecommendationWarning.BLOG_EVIDENCE_UNAVAILABLE
        );
        assertThat(result.places()).allSatisfy(place -> {
            assertThat(place.evidence()).isEmpty();
            assertThat(place.scoreBreakdown().blogEvidence()).isZero();
        });
    }

    private CandidateRankingService service(
        PlaceSearchPort placePort,
        BlogSearchPort blogPort
    ) {
        return service(placePort, blogPort, RecommendationTraceSink.none());
    }

    private CandidateRankingService service(
        PlaceSearchPort placePort,
        BlogSearchPort blogPort,
        RecommendationTraceSink traceSink
    ) {
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        return new CandidateRankingService(
            placePort,
            blogPort,
            new CandidateQueryPlanner(taxonomy),
            new CandidateNormalizer(taxonomy, new LocationMatcher()),
            new CandidateRanker(new CandidateScoringPolicy()),
            uuidSupplier(),
            traceSink
        );
    }

    private ConfirmedRecommendationCondition condition(boolean withBudget) {
        return new ConfirmedRecommendationCondition(
            "서울 강남구",
            PlaceType.CAFE,
            null,
            4,
            withBudget ? 10_000 : null,
            withBudget ? 30_000 : null,
            List.of(
                new Preference("창가", 3),
                new Preference("조용함", 8),
                new Preference("주차", 3)
            ),
            List.of("흡연")
        );
    }

    private List<PlaceSearchItem> places(int startInclusive, int endInclusive) {
        return java.util.stream.IntStream.rangeClosed(startInclusive, endInclusive)
            .mapToObj(this::place)
            .toList();
    }

    private PlaceSearchItem place(int index) {
        return new PlaceSearchItem(
            "카페 " + index,
            "https://place.test/" + index,
            "카페>디저트",
            index % 2 == 0 ? "조용함 창가" : "주차",
            "서울특별시 강남구 테헤란로 " + index,
            "서울특별시 강남구 테헤란로 " + index,
            "",
            ""
        );
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
            int responseIndex = queries.size();
            queries.add(query);
            List<PlaceSearchItem> response = responses.get(responseIndex);
            return new PlaceSearchResult(response.size(), response);
        }
    }

    private static final class RecordingBlogPort implements BlogSearchPort {
        private final int failureCall;
        private final AtomicInteger calls = new AtomicInteger();
        private final List<BlogSearchQuery> queries = new ArrayList<>();

        private RecordingBlogPort(int failureCall) {
            this.failureCall = failureCall;
        }

        @Override
        public BlogSearchResult searchBlogs(BlogSearchQuery query) {
            int call = calls.incrementAndGet();
            queries.add(query);
            if (call == failureCall) {
                throw new SearchProviderException(
                    SearchProviderFailure.PROVIDER_UNAVAILABLE,
                    503,
                    SearchProviderFailureStage.HTTP_STATUS,
                    "Search provider unavailable.",
                    null
                );
            }
            String candidateName = query.query().substring(0, query.query().indexOf(" 서울"));
            BlogSearchItem item = new BlogSearchItem(
                candidateName + " 후기",
                "https://blog.test/" + call,
                candidateName + " 방문 기록",
                "작성자",
                "",
                "20260715"
            );
            return new BlogSearchResult(1, List.of(item));
        }
    }

    private static final class RecordingCandidateTrace implements RecommendationTraceSink {
        private final List<CandidateFunnel> funnels = new ArrayList<>();
        private CandidateFunnel completedFunnel;

        @Override
        public void candidatesNormalized(
            List<com.placepick.recommendation.domain.candidate.NormalizedCandidate> candidates,
            CandidateFunnel funnel,
            boolean relaxed
        ) {
            funnels.add(funnel);
        }

        @Override
        public void candidateFunnelCompleted(CandidateFunnel funnel, boolean relaxed) {
            completedFunnel = funnel;
        }
    }
}
