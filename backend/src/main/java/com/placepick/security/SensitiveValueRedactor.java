package com.placepick.security;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Last-resort log defense. Application code must still avoid logging request/provider values. */
public final class SensitiveValueRedactor {

    private static final Pattern BEARER = Pattern.compile(
        "(?i)(Bearer\\s+)[^\\s,;]+"
    );
    private static final Pattern SENSITIVE_ASSIGNMENT = Pattern.compile(
        "(?i)(authorization|cookie|set-cookie|proxy_token|chat_proxy_url|"
            + "embedding_proxy_url|api[_-]?key|"
            + "x-ncp-apigw-api-key(?:-id)?|csrfToken|organizerCapability|sessionToken)"
            + "(\\s*[=:]\\s*)(\\\"?)([^\\s,;\\\"}]+)(\\\"?)"
    );
    private static final Pattern ELICE_ROUTE = Pattern.compile(
        "(?i)(https://mlapi\\.run/)"
            + "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    );
    private static final Pattern SESSION_TOKEN = Pattern.compile(
        "(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])"
    );
    private static final Pattern URI_USER_INFO = Pattern.compile(
        "(?i)([a-z][a-z0-9+.-]*://)([^\\s/@]+)(@)"
    );

    private SensitiveValueRedactor() {
    }

    public static String redact(String message) {
        if (message == null || message.isEmpty()) {
            return message;
        }
        String redacted = replaceUriUserInfo(message);
        redacted = ELICE_ROUTE.matcher(redacted).replaceAll("$1<redacted-route>");
        redacted = BEARER.matcher(redacted).replaceAll("$1<redacted>");
        redacted = replaceAssignments(redacted);
        return SESSION_TOKEN.matcher(redacted).replaceAll("<redacted-token>");
    }

    private static String replaceUriUserInfo(String value) {
        Matcher matcher = URI_USER_INFO.matcher(value);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(
                result,
                Matcher.quoteReplacement(matcher.group(1) + "<redacted>@")
            );
        }
        matcher.appendTail(result);
        return result.toString();
    }

    private static String replaceAssignments(String value) {
        Matcher matcher = SENSITIVE_ASSIGNMENT.matcher(value);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            String quote = matcher.group(3).isEmpty() ? matcher.group(5) : matcher.group(3);
            matcher.appendReplacement(
                result,
                Matcher.quoteReplacement(
                    matcher.group(1) + matcher.group(2) + quote + "<redacted>" + quote
                )
            );
        }
        matcher.appendTail(result);
        return result.toString();
    }
}
