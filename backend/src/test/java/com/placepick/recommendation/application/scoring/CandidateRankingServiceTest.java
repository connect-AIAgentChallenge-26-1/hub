package com.placepick.recommendation.application.scoring;

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
import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.port.out.SearchProviderFailure;
import com.placepick.recommendation.application.port.out.SearchProviderFailureStage;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import com.placepick.recommendation.workflow.application.RecommendationExecutionContext;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CandidateRankingServiceTest {

    @Test
    void executesAccuracyAndPopularityFirstAndStopsAtTheTenCandidateTarget() {
        UniquePlacePort places = new UniquePlacePort();
        RecordingBlogPort blogs = new RecordingBlogPort(-1);

        CandidateRankingResult result = service(places, blogs).rank(condition());

        assertThat(places.queries).hasSize(2);
        assertThat(places.queries).extracting(PlaceSearchQuery::sort)
            .containsExactly(PlaceSearchSort.ACCURACY, PlaceSearchSort.POPULARITY);
        assertThat(result.placeSearchCalls()).isEqualTo(2);
        assertThat(result.blogSearchCalls()).isEqualTo(8);
        assertThat(blogs.queries).hasSize(8).allSatisfy(query -> {
            assertThat(query.limit()).isEqualTo(10);
            assertThat(query.sort().providerValue()).isEqualTo("sim");
        });
        assertThat(result.places()).hasSize(3);
        assertThat(result.places()).allSatisfy(place -> {
            assertThat(place.placeId().version()).isEqualTo(4);
            assertThat(place.score()).isBetween(0, 100);
            assertThat(place.candidate().searchObservations()).isNotEmpty();
        });
        assertThat(result.searchExhausted()).isFalse();
    }

    @Test
    void exhaustsTheSixCallBudgetAndReturnsOneCandidateAsAPartialResult() {
        RepeatedPlacePort places = new RepeatedPlacePort(false);
        RecordingBlogPort blogs = new RecordingBlogPort(-1);

        CandidateRankingResult result = service(places, blogs).rank(condition());

        assertThat(places.queries).hasSize(6);
        assertThat(result.places()).hasSize(1);
        assertThat(result.partial()).isTrue();
        assertThat(result.resultCount()).isEqualTo(1);
        assertThat(result.warnings()).contains(
            RecommendationWarning.PARTIAL_RECOMMENDATION,
            RecommendationWarning.EXCLUSION_UNVERIFIED
        );
        assertThat(result.usedVariantIds()).hasSize(6);
        assertThat(result.searchExhausted()).isFalse();
    }

    @Test
    void failsOnlyWhenNoEligibleCandidateExistsAfterTheSearchBudget() {
        RepeatedPlacePort places = new RepeatedPlacePort(true);
        RecordingBlogPort blogs = new RecordingBlogPort(-1);

        assertThatThrownBy(() -> service(places, blogs).rank(condition()))
            .isInstanceOf(InsufficientCandidatesException.class)
            .hasMessage("INSUFFICIENT_CANDIDATES");
        assertThat(places.queries).hasSize(6);
        assertThat(blogs.queries).isEmpty();
    }

    @Test
    void isolatesOneBlogFailureAndKeepsEvidenceForTheOtherCandidates() {
        ThreePlacePort places = new ThreePlacePort();
        RecordingBlogPort blogs = new RecordingBlogPort(2);

        CandidateRankingResult result = service(places, blogs).rank(condition());

        assertThat(blogs.queries).hasSize(3);
        assertThat(result.degraded()).isTrue();
        assertThat(result.warnings()).contains(RecommendationWarning.BLOG_EVIDENCE_UNAVAILABLE);
        assertThat(result.places()).anySatisfy(place -> assertThat(place.evidence()).isEmpty());
        assertThat(result.places()).anySatisfy(place -> assertThat(place.evidence()).isNotEmpty());
    }

    @Test
    void alternativeSkipsUsedVariantsAndPreviouslyShownFingerprints() {
        UniquePlacePort places = new UniquePlacePort();
        CandidateRankingService service = service(places, new RecordingBlogPort(-1));
        CandidateRankingResult initial = service.rank(condition());
        var excluded = initial.places().stream()
            .map(value -> value.candidate().candidateKey())
            .collect(java.util.stream.Collectors.toSet());

        CandidateRankingResult alternative = service.rank(
            condition(),
            RecommendationExecutionContext.alternative(
                1,
                excluded,
                Set.of("v2.base.accuracy", "v2.base.popularity")
            )
        );

        assertThat(alternative.explorationRound()).isEqualTo(1);
        assertThat(alternative.usedVariantIds()).contains(
            "v2.base.accuracy", "v2.base.popularity"
        );
        assertThat(alternative.places()).noneMatch(value ->
            excluded.contains(value.candidate().candidateKey())
        );
    }

    private CandidateRankingService service(PlaceSearchPort places, BlogSearchPort blogs) {
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        return new CandidateRankingService(
            places,
            blogs,
            new CandidateQueryPlanner(taxonomy),
            new CandidateNormalizer(taxonomy, new LocationMatcher()),
            new CandidateRanker(new CandidateScoringPolicy()),
            java.util.UUID::randomUUID,
            RecommendationTraceSink.none(),
            RetrievalPolicy.qualityDefaults()
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
            List.of(
                new Preference("조용함", 8),
                new Preference("창가", 3),
                new Preference("주차", 3)
            ),
            List.of("흡연")
        );
    }

    private static PlaceSearchItem place(int index) {
        return new PlaceSearchItem(
            "카페 " + index,
            "https://place.test/" + index,
            "카페>디저트",
            index % 2 == 0 ? "조용함 창가" : "주차",
            "서울특별시 강남구 테헤란로 " + index,
            "서울특별시 강남구 테헤란로 " + index,
            Integer.toString(1000 + index),
            Integer.toString(2000 + index)
        );
    }

    private static final class UniquePlacePort implements PlaceSearchPort {
        private final List<PlaceSearchQuery> queries = new ArrayList<>();

        @Override
        public PlaceSearchResult searchPlaces(PlaceSearchQuery query) {
            int base = queries.size() * 5;
            queries.add(query);
            List<PlaceSearchItem> items = java.util.stream.IntStream.rangeClosed(base + 1, base + 5)
                .mapToObj(CandidateRankingServiceTest::place)
                .toList();
            return new PlaceSearchResult(items.size(), items);
        }
    }

    private static final class RepeatedPlacePort implements PlaceSearchPort {
        private final boolean empty;
        private final List<PlaceSearchQuery> queries = new ArrayList<>();

        private RepeatedPlacePort(boolean empty) {
            this.empty = empty;
        }

        @Override
        public PlaceSearchResult searchPlaces(PlaceSearchQuery query) {
            queries.add(query);
            return empty
                ? new PlaceSearchResult(0, List.of())
                : new PlaceSearchResult(1, List.of(place(1)));
        }
    }

    private static final class ThreePlacePort implements PlaceSearchPort {
        @Override
        public PlaceSearchResult searchPlaces(PlaceSearchQuery query) {
            return new PlaceSearchResult(3, List.of(place(1), place(2), place(3)));
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
            String name = query.query().substring(0, query.query().indexOf(" 서울"));
            return new BlogSearchResult(1, List.of(new BlogSearchItem(
                name + " 후기",
                "https://blog.test/" + call,
                name + " 서울 강남구 조용함 방문 기록",
                "작성자 " + call,
                "https://blog.test/authors/" + call,
                "20260715"
            )));
        }
    }
}
