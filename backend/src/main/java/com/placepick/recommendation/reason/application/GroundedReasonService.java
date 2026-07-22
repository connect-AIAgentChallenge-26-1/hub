package com.placepick.recommendation.reason.application;

import com.placepick.recommendation.application.scoring.CandidateRankingResult;
import com.placepick.recommendation.application.trace.RecommendationTraceSink;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.domain.scoring.RankedPlace;
import com.placepick.recommendation.domain.scoring.RecommendationWarning;
import com.placepick.recommendation.reason.application.port.out.GroundedReasonGenerationPort;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationCommand;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationDiagnosticCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationErrorCode;
import com.placepick.recommendation.reason.application.port.out.ReasonGenerationOutcome;
import com.placepick.recommendation.reason.domain.PlaceReasonStatements;
import com.placepick.recommendation.reason.domain.ReasonClaim;
import com.placepick.recommendation.reason.domain.ReasonEvidenceType;
import com.placepick.recommendation.reason.domain.ReasonPlaceContext;
import com.placepick.recommendation.reason.domain.ReasonStatement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadLocalRandom;

public final class GroundedReasonService {

    public static final String BUDGET_CAUTION =
        "가격 정보는 검색 근거에서 확인되지 않았습니다.";
    public static final String BLOG_CAUTION =
        "블로그 근거를 확인하지 못했습니다.";
    public static final String FALLBACK_CAUTION =
        "추천 이유는 검증된 서버 템플릿으로 대체되었습니다.";

    private static final int MAX_ATTEMPTS_PER_PLACE = 2;
    private static final int MAX_PARALLELISM = 3;
    private static final Duration DEFAULT_RETRY_DELAY = Duration.ofMillis(500);
    private static final Duration MAX_RETRY_DELAY = Duration.ofSeconds(5);

    private final GroundedReasonGenerationPort generationPort;
    private final ReasonContextFactory contextFactory;
    private final ReasonBatchValidator validator;
    private final RecommendationTraceSink traceSink;
    private final RetryWaiter retryWaiter;
    private final AsyncExecutionContext asyncExecutionContext;

    public GroundedReasonService(GroundedReasonGenerationPort generationPort) {
        this(generationPort, RecommendationTraceSink.none());
    }

    public GroundedReasonService(
        GroundedReasonGenerationPort generationPort,
        RecommendationTraceSink traceSink
    ) {
        this(
            generationPort,
            traceSink,
            GroundedReasonService::sleep,
            AsyncExecutionContext.none()
        );
    }

    public static GroundedReasonService withAsyncContext(
        GroundedReasonGenerationPort generationPort,
        RecommendationTraceSink traceSink,
        AsyncExecutionContext asyncExecutionContext
    ) {
        return new GroundedReasonService(
            generationPort,
            traceSink,
            GroundedReasonService::sleep,
            asyncExecutionContext
        );
    }

    GroundedReasonService(
        GroundedReasonGenerationPort generationPort,
        RecommendationTraceSink traceSink,
        RetryWaiter retryWaiter
    ) {
        this(
            generationPort,
            traceSink,
            retryWaiter,
            AsyncExecutionContext.none()
        );
    }

    GroundedReasonService(
        GroundedReasonGenerationPort generationPort,
        RecommendationTraceSink traceSink,
        RetryWaiter retryWaiter,
        AsyncExecutionContext asyncExecutionContext
    ) {
        this.generationPort = Objects.requireNonNull(generationPort, "generationPort");
        this.contextFactory = new ReasonContextFactory();
        this.validator = new ReasonBatchValidator(new ReasonStatementPolicy());
        this.traceSink = Objects.requireNonNull(traceSink, "traceSink");
        this.retryWaiter = Objects.requireNonNull(retryWaiter, "retryWaiter");
        this.asyncExecutionContext = Objects.requireNonNull(
            asyncExecutionContext,
            "asyncExecutionContext"
        );
    }

    public ReasonEnrichmentResult enrich(
        ConfirmedRecommendationCondition condition,
        CandidateRankingResult ranking
    ) {
        Objects.requireNonNull(condition, "condition");
        Objects.requireNonNull(ranking, "ranking");

        List<ReasonGenerationCommand> commands = new ArrayList<>();
        for (int index = 0; index < ranking.places().size(); index++) {
            ReasonPlaceContext context = contextFactory.create(ranking.places().get(index));
            commands.add(ReasonGenerationCommand.forPlace(condition, index + 1, context));
        }

        List<CandidateExecution> executions = executeInParallel(ranking, commands);
        int generationCalls = executions.stream()
            .mapToInt(CandidateExecution::generationCalls)
            .sum();
        if (executions.stream().anyMatch(CandidateExecution::globalFallback)) {
            executions = allFallback(ranking, commands, executions);
        }

        List<EnrichedPlaceReason> places = new ArrayList<>();
        for (int index = 0; index < executions.size(); index++) {
            CandidateExecution execution = executions.get(index);
            traceSink.reasonPlaceCompleted(
                execution.fallbackUsed(),
                execution.generationCalls(),
                !execution.fallbackUsed() && execution.generationCalls() > 1
            );
            places.add(assemble(
                ranking,
                ranking.places().get(index),
                execution.statements(),
                execution.fallbackUsed()
            ));
        }
        return new ReasonEnrichmentResult(places, generationCalls);
    }

