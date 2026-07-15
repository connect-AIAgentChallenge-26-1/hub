package com.placepick.workflow.live;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.placepick.infrastructure.external.http.NoRetryHttpRequestFactory;
import com.placepick.infrastructure.external.llm.EliceConditionExtractionClient;
import com.placepick.infrastructure.external.llm.LinkedLiveConditionClientFactory;
import com.placepick.infrastructure.external.naver.LinkedLiveNaverAdapterFactory;
import com.placepick.infrastructure.external.naver.NaverApiHubAdapter;
import com.placepick.recommendation.application.candidate.CandidateNormalizer;
import com.placepick.recommendation.application.candidate.CandidateQueryPlanner;
import com.placepick.recommendation.application.candidate.CategoryTaxonomy;
import com.placepick.recommendation.application.candidate.LocationMatcher;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.scoring.CandidateRanker;
import com.placepick.recommendation.application.scoring.CandidateRankingService;
import com.placepick.recommendation.application.scoring.CandidateScoringPolicy;
import com.placepick.recommendation.application.scoring.InsufficientCandidatesException;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.condition.domain.PlaceType;
import com.placepick.recommendation.condition.domain.Preference;
import com.placepick.recommendation.reason.adapter.out.llm.EliceGroundedReasonClient;
import com.placepick.recommendation.reason.adapter.out.llm.LinkedLiveReasonClientFactory;
import com.placepick.recommendation.reason.application.GroundedReasonService;
import com.placepick.recommendation.workflow.application.RecommendationCorePlace;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import com.placepick.recommendation.workflow.application.RecommendationCoreUseCase;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

class WorkflowLinkedLiveProbeTest {

    private static final String FIXTURE_HASH =
        "2afeef2b02ae9f168745b1d842277c2bcba0e9fb11b534d6683b319e81e6e2b0";
    private static final String SCOPE_HASH =
        "73b6d630cb24b9222e05b289822b11a64c2f23ad04acb09b5fe01accafe3b2d0";
    private static final String SYNTHETIC_INPUT =
        "서울에서 2명이 1인당 20000원 이하로 조용한 카페를 찾습니다. " +
            "흡연 장소는 제외합니다.";
    private static final String SAFETY_IDENTIFIER =
        "synthetic-linked-workflow-session-0001";
    private static final int MAX_CONTROL_RESPONSE_BYTES = 32 * 1024;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final List<String> EXPECTED_STAGES = List.of(
        "conditionExtraction",
        "naverLocal",
        "naverBlog",
        "reasonGeneration"
    );
    private static final Set<String> EQUIVALENT_LOCATIONS = Set.of(
        "서울", "서울시", "서울특별시"
    );
    private static final Set<String> EQUIVALENT_PREFERENCES = Set.of(
        "조용", "조용한", "조용함", "조용한 곳", "조용한 장소", "조용한 분위기"
    );
    private static final Set<String> EQUIVALENT_EXCLUSIONS = Set.of(
        "흡연", "흡연 장소", "흡연 가능", "흡연 가능 장소"
    );

