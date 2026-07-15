package com.placepick.liveevidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.infrastructure.external.llm.EliceConditionExtractionClient;
import com.placepick.infrastructure.external.llm.LiveEvidenceConditionProbe;
import com.placepick.infrastructure.external.naver.NaverApiHubAdapter;
import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.reason.adapter.out.llm.EliceGroundedReasonClient;
import com.placepick.recommendation.reason.adapter.out.llm.LiveEvidenceReasonProbe;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.Test;

class LiveEvidenceWorkflowTest {

    private static final URI NAVER_API_HUB = URI.create(
        "https://naverapihub.apigw.ntruss.com"
    );

    @Test
    void verifiesThreeDirectProviderRecommendationScenarios() {
        assertThat(System.getenv("CI")).as("Live evidence must not run in CI").isNull();
        assertThat(System.getProperty("placepick.live-evidence.enabled"))
            .isEqualTo("true");

        LiveEvidenceEnvironment environment = LiveEvidenceEnvironment.load();
        String keyId = environment.required("NAVER_API_HUB_KEY_ID");
        String key = environment.required("NAVER_API_HUB_KEY");
        String token = environment.required("PROXY_TOKEN");
        URI chatBaseUrl = URI.create(environment.required("CHAT_PROXY_URL"));
        String model = environment.required("OPENAI_MODEL");

        EliceConditionExtractionClient extraction = EliceConditionExtractionClient.create(
            chatBaseUrl,
            token,
            model
        );
        NaverApiHubAdapter naver = NaverApiHubAdapter.create(
            NAVER_API_HUB,
            keyId,
            key,
            Duration.ofSeconds(3),
            Duration.ofSeconds(10)
        );
        LiveEvidenceReasonProbe reason = new LiveEvidenceReasonProbe(
            EliceGroundedReasonClient.create(chatBaseUrl, token, model)
        );
        RecommendationCoreUseCase core = core(naver, reason);

        int totalCalls = 0;
        for (LiveEvidenceScenario scenario : LiveEvidenceScenario.all()) {
            LiveEvidenceConditionProbe.Result extractionResult =
                LiveEvidenceConditionProbe.extract(extraction, new ExtractionCommand(
                    scenario.requestText(),
                    scenario.safetyIdentifier()
                ));
            ExtractionOutcome draft = extractionResult.outcome();
            assertThat(draft.extracted())
                .as(
                    "scenario %s condition extraction failed with %s stage=%s boundary=%s",
                    scenario.id(),
                    draft.errorCode(),
                    extractionResult.failureStage(),
                    extractionResult.boundaryCode()
                )
                .isTrue();
            assertThat(draft.condition().placeType()).isEqualTo(scenario.placeType());
            assertThat(scenario.locationAliases()).contains(draft.condition().locationQuery());

            RecommendationCoreResult result = core.recommend(scenario.confirmedCondition());
            assertThat(result.places()).hasSize(3);
            assertThat(result.degraded())
                .as(
                    "scenario %s degraded warnings=%s localCalls=%d blogCalls=%d reasonFallback=%s reasonError=%s boundary=%s",
                    scenario.id(),
                    result.warnings(),
                    result.placeSearchCalls(),
                    result.blogSearchCalls(),
                    result.reasonFallback(),
                    reason.lastErrorCode(),
                    reason.lastBoundaryCode()
                )
                .isFalse();
            assertThat(result.reasonFallback())
                .as("scenario %s used the reason fallback", scenario.id())
                .isFalse();
            assertThat(result.blogSearchCalls()).isBetween(3, 5);
            int scenarioCalls = 1 + result.providerCalls();
            assertThat(scenarioCalls).isBetween(6, 9);
            totalCalls += scenarioCalls;

            System.out.printf(
                "LIVE_EVIDENCE scenario=%s linked=true places=3 degraded=false reasonFallback=false callCount=%d status=passed%n",
                scenario.id(),
                scenarioCalls
            );
        }
        System.out.printf(
            "LIVE_EVIDENCE scenarios=3 linked=true totalCallCount=%d status=passed%n",
            totalCalls
        );
    }

    private static RecommendationCoreUseCase core(
        NaverApiHubAdapter naver,
        LiveEvidenceReasonProbe reason
    ) {
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        CandidateRankingService ranking = new CandidateRankingService(
            naver,
            naver,
            new CandidateQueryPlanner(taxonomy),
            new CandidateNormalizer(taxonomy, new LocationMatcher()),
            new CandidateRanker(new CandidateScoringPolicy())
        );
        return new RecommendationCoreUseCase(
            ranking,
            new GroundedReasonService(reason)
        );
    }
}
