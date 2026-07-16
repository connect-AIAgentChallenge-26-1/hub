package com.placepick.infrastructure.observability;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.info.Info;
import org.springframework.mock.env.MockEnvironment;

class RevisionInfoContributorTest {

    @Test
    void exposesOnlyOneCanonicalCommitSha() {
        MockEnvironment environment = new MockEnvironment()
            .withProperty("RENDER_GIT_COMMIT", "ABCDEF0123456789ABCDEF0123456789ABCDEF01");

        assertThat(details(environment))
            .isEqualTo(Map.of(
                "git",
                Map.of("commit", Map.of("id", "abcdef0123456789abcdef0123456789abcdef01"))
            ));
    }

    @Test
    void doesNotExposeAnUnexpectedEnvironmentValue() {
        MockEnvironment environment = new MockEnvironment()
            .withProperty("RENDER_GIT_COMMIT", "credential-like unexpected value");

        assertThat(details(environment))
            .isEqualTo(Map.of("git", Map.of("commit", Map.of("id", "local"))));
    }

    private static Map<String, Object> details(MockEnvironment environment) {
        Info.Builder builder = new Info.Builder();
        new RevisionInfoContributor(environment).contribute(builder);
        return builder.build().getDetails();
    }
}
