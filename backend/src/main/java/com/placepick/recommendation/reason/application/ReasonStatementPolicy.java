package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.domain.GeneratedReasonStatement;
import com.placepick.recommendation.reason.domain.ReasonClaim;
import com.placepick.recommendation.reason.domain.ReasonEvidence;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Deterministic ownership and unsupported-claim validation after strict JSON parsing. */
public final class ReasonStatementPolicy {

    public static final String LOCAL_STATEMENT_TEXT =
        "검증된 장소 정보에 따라 이 후보를 제안합니다.";
    public static final String BLOG_STATEMENT_TEXT =
        "연결된 블로그 근거를 함께 확인할 수 있습니다.";

    private static final Set<String> ALWAYS_FORBIDDEN_TOKENS = Set.of(
        "점수", "순위", "이전 지시", "무시하고"
    );
    private static final Set<String> EVIDENCE_REQUIRED_ATTRIBUTE_TOKENS = Set.of(
        "가격", "영업시간", "영업 시간", "반려동물", "단체석", "단체 좌석",
        "와이파이", "wi-fi", "wifi", "콘센트", "주차", "도보", "출구",
        "예약 가능", "루프탑", "실시간"
    );
    private static final Set<String> BLOG_ATTRIBUTION_TOKENS = Set.of(
        "언급", "기록", "소개", "후기", "확인"
    );
    private static final Set<String> GENERIC_GROUNDING_TOKENS = Set.of(
        "장소", "후보", "추천", "카페", "음식점", "식당", "술집", "주점", "바",
        "블로그", "검색", "결과", "기록", "정보", "근거", "방문", "소개", "확인",
        "제안", "해당", "관련", "공간"
    );

    public boolean isSupported(
        GeneratedReasonStatement statement,
        ReasonGenerationCommand command
    ) {
        return validate(statement, command) == ValidationResult.SUPPORTED;
    }

    public ValidationResult validate(
        GeneratedReasonStatement statement,
        ReasonGenerationCommand command
    ) {
        Map<String, ReasonClaim> available = new HashMap<>();
        command.claims().forEach(claim -> available.put(claim.claimId(), claim));
        List<ReasonClaim> cited = new ArrayList<>();
        for (String claimId : statement.claimIds()) {
            ReasonClaim claim = available.get(claimId);
            if (claim == null) {
                return ValidationResult.UNKNOWN_CLAIM;
            }
            cited.add(claim);
        }

        String normalizedText = normalize(statement.text());
        if (containsAny(normalizedText, ALWAYS_FORBIDDEN_TOKENS) ||
            normalizedText.matches(".*\\d+[ ]*원.*") ||
            normalizedText.matches(".*\\d+[ ]*위.*")) {
            return ValidationResult.FORBIDDEN_CLAIM;
        }
        String normalizedClaims = normalize(cited.stream()
            .map(value -> value.title() + " " + value.summary())
            .reduce("", (left, right) -> left + " " + right));
        for (String attribute : EVIDENCE_REQUIRED_ATTRIBUTE_TOKENS) {
            String normalizedAttribute = normalize(attribute);
            if (normalizedText.contains(normalizedAttribute) &&
                !normalizedClaims.contains(normalizedAttribute)) {
                return ValidationResult.FORBIDDEN_CLAIM;
            }
        }

        boolean citesBlog = cited.stream().anyMatch(
            value -> value.type() == ReasonEvidenceType.BLOG
        );
        boolean mentionsBlog = normalizedText.contains("블로그");
        if (mentionsBlog && !citesBlog) {
            return ValidationResult.BLOG_ATTRIBUTION_MISMATCH;
        }
        if (citesBlog &&
            (!mentionsBlog ||
                BLOG_ATTRIBUTION_TOKENS.stream()
                    .map(ReasonStatementPolicy::normalize)
                    .noneMatch(normalizedText::contains))) {
            return ValidationResult.BLOG_ATTRIBUTION_MISSING;
        }

        Set<String> excluded = tokens(
            command.place().name() + " " + command.place().category()
        );
        excluded.addAll(GENERIC_GROUNDING_TOKENS);
        Set<String> substantive = new LinkedHashSet<>();
        for (ReasonClaim claim : cited) {
            tokens(claim.title() + " " + claim.summary()).stream()
                .filter(token -> !excluded.contains(token))
                .forEach(substantive::add);
        }
        return substantive.stream().anyMatch(normalizedText::contains)
            ? ValidationResult.SUPPORTED
            : ValidationResult.UNSUPPORTED_GROUNDING;
    }

    /**
     * Compatibility validation for persisted v2 statements. New generation uses claim-scoped
     * validation above.
     */
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
        if (containsAny(normalizedText, ALWAYS_FORBIDDEN_TOKENS) ||
            containsAny(normalizedText, EVIDENCE_REQUIRED_ATTRIBUTE_TOKENS) ||
            normalizedText.matches(".*\\d+[ ]*원.*") ||
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

    private static boolean containsAny(String text, Set<String> values) {
        return values.stream().map(ReasonStatementPolicy::normalize).anyMatch(text::contains);
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ")
            .strip();
    }

    public enum ValidationResult {
        SUPPORTED,
        UNKNOWN_CLAIM,
        BLOG_ATTRIBUTION_MISSING,
        BLOG_ATTRIBUTION_MISMATCH,
        UNSUPPORTED_GROUNDING,
        UNKNOWN_EVIDENCE,
        TEMPLATE_EVIDENCE_TYPE_MISMATCH,
        FORBIDDEN_CLAIM,
        NO_LEXICAL_GROUNDING
    }
}