    @Test
    void verifiesTheActualNaverToEliceRecommendationCore() {
        requireExplicitEnablement();
        URI gatewayRoot = requiredLoopbackRoot();
        String controlToken = requiredCredential("WORKFLOW_LINKED_CONTROL_TOKEN");
        String naverKeyId = requiredCredential("WORKFLOW_LINKED_NAVER_KEY_ID");
        String naverKey = requiredCredential("WORKFLOW_LINKED_NAVER_KEY");
        String eliceToken = requiredCredential("WORKFLOW_LINKED_ELICE_TOKEN");
        String approvedSha = requiredSha("APPROVED_SHA");
        RestClient control = controlClient(controlToken);

        byte[] start = postControl(
            control,
            gatewayRoot.resolve("/v1/probes/workflow-linked/start"),
            startBody(approvedSha),
            "start"
        );
        validateReadySummary(start, approvedSha);

        EliceConditionExtractionClient extractionClient =
            LinkedLiveConditionClientFactory.create(gatewayRoot.resolve("/v1"), eliceToken);
        LinkedLiveConditionClientFactory.LinkedLiveExtraction extractionResult =
            LinkedLiveConditionClientFactory.extract(
                extractionClient,
                new ExtractionCommand(SYNTHETIC_INPUT, SAFETY_IDENTIFIER)
            );
        requireExpectedExtraction(extractionResult.outcome(), extractionResult.boundaryCode());
        ConfirmedRecommendationCondition confirmed = confirmedFixture();

        NaverApiHubAdapter naver = LinkedLiveNaverAdapterFactory.create(
            gatewayRoot,
            naverKeyId,
            naverKey
        );
        EliceGroundedReasonClient reasonClient = LinkedLiveReasonClientFactory.create(
            gatewayRoot.resolve("/v1"),
            eliceToken
        );
        CategoryTaxonomy taxonomy = new CategoryTaxonomy();
        CandidateRankingService ranking = new CandidateRankingService(
            naver,
            naver,
            new CandidateQueryPlanner(taxonomy),
            new CandidateNormalizer(taxonomy, new LocationMatcher()),
            new CandidateRanker(new CandidateScoringPolicy())
        );
        RecommendationCoreUseCase core = new RecommendationCoreUseCase(
            ranking,
            new GroundedReasonService(reasonClient)
        );

        RecommendationCoreResult result;
        try {
            result = core.recommend(confirmed);
        } catch (InsufficientCandidatesException exception) {
            throw safeFailure("naverLocal", "INSUFFICIENT_CANDIDATES");
        } catch (SearchProviderException exception) {
            throw safeFailure("naverLocal", exception.failure().name());
        }
        CoreEvidence coreEvidence = validateCoreResult(result);
        byte[] completed = postControl(
            control,
            gatewayRoot.resolve("/v1/probes/workflow-linked/complete"),
            completionBody(approvedSha, result),
            "complete"
        );
        SafeSummary summary = validateSafeSummary(
            completed,
            approvedSha,
            result,
            coreEvidence
        );

        summary.checks().forEach(WorkflowLinkedLiveProbeTest::printCheck);
        System.out.println(
            "WORKFLOW_LINKED stage=userConfirmation applied=true semanticMatch=true"
        );
        System.out.println(
            "WORKFLOW_LINKED stage=ranking resultCount=3 scoreMin=" +
                coreEvidence.minimumScore() + " scoreMax=" + coreEvidence.maximumScore() +
                " relaxed=" + result.relaxed() + " degraded=false"
        );
        System.out.println(
            "WORKFLOW_LINKED result=validated linked=true status=passed degraded=false " +
                "reasonFallback=false callCount=" + summary.callCount()
        );
    }

    private static RestClient controlClient(String controlToken) {
        return RestClient.builder()
            .requestFactory(NoRetryHttpRequestFactory.create(
                Duration.ofSeconds(2),
                Duration.ofSeconds(30)
            ))
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + controlToken)
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    private static byte[] postControl(
        RestClient client,
        URI endpoint,
        Map<String, Object> body,
        String stage
    ) {
        ControlResponse result;
        try {
            result = client.post()
                .uri(endpoint)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .exchange((request, response) -> {
                    MediaType contentType = response.getHeaders().getContentType();
                    try (InputStream input = response.getBody()) {
                        byte[] bounded = input.readNBytes(MAX_CONTROL_RESPONSE_BYTES + 1);
                        if (bounded.length > MAX_CONTROL_RESPONSE_BYTES) {
                            throw safeFailure(stage, "CONTROL_RESPONSE_TOO_LARGE");
                        }
                        return new ControlResponse(
                            response.getStatusCode().value(),
                            contentType,
                            bounded
                        );
                    }
                });
        } catch (RestClientException exception) {
            throw safeFailure(stage, "CONTROL_UNAVAILABLE");
        }
        if (result.httpStatus() < 200 || result.httpStatus() >= 300) {
            throw safeFailure(stage, safeProblemCode(result.body()));
        }
        if (result.contentType() == null ||
            !MediaType.APPLICATION_JSON.isCompatibleWith(result.contentType())) {
            throw safeFailure(stage, "INVALID_CONTROL_RESPONSE");
        }
        return result.body();
    }

