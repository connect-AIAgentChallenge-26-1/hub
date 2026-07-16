package com.placepick.infrastructure.external.naver;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.exactly;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.BlogSearchQuery;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchQuery;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.port.out.SearchProviderFailure;
import com.placepick.recommendation.application.port.out.SearchProviderFailureStage;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class NaverApiHubAdapterIntegrationTest {

    private static final String KEY_ID = "synthetic-key-id";
    private static final String KEY = "synthetic-key";
    private static final WireMockServer WIRE_MOCK = new WireMockServer(
        WireMockConfiguration.options().dynamicPort()
    );

    private NaverApiHubAdapter adapter;

    @BeforeAll
    static void startWireMock() {
        WIRE_MOCK.start();
    }

    @AfterAll
    static void stopWireMock() {
        WIRE_MOCK.stop();
    }

    @BeforeEach
    void setUp() {
        WIRE_MOCK.resetAll();
        adapter = newAdapter(Duration.ofSeconds(2));
    }

    @Test
    void callsCurrentLocalContractAndMapsPlainProviderNeutralItems() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH))
            .willReturn(jsonResponse(200, """
                {
                  "lastBuildDate": "Tue, 14 Jul 2026 09:00:00 +0900",
                  "total": 1,
                  "start": 1,
                  "display": 1,
                  "items": [{
                    "title": "<b>가상</b> &amp; 테스트 카페",
                    "link": "https://example.invalid/places/1",
                    "category": "카페&gt;디저트",
                    "description": "<em>합성</em> 설명",
                    "telephone": "",
                    "address": "서울특별시 테스트구 가상로 1",
                    "roadAddress": "서울특별시 테스트구 가상로 1",
                    "mapx": "1260000000",
                    "mapy": "370000000"
                  }]
                }
                """)));

        var result = adapter.searchPlaces(new PlaceSearchQuery("서울 가상 카페", 1));

        assertThat(result.total()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.name()).isEqualTo("가상 & 테스트 카페");
            assertThat(item.category()).isEqualTo("카페>디저트");
            assertThat(item.description()).isEqualTo("합성 설명");
        });
        verifyCurrentRequest(NaverApiHubAdapter.LOCAL_PATH, "서울 가상 카페");
        WIRE_MOCK.verify(0, getRequestedFor(urlPathEqualTo("/v1/search/local.json")));
    }

    @Test
    void callsCurrentBlogContractAndMapsPlainProviderNeutralEvidence() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH))
            .willReturn(jsonResponse(200, """
                {
                  "lastBuildDate": "Tue, 14 Jul 2026 09:00:00 +0900",
                  "total": 1,
                  "start": 1,
                  "display": 1,
                  "items": [{
                    "title": "<b>가상 카페</b> 후기",
                    "link": "https://example.invalid/blog/1",
                    "description": "근거용 &amp; 합성 설명",
                    "bloggername": "가상 작성자",
                    "bloggerlink": "https://example.invalid/blogs/author",
                    "postdate": "20260714"
                  }]
                }
                """)));

        var result = adapter.searchBlogs(new BlogSearchQuery("서울 가상 카페 후기", 1));

        assertThat(result.total()).isEqualTo(1);
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.title()).isEqualTo("가상 카페 후기");
            assertThat(item.summary()).isEqualTo("근거용 & 합성 설명");
            assertThat(item.publishedDate()).isEqualTo("20260714");
        });
        verifyCurrentRequest(NaverApiHubAdapter.BLOG_PATH, "서울 가상 카페 후기");
        WIRE_MOCK.verify(0, getRequestedFor(urlPathEqualTo("/v1/search/blog.json")));
    }

    @Test
    void dropsOnlyIncompleteItemsAndKeepsUsableProviderResults() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH))
            .willReturn(jsonResponse(200, """
                {
                  "total": 2,
                  "items": [
                    {"title":"", "link":"https://example.invalid/ignored"},
                    {
                      "title":"검증 가능한 카페",
                      "link":"https://example.invalid/places/usable",
                      "category":"카페",
                      "address":"서울특별시 테스트구"
                    }
                  ]
                }
                """)));

        var result = adapter.searchPlaces(new PlaceSearchQuery("합성 검색", 2));

        assertThat(result.total()).isEqualTo(2);
        assertThat(result.items())
            .extracting(PlaceSearchItem::name)
            .containsExactly("검증 가능한 카페");
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH)));
    }

    @ParameterizedTest
    @CsvSource({
        "local, 400, INVALID_REQUEST",
        "local, 401, AUTHENTICATION_FAILED",
        "local, 403, AUTHENTICATION_FAILED",
        "local, 429, RATE_LIMITED",
        "local, 503, PROVIDER_UNAVAILABLE",
        "blog, 400, INVALID_REQUEST",
        "blog, 401, AUTHENTICATION_FAILED",
        "blog, 403, AUTHENTICATION_FAILED",
        "blog, 429, RATE_LIMITED",
        "blog, 503, PROVIDER_UNAVAILABLE"
    })
    void normalizesBothEndpointHttpFailuresWithoutRetry(
        String endpoint,
        int status,
        SearchProviderFailure expectedFailure
    ) {
        String path = pathFor(endpoint);
        WIRE_MOCK.stubFor(get(urlPathEqualTo(path))
            .willReturn(jsonResponse(status, "{\"errorCode\":\"SYNTHETIC\"}")));

        assertThatThrownBy(() -> invoke(endpoint, "오류 분류"))
            .isInstanceOfSatisfying(SearchProviderException.class, exception -> {
                assertThat(exception.failure()).isEqualTo(expectedFailure);
                assertThat(exception.httpStatus()).isEqualTo(status);
                assertThat(exception.stage()).isEqualTo(SearchProviderFailureStage.HTTP_STATUS);
                assertThat(exception.getMessage()).doesNotContain(KEY_ID, KEY, "SYNTHETIC");
            });

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path)));
    }

    @ParameterizedTest
    @CsvSource({"local", "blog"})
    void normalizesBothEndpointTimeoutsWithoutRetrying(String endpoint) {
        adapter = newAdapter(Duration.ofMillis(100));
        String path = pathFor(endpoint);
        WIRE_MOCK.stubFor(get(urlPathEqualTo(path))
            .willReturn(jsonResponse(200, "{\"total\":0,\"items\":[]}")
                .withFixedDelay(500)));

        assertThatThrownBy(() -> invoke(endpoint, "지연 검증"))
            .isInstanceOfSatisfying(SearchProviderException.class, exception -> {
                assertThat(exception.failure()).isEqualTo(SearchProviderFailure.PROVIDER_UNAVAILABLE);
                assertThat(exception.getCause()).isNull();
                assertThat(exception.getMessage()).doesNotContain("지연 검증", KEY_ID, KEY);
            });

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path)));
    }

    @ParameterizedTest
    @CsvSource({"local", "blog"})
    void rejectsMalformedJsonFromBothEndpoints(String endpoint) {
        String path = pathFor(endpoint);
        WIRE_MOCK.stubFor(get(urlPathEqualTo(path))
            .willReturn(jsonResponse(200, "{not-json")));

        assertThatThrownBy(() -> invoke(endpoint, "응답 검증"))
            .isInstanceOfSatisfying(SearchProviderException.class, exception -> {
                assertThat(exception.failure()).isEqualTo(SearchProviderFailure.INVALID_RESPONSE);
                assertThat(exception.httpStatus()).isEqualTo(200);
                assertThat(exception.stage()).isEqualTo(SearchProviderFailureStage.JSON);
                assertThat(exception.getCause()).isNull();
                assertThat(exception.getMessage()).doesNotContain("응답 검증", KEY_ID, KEY, "not-json");
            });

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path)));
    }

    @ParameterizedTest
    @CsvSource({"local, text/plain", "blog, application/octet-stream"})
    void acceptsStrictlyValidJsonWhenProviderUsesANonJsonMediaType(
        String endpoint,
        String contentType
    ) {
        String path = pathFor(endpoint);
        WIRE_MOCK.stubFor(get(urlPathEqualTo(path))
            .willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", contentType)
                .withBody("{\"total\":1,\"items\":[{\"title\":\"합성 결과\"}]}")));

        invoke(endpoint, "비표준 media type 검증");

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path))
            .withHeader("Accept", equalTo("application/json")));
    }

    @ParameterizedTest
    @CsvSource({"local", "blog"})
    void acceptsStrictlyValidJsonWhenProviderOmitsTheMediaType(String endpoint) {
        String path = pathFor(endpoint);
        WIRE_MOCK.stubFor(get(urlPathEqualTo(path))
            .willReturn(aResponse()
                .withStatus(200)
                .withBody("{\"total\":1,\"items\":[{\"title\":\"합성 결과\"}]}")));

        invoke(endpoint, "media type 누락 검증");

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path))
            .withHeader("Accept", equalTo("application/json")));
    }

    @ParameterizedTest
    @CsvSource({"local", "blog"})
    void stillRejectsMalformedJsonWhenTheMediaTypeIsNonJson(String endpoint) {
        String path = pathFor(endpoint);
        WIRE_MOCK.stubFor(get(urlPathEqualTo(path))
            .willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "text/plain")
                .withBody("{not-json")));

        assertThatThrownBy(() -> invoke(endpoint, "비표준 media type 오류 검증"))
            .isInstanceOfSatisfying(SearchProviderException.class, exception -> {
                assertThat(exception.failure()).isEqualTo(SearchProviderFailure.INVALID_RESPONSE);
                assertThat(exception.httpStatus()).isEqualTo(200);
                assertThat(exception.stage()).isEqualTo(SearchProviderFailureStage.JSON);
                assertThat(exception.getCause()).isNull();
                assertThat(exception.getMessage()).doesNotContain(KEY_ID, KEY, "not-json");
            });

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path)));
    }

    @Test
    void acceptsProviderDocumentedOptionalItemFieldsWhenTheyAreOmitted() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH))
            .willReturn(jsonResponse(200, """
                {
                  "lastBuildDate": "Tue, 14 Jul 2026 09:00:00 +0900",
                  "total": 1,
                  "start": 1,
                  "display": 1,
                  "items": [{"title": "필드 누락"}]
                }
                """)));
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH))
            .willReturn(jsonResponse(200, """
                {
                  "lastBuildDate": "Tue, 14 Jul 2026 09:00:00 +0900",
                  "total": 1,
                  "start": 1,
                  "display": 1,
                  "items": [{"title": "선택 필드 생략"}]
                }
                """)));

        var places = adapter.searchPlaces(new PlaceSearchQuery("선택 필드 검증", 1));
        var blogs = adapter.searchBlogs(new BlogSearchQuery("선택 필드 검증", 1));

        assertThat(places.items()).singleElement().satisfies(item -> {
            assertThat(item.name()).isEqualTo("필드 누락");
            assertThat(item.link()).isEmpty();
            assertThat(item.roadAddress()).isEmpty();
        });
        assertThat(blogs.items()).singleElement().satisfies(item -> {
            assertThat(item.title()).isEqualTo("선택 필드 생략");
            assertThat(item.link()).isEmpty();
            assertThat(item.publishedDate()).isEmpty();
        });

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH)));
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH)));
    }

    @Test
    void acceptsProviderDocumentedOptionalEnvelopeMetadataWhenItIsOmitted() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH))
            .willReturn(jsonResponse(200, """
                {"total":1,"items":[{"title":"선택 envelope 지역"}]}
                """)));
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH))
            .willReturn(jsonResponse(200, """
                {"total":1,"items":[{"title":"선택 envelope 블로그"}]}
                """)));

        var places = adapter.searchPlaces(new PlaceSearchQuery("선택 envelope 검증", 1));
        var blogs = adapter.searchBlogs(new BlogSearchQuery("선택 envelope 검증", 1));

        assertThat(places.total()).isOne();
        assertThat(places.items()).singleElement()
            .extracting(PlaceSearchItem::name)
            .isEqualTo("선택 envelope 지역");
        assertThat(blogs.total()).isOne();
        assertThat(blogs.items()).singleElement()
            .extracting(BlogSearchItem::title)
            .isEqualTo("선택 envelope 블로그");
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH)));
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH)));
    }

    @Test
    void dropsAnItemWithoutTheMinimumUsableTitle() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH))
            .willReturn(jsonResponse(200, """
                {
                  "lastBuildDate": "Tue, 14 Jul 2026 09:00:00 +0900",
                  "total": 1,
                  "start": 1,
                  "display": 1,
                  "items": [{"address": "제목 없음"}]
                }
                """)));

        var result = adapter.searchPlaces(new PlaceSearchQuery("schema 검증", 1));

        assertThat(result.items()).isEmpty();
        assertThat(result.total()).isOne();

        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH)));
    }

    @Test
    void acceptsExplicitZeroItemResponsesFromBothEndpoints() {
        String emptyBody = "{\"lastBuildDate\":\"Tue, 14 Jul 2026 09:00:00 +0900\"," +
            "\"total\":0,\"start\":1,\"display\":0,\"items\":[]}";
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH))
            .willReturn(jsonResponse(200, emptyBody)));
        WIRE_MOCK.stubFor(get(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH))
            .willReturn(jsonResponse(200, emptyBody)));

        var places = adapter.searchPlaces(new PlaceSearchQuery("결과 없음", 1));
        var blogs = adapter.searchBlogs(new BlogSearchQuery("결과 없음", 1));

        assertThat(places.total()).isZero();
        assertThat(places.items()).isEmpty();
        assertThat(blogs.total()).isZero();
        assertThat(blogs.items()).isEmpty();
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.LOCAL_PATH)));
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(NaverApiHubAdapter.BLOG_PATH)));
    }

    private static void verifyCurrentRequest(String path, String query) {
        WIRE_MOCK.verify(exactly(1), getRequestedFor(urlPathEqualTo(path))
            .withHeader("Accept", equalTo("application/json"))
            .withHeader(NaverApiHubAdapter.KEY_ID_HEADER, equalTo(KEY_ID))
            .withHeader(NaverApiHubAdapter.KEY_HEADER, equalTo(KEY))
            .withQueryParam("query", equalTo(query))
            .withQueryParam("display", equalTo("1"))
            .withoutQueryParam("start")
            .withoutQueryParam("sort")
            .withoutQueryParam("format"));
    }

    private static NaverApiHubAdapter newAdapter(Duration responseTimeout) {
        return NaverApiHubAdapter.createForTesting(
            URI.create(WIRE_MOCK.baseUrl()),
            KEY_ID,
            KEY,
            Duration.ofSeconds(1),
            responseTimeout
        );
    }

    private void invoke(String endpoint, String query) {
        if ("local".equals(endpoint)) {
            adapter.searchPlaces(new PlaceSearchQuery(query, 1));
        } else if ("blog".equals(endpoint)) {
            adapter.searchBlogs(new BlogSearchQuery(query, 1));
        } else {
            throw new IllegalArgumentException("Unknown synthetic endpoint case.");
        }
    }

    private static String pathFor(String endpoint) {
        return switch (endpoint) {
            case "local" -> NaverApiHubAdapter.LOCAL_PATH;
            case "blog" -> NaverApiHubAdapter.BLOG_PATH;
            default -> throw new IllegalArgumentException("Unknown synthetic endpoint case.");
        };
    }

    private static ResponseDefinitionBuilder jsonResponse(
        int status,
        String body
    ) {
        return aResponse()
            .withStatus(status)
            .withHeader("Content-Type", "application/json; charset=UTF-8")
            .withBody(body);
    }
}
