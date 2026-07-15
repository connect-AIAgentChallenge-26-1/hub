package com.placepick.livedev;

import com.placepick.infrastructure.external.llm.EliceConditionExtractionClient;
import com.placepick.infrastructure.external.naver.NaverApiHubAdapter;
import com.placepick.infrastructure.observability.ObservedProviderPorts;
import com.placepick.infrastructure.observability.ProviderCallMetrics;
import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.job.infrastructure.DeterministicRecommendationProvider;
import com.placepick.recommendation.reason.adapter.out.llm.EliceGroundedReasonClient;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Explicit live-provider wiring that exists only while the {@code live-dev} profile is active. */
@Configuration(proxyBeanMethods = false)
@Profile("live-dev")
public class LiveDevConfiguration {

    private static final URI NAVER_API_HUB = URI.create("https://naverapihub.apigw.ntruss.com");
    private static final Duration NAVER_CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration NAVER_RESPONSE_TIMEOUT = Duration.ofSeconds(10);

    @Bean
    @ConditionalOnProperty(prefix = "placepick.external", name = "mode", havingValue = "live-dev")
    NaverApiHubAdapter liveDevNaverAdapter(
        @Value("${NAVER_API_HUB_KEY_ID}") String keyId,
        @Value("${NAVER_API_HUB_KEY}") String key
    ) {
        return NaverApiHubAdapter.create(
            NAVER_API_HUB,
            keyId,
            key,
            NAVER_CONNECT_TIMEOUT,
            NAVER_RESPONSE_TIMEOUT
        );
    }

    @Bean
    @ConditionalOnProperty(prefix = "placepick.external", name = "mode", havingValue = "live-dev")
    ConditionExtractionPort liveDevConditionExtractionPort(
        @Value("${CHAT_PROXY_URL}") URI chatBaseUrl,
        @Value("${PROXY_TOKEN}") String token,
        @Value("${OPENAI_MODEL:openai/gpt-4.1-mini}") String model,
        ProviderCallMetrics metrics
    ) {
        return ObservedProviderPorts.condition(
            EliceConditionExtractionClient.create(chatBaseUrl, token, model),
            metrics,
            "elice",
            Duration.ofSeconds(30)
        );
    }

    @Bean
    @ConditionalOnProperty(prefix = "placepick.external", name = "mode", havingValue = "live-dev")
    GroundedReasonGenerationPort liveDevReasonGenerationPort(
        @Value("${CHAT_PROXY_URL}") URI chatBaseUrl,
        @Value("${PROXY_TOKEN}") String token,
        @Value("${OPENAI_MODEL:openai/gpt-4.1-mini}") String model
    ) {
        return EliceGroundedReasonClient.create(chatBaseUrl, token, model);
    }

    @Bean
    @ConditionalOnProperty(prefix = "placepick.external", name = "mode", havingValue = "live-dev")
    LiveDevCoreFactory liveDevCoreFactory(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        GroundedReasonGenerationPort reasonGenerationPort,
        ProviderCallMetrics metrics
    ) {
        return observedCore(
            placeSearchPort,
            blogSearchPort,
            reasonGenerationPort,
            metrics,
            "naver",
            "elice"
        );
    }

    private LiveDevCoreFactory observedCore(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        GroundedReasonGenerationPort reasonGenerationPort,
        ProviderCallMetrics metrics,
        String searchProvider,
        String reasonProvider
    ) {
        PlaceSearchPort observedPlaces = ObservedProviderPorts.places(
            placeSearchPort,
            metrics,
            searchProvider,
            NAVER_RESPONSE_TIMEOUT
        );
        BlogSearchPort observedBlogs = ObservedProviderPorts.blogs(
            blogSearchPort,
            metrics,
            searchProvider,
            NAVER_RESPONSE_TIMEOUT
        );
        GroundedReasonGenerationPort observedReasons = ObservedProviderPorts.reasons(
            reasonGenerationPort,
            metrics,
            reasonProvider,
            Duration.ofSeconds(30)
        );
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        CandidateQueryPlanner queryPlanner = new CandidateQueryPlanner(taxonomy);
        CandidateNormalizer normalizer = new CandidateNormalizer(
            taxonomy,
            new LocationMatcher()
        );
        CandidateRanker ranker = new CandidateRanker(new CandidateScoringPolicy());
        return traceSink -> new RecommendationCoreUseCase(
            new CandidateRankingService(
                observedPlaces,
                observedBlogs,
                queryPlanner,
                normalizer,
                ranker,
                traceSink
            ),
            new GroundedReasonService(observedReasons, traceSink)
        );
    }

    @Bean
    @ConditionalOnProperty(
        prefix = "placepick.external",
        name = "mode",
        havingValue = "mock",
        matchIfMissing = true
    )
    LiveDevCoreFactory liveDevMockCoreFactory(
        DeterministicRecommendationProvider provider,
        ProviderCallMetrics metrics
    ) {
        return observedCore(provider, provider, provider, metrics, "mock", "mock");
    }

    @Bean
    LiveDevWorkflowService liveDevWorkflowService(
        ConditionExtractionPort extractionPort,
        LiveDevCoreFactory coreFactory,
        Clock liveDevClock,
        @Value("${placepick.live-dev.ttl:PT30M}") String ttl,
        @Value("${placepick.live-dev.max-concurrency:2}") int maximumConcurrency
    ) {
        return new LiveDevWorkflowService(
            extractionPort,
            coreFactory,
            liveDevClock,
            Duration.parse(ttl),
            maximumConcurrency
        );
    }
}