    private List<CandidateExecution> executeInParallel(
        CandidateRankingResult ranking,
        List<ReasonGenerationCommand> commands
    ) {
        int parallelism = Math.min(MAX_PARALLELISM, commands.size());
        ExecutorService executor = Executors.newFixedThreadPool(parallelism, runnable -> {
            Thread thread = new Thread(runnable, "reason-generation");
            thread.setDaemon(true);
            return thread;
        });
        try {
            List<Future<CandidateExecution>> futures = new ArrayList<>();
            for (int index = 0; index < commands.size(); index++) {
                int candidateIndex = index;
                futures.add(executor.submit(asyncExecutionContext.wrap(
                    () -> executeForPlace(
                        ranking.places().get(candidateIndex),
                        commands.get(candidateIndex)
                    )
                )));
            }
            List<CandidateExecution> executions = new ArrayList<>();
            for (Future<CandidateExecution> future : futures) {
                executions.add(await(future));
            }
            return List.copyOf(executions);
        } finally {
            executor.shutdownNow();
        }
    }

    private CandidateExecution executeForPlace(
        RankedPlace rankedPlace,
        ReasonGenerationCommand command
    ) {
        int calls = 0;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS_PER_PLACE; attempt++) {
            calls++;
            traceSink.reasonGenerationRequested(command);
            ReasonGenerationOutcome outcome = generationPort.generate(command);
            if (outcome == null) {
                throw new IllegalStateException("Reason generation port returned no outcome.");
            }

            if (outcome.generated()) {
                try {
                    PlaceReasonStatements statements = validator.validate(
                        command,
                        outcome.result()
                    );
                    traceSink.reasonGenerationCompleted(outcome, false);
                    return CandidateExecution.generated(statements, calls);
                } catch (ReasonBatchValidationException exception) {
                    traceSink.reasonValidationFailed(exception.code());
                    boolean willRetry = attempt < MAX_ATTEMPTS_PER_PLACE;
                    traceSink.reasonGenerationCompleted(outcome, !willRetry);
                    if (willRetry) {
                        retryWaiter.await(jitteredDefaultRetryDelay());
                        continue;
                    }
                    return CandidateExecution.fallback(
                        fallbackStatements(rankedPlace, command),
                        calls,
                        false
                    );
                }
            }

            if (isGlobalFailure(outcome)) {
                traceSink.reasonGenerationCompleted(outcome, true);
                return CandidateExecution.fallback(
                    fallbackStatements(rankedPlace, command),
                    calls,
                    true
                );
            }
            boolean willRetry =
                attempt < MAX_ATTEMPTS_PER_PLACE && isRetryable(outcome);
            traceSink.reasonGenerationCompleted(outcome, !willRetry);
            if (willRetry) {
                retryWaiter.await(retryDelay(outcome));
                continue;
            }
            return CandidateExecution.fallback(
                fallbackStatements(rankedPlace, command),
                calls,
                false
            );
        }
        throw new IllegalStateException("Reason generation retry budget was not resolved.");
    }

    private List<CandidateExecution> allFallback(
        CandidateRankingResult ranking,
        List<ReasonGenerationCommand> commands,
        List<CandidateExecution> executions
    ) {
        List<CandidateExecution> fallback = new ArrayList<>();
        for (int index = 0; index < executions.size(); index++) {
            CandidateExecution previous = executions.get(index);
            fallback.add(CandidateExecution.fallback(
                fallbackStatements(ranking.places().get(index), commands.get(index)),
                previous.generationCalls(),
                true
            ));
        }
        return List.copyOf(fallback);
    }

    private PlaceReasonStatements fallbackStatements(
        RankedPlace place,
        ReasonGenerationCommand command
    ) {
        ReasonClaim local = command.claims().stream()
            .filter(claim -> claim.type() == ReasonEvidenceType.LOCAL)
            .findFirst()
            .orElseThrow(() -> new IllegalStateException(
                "A reason command requires one local claim."
            ));
        List<ReasonStatement> statements = new ArrayList<>();
        statements.add(new ReasonStatement(
            bounded(
                "'" + place.candidate().name() + "'은 장소 검색에서 " +
                    usefulText(local.summary(), place.candidate().category()) +
                    " 정보가 확인된 후보입니다.",
                160
            ),
            List.of(local.evidenceId())
        ));
        command.claims().stream()
            .filter(claim -> claim.type() == ReasonEvidenceType.BLOG)
            .findFirst()
            .ifPresent(blog -> statements.add(new ReasonStatement(
                bounded(
                    "블로그 검색 결과에서 " + usefulText(blog.title(), blog.summary()) +
                        " 관련 내용이 언급되어 보조 근거로 확인했습니다.",
                    160
                ),
                List.of(blog.evidenceId())
            )));
        return new PlaceReasonStatements(place.placeId(), statements);
    }

    private EnrichedPlaceReason assemble(
        CandidateRankingResult ranking,
        RankedPlace place,
        PlaceReasonStatements generated,
        boolean fallback
    ) {
        List<String> cautions = new ArrayList<>();
        if (ranking.warnings().contains(RecommendationWarning.BUDGET_EVIDENCE_UNAVAILABLE)) {
            cautions.add(BUDGET_CAUTION);
        }
        if (place.evidence().isEmpty()) {
            cautions.add(BLOG_CAUTION);
        }
        if (fallback) {
            cautions.add(FALLBACK_CAUTION);
        }
        String shareText = bounded(
            "추천 후보: " + place.candidate().name() + " — " +
                generated.statements().get(0).text(),
            240
        );
        return new EnrichedPlaceReason(
            place.placeId(),
            generated.statements(),
            cautions,
            shareText,
            fallback
        );
    }

    private static CandidateExecution await(Future<CandidateExecution> future) {
        try {
            return future.get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Reason generation was interrupted.", exception);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            if (cause instanceof Error error) {
                throw error;
            }
            throw new IllegalStateException("Reason generation failed unexpectedly.", cause);
        }
    }

    private static boolean isRetryable(ReasonGenerationOutcome outcome) {
        if (outcome.errorCode() == ReasonGenerationErrorCode.PROVIDER_RATE_LIMITED ||
            outcome.errorCode() == ReasonGenerationErrorCode.PROVIDER_UNAVAILABLE) {
            return true;
        }
        return outcome.errorCode() == ReasonGenerationErrorCode.PROVIDER_INVALID_RESPONSE &&
            isContentFailure(outcome.diagnosticCode()) &&
            outcome.diagnosticCode() != ReasonGenerationDiagnosticCode.REASON_CONTENT_ROOT_SCHEMA;
    }

    private static boolean isContentFailure(ReasonGenerationDiagnosticCode code) {
        return code.name().startsWith("REASON_CONTENT_");
    }

    private static boolean isGlobalFailure(ReasonGenerationOutcome outcome) {
        return switch (outcome.diagnosticCode()) {
            case REASON_HTTP_CONTENT_TYPE,
                 REASON_HTTP_RESPONSE_TOO_LARGE,
                 REASON_ENVELOPE_JSON,
                 REASON_ENVELOPE_METADATA,
                 REASON_ENVELOPE_CHOICES,
                 REASON_ENVELOPE_MESSAGE,
                 REASON_ENVELOPE_CONTENT,
                 REASON_ENVELOPE_USAGE,
                 REASON_CONTENT_ROOT_SCHEMA -> true;
            default -> false;
        };
    }

    private static Duration retryDelay(ReasonGenerationOutcome outcome) {
        Duration requested = outcome.retryAfter().orElseGet(() ->
            jitteredDefaultRetryDelay()
        );
        if (requested.compareTo(DEFAULT_RETRY_DELAY) < 0) {
            return outcome.retryAfter().isPresent() ? DEFAULT_RETRY_DELAY : requested;
        }
        return requested.compareTo(MAX_RETRY_DELAY) > 0 ? MAX_RETRY_DELAY : requested;
    }

    private static Duration jitteredDefaultRetryDelay() {
        return Duration.ofMillis(ThreadLocalRandom.current().nextLong(400, 601));
    }

    private static void sleep(Duration duration) {
        try {
            long millis = duration.toMillis();
            int nanos = duration.minusMillis(millis).getNano();
            Thread.sleep(millis, nanos);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Reason generation retry wait was interrupted.", exception);
        }
    }

    private static String usefulText(String preferred, String fallback) {
        String value = preferred == null || preferred.isBlank() ? fallback : preferred;
        value = value == null || value.isBlank() ? "검증 가능한 장소" : value;
        return bounded(value.replaceAll("\\s+", " ").strip(), 90);
    }

    private static String bounded(String source, int maximum) {
        int length = source.codePointCount(0, source.length());
        return length <= maximum
            ? source
            : source.substring(0, source.offsetByCodePoints(0, maximum));
    }

    @FunctionalInterface
    interface RetryWaiter {

        void await(Duration duration);
    }

    private record CandidateExecution(
        PlaceReasonStatements statements,
        boolean fallbackUsed,
        int generationCalls,
        boolean globalFallback
    ) {

        private static CandidateExecution generated(
            PlaceReasonStatements statements,
            int calls
        ) {
            return new CandidateExecution(statements, false, calls, false);
        }

        private static CandidateExecution fallback(
            PlaceReasonStatements statements,
            int calls,
            boolean global
        ) {
            return new CandidateExecution(statements, true, calls, global);
        }
    }
}
