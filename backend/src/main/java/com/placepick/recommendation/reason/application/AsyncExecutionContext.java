package com.placepick.recommendation.reason.application;

import java.util.Objects;
import java.util.concurrent.Callable;

/** Carries infrastructure context across the reason-generation executor boundary. */
public interface AsyncExecutionContext {

    <T> Callable<T> wrap(Callable<T> task);

    static AsyncExecutionContext none() {
        return new AsyncExecutionContext() {
            @Override
            public <T> Callable<T> wrap(Callable<T> task) {
                return Objects.requireNonNull(task, "task");
            }
        };
    }
}
