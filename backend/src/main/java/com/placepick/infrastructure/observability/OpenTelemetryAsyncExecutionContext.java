package com.placepick.infrastructure.observability;

import com.placepick.recommendation.reason.application.AsyncExecutionContext;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import java.util.Objects;
import java.util.concurrent.Callable;

/** Captures the active trace once and restores it around work executed on another thread. */
public final class OpenTelemetryAsyncExecutionContext implements AsyncExecutionContext {

    @Override
    public <T> Callable<T> wrap(Callable<T> task) {
        Objects.requireNonNull(task, "task");
        Context captured = Context.current();
        return () -> {
            Scope scope = captured.makeCurrent();
            try {
                return task.call();
            } finally {
                scope.close();
            }
        };
    }
}
