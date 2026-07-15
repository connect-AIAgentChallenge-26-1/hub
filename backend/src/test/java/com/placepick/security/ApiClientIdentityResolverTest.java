package com.placepick.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.placepick.session.SessionTokenCodec;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterConfig;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.filter.ForwardedHeaderFilter;

class ApiClientIdentityResolverTest {

    @Test
    void frameworkForwardedAddressKeepsDistinctVercelClientsDistinct() throws Exception {
        ApiClientIdentityResolver resolver = new ApiClientIdentityResolver(
            new SessionTokenCodec()
        );

        String first = forwardedIpKey(resolver, "198.51.100.10", "10.0.0.10");
        String second = forwardedIpKey(resolver, "198.51.100.11", "10.0.0.10");

        assertThat(first).isNotEqualTo(second);
        assertThat(first).doesNotContain("198.51.100.10", "10.0.0.10");
    }

    private String forwardedIpKey(
        ApiClientIdentityResolver resolver,
        String clientAddress,
        String proxyAddress
    ) throws ServletException, IOException {
        ForwardedHeaderFilter filter = new ForwardedHeaderFilter();
        filter.init(new MockFilterConfig());
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(proxyAddress);
        request.addHeader("X-Forwarded-For", clientAddress + ", " + proxyAddress);
        request.addHeader("X-Forwarded-Proto", "https");
        AtomicReference<String> key = new AtomicReference<>();
        FilterChain chain = (servletRequest, servletResponse) -> key.set(
            resolver.resolve((HttpServletRequest) servletRequest).ipKey()
        );

        filter.doFilter(request, new MockHttpServletResponse(), chain);
        return key.get();
    }
}
