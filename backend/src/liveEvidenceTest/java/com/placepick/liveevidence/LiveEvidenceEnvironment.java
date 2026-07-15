package com.placepick.liveevidence;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

final class LiveEvidenceEnvironment {

    private static final Set<String> ALLOWED = Set.of(
        "NAVER_API_HUB_KEY_ID",
        "NAVER_API_HUB_KEY",
        "PROXY_TOKEN",
        "CHAT_PROXY_URL",
        "OPENAI_MODEL",
        "EMBEDDING_PROXY_URL",
        "OPENAI_EMBEDDING_MODEL"
    );

    private final Map<String, String> values;

    private LiveEvidenceEnvironment(Map<String, String> values) {
        this.values = Map.copyOf(values);
    }

    static LiveEvidenceEnvironment load() {
        Path file = findRepositoryRoot().resolve(".env.live.local");
        if (!Files.isRegularFile(file)) {
            throw new IllegalStateException("Live evidence environment file is missing.");
        }
        Map<String, String> values = new HashMap<>();
        try {
            for (String rawLine : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                String line = rawLine.strip();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                int delimiter = line.indexOf('=');
                if (delimiter < 1) {
                    throw new IllegalStateException("Live evidence environment line is invalid.");
                }
                String key = line.substring(0, delimiter).strip();
                if (!ALLOWED.contains(key)) {
                    continue;
                }
                String value = unquote(line.substring(delimiter + 1).strip());
                if (values.putIfAbsent(key, value) != null) {
                    throw new IllegalStateException("Live evidence environment contains a duplicate key.");
                }
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Live evidence environment could not be read.");
        }
        return new LiveEvidenceEnvironment(values);
    }

    String required(String key) {
        String value = System.getenv(key);
        if (value == null || value.isBlank()) {
            value = values.get(key);
        }
        if (value == null || value.isBlank() || value.contains("여기에") || value.contains("placeholder")) {
            throw new IllegalStateException("A required live evidence setting is missing.");
        }
        if (value.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalStateException("A live evidence setting contains a control character.");
        }
        return value;
    }

    private static String unquote(String value) {
        if (value.length() >= 2 &&
            ((value.startsWith("\"") && value.endsWith("\"")) ||
             (value.startsWith("'") && value.endsWith("'")))) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    private static Path findRepositoryRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        while (current != null) {
            if (Files.isRegularFile(current.resolve("settings.gradle"))) {
                return current;
            }
            current = current.getParent();
        }
        throw new IllegalStateException("Repository root could not be located.");
    }
}
