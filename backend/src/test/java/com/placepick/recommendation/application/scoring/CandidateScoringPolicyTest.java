package com.placepick.recommendation.application.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.recommendation.application.candidate.CandidateQueryPlan;
import com.placepick.recommendation.application.candidate.LocationConfidence;
import com.placepick.recommendation.application.candidate.SearchObservation;
import com.placepick.recommendation.application.port.out.PlaceSearchSort;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.domain.candidate.CandidateEvidence;
import com.placepick.recommendation.domain.candidate.CandidateKey;
import com.placepick.recommendation.domain.candidate.NormalizedCandidate;
import com.placepick.recommendation.domain.scoring.ScoreBreakdown;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class CandidateScoringPolicyTest {

    private final CandidateScoringPolicy policy = new CandidateScoringPolicy(
        new PreferenceEvidenceMatcher(),
        Clock.fixed(Instant.parse("2026-07-16T00:00:00Z"), ZoneOffset.UTC)
    );

    @Test
    void calculatesLocationRrfPreferenceAndEvidenceQualityOnTheHundredPointScale() {
        ConfirmedRecommendationCondition condition = condition(List.of(
            new Preference("조용함", 2),
            new Preference("주차", 1)
        ));
        List<CandidateQueryPlan> plans = plans();
        NormalizedCandidate candidate = candidate(
            "a",
            "조용한 카페",
            List.of(
                new SearchObservation("v2.base.accuracy", PlaceSearchSort.ACCURACY, 1, 1_000),
                new SearchObservation("v2.base.popularity", PlaceSearchSort.POPULARITY, 2, 900)
            )
        );

        var scored = policy.score(condition, candidate, evidence(2), plans);

        assertThat(scored.scoreBreakdown()).satisfies(score -> {
            assertThat(score.locationConfidence()).isEqualTo(15);
            assertThat(score.searchRelevance()).isEqualTo(30);
            assertThat(score.preferenceEvidence()).isEqualTo(30);
            assertThat(score.evidenceQuality()).isEqualTo(21);
            assertThat(score.total()).isEqualTo(96);
        });
    }

    @Test
    void lexicalSynonymsCanUseValidatedBlogEvidenceWithoutEmbeddings() {
        NormalizedCandidate candidate = candidate(
            "b",
            "카페",
            List.of(new SearchObservation(
                "v2.base.accuracy", PlaceSearchSort.ACCURACY, 3, 1_000
            ))
        );
        ConfirmedRecommendationCondition condition = condition(List.of(
            new Preference("조용", 10)
        ));
        CandidateEvidence evidence = new CandidateEvidence(
            "e-1",
            "차분한 공간",
            "한적한 분위기",
            "https://blog.test/1",
            "작성자",
            "https://blog.test/authors/1",
            "20260715",
            90
        );

        assertThat(policy.score(condition, candidate, List.of(evidence), plans())
            .scoreBreakdown().preferenceEvidence()).isEqualTo(30);
        assertThat(PreferenceEvidenceMatcher.VERSION).isEqualTo("preference-lexicon.v1");
    }

    @Test
    void readsLegacyScoreJsonButWritesOnlyExactV2ComponentNames() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ScoreBreakdown legacy = mapper.readValue("""
            {"location":30,"placeType":25,"budget":0,"preference":10,"blogEvidence":10}
            """, ScoreBreakdown.class);
        String encoded = mapper.writeValueAsString(legacy);

        assertThat(legacy.total()).isEqualTo(75);
        assertThat(encoded).contains(
            "\"locationConfidence\"",
            "\"searchRelevance\"",
            "\"preferenceEvidence\"",
            "\"evidenceQuality\"",
            "\"total\":75"
        ).doesNotContain(
            "\"placeType\"",
            "\"budget\"",
            "\"blogEvidence\""
        );
        assertThat(mapper.readValue(encoded, ScoreBreakdown.class)).isEqualTo(legacy);
        assertThatThrownBy(() -> mapper.readValue("""
            {"locationConfidence":15,"searchRelevance":25,
             "preferenceEvidence":20,"evidenceQuality":15,"total":74}
            """, ScoreBreakdown.class))
            .hasRootCauseMessage("Score JSON total does not match its components.");
    }

    @Test
    void rejectsOutOfRangeV2ComponentsAndLegacyBudgetInference() {
        assertThatThrownBy(() -> new ScoreBreakdown(16, 30, 30, 25))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("locationConfidence");
        assertThatThrownBy(() -> new ScoreBreakdown(30, 25, 1, 15, 9))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("budget");
    }

    private ConfirmedRecommendationCondition condition(List<Preference> preferences) {
        return new ConfirmedRecommendationCondition(
            "서울",
            PlaceType.CAFE,
            null,
            null,
            10_000,
            20_000,
            preferences,
            List.of()
        );
    }

    private NormalizedCandidate candidate(
        String identity,
        String searchable,
        List<SearchObservation> observations
    ) {
        return new NormalizedCandidate(
            CandidateKey.fromIdentity(identity),
            "카페 " + identity,
            "카페",
            "",
            "서울",
            "서울",
            "https://example.test/" + identity,
            searchable,
            "127.0",
            "37.0",
            LocationConfidence.EXACT,
            observations
        );
    }

    private List<CandidateEvidence> evidence(int count) {
        return java.util.stream.IntStream.range(0, count)
            .mapToObj(index -> new CandidateEvidence(
                "e-" + index,
                index == 0 ? "조용한 공간" : "주차 안내",
                index == 0 ? "조용함" : "주차 가능",
                "https://blog.test/" + index,
                "작성자 " + index,
                "https://blog.test/authors/" + index,
                "20260715",
                100
            ))
            .toList();
    }

    private List<CandidateQueryPlan> plans() {
        return List.of(
            new CandidateQueryPlan(
                "서울 카페", List.of(), "v2.base.accuracy", PlaceSearchSort.ACCURACY, 1_000
            ),
            new CandidateQueryPlan(
                "서울 카페", List.of(), "v2.base.popularity", PlaceSearchSort.POPULARITY, 900
            )
        );
    }
}
