package com.placepick.recommendation.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.infrastructure.external.naver.NaverApiHubAdapter;
import com.placepick.infrastructure.observability.PlacePickMetrics;
import com.placepick.infrastructure.observability.ProviderCallMetrics;
import com.placepick.livedev.LiveDevConfiguration;
import com.placepick.livedev.LiveDevCoreFactory;
import com.placepick.outbox.OutboxRepository;
import com.placepick.recommendation.job.infrastructure.DeterministicRecommendationProvider;
import com.placepick.recommendation.job.infrastructure.MockRecommendationProviderConfiguration;
import com.placepick.recommendation.job.infrastructure.RecommendationJobInfrastructureConfiguration;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.redis.core.StringRedisTemplate;

class RecommendationJobProviderWiringTest {

    @Test
    void mockWorkerUsesOneDeterministicProviderAndCreatesTraceScopedCoreFactory() {
        runner(RecommendationJobInfrastructureConfiguration.class)
            .withPropertyValues(
                "placepick.role=worker",
                "placepick.external.mode=mock",
                "placepick.worker.poll-delay=600000"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(DeterministicRecommendationProvider.class);
                assertThat(context).hasSingleBean(RecommendationWorkerCoreFactory.class);
                RecommendationWorkerCoreFactory factory = context.getBean(
                    RecommendationWorkerCoreFactory.class
                );
                assertThat(factory.create(com.placepick.recommendation.application.trace.RecommendationTraceSink.none()))
                    .isNotSameAs(factory.create(
                        com.placepick.recommendation.application.trace.RecommendationTraceSink.none()
                    ));
            });
    }

    @Test
    void productionWorkerPinsOfficialNaverAndEliceAdaptersWithoutCallingThem() {
        runner(RecommendationJobInfrastructureConfiguration.class)
            .withInitializer(context ->
                context.getEnvironment().setActiveProfiles("production")
            )
            .withPropertyValues(
                "placepick.role=worker",
                "placepick.external.mode=production",
                "NAVER_API_HUB_KEY_ID=synthetic-key-id",
                "NAVER_API_HUB_KEY=synthetic-key-value",
                "CHAT_PROXY_URL=https://mlapi.run/11111111-1111-4111-8111-111111111111/v1",
                "PROXY_TOKEN=synthetic-proxy-token",
                "OPENAI_MODEL=openai/gpt-4.1-mini",
                "placepick.worker.poll-delay=600000"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(NaverApiHubAdapter.class);
                assertThat(context).hasSingleBean(GroundedReasonGenerationPort.class);
                assertThat(context).hasSingleBean(RecommendationWorkerCoreFactory.class);
                assertThat(context).doesNotHaveBean(DeterministicRecommendationProvider.class);
            });
    }

    @Test
    void liveDevProfileKeepsPlaygroundAndFormalWorkerOnTheSameDirectPorts() {
        runner(
            RecommendationJobInfrastructureConfiguration.class,
            LiveDevConfiguration.class
        )
            .withInitializer(context ->
                context.getEnvironment().setActiveProfiles("live-dev")
            )
            .withPropertyValues(
                "placepick.role=all",
                "placepick.external.mode=live-dev",
                "NAVER_API_HUB_KEY_ID=synthetic-key-id",
                "NAVER_API_HUB_KEY=synthetic-key-value",
                "CHAT_PROXY_URL=https://mlapi.run/11111111-1111-4111-8111-111111111111/v1",
                "PROXY_TOKEN=synthetic-proxy-token",
                "OPENAI_MODEL=openai/gpt-4.1-mini",
                "placepick.worker.poll-delay=600000"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(NaverApiHubAdapter.class);
                assertThat(context).hasSingleBean(GroundedReasonGenerationPort.class);
                assertThat(context).hasSingleBean(LiveDevCoreFactory.class);
                assertThat(context).hasSingleBean(RecommendationWorkerCoreFactory.class);
                assertThat(context).doesNotHaveBean(DeterministicRecommendationProvider.class);
            });
    }

    private final ApplicationContextRunner runner(Class<?>... configurations) {
        return new ApplicationContextRunner()
            .withUserConfiguration(MockRecommendationProviderConfiguration.class)
            .withUserConfiguration(configurations)
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withBean(Clock.class, Clock::systemUTC)
            .withBean(StringRedisTemplate.class, () -> mock(StringRedisTemplate.class))
            .withBean(OutboxRepository.class, () -> mock(OutboxRepository.class))
            .withBean(PlacePickMetrics.class, () -> mock(PlacePickMetrics.class))
            .withBean(ProviderCallMetrics.class, () -> mock(ProviderCallMetrics.class))
            .withBean(
                RecommendationJobTransactionCoordinator.class,
                () -> mock(RecommendationJobTransactionCoordinator.class)
            );
    }
}
