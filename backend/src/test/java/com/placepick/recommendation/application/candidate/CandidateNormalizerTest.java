package com.placepick.recommendation.application.candidate;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.recommendation.application.port.out.BlogSearchItem;
import com.placepick.recommendation.application.port.out.PlaceSearchItem;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class CandidateNormalizerTest {

    private final CandidateNormalizer normalizer = new CandidateNormalizer(
        new CategoryTaxonomy(),
        new LocationMatcher()
    );

    @Test
    void accountsForEveryReceivedItemWithOneClosedFunnelReason() {
        PlaceSearchItem eligible = place(
            "카페 하나",
            "https://example.test/one",
            "카페",
            "서울 강남구",
            "조용한 좌석"
        );
        CandidateNormalizationResult result = normalizer.normalizeEligibleWithFunnel(
            List.of(
                eligible,
                place("식별 불가", "", "카페", "", ""),
                place("다른 지역 식당", "https://example.test/location", "한식", "부산 해운대구", ""),
                place("다른 유형", "https://example.test/type", "한식", "서울 강남구", ""),
                place("제외 후보", "https://example.test/exclusion", "카페", "서울 강남구", "흡연실"),
                eligible
            ),
            condition(PlaceType.CAFE, null, List.of("흡연"))
        );

        assertThat(result.candidates()).singleElement();
        assertThat(result.funnel()).satisfies(funnel -> {
            assertThat(funnel.receivedCount()).isEqualTo(6);
            assertThat(funnel.eligibleCount()).isEqualTo(1);
            assertThat(funnel.rejectedCount()).isEqualTo(5);
            assertThat(funnel.rejectionCounts()).containsExactlyInAnyOrderEntriesOf(
                java.util.Map.of(
                    CandidateRejectionReason.MISSING_IDENTITY, 1,
                    CandidateRejectionReason.LOCATION, 1,
                    CandidateRejectionReason.TYPE, 1,
                    CandidateRejectionReason.EXCLUSION, 1,
                    CandidateRejectionReason.DUPLICATE, 1
                )
            );
        });
    }

    @Test
    void preservesDisplayGlyphsWhileNormalizingComparisonHtmlAndWhitespace() {
        List<PlaceSearchItem> items = List.of(
            place("<b>카페　Ａ</b>", "https://example.test/one", "카페>디저트", "서울특별시 강남구", "조용한 좌석"),
            place("식별 정보 없음", "", "카페", "", ""),
            place("다른 지역", "https://example.test/two", "카페", "부산광역시 해운대구", ""),
            place("다른 유형", "https://example.test/three", "한식", "서울 강남구", ""),
            place("제외 후보", "https://example.test/four", "카페", "서울 강남구", "흡연실")
        );

        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            items,
            condition(PlaceType.CAFE, null, List.of("흡연"))
        );

        assertThat(result).singleElement().satisfies(candidate -> {
            assertThat(candidate.name()).isEqualTo("카페 Ａ");
            assertThat(candidate.sourceUrl()).isEqualTo("https://example.test/one");
            assertThat(candidate.searchableText()).contains("조용한 좌석");
        });
    }

    @Test
    void removesEncodedHtmlBeforeAProviderStringCanReachDisplayOutput() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(place(
                "&lt;script&gt;alert(1)&lt;/script&gt; 카페 하나",
                "https://example.test/safe",
                "카페",
                "서울 강남구",
                ""
            )),
            condition(PlaceType.CAFE, null, List.of())
        );

        assertThat(result).singleElement().satisfies(candidate -> {
            assertThat(candidate.name()).isEqualTo("alert(1) 카페 하나");
            assertThat(candidate.name()).doesNotContain("<", ">");
        });
    }

    @Test
    void deduplicatesByCanonicalLinkOrConservativeNameAndAddressIndependentOfInputOrder() {
        PlaceSearchItem first = place(
            "카페 하나",
            "HTTPS://EXAMPLE.TEST:443/place/1#section",
            "카페",
            "서울특별시 강남구 테헤란로 1",
            ""
        );
        PlaceSearchItem sameLink = place(
            "카페 하나 강남점",
            "https://example.test/place/1",
            "카페>디저트",
            "서울특별시 강남구 테헤란로 1",
            "소개"
        );
        PlaceSearchItem sameComposite = place(
            "카페 하나",
            "https://example.test/alternate",
            "카페",
            "서울특별시 강남구 테헤란로 1",
            "다른 소개"
        );
        PlaceSearchItem otherBranch = place(
            "카페 하나",
            "https://example.test/place/2",
            "카페",
            "서울특별시 강남구 테헤란로 2",
            ""
        );
        List<PlaceSearchItem> forward = List.of(first, sameLink, sameComposite, otherBranch);
        List<PlaceSearchItem> reverse = new ArrayList<>(forward);
        Collections.reverse(reverse);

        List<NormalizedCandidate> firstResult = normalizer.normalizeEligible(
            forward, condition(PlaceType.CAFE, null, List.of())
        );
        List<NormalizedCandidate> secondResult = normalizer.normalizeEligible(
            reverse, condition(PlaceType.CAFE, null, List.of())
        );

        assertThat(firstResult).hasSize(3).isEqualTo(secondResult);
        assertThat(firstResult).extracting(value -> value.candidateKey().value())
            .doesNotHaveDuplicates();
    }

    @Test
    void mergesDifferentLinksOnlyWhenEachLinkGroupHasOneSharedCompositeIdentity() {
        PlaceSearchItem first = place(
            "카페 하나",
            "https://example.test/primary",
            "카페",
            "서울 강남구 테헤란로 1",
            ""
        );
        PlaceSearchItem alternate = place(
            "카페 하나",
            "https://example.test/alternate",
            "카페",
            "서울 강남구 테헤란로 1",
            ""
        );

        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(first, alternate),
            condition(PlaceType.CAFE, null, List.of())
        );

        assertThat(result).singleElement().satisfies(candidate ->
            assertThat(candidate.candidateKey()).isEqualTo(
                normalizer.normalizeEligible(
                    List.of(alternate, first),
                    condition(PlaceType.CAFE, null, List.of())
                ).get(0).candidateKey()
            )
        );
    }

    @Test
    void refusesATransitiveBridgeWhenOneCanonicalLinkHasConflictingComposites() {
        PlaceSearchItem first = place(
            "카페 하나",
            "https://example.test/shared",
            "카페",
            "서울 강남구 테헤란로 1",
            ""
        );
        PlaceSearchItem changedAddress = place(
            "카페 하나",
            "https://example.test/shared",
            "카페",
            "서울 강남구 테헤란로 2",
            ""
        );
        PlaceSearchItem bridge = place(
            "카페 하나",
            "https://example.test/other",
            "카페",
            "서울 강남구 테헤란로 2",
            ""
        );

        assertThat(normalizer.normalizeEligible(
            List.of(first, changedAddress, bridge),
            condition(PlaceType.CAFE, null, List.of())
        )).hasSize(2);
    }

    @Test
    void appliesTheVersionedOtherTaxonomyAgainstNameOrCategory() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(
                place("북스토어 하나", "https://example.test/book", "서점", "서울 강남구", ""),
                place("소품 하나", "https://example.test/goods", "소품샵", "서울 강남구", "")
            ),
            condition(PlaceType.OTHER, "서점", List.of())
        );

        assertThat(CategoryTaxonomy.VERSION).isEqualTo("place-category.v1");
        assertThat(result).singleElement().extracting(NormalizedCandidate::name)
            .isEqualTo("북스토어 하나");
    }

    @Test
    void requiresAllLocationTokensInOneAddressRepresentation() {
        PlaceSearchItem splitAcrossAddressFields = new PlaceSearchItem(
            "카페 하나",
            "https://example.test/split-address",
            "카페",
            "",
            "서울특별시 종로구",
            "경기도 강남구",
            "",
            ""
        );

        assertThat(normalizer.normalizeEligible(
            List.of(splitAcrossAddressFields),
            condition(PlaceType.CAFE, null, List.of())
        )).isEmpty();
    }

    @Test
    void doesNotCollapseDistinctNumberedNeighborhoods() {
        ConfirmedRecommendationCondition numberedLocation = new ConfirmedRecommendationCondition(
            "서울 종로1가",
            PlaceType.CAFE,
            null,
            null,
            null,
            null,
            List.of(new Preference("조용한", 5)),
            List.of()
        );

        assertThat(normalizer.normalizeEligible(
            List.of(place(
                "카페 하나",
                "https://example.test/wrong-neighborhood",
                "카페",
                "서울 종로2가",
                ""
            )),
            numberedLocation
        )).isEmpty();
    }

    @Test
    void doesNotMatchOtherDetailAcrossNameAndCategoryBoundaries() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(place("복합 문", "https://example.test/cross", "화공 간", "서울 강남구", "")),
            condition(PlaceType.OTHER, "문화공간", List.of())
        );

        assertThat(result).isEmpty();
    }

    @Test
    void doesNotTreatAnUnrelatedWordContainingBarAsTheBarCategory() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(
                place("바리스타 학원", "https://example.test/academy", "교육원", "서울 강남구", ""),
                place("위스키바 하나", "https://example.test/bar", "바", "서울 강남구", "")
            ),
            condition(PlaceType.BAR, null, List.of())
        );

        assertThat(result).singleElement().extracting(NormalizedCandidate::name)
            .isEqualTo("위스키바 하나");
    }

    @Test
    void doesNotTreatWordsThatMerelyStartWithCafeAsTheCafeCategory() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(
                place("카페인 연구소", "https://example.test/caffeine", "연구소", "서울 강남구", ""),
                place("정상 카페", "https://example.test/cafe", "카페", "서울 강남구", "")
            ),
            condition(PlaceType.CAFE, null, List.of())
        );

        assertThat(result).singleElement().extracting(NormalizedCandidate::name)
            .isEqualTo("정상 카페");
    }

    @Test
    void linksAtMostThreeUniqueValidBlogEvidenceItemsToTheCandidate() {
        NormalizedCandidate candidate = normalizer.normalizeEligible(
            List.of(place("카페 하나", "https://example.test/place", "카페", "서울 강남구", "")),
            condition(PlaceType.CAFE, null, List.of())
        ).get(0);
        List<BlogSearchItem> source = List.of(
            blog("<b>카페 하나</b> 후기", "https://blog.test/1"),
            blog("카페 하나 후기 복제", "HTTPS://BLOG.TEST:443/1#copy"),
            blog("카페 하나 두 번째", "https://blog.test/2"),
            blog("카페 하나 세 번째", "https://blog.test/3"),
            blog("카페 하나 네 번째", "https://blog.test/4"),
            blog("관련 없는 글", "https://blog.test/5"),
            blog("카페 하나 잘못된 URL", "javascript:alert(1)")
        );

        List<CandidateEvidence> evidence = normalizer.normalizeEvidence(candidate, source);
        List<BlogSearchItem> reversed = new ArrayList<>(source);
        Collections.reverse(reversed);

        assertThat(evidence).hasSize(3);
        assertThat(normalizer.normalizeEvidence(candidate, reversed)).isEqualTo(evidence);
        assertThat(evidence).extracting(CandidateEvidence::sourceUrl)
            .containsExactly("https://blog.test/1", "https://blog.test/2", "https://blog.test/3");
        assertThat(evidence).extracting(CandidateEvidence::evidenceId).doesNotHaveDuplicates();
    }

    @Test
    void rejectsABlogPostForANameMatchInADifferentBranchLocation() {
        NormalizedCandidate candidate = normalizer.normalizeEligible(
            List.of(place("커피빈", "https://example.test/gangnam", "카페", "서울 강남구", "")),
            condition(PlaceType.CAFE, null, List.of())
        ).get(0);

        assertThat(normalizer.normalizeEvidence(
            candidate,
            List.of(new BlogSearchItem(
                "커피빈 홍대점 후기",
                "https://blog.test/wrong-branch",
                "홍대에서 방문한 카페 기록",
                "작성자",
                "",
                "20260715"
            )),
            "서울 강남구"
        )).isEmpty();
    }

    @Test
    void preservesPercentEncodedCanonicalBlogPathsAcrossJavaAndGateway() {
        NormalizedCandidate candidate = normalizer.normalizeEligible(
            List.of(place("카페 알파", "https://example.test/place", "카페", "서울 강남구", "")),
            condition(PlaceType.CAFE, null, List.of())
        ).get(0);

        List<CandidateEvidence> evidence = normalizer.normalizeEvidence(
            candidate,
            List.of(blog(
                "카페 알파 후기",
                "HTTPS://EXAMPLE.INVALID:443/blog/%EC%B9%B4%ED%8E%98%20%EC%95%8C%ED%8C%8C#fragment"
            ))
        );

        assertThat(evidence).singleElement().satisfies(value -> {
            assertThat(value.evidenceId()).isEqualTo("e-a9e8168b6bb8e7ad");
            assertThat(value.sourceUrl()).contains("%EC%B9%B4%ED%8E%98");
        });
    }

    @Test
    void rejectsEncodedDotSegmentsBeforeCrossRuntimeCanonicalization() {
        NormalizedCandidate candidate = normalizer.normalizeEligible(
            List.of(place("카페 알파", "https://example.test/place", "카페", "서울 강남구", "")),
            condition(PlaceType.CAFE, null, List.of())
        ).get(0);

        assertThat(normalizer.normalizeEvidence(
            candidate,
            List.of(blog(
                "카페 알파 후기",
                "https://example.invalid/blog/%2e%2e/private"
            ))
        )).isEmpty();
    }

    @Test
    void keepsALinklessCandidateWhenNameAndAddressProvideStableIdentity() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(place("링크 없는 카페", "", "카페", "서울 강남구", "조용함")),
            condition(PlaceType.CAFE, null, List.of())
        );

        assertThat(result).singleElement().satisfies(candidate -> {
            assertThat(candidate.sourceUrl()).isNull();
            assertThat(candidate.address()).isEqualTo("서울 강남구");
        });
    }

    @Test
    void doesNotMergeBranchesThatShareAHomepageButHaveDifferentAddresses() {
        List<NormalizedCandidate> result = normalizer.normalizeEligible(
            List.of(
                place("공유 카페", "https://brand.test", "카페", "서울 강남구 1", ""),
                place("공유 카페", "https://brand.test", "카페", "서울 강남구 2", "")
            ),
            condition(PlaceType.CAFE, null, List.of())
        );

        assertThat(result).hasSize(2);
        assertThat(result).extracting(NormalizedCandidate::candidateKey).doesNotHaveDuplicates();
    }

    private ConfirmedRecommendationCondition condition(
        PlaceType placeType,
        String detail,
        List<String> exclusions
    ) {
        return new ConfirmedRecommendationCondition(
            "서울 강남구",
            placeType,
            detail,
            null,
            null,
            null,
            List.of(new Preference("조용한", 5)),
            exclusions
        );
    }

    private PlaceSearchItem place(
        String name,
        String link,
        String category,
        String address,
        String description
    ) {
        return new PlaceSearchItem(name, link, category, description, address, address, "", "");
    }

    private BlogSearchItem blog(String title, String link) {
        return new BlogSearchItem(title, link, "서울 강남구 카페 하나 방문 기록", "작성자", "", "20260715");
    }
}
