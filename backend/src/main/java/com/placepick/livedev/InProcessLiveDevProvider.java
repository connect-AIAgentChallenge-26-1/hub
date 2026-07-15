package com.placepick.livedev;

import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.BlogSearchResult;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchResult;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.application.ReasonStatementPolicy;
import com.placepick.recommendation.reason.domain.GeneratedReasonBatch;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Deterministic, network-free provider used by {@code make dev}. */
final class InProcessLiveDevProvider
    implements PlaceSearchPort, BlogSearchPort, GroundedReasonGenerationPort {

    private static final List<String> KNOWN_TYPE_TOKENS = List.of("카페", "음식점", "술집");

    @Override
    public PlaceSearchResult searchPlaces(PlaceSearchQuery query) {
        QueryContext context = QueryContext.from(query.query());
        List<PlaceSearchItem> items = new ArrayList<>();
        for (int index = 1; index <= query.limit(); index++) {
            String suffix = Integer.toString(index);
            String name = "플레이스픽 모의 " + context.typeLabel() + " " + suffix;
            items.add(new PlaceSearchItem(
                name,
                "https://mock.placepick.local/places/" + context.typePath() + "-" + suffix,
                context.category(),
                context.preferences() + " 조건을 확인할 수 있는 네트워크 없는 모의 후보",
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
        String candidateName = candidateName(query.query());
        List<BlogSearchItem> items = new ArrayList<>();
        for (int index = 1; index <= Math.min(2, query.limit()); index++) {
            items.add(new BlogSearchItem(
                candidateName + " 모의 방문 기록 " + index,
                "https://mock.placepick.local/blog/" + slug(candidateName) + "-" + index,
                candidateName + "의 조건과 분위기를 확인한 네트워크 없는 합성 근거입니다.",
                "placepick-mock",
                "https://mock.placepick.local/authors/placepick-mock",
                "2026010" + index
            ));
        }
        return new BlogSearchResult(items.size(), items);
    }

    @Override
    public ReasonGenerationOutcome generate(ReasonGenerationCommand command) {
        List<PlaceReasonStatements> places = command.places().stream()
            .map(place -> new PlaceReasonStatements(
                place.placeId(),
                List.of(new ReasonStatement(
                    ReasonStatementPolicy.expectedText(place.evidence().get(0).type()),
                    List.of(place.evidence().get(0).evidenceId())
                ))
            ))
            .toList();
        return ReasonGenerationOutcome.generated(new GeneratedReasonBatch(
            GeneratedReasonBatch.SCHEMA_VERSION,
            places
        ));
    }

    private static String candidateName(String blogQuery) {
        int locationStart = blogQuery.indexOf(" 서울");
        if (locationStart < 0) {
            locationStart = blogQuery.lastIndexOf(' ');
        }
        return locationStart > 0 ? blogQuery.substring(0, locationStart) : blogQuery;
    }

    private static String slug(String source) {
        return source.toLowerCase(Locale.ROOT)
            .replaceAll("[^\\p{L}\\p{N}]+", "-")
            .replaceAll("(^-|-$)", "");
    }

    private record QueryContext(
        String location,
        String typeLabel,
        String typePath,
        String category,
        String preferences
    ) {
        private static QueryContext from(String query) {
            for (String token : KNOWN_TYPE_TOKENS) {
                int boundary = query.indexOf(" " + token);
                if (boundary > 0) {
                    String location = query.substring(0, boundary);
                    String afterType = query.substring(boundary + token.length() + 1).strip();
                    return new QueryContext(
                        location,
                        token,
                        switch (token) {
                            case "카페" -> "cafe";
                            case "음식점" -> "restaurant";
                            default -> "bar";
                        },
                        switch (token) {
                            case "카페" -> "카페>디저트";
                            case "음식점" -> "음식점>한식";
                            default -> "술집>바";
                        },
                        afterType
                    );
                }
            }
            int boundary = query.lastIndexOf(' ');
            String location = boundary > 0 ? query.substring(0, boundary) : query;
            String detail = boundary > 0 ? query.substring(boundary + 1) : "장소";
            return new QueryContext(location, detail, "other", detail, "");
        }
    }
}
