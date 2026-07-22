package com.placepick.recommendation.application.port.out;

/**
 * Provider-neutral, low-cardinality stage at which an LLM operation failed.
 *
 * <p>The value is safe for metrics and traces. It never contains a provider payload,
 * credential, prompt, or user-controlled value.</p>
 */
public enum LlmFailureStage {
    NONE,
    UNSPECIFIED,
    HTTP_STATUS,
    TRANSPORT_TIMEOUT,
    TRANSPORT,
    CLIENT,
    MEDIA_TYPE,
    RESPONSE_SIZE,
    JSON,
    CHAT_METADATA,
    CHAT_MODEL,
    CHAT_CHOICES,
    CHAT_MESSAGE,
    CHAT_REFUSAL,
    CHAT_INCOMPLETE,
    CHAT_CONTENT,
    CHAT_CONTENT_SCHEMA,
    CHAT_CONTENT_CONDITION,
    CHAT_CONTENT_WARNINGS,
    CHAT_USAGE,
    UNEXPECTED
}
