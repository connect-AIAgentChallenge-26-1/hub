package com.placepick.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapGetter;
import java.io.IOException;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public final class TraceIdFilter extends OncePerRequestFilter {

    public static final String REQUEST_ATTRIBUTE = TraceIdFilter.class.getName() + ".traceId";
    public static final String TRACEPARENT_ATTRIBUTE =
        TraceIdFilter.class.getName() + ".traceparent";
    public static final String TRACESTATE_ATTRIBUTE =
        TraceIdFilter.class.getName() + ".tracestate";
    public static final String RESPONSE_HEADER = "X-Trace-Id";
    private static final Pattern W3C_TRACEPARENT = Pattern.compile(
        "00-([0-9a-f]{32})-([0-9a-f]{16})-(?:00|01)"
    );
    private static final TextMapGetter<HttpServletRequest> REQUEST_GETTER =
        new TextMapGetter<>() {
            @Override
            public Iterable<String> keys(HttpServletRequest carrier) {
                return carrier == null
                    ? java.util.List.of()
                    : Collections.list(carrier.getHeaderNames());
            }

            @Override
            public String get(HttpServletRequest carrier, String key) {
                return carrier == null ? null : carrier.getHeader(key);
            }
        };

    private final Tracer tracer;
    private final OpenTelemetry openTelemetry;

    public TraceIdFilter(Tracer tracer, OpenTelemetry openTelemetry) {
        this.tracer = tracer;
        this.openTelemetry = openTelemetry;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        Span active = tracer.currentSpan();
        if (continueWithIncomingTrace(request, response, filterChain, active)) {
            return;
        }
        if (active != null) {
            continueWithTrace(active, request, response, filterChain);
            return;
        }

        Span fallback = tracer.nextSpan().name("placepick.http.request").start();
        Tracer.SpanInScope scope = tracer.withSpan(fallback);
        try {
            continueWithTrace(fallback, request, response, filterChain);
        } finally {
            scope.close();
            fallback.end();
        }
    }

    private boolean continueWithIncomingTrace(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain,
        Span active
    ) throws ServletException, IOException {
        String value = request.getHeader("traceparent");
        if (value == null) {
            return false;
        }
        Matcher matcher = W3C_TRACEPARENT.matcher(value);
        if (!matcher.matches()
            || matcher.group(1).chars().allMatch(character -> character == '0')
            || matcher.group(2).chars().allMatch(character -> character == '0')) {
            return false;
        }
        String incomingTraceId = matcher.group(1);
        if (active != null && incomingTraceId.equals(active.context().traceId())) {
            return false;
        }
        Context remote = W3CTraceContextPropagator.getInstance().extract(
            Context.root(),
            request,
            REQUEST_GETTER
        );
        io.opentelemetry.api.trace.SpanContext remoteSpan =
            io.opentelemetry.api.trace.Span.fromContext(remote).getSpanContext();
        if (!remoteSpan.isValid() || !incomingTraceId.equals(remoteSpan.getTraceId())) {
            return false;
        }
        io.opentelemetry.api.trace.Span extracted = openTelemetry
            .getTracer("com.placepick.http")
            .spanBuilder("placepick.http.request")
            .setParent(remote)
            .setSpanKind(SpanKind.SERVER)
            .startSpan();
        Scope scope = extracted.makeCurrent();
        try {
            continueWithTrace(
                extracted.getSpanContext().getTraceId(),
                extracted.getSpanContext().getSpanId(),
                extracted.getSpanContext().isSampled(),
                extracted.getSpanContext().getTraceState().toString(),
                request,
                response,
                filterChain
            );
        } finally {
            scope.close();
            extracted.end();
        }
        return true;
    }

    private void continueWithTrace(
        Span span,
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        continueWithTrace(
            span.context().traceId(),
            span.context().spanId(),
            Boolean.TRUE.equals(span.context().sampled()),
            currentTraceState(span.context().traceId()),
            request,
            response,
            filterChain
        );
    }

    private void continueWithTrace(
        String traceId,
        String spanId,
        boolean sampled,
        String tracestate,
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String sampledFlag = sampled ? "01" : "00";
        String traceparent = "00-" + traceId + "-" + spanId + "-" + sampledFlag;

        request.setAttribute(REQUEST_ATTRIBUTE, traceId);
        request.setAttribute(TRACEPARENT_ATTRIBUTE, traceparent);
        if (tracestate != null && !tracestate.isBlank()) {
            request.setAttribute(TRACESTATE_ATTRIBUTE, tracestate);
        }
        response.setHeader(RESPONSE_HEADER, traceId);
        filterChain.doFilter(request, response);
    }

    private static String currentTraceState(String traceId) {
        io.opentelemetry.api.trace.SpanContext context =
            io.opentelemetry.api.trace.Span.current().getSpanContext();
        if (!context.isValid() || !traceId.equals(context.getTraceId())) {
            return null;
        }
        String value = context.getTraceState().toString();
        return value.isBlank() ? null : value;
    }
}
