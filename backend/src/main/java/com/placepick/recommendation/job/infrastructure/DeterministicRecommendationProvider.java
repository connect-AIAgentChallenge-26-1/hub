package com.placepick.recommendation.job.infrastructure;

import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.reason.application.ReasonStatementPolicy;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.ArrayList;
import java.util.List;

/** Network-free provider for local/test job and worker flows. */
public class DeterministicRecommendationProvider
    implements PlaceSearchPort, BlogSearchPort, GroundedReasonGenerationPort {

    @Override
    public PlaceSearchResult searchPlaces(PlaceSearchQuery query) {
        QueryContext context = QueryContext.from(query.query());
        List<PlaceSearchItem> items = new ArrayList<>();
        for (int index = 1; index <= query.limit(); index++) {
            String name = "PlacePick Mock " + context.typeToken() + " " + index;
            items.add(new PlaceSearchItem(
                name,
                "https://mock.placepick.local/places/" + context.path() + "-" + index,
                context.category(),
                "조용한 디저트 주차 뷰 룸 채식 반려동물 조건을 위한 합성 후보",
                context.location() + " 모의동 " + index,
                context.location() + " 모의로 " + index + "길",
                "0",
                "0"
            ));
        }
        return new PlaceSearchResult(items.size(), items);
    }

    @Override
    public BlogSearchResult searchBlogs(BlogSearchQuery query) {
        String candidate = candidateName(query.query());
        List<BlogSearchItem> items = new ArrayList<>();
        for (int index = 1; index <= Math.min(2, query.limit()); index++) {
            items.add(new BlogSearchItem(
                candidate + " 합성 근거 " + index,
                "https://mock.placepick.local/blog/evidence-" + Math.abs(candidate.hashCode()) +
                    "-" + index,
                candidate + "의 조건을 확인하는 네트워크 없는 근거입니다.",
                "placepick-mock",
                "https://mock.placepick.local/authors/mock",
                "2026010" + index
            ));
        }
        return new BlogSearchResult(items.size(), items);
    }

    @Override
    public ReasonGenerationOutcome generate(ReasonGenerationCommand command) {
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

    private static String candidateName(String query) {
        int boundary = query.indexOf(" 서울");
        if (boundary < 0) {
            boundary = query.lastIndexOf(' ');
        }
        return boundary > 0 ? query.substring(0, boundary) : query;
    }

    private record QueryContext(
        String location,
        String typeToken,
        String category,
        String path
    ) {
        private static QueryContext from(String query) {
            for (String type : List.of("카페", "음식점", "술집")) {
                int boundary = query.indexOf(" " + type);
                if (boundary > 0) {
                    return new QueryContext(
                        query.substring(0, boundary),
                        type,
                        switch (type) {
                            case "카페" -> "카페>디저트";
                            case "음식점" -> "음식점>한식";
                            default -> "술집>바";
                        },
                        switch (type) {
                            case "카페" -> "cafe";
                            case "음식점" -> "restaurant";
                            default -> "bar";
                        }
                    );
                }
            }
            int boundary = query.lastIndexOf(' ');
            String location = boundary > 0 ? query.substring(0, boundary) : query;
            String detail = boundary > 0 ? query.substring(boundary + 1) : "장소";
            return new QueryContext(location, detail, detail, "other");
        }
    }
}