    private static Map<String, Object> startBody(String approvedSha) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("approvedSha", approvedSha);
        body.put("fixtureHash", FIXTURE_HASH);
        body.put("scopeHash", SCOPE_HASH);
        return body;
    }

    private static Map<String, Object> completionBody(
        String approvedSha,
        RecommendationCoreResult result
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("approvedSha", approvedSha);
        body.put("resultCount", result.places().size());
        body.put("placeSearchCalls", result.placeSearchCalls());
        body.put("blogSearchCalls", result.blogSearchCalls());
        body.put("degraded", result.degraded());
        body.put("reasonFallback", result.reasonFallback());
        return body;
    }

    private static void requireExpectedExtraction(
        ExtractionOutcome extraction,
        String boundaryCode
    ) {
        if (extraction == null || !extraction.extracted() || extraction.condition() == null) {
            String errorCode = boundaryCode != null
                ? boundaryCode
                : extraction == null
                ? "INVALID_RESPONSE"
                : extraction.errorCode().name();
            throw safeFailure("conditionExtraction", errorCode);
        }
        DraftRecommendationCondition draft = extraction.condition();
        if (
            !equivalent(draft.locationQuery(), EQUIVALENT_LOCATIONS) ||
            draft.placeType() != PlaceType.CAFE ||
            draft.placeTypeDetail() != null || !Integer.valueOf(2).equals(draft.partySize()) ||
            draft.budgetPerPersonMin() != null ||
            !Integer.valueOf(20_000).equals(draft.budgetPerPersonMax()) ||
            draft.preferences().size() != 1 ||
            !equivalent(draft.preferences().get(0).value(), EQUIVALENT_PREFERENCES) ||
            draft.preferences().get(0).priority() != null ||
            draft.exclusions().size() != 1 ||
            !equivalent(draft.exclusions().get(0), EQUIVALENT_EXCLUSIONS) ||
            !extraction.warnings().isEmpty()) {
            throw safeFailure("conditionExtraction", "SEMANTIC_MISMATCH");
        }
    }

    private static boolean equivalent(String value, Set<String> allowlist) {
        if (value == null) {
            return false;
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).strip();
        return allowlist.contains(normalized);
    }

    private static ConfirmedRecommendationCondition confirmedFixture() {
        return new ConfirmedRecommendationCondition(
            "서울",
            PlaceType.CAFE,
            null,
            2,
            null,
            20_000,
            List.of(new Preference("조용한", 10)),
            List.of("흡연")
        );
    }

    private static CoreEvidence validateCoreResult(RecommendationCoreResult result) {
        if (result == null) {
            throw safeFailure("recommendationCore", "INVALID_CORE_RESULT");
        }
        if (result.warnings().contains("BLOG_EVIDENCE_UNAVAILABLE")) {
            throw safeFailure("naverBlog", "BLOG_EVIDENCE_UNAVAILABLE");
        }
        if (result.reasonFallback()) {
            throw safeFailure("reasonGeneration", "LLM_REASON_FALLBACK");
        }
        if (result.places().size() != 3 || result.degraded() ||
            result.placeSearchCalls() < 1 ||
            result.placeSearchCalls() > 2 || result.blogSearchCalls() < 3 ||
            result.blogSearchCalls() > 5 || result.reasonGenerationCalls() != 1) {
            throw safeFailure("recommendationCore", "STRICT_SUCCESS_CONTRACT_FAILED");
        }

        int previousScore = Integer.MAX_VALUE;
        int previousEvidenceCount = Integer.MAX_VALUE;
        String previousCandidateKey = null;
        int minimumScore = Integer.MAX_VALUE;
        int maximumScore = Integer.MIN_VALUE;
        int blogEvidenceCount = 0;
        for (RecommendationCorePlace place : result.places()) {
            int score = place.rankedPlace().score();
            int evidenceCount = place.rankedPlace().evidence().size();
            String candidateKey = place.rankedPlace().candidate().candidateKey().value();
            if (score < 0 || score > 80 || score > previousScore) {
                throw safeFailure("ranking", "INVALID_SCORE_ORDER");
            }
            if (score == previousScore && evidenceCount > previousEvidenceCount) {
                throw safeFailure("ranking", "INVALID_EVIDENCE_ORDER");
            }
            if (score == previousScore && evidenceCount == previousEvidenceCount &&
                previousCandidateKey != null &&
                candidateKey.compareTo(previousCandidateKey) < 0) {
                throw safeFailure("ranking", "INVALID_CANDIDATE_KEY_ORDER");
            }
            previousScore = score;
            previousEvidenceCount = evidenceCount;
            previousCandidateKey = candidateKey;
            minimumScore = Math.min(minimumScore, score);
            maximumScore = Math.max(maximumScore, score);
            blogEvidenceCount += evidenceCount;

            Set<String> allowedEvidence = new LinkedHashSet<>();
            allowedEvidence.add("local:" + place.rankedPlace().placeId());
            place.rankedPlace().evidence().forEach(value ->
                allowedEvidence.add(value.evidenceId())
            );
            if (place.reasonStatements().isEmpty() ||
                place.reasonStatements().stream()
                    .flatMap(value -> value.evidenceIds().stream())
                    .anyMatch(value -> !allowedEvidence.contains(value))) {
                throw safeFailure("reasonGeneration", "INVALID_REASON_EVIDENCE");
            }
        }
        if (blogEvidenceCount < 1) {
            throw safeFailure("naverBlog", "BLOG_EVIDENCE_UNAVAILABLE");
        }
        return new CoreEvidence(minimumScore, maximumScore, blogEvidenceCount);
    }

    private static void validateReadySummary(byte[] body, String approvedSha) {
        JsonNode root = readControlJson(body, "start");
        if (root.size() != 3 || !approvedSha.equals(text(root, "approvedSha")) ||
            !"linked".equals(text(root, "mode")) ||
            !"ready".equals(text(root, "status"))) {
            throw safeFailure("start", "INVALID_CONTROL_RESPONSE");
        }
    }

    private static SafeSummary validateSafeSummary(
        byte[] body,
        String approvedSha,
        RecommendationCoreResult result,
        CoreEvidence coreEvidence
    ) {
        JsonNode root;
        try {
            root = OBJECT_MAPPER.readTree(body);
        } catch (IOException exception) {
            throw new IllegalStateException("Linked workflow safe summary JSON is invalid.", null);
        }
        if (root == null || !root.isObject() ||
            !approvedSha.equals(text(root, "approvedSha")) ||
            !"linked".equals(text(root, "mode")) ||
            !"passed".equals(text(root, "status")) ||
            !root.path("linked").asBoolean(false) ||
            integer(root, "callCount") !=
                2 + result.placeSearchCalls() + result.blogSearchCalls() ||
            integer(root, "evidenceCount") != coreEvidence.blogEvidenceCount() ||
            !root.path("checks").isArray() || root.path("checks").size() != 4) {
            throw new IllegalStateException("Linked workflow safe summary is invalid.");
        }

        List<SafeCheck> checks = new ArrayList<>();
        for (int index = 0; index < EXPECTED_STAGES.size(); index++) {
            JsonNode check = root.path("checks").path(index);
            String expectedStage = EXPECTED_STAGES.get(index);
            int status = integer(check, "httpStatus");
            if (!check.isObject() || !expectedStage.equals(text(check, "stage")) ||
                status < 200 || status >= 300 ||
                !check.path("schemaValid").asBoolean(false) ||
                integer(check, "durationMs") < 0) {
                throw new IllegalStateException("Linked workflow stage summary is invalid.");
            }
            checks.add(new SafeCheck(
                expectedStage,
                integer(check, "durationMs"),
                nullableInteger(check, "calls"),
                nullableInteger(check, "itemCount"),
                nullableInteger(check, "evidenceCount"),
                nullableInteger(check, "inputTokens"),
                nullableInteger(check, "outputTokens")
            ));
        }
        validateStageDetails(checks, result, coreEvidence);
        return new SafeSummary(
            integer(root, "callCount"),
            integer(root, "evidenceCount"),
            List.copyOf(checks)
        );
    }

    private static void validateStageDetails(
        List<SafeCheck> checks,
        RecommendationCoreResult result,
        CoreEvidence coreEvidence
    ) {
        SafeCheck condition = checks.get(0);
        SafeCheck local = checks.get(1);
        SafeCheck blog = checks.get(2);
        SafeCheck reason = checks.get(3);
        if (condition.inputTokens() == null || condition.outputTokens() == null ||
            local.calls() == null || local.calls() != result.placeSearchCalls() ||
            local.itemCount() == null || local.itemCount() < 3 ||
            blog.calls() == null || blog.calls() != result.blogSearchCalls() ||
            blog.itemCount() == null || blog.itemCount() < 1 ||
            reason.evidenceCount() == null ||
            reason.evidenceCount() != coreEvidence.blogEvidenceCount() ||
            reason.inputTokens() == null || reason.outputTokens() == null) {
            throw safeFailure("complete", "INCONSISTENT_SAFE_SUMMARY");
        }
    }

    private static void printCheck(SafeCheck check) {
        StringBuilder output = new StringBuilder()
            .append("WORKFLOW_LINKED stage=").append(check.stage())
            .append(" http=2xx schema=true");
        append(output, "calls", check.calls());
        append(output, "itemCount", check.itemCount());
        append(output, "evidenceCount", check.evidenceCount());
        append(output, "inputTokens", check.inputTokens());
        append(output, "outputTokens", check.outputTokens());
        output.append(" latencyMs=").append(check.durationMilliseconds());
        System.out.println(output);
    }

    private static void append(StringBuilder output, String name, Integer value) {
        if (value != null) {
            output.append(' ').append(name).append('=').append(value);
        }
    }

    private static JsonNode readControlJson(byte[] body, String stage) {
        try {
            JsonNode root = OBJECT_MAPPER.readTree(body);
            if (root == null || !root.isObject()) {
                throw safeFailure(stage, "INVALID_CONTROL_RESPONSE");
            }
            return root;
        } catch (IOException exception) {
            throw safeFailure(stage, "INVALID_CONTROL_RESPONSE");
        }
    }

    private static String safeProblemCode(byte[] body) {
        try {
            JsonNode root = OBJECT_MAPPER.readTree(body);
            String errorCode = text(root, "errorCode");
            return errorCode != null && errorCode.matches("[A-Z][A-Z0-9_]{2,64}")
                ? errorCode
                : "CONTROL_REQUEST_FAILED";
        } catch (IOException exception) {
            return "CONTROL_REQUEST_FAILED";
        }
    }

    private static IllegalStateException safeFailure(String stage, String errorCode) {
        String safeStage = stage != null && stage.matches("[a-zA-Z][a-zA-Z0-9]{1,31}")
            ? stage
            : "unknown";
        String safeCode = errorCode != null && errorCode.matches("[A-Z][A-Z0-9_]{2,64}")
            ? errorCode
            : "UNCLASSIFIED_FAILURE";
        System.out.println(
            "WORKFLOW_LINKED status=failed stage=" + safeStage + " errorCode=" + safeCode
        );
        return new IllegalStateException(
            "Linked workflow failed at stage=" + safeStage + " errorCode=" + safeCode + "."
        );
    }

    private static String text(JsonNode value, String field) {
        JsonNode node = value.get(field);
        return node != null && node.isTextual() ? node.textValue() : null;
    }

    private static int integer(JsonNode value, String field) {
        Integer result = nullableInteger(value, field);
        return result == null ? -1 : result;
    }

    private static Integer nullableInteger(JsonNode value, String field) {
        JsonNode node = value.get(field);
        return node != null && node.canConvertToInt() && node.intValue() >= 0
            ? node.intValue()
            : null;
    }

    private static URI requiredLoopbackRoot() {
        URI value;
        try {
            value = URI.create(requiredEnvironment("WORKFLOW_LINKED_GATEWAY_URL"));
        } catch (IllegalArgumentException exception) {
            throw new IllegalStateException("WORKFLOW_LINKED_GATEWAY_URL is invalid.", null);
        }
        String host = value.getHost();
        if (!value.isAbsolute() || !"http".equals(value.getScheme()) ||
            !("127.0.0.1".equals(host) || "localhost".equals(host)) ||
            value.getUserInfo() != null || value.getQuery() != null ||
            value.getFragment() != null ||
            !(value.getPath().isEmpty() || "/".equals(value.getPath()))) {
            throw new IllegalStateException("Linked workflow gateway must be loopback-only.");
        }
        return value;
    }

    private static String requiredCredential(String name) {
        String value = requiredEnvironment(name);
        if (!value.matches("[A-Za-z0-9_-]{32,128}")) {
            throw new IllegalStateException(name + " is malformed.");
        }
        return value;
    }

    private static String requiredSha(String name) {
        String value = requiredEnvironment(name);
        if (!value.matches("[0-9a-f]{40}")) {
            throw new IllegalStateException(name + " is malformed.");
        }
        return value;
    }

    private static String requiredEnvironment(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required for the linked workflow probe.");
        }
        return value;
    }

    private static void requireExplicitEnablement() {
        if (!"live-contract".equals(System.getenv("PLACEPICK_EXTERNAL_MODE"))) {
            throw new IllegalStateException(
                "Linked workflow probe requires PLACEPICK_EXTERNAL_MODE=live-contract."
            );
        }
        if (System.getenv("CI") != null) {
            throw new IllegalStateException("Linked workflow probe is forbidden when CI is set.");
        }
        Set<String> rawProviderVariables = Set.of(
            "NAVER_API_HUB_KEY_ID",
            "NAVER_API_HUB_KEY",
            "PROXY_TOKEN",
            "CHAT_PROXY_URL",
            "EMBEDDING_PROXY_URL",
            "OPENAI_MODEL",
            "OPENAI_EMBEDDING_MODEL"
        );
        if (rawProviderVariables.stream().anyMatch(name -> System.getenv(name) != null)) {
            throw new IllegalStateException(
                "Raw provider configuration must not enter the Java linked workflow process."
            );
        }
    }

    private record CoreEvidence(int minimumScore, int maximumScore, int blogEvidenceCount) {
    }

    private record ControlResponse(int httpStatus, MediaType contentType, byte[] body) {
    }

    private record SafeSummary(int callCount, int evidenceCount, List<SafeCheck> checks) {
    }

    private record SafeCheck(
        String stage,
        long durationMilliseconds,
        Integer calls,
        Integer itemCount,
        Integer evidenceCount,
        Integer inputTokens,
        Integer outputTokens
    ) {
    }
}
