package com.placepick.recommendation.domain.candidate;

import java.util.Objects;

public record CandidateEvidence(
    String evidenceId,
    String title,
    String summary,
    String sourceUrl,
    String authorName,
    String authorLink,
    String publishedDate,
    int entityConfidence
) {

    public CandidateEvidence {
        evidenceId = requireNonBlank(evidenceId, "evidenceId");
        title = Objects.requireNonNull(title, "title");
        summary = Objects.requireNonNull(summary, "summary");
        sourceUrl = SourceUrlPolicy.requireValid(sourceUrl);
        authorName = Objects.requireNonNull(authorName, "authorName");
        authorLink = SourceUrlPolicy.nullableValid(authorLink);
        publishedDate = Objects.requireNonNull(publishedDate, "publishedDate");
        if (entityConfidence < 0 || entityConfidence > 100) {
            throw new IllegalArgumentException("Entity confidence must be between zero and 100.");
        }
    }

    public CandidateEvidence(
        String evidenceId,
        String title,
        String summary,
        String sourceUrl
    ) {
        this(evidenceId, title, summary, sourceUrl, "", null, "", 100);
    }

    private static String requireNonBlank(String value, String field) {
        Objects.requireNonNull(value, field);
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank.");
        }
        return value;
    }
}
