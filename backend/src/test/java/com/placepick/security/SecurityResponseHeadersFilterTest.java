package com.placepick.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SecurityResponseHeadersFilterTest {

    @Test
    void appliesClosedApiResponseHeadersBeforeTheApplicationChain() throws Exception {
        SecurityResponseHeadersFilter filter = new SecurityResponseHeadersFilter();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(
            new MockHttpServletRequest("GET", "/api/v1/recommendations/example"),
            response,
            (request, servletResponse) -> servletResponse.getWriter().write("safe")
        );

        assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(response.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
        assertThat(response.getHeader("Content-Security-Policy"))
            .isEqualTo("default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
}
