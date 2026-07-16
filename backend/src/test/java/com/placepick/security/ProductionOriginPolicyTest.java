package com.placepick.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.placepick.web.ApiErrorCode;
import com.placepick.web.ApiException;
import org.junit.jupiter.api.Test;

class ProductionOriginPolicyTest {

    @Test
    void acceptsOnlyOneCanonicalHttpsOriginAndAllowsNonBrowserRequests() {
        ProductionOriginPolicy policy = new ProductionOriginPolicy(
            "https://PlacePick.Example/"
        );

        assertThat(policy.allowedOrigin()).isEqualTo("https://placepick.example");
        assertThatCode(() -> policy.requireAllowed("https://placepick.example"))
            .doesNotThrowAnyException();
        assertThatCode(() -> policy.requireAllowed(null)).doesNotThrowAnyException();
    }

    @Test
    void rejectsWildcardHttpPathAndForeignOriginsWithoutEchoingThem() {
        assertThatThrownBy(() -> new ProductionOriginPolicy("*"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ProductionOriginPolicy("http://placepick.example"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ProductionOriginPolicy(
            "https://placepick.example/path"
        )).isInstanceOf(IllegalArgumentException.class);

        ProductionOriginPolicy policy = new ProductionOriginPolicy("https://placepick.example");
        assertThatThrownBy(() -> policy.requireAllowed("https://attacker.example"))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.errorCode()).isEqualTo(ApiErrorCode.ORIGIN_NOT_ALLOWED);
                assertThat(exception.getMessage()).isEqualTo("The request origin is not allowed.");
            });
    }
}
