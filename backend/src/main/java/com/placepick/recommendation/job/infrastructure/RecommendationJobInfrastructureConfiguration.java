package com.placepick.recommendation.job.infrastructure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.infrastructure.external.naver.NaverApiHubAdapter;
import com.placepick.infrastructure.observability.ObservedProviderPorts;
import com.placepick.infrastructure.observability.PlacePickMetrics;
import com.placepick.infrastructure.observability.ProviderCallMetrics;
import com.placepick.outbox.OutboxRelay;
import com.placepick.outbox.OutboxRepository;
import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.port.out.BlogSearchPort;
import com.placepick.recommendation.application.port.out.PlaceSearchPort;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.job.RecommendationJobTransactionCoordinator;
import com.placepick.recommendation.job.RecommendationJobWorker;
import com.placepick.recommendation.job.RecommendationWorkerCoreFactory;
import com.placepick.recommendation.reason.adapter.out.llm.EliceGroundedReasonClient;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;
import com.placepick.stream.RecommendationStreamConsumer;
import com.placepick.stream.RecommendationStreamGateway;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.data.redis.core.StringRedisTemplate;

@Configuration(proxyBeanMethods = false)
public class RecommendationJobInfrastructureConfiguration {

    private static final URI NAVER_API_HUB = URI.create(
        "https://naverapihub.apigw.ntruss.com"
    );
    private static final Duration NAVER_CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration NAVER_RESPONSE_TIMEOUT = Duration.ofSeconds(10);

    @Bean
    Object placePickRoleVerifier(Environment environment) {
        String role = environment.getProperty("placepick.role", "all");
        if (!Set.of("api", "worker", "all").contains(role)) {
            throw new IllegalStateException("PLACEPICK_ROLE must be api, worker, or all.");
        }
        return new Object();
    }

    @Bean
    @Profile("production")
    @Conditional(PlacePickRoleCondition.Worker.class)
    @ConditionalOnProperty(
        prefix = "placepick.external",
        name = "mode",
        havingValue = "production"
    )
    NaverApiHubAdapter productionNaverAdapter(
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
    @Profile("production")
    @Conditional(PlacePickRoleCondition.Worker.class)
    @ConditionalOnProperty(
        prefix = "placepick.external",
        name = "mode",
        havingValue = "production"
    )
    GroundedReasonGenerationPort productionReasonGenerationPort(
        @Value("${CHAT_PROXY_URL}") URI chatBaseUrl,
        @Value("${PROXY_TOKEN}") String token,
        @Value("${OPENAI_MODEL:openai/gpt-4.1-mini}") String model
    ) {
        return EliceGroundedReasonClient.create(chatBaseUrl, token, model);
    }

    @Bean
    @Conditional(PlacePickRoleCondition.Worker.class)
    RecommendationWorkerCoreFactory recommendationWorkerCoreFactory(
        PlaceSearchPort placeSearchPort,
        BlogSearchPort blogSearchPort,
        GroundedReasonGenerationPort reasonGenerationPort,
        ProviderCallMetrics metrics,
        @Value("${placepick.external.mode:mock}") String externalMode
    ) {
        boolean directProvider = Set.of("production", "live-dev").contains(externalMode);
        String searchProvider = directProvider ? "naver" : "mock";
        String reasonProvider = directProvider ? "elice" : "mock";
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
        CandidateQueryPlanner planner = new CandidateQueryPlanner(taxonomy);
        CandidateNormalizer normalizer = new CandidateNormalizer(taxonomy, new LocationMatcher());
        CandidateRanker ranker = new CandidateRanker(new CandidateScoringPolicy());
        return trace -> new RecommendationCoreUseCase(
            new CandidateRankingService(
                observedPlaces,
                observedBlogs,
                planner,
                normalizer,
                ranker,
                trace
            ),
            new GroundedReasonService(observedReasons, trace)
        );
    }

    @Bean
    @Conditional(PlacePickRoleCondition.Worker.class)
    RecommendationStreamGateway recommendationStreamGateway(
        StringRedisTemplate redisTemplate,
        ObjectMapper objectMapper,
        PlacePickMetrics metrics
    ) {
        return new RecommendationStreamGateway(redisTemplate, objectMapper, metrics);
    }

    @Bean
    @Conditional(PlacePickRoleCondition.Worker.class)
    OutboxRelay recommendationOutboxRelay(
        OutboxRepository repository,
        RecommendationStreamGateway gateway,
        Clock clock,
        @Value("${placepick.worker.outbox-batch-size:50}") int batchSize
    ) {
        return new OutboxRelay(repository, gateway, clock, batchSize);
    }

    @Bean
    @Conditional(PlacePickRoleCondition.Worker.class)
    @ConditionalOnBean(RecommendationWorkerCoreFactory.class)
    RecommendationJobWorker recommendationJobWorker(
        RecommendationJobTransactionCoordinator coordinator,
        RecommendationWorkerCoreFactory coreFactory
    ) {
        return new RecommendationJobWorker(coordinator, coreFactory);
    }

    @Bean
    @Conditional(PlacePickRoleCondition.Worker.class)
    @ConditionalOnBean(RecommendationJobWorker.class)
    RecommendationStreamConsumer recommendationStreamConsumer(
        RecommendationStreamGateway gateway,
        RecommendationJobWorker worker,
        @Value("${placepick.worker.consumer-name:${HOSTNAME:local-worker}}") String consumerName,
        @Value("${placepick.worker.batch-size:10}") int batchSize,
        @Value("${placepick.worker.maximum-attempts:3}") int maximumAttempts,
        @Value("${placepick.worker.pending-idle:PT30S}") String pendingIdle
    ) {
        return new RecommendationStreamConsumer(
            gateway,
            worker,
            consumerName,
            batchSize,
            maximumAttempts,
            Duration.parse(pendingIdle)
        );
    }

    @Bean
    @Conditional(PlacePickRoleCondition.Worker.class)
    @ConditionalOnBean(RecommendationStreamConsumer.class)
    RecommendationWorkerSchedules recommendationWorkerSchedules(
        OutboxRelay relay,
        RecommendationStreamConsumer consumer
    ) {
        return new RecommendationWorkerSchedules(relay, consumer);
    }
}
