package com.placepick.infrastructure.external.llm;

/** Safe diagnostic stage that never contains provider payload or credential data. */
public enum LlmProviderFailureStage {
    HTTP_STATUS,
    TRANSPORT,
    CLIENT,
    MEDIA_TYPE,
    RESPONSE_SIZE,
    JSON,
    CHAT_METADATA,
    CHAT_MODEL,
    CHAT_CHOICES,
    CHAT_MESSAGE,
    CHAT_CONTENT,
    CHAT_CONTENT_SCHEMA,
    CHAT_CONTENT_CONDITION,
    CHAT_CONTENT_WARNINGS,
    CHAT_USAGE,
    EMBEDDING_METADATA,
    EMBEDDING_MODEL,
    EMBEDDING_DATA,
    EMBEDDING_VECTOR,
    EMBEDDING_USAGE,
    UNEXPECTED
}
