package com.placepick.infrastructure.observability;

import java.util.Map;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public final class RevisionInfoContributor implements InfoContributor {

    private static final Pattern COMMIT_SHA = Pattern.compile("[0-9a-fA-F]{40}");

    private final Environment environment;

    public RevisionInfoContributor(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void contribute(Info.Builder builder) {
        String source = environment.getProperty("RENDER_GIT_COMMIT", "local");
        String commit = source != null && COMMIT_SHA.matcher(source).matches()
            ? source.toLowerCase(Locale.ROOT)
            : "local";
        builder.withDetail("git", Map.of("commit", Map.of("id", commit)));
    }
}
