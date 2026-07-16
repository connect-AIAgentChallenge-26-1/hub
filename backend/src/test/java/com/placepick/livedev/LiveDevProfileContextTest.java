package com.placepick.livedev;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.livedev.LiveDevApiDto.DraftView;
import com.placepick.livedev.LiveDevApiDto.RunView;
import com.placepick.infrastructure.observability.ProviderCallMetrics;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.job.infrastructure.MockRecommendationProviderConfiguration;
import com.placepick.web.ServiceApiConfiguration;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class LiveDevProfileContextTest {

    @Test
    void localAndProductionProfilesDoNotRegisterDeveloperSurface() {
        assertProfileDoesNotRegisterDeveloperSurface("local");
        assertProfileDoesNotRegisterDeveloperSurface("production");
    }

    @Test
    void mockLiveDevRunsTheWholeCoreWithoutProviderSecrets() {
        contextRunner("live-dev")
            .withPropertyValues(
                "placepick.external.mode=mock",
                "placepick.live-dev.ttl=PT30M",
                "placepick.live-dev.max-concurrency=2"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasSingleBean(LiveDevController.class);
                assertThat(context).hasSingleBean(LiveDevWorkflowService.class);
                assertThat(context).doesNotHaveBean("liveDevNaverAdapter");
                assertThat(context).doesNotHaveBean("liveDevReasonGenerationPort");

                LiveDevWorkflowService service = context.getBean(LiveDevWorkflowService.class);
                DraftView draft = service.createDraft(
                    "서울 성수동에서 4명이 1만원~2만원 조용한 디저트 카페, 흡연 제외"
                );
                assertThat(draft.status()).isEqualTo("EXTRACTED");

                service.confirmDraft(draft.draftId(), confirmedCondition());
                RunView started = service.startRun(draft.draftId());
                RunView completed = awaitTerminal(service, started);

                assertThat(completed.status()).isEqualTo("COMPLETED");
                assertThat(completed.result()).isNotNull();
                assertThat(completed.result().places()).hasSize(3);
                assertThat(completed.result().degraded()).isFalse();
                assertThat(completed.result().reasonFallback()).isFalse();
                assertThat(completed.trace()).extracting(LiveDevApiDto.TraceEventView::stage)
                    .contains(
                        "CONDITION_EXTRACTED",
                        "USER_CONDITION_CONFIRMED",
                        "NAVER_LOCAL_COMPLETED",
                        "CANDIDATES_NORMALIZED",
                        "FINAL_RANKING_COMPLETED",
                        "ELICE_REASON_REQUESTED",
                        "ELICE_REASON_COMPLETED",
                        "RECOMMENDATION_WORKFLOW_COMPLETED"
                    );
            });
    }

    @Test
    void directLiveDevSelectsTheRealAdaptersWithoutMakingAStartupRequest() {
        contextRunner("live-dev")
            .withPropertyValues(
                "placepick.external.mode=live-dev",
                "NAVER_API_HUB_KEY_ID=fake-key-id",
                "NAVER_API_HUB_KEY=fake-key",
                "PROXY_TOKEN=fake-token",
                "CHAT_PROXY_URL=https://mlapi.run/11111111-1111-4111-8111-111111111111/v1",
                "OPENAI_MODEL=openai/gpt-4.1-mini"
            )
            .run(context -> {
                assertThat(context).hasNotFailed();
                assertThat(context).hasBean("liveDevNaverAdapter");
                assertThat(context).hasBean("liveDevConditionExtractionPort");
                assertThat(context).hasBean("liveDevReasonGenerationPort");
                assertThat(context).doesNotHaveBean("liveDevMockProvider");
                assertThat(context).doesNotHaveBean("liveDevMockConditionExtractionPort");
            });
    }

    private static void assertProfileDoesNotRegisterDeveloperSurface(String profile) {
        contextRunner(profile).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).doesNotHaveBean(LiveDevController.class);
            assertThat(context).doesNotHaveBean(LiveDevWorkflowService.class);
        });
    }

    private static ApplicationContextRunner contextRunner(String profile) {
        return new ApplicationContextRunner()
            .withInitializer(context -> context.getEnvironment().setActiveProfiles(profile))
            .withUserConfiguration(
                ServiceApiConfiguration.class,
                MockRecommendationProviderConfiguration.class,
                LiveDevConfiguration.class,
                LiveDevController.class,
                TestMetricsConfiguration.class
            );
    }

    @Configuration(proxyBeanMethods = false)
    static class TestMetricsConfiguration {

        @Bean
        ProviderCallMetrics providerCallMetrics() {
            return new ProviderCallMetrics(
                new SimpleMeterRegistry(),
                2,
                Duration.ofMillis(100)
            );
        }
    }

    private static ConfirmedRecommendationCondition confirmedCondition() {
        return new ConfirmedRecommendationCondition(
            "서울 성수동",
            PlaceType.CAFE,
            null,
            4,
            10_000,
            20_000,
            List.of(new Preference("조용한", 8), new Preference("디저트", 7)),
            List.of("흡연")
        );
    }

    private static RunView awaitTerminal(LiveDevWorkflowService service, RunView started) {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        RunView current = started;
        while (!List.of("COMPLETED", "FAILED", "CANCELLED").contains(current.status())) {
            if (System.nanoTime() >= deadline) {
                throw new AssertionError("The mock live developer workflow did not finish.");
            }
            try {
                TimeUnit.MILLISECONDS.sleep(10);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("The test was interrupted.", exception);
            }
            current = service.getRun(started.runId());
        }
        return current;
    }
}
