package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.text.Normalizer;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/** Deterministic ownership and unsupported-claim validation after strict JSON parsing. */
public final class ReasonStatementPolicy {

    public static final String LOCAL_STATEMENT_TEXT =
        "검증된 장소 정보에 따라 이 후보를 제안합니다.";
    public static final String BLOG_STATEMENT_TEXT =
        "연결된 블로그 근거를 함께 확인할 수 있습니다.";

    private static final Set<String> FORBIDDEN_CLAIM_TOKENS = Set.of(
        "가격", "영업", "도보", "출구", "주차", "예약 가능", "실시간",
        "점수", "순위", "루프탑", "이전 지시", "무시하고"
    );

    public boolean isSupported(ReasonStatement statement, ReasonPlaceContext place) {
        return validate(statement, place) == ValidationResult.SUPPORTED;
    }

    public ValidationResult validate(ReasonStatement statement, ReasonPlaceContext place) {
        Set<ReasonEvidence> cited = new LinkedHashSet<>();
        for (String evidenceId : statement.evidenceIds()) {
            ReasonEvidence evidence = place.evidence().stream()
                .filter(value -> value.evidenceId().equals(evidenceId))
                .findFirst()
                .orElse(null);
            if (evidence == null) {
                return ValidationResult.UNKNOWN_EVIDENCE;
            }
            cited.add(evidence);
        }

        if (LOCAL_STATEMENT_TEXT.equals(statement.text())) {
            return cited.stream().allMatch(value -> value.type() == ReasonEvidenceType.LOCAL)
                ? ValidationResult.SUPPORTED
                : ValidationResult.TEMPLATE_EVIDENCE_TYPE_MISMATCH;
        }
        if (BLOG_STATEMENT_TEXT.equals(statement.text())) {
            return cited.stream().allMatch(value -> value.type() == ReasonEvidenceType.BLOG)
                ? ValidationResult.SUPPORTED
                : ValidationResult.TEMPLATE_EVIDENCE_TYPE_MISMATCH;
        }

        String normalizedText = normalize(statement.text());
        if (FORBIDDEN_CLAIM_TOKENS.stream().map(ReasonStatementPolicy::normalize)
            .anyMatch(normalizedText::contains) || normalizedText.matches(".*\\d+[ ]*원.*") ||
            normalizedText.matches(".*\\d+[ ]*위.*")) {
            return ValidationResult.FORBIDDEN_CLAIM;
        }

        Set<String> groundingTokens = tokens(place.name() + " " + place.category());
        for (ReasonEvidence evidence : cited) {
            groundingTokens.addAll(tokens(evidence.title() + " " + evidence.summary()));
        }
        return groundingTokens.stream().anyMatch(normalizedText::contains)
            ? ValidationResult.SUPPORTED
            : ValidationResult.NO_LEXICAL_GROUNDING;
    }

    public static String expectedText(ReasonEvidenceType type) {
        return switch (type) {
            case LOCAL -> LOCAL_STATEMENT_TEXT;
            case BLOG -> BLOG_STATEMENT_TEXT;
        };
    }

    private static Set<String> tokens(String value) {
        Set<String> result = new LinkedHashSet<>();
        for (String token : normalize(value).split("[^\\p{L}\\p{N}]+")) {
            if (token.codePointCount(0, token.length()) >= 2) {
                result.add(token);
            }
        }
        return result;
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ")
            .strip();
    }

    public enum ValidationResult {
        SUPPORTED,
        UNKNOWN_EVIDENCE,
        TEMPLATE_EVIDENCE_TYPE_MISMATCH,
        FORBIDDEN_CLAIM,
        NO_LEXICAL_GROUNDING
    }
}
