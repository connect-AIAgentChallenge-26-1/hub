package com.placepick.recommendation.job.infrastructure;

import java.util.Set;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

public abstract class PlacePickRoleCondition implements Condition {

    private final Set<String> accepted;

    protected PlacePickRoleCondition(Set<String> accepted) {
        this.accepted = Set.copyOf(accepted);
    }

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String role = context.getEnvironment().getProperty("placepick.role", "all");
        return accepted.contains(role);
    }

    public static final class Worker extends PlacePickRoleCondition {
        public Worker() {
            super(Set.of("worker", "all"));
        }
    }

    public static final class Api extends PlacePickRoleCondition {
        public Api() {
            super(Set.of("api", "all"));
        }
    }
}
