package com.placepick.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.placepick.session.SessionAuthenticator;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

class ProductEventControllerRoleTest {

    @Test
    void exposesTheControllerOnlyForApiCapableRoles() {
        context("worker").run(application -> assertThat(application)
            .doesNotHaveBean(ProductEventController.class));
        context("api").run(application -> assertThat(application)
            .hasSingleBean(ProductEventController.class));
        context("all").run(application -> assertThat(application)
            .hasSingleBean(ProductEventController.class));
    }

    private static ApplicationContextRunner context(String role) {
        return new ApplicationContextRunner()
            .withPropertyValues("placepick.role=" + role)
            .withUserConfiguration(TestConfiguration.class);
    }

    @Configuration(proxyBeanMethods = false)
    @Import(ProductEventController.class)
    static class TestConfiguration {

        @Bean
        SessionAuthenticator sessionAuthenticator() {
            return mock(SessionAuthenticator.class);
        }

        @Bean
        ProductEventService productEventService() {
            return mock(ProductEventService.class);
        }
    }
}
