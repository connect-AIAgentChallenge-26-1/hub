package com.placepick.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.HandlerInterceptor;

final class ProductionOriginInterceptor implements HandlerInterceptor {

    private final ProductionOriginPolicy policy;

    ProductionOriginInterceptor(ProductionOriginPolicy policy) {
        this.policy = policy;
    }

    @Override
    public boolean preHandle(
        HttpServletRequest request,
        HttpServletResponse response,
        Object handler
    ) {
        policy.requireAllowed(request.getHeader(HttpHeaders.ORIGIN));
        return true;
    }
}
