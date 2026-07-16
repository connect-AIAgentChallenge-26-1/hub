package com.placepick.livedev;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Loads only live-provider settings from the repository-local ignored env file.
 *
 * <p>The file is parsed as data, never sourced or evaluated. Mock mode returns before any file
 * access, and operating-system/command-line values retain precedence.</p>
 */
public final class LiveDevEnvironmentPostProcessor
    implements EnvironmentPostProcessor, Ordered {

    private static final String PROPERTY_SOURCE = "placepickLiveDevLocalFile";
    private static final Pattern VARIABLE_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Set<String> REQUIRED = Set.of(
        "NAVER_API_HUB_KEY_ID",
        "NAVER_API_HUB_KEY",
        "PROXY_TOKEN",
        "CHAT_PROXY_URL",
        "OPENAI_MODEL"
    );

    @Override
    public void postProcessEnvironment(
        ConfigurableEnvironment environment,
        SpringApplication application
    ) {
        if (!isLiveDevProfile(environment) || !isDirectLiveMode(environment)) {
            return;
        }

        Path file = findRepositoryFile();
        if (file == null) {
            throw new IllegalStateException(
                "Direct live developer mode requires the ignored .env.live.local file."
            );
        }
        Map<String, String> parsed = parse(file);
        Map<String, Object> selected = new LinkedHashMap<>();
        for (String name : REQUIRED) {
            String existing = environment.getProperty(name);
            if (existing != null && !existing.isBlank()) {
                continue;
            }
            String value = parsed.get(name);
            if (value == null || value.isBlank()) {
                throw new IllegalStateException(
                    "Direct live developer mode is missing required setting " + name + "."
                );
            }
            selected.put(name, value);
        }
        environment.getPropertySources().addLast(new MapPropertySource(PROPERTY_SOURCE, selected));
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    private static boolean isLiveDevProfile(ConfigurableEnvironment environment) {
        for (String profile : environment.getActiveProfiles()) {
            if ("live-dev".equals(profile)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isDirectLiveMode(ConfigurableEnvironment environment) {
        String mode = environment.getProperty("PLACEPICK_EXTERNAL_MODE");
        if (mode == null) {
            mode = environment.getProperty("placepick.external.mode", "mock");
        }
        return "live-dev".equals(mode);
    }

    private static Path findRepositoryFile() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        for (int level = 0; current != null && level < 6; level++) {
            Path candidate = current.resolve(".env.live.local");
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        return null;
    }

    private static Map<String, String> parse(Path file) {
        List<String> lines;
        try {
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException(
                "Direct live developer settings could not be read.",
                exception
            );
        }
        Map<String, String> values = new LinkedHashMap<>();
        for (String rawLine : lines) {
            String line = rawLine.strip();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            int separator = line.indexOf('=');
            if (separator < 1) {
                throw new IllegalStateException(
                    "Direct live developer settings contain an invalid assignment."
                );
            }
            String name = line.substring(0, separator).strip();
            if (!VARIABLE_NAME.matcher(name).matches()) {
                throw new IllegalStateException(
                    "Direct live developer settings contain an invalid variable name."
                );
            }
            if (!REQUIRED.contains(name)) {
                continue;
            }
            if (values.containsKey(name)) {
                throw new IllegalStateException(
                    "Direct live developer settings contain duplicate variable " + name + "."
                );
            }
            values.put(name, unquote(line.substring(separator + 1).strip()));
        }
        return values;
    }

    private static String unquote(String value) {
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '\'' && last == '\'') || (first == '"' && last == '"')) {
                return value.substring(1, value.length() - 1);
            }
        }
        return value;
    }
}
