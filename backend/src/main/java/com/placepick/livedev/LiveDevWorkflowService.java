package com.placepick.livedev;

import com.placepick.livedev.LiveDevApiDto.ConditionView;
import com.placepick.livedev.LiveDevApiDto.DraftView;
import com.placepick.livedev.LiveDevApiDto.FailureView;
import com.placepick.livedev.LiveDevApiDto.ResultView;
import com.placepick.livedev.LiveDevApiDto.RunView;
import com.placepick.livedev.LiveDevApiDto.TraceEventView;
import com.placepick.recommendation.application.port.out.SearchProviderException;
import com.placepick.recommendation.application.scoring.InsufficientCandidatesException;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionErrorCode;
import com.placepick.recommendation.condition.application.port.out.ConditionExtractionPort;
import com.placepick.recommendation.condition.application.port.out.ExtractionCommand;
import com.placepick.recommendation.condition.application.port.out.ExtractionOutcome;
import com.placepick.recommendation.condition.domain.ConfirmedRecommendationCondition;
import com.placepick.recommendation.condition.domain.DraftRecommendationCondition;
import com.placepick.recommendation.workflow.application.RecommendationCoreResult;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** In-memory orchestration exclusively for the local, visible live-development workflow. */
public final class LiveDevWorkflowService {

    private static final String EVENT_NAME = "workflow-trace";

    private final ConditionExtractionPort extractionPort;
    private final LiveDevCoreFactory coreFactory;
    private final Clock clock;
    private final Duration ttl;
    private final ExecutorService workflowExecutor;
    private final ScheduledExecutorService cleanupExecutor;
    private final Map<UUID, DraftState> drafts = new ConcurrentHashMap<>();
    private final Map<UUID, RunState> runs = new ConcurrentHashMap<>();

    public LiveDevWorkflowService(
        ConditionExtractionPort extractionPort,
        LiveDevCoreFactory coreFactory,
        Clock clock,
        Duration ttl,
        int maximumConcurrency
    ) {
        this.extractionPort = Objects.requireNonNull(extractionPort, "extractionPort");
        this.coreFactory = Objects.requireNonNull(coreFactory, "coreFactory");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.ttl = requireTtl(ttl);
        if (maximumConcurrency < 1 || maximumConcurrency > 64) {
            throw new IllegalArgumentException("Live developer concurrency must be between 1 and 64.");
        }
        this.workflowExecutor = Executors.newFixedThreadPool(
            maximumConcurrency,
            daemonThreadFactory("placepick-live-dev-workflow-")
        );
        this.cleanupExecutor = Executors.newSingleThreadScheduledExecutor(
            daemonThreadFactory("placepick-live-dev-cleanup-")
        );
        cleanupExecutor.scheduleAtFixedRate(this::cleanupExpiredSafely, 1, 1, TimeUnit.MINUTES);
    }

    public DraftView createDraft(String requestText) {
        cleanupExpired();
        ExtractionCommand command;
        try {
            command = new ExtractionCommand(requestText, safetyIdentifier());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw failure(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_TEXT", "요청 문장을 확인해 주세요.");
        }

        ExtractionOutcome outcome;
        try {
            outcome = extractionPort.extract(command);
        } catch (RuntimeException exception) {
            throw failure(
                HttpStatus.BAD_GATEWAY,
                "CONDITION_PROVIDER_UNAVAILABLE",
                "조건 추출 Provider를 사용할 수 없습니다."
            );
        }
        if (!outcome.extracted()) {
            throw extractionFailure(outcome.errorCode());
        }

        Instant createdAt = clock.instant();
        DraftState state = new DraftState(
            UUID.randomUUID(),
            command.requestText(),
            outcome.condition(),
            outcome.warnings().stream().map(Enum::name).toList(),
            createdAt,
            createdAt.plus(ttl)
        );
        drafts.put(state.id, state);
        return state.view();
    }

    public DraftView confirmDraft(UUID draftId, ConfirmedRecommendationCondition condition) {
        cleanupExpired();
        if (condition == null) {
            throw failure(
                HttpStatus.BAD_REQUEST,
                "CONFIRMED_CONDITION_REQUIRED",
                "확정 조건이 필요합니다."
            );
        }
        DraftState state = requireDraft(draftId);
        synchronized (state) {
            state.confirmed = condition;
            state.status = DraftStatus.CONFIRMED;
            return state.view();
        }
    }

    public RunView startRun(UUID draftId) {
        cleanupExpired();
        DraftState draft = requireDraft(draftId);
        ConfirmedRecommendationCondition confirmed;
        synchronized (draft) {
            if (draft.status != DraftStatus.CONFIRMED || draft.confirmed == null) {
                throw failure(
                    HttpStatus.CONFLICT,
                    "DRAFT_NOT_CONFIRMED",
                    "추천 실행 전에 조건을 확인하고 확정해 주세요."
                );
            }
            confirmed = draft.confirmed;
        }

        Instant createdAt = clock.instant();
        RunState run = new RunState(
            UUID.randomUUID(),
            draft.id,
            createdAt,
            createdAt.plus(ttl)
        );
        runs.put(run.id, run);
        run.emit("USER_REQUEST_ACCEPTED", "completed", Map.of(
            "requestText", draft.requestText
        ));
        run.emit("CONDITION_EXTRACTED", "completed", Map.of(
            "condition", ConditionView.from(draft.extracted),
            "warnings", draft.warnings
        ));
        run.emit("USER_CONDITION_CONFIRMED", "completed", Map.of(
            "condition", ConditionView.from(confirmed)
        ));

        ConfirmedRecommendationCondition executionCondition = confirmed;
        Future<?> future = workflowExecutor.submit(() -> execute(run, executionCondition));
        run.attach(future);
        return run.view();
    }

    public RunView getRun(UUID runId) {
        cleanupExpired();
        return requireRun(runId).view();
    }

    public SseEmitter subscribe(UUID runId) {
        cleanupExpired();
        RunState run = requireRun(runId);
        long remaining = Math.max(1L, Duration.between(clock.instant(), run.expiresAt).toMillis());
        SseEmitter emitter = new SseEmitter(remaining);
        emitter.onCompletion(() -> run.remove(emitter));
        emitter.onTimeout(() -> run.remove(emitter));
        emitter.onError(ignored -> run.remove(emitter));
        run.subscribe(emitter);
        return emitter;
    }

    public void deleteRun(UUID runId) {
        cleanupExpired();
        RunState run = runs.remove(requireId(runId, "runId"));
        if (run == null) {
            throw notFound("RUN_NOT_FOUND", "추천 실행을 찾을 수 없습니다.");
        }
        drafts.remove(run.draftId);
        run.cancel();
    }

    void cleanupExpired() {
        Instant now = clock.instant();
        drafts.entrySet().removeIf(entry -> !entry.getValue().expiresAt.isAfter(now));
        runs.forEach((id, run) -> {
            if (!run.expiresAt.isAfter(now) && runs.remove(id, run)) {
                run.cancel();
            }
        });
    }

    @PreDestroy
    public void close() {
        runs.values().forEach(RunState::cancel);
        workflowExecutor.shutdownNow();
        cleanupExecutor.shutdownNow();
    }

    private void execute(RunState run, ConfirmedRecommendationCondition condition) {
        if (!run.start()) {
            return;
        }
        run.emit("RECOMMENDATION_WORKFLOW_STARTED", "running", Map.of());
        try {
            LiveDevTraceCollector trace = new LiveDevTraceCollector(
                (stage, data) -> run.emit(stage, "completed", data)
            );
            RecommendationCoreResult result = coreFactory.create(trace).recommend(condition);
            run.complete(result);
        } catch (InsufficientCandidatesException exception) {
            run.fail("INSUFFICIENT_CANDIDATES", "조건에 맞는 후보가 3개보다 적습니다.");
        } catch (SearchProviderException exception) {
            run.fail("NAVER_" + exception.failure().name(), "장소 검색 Provider 요청에 실패했습니다.");
        } catch (RuntimeException exception) {
            run.fail("WORKFLOW_FAILED", "추천 워크플로 실행에 실패했습니다.");
        }
    }

    private DraftState requireDraft(UUID draftId) {
        DraftState state = drafts.get(requireId(draftId, "draftId"));
        if (state == null) {
            throw notFound("DRAFT_NOT_FOUND", "조건 초안을 찾을 수 없습니다.");
        }
        return state;
    }

    private RunState requireRun(UUID runId) {
        RunState state = runs.get(requireId(runId, "runId"));
        if (state == null) {
            throw notFound("RUN_NOT_FOUND", "추천 실행을 찾을 수 없습니다.");
        }
        return state;
    }

    private static UUID requireId(UUID value, String name) {
        if (value == null) {
            throw failure(HttpStatus.BAD_REQUEST, "INVALID_IDENTIFIER", name + " 값이 필요합니다.");
        }
        return value;
    }

    private static LiveDevWorkflowException extractionFailure(
        ConditionExtractionErrorCode errorCode
    ) {
        if (errorCode == ConditionExtractionErrorCode.UNPROCESSABLE_CONDITION) {
            return failure(
                HttpStatus.UNPROCESSABLE_ENTITY,
                errorCode.name(),
                "위치와 장소 유형을 포함해 요청해 주세요."
            );
        }
        return failure(
            HttpStatus.BAD_GATEWAY,
            "CONDITION_" + errorCode.name(),
            "조건 추출 Provider 응답을 처리하지 못했습니다."
        );
    }

    private static LiveDevWorkflowException notFound(String code, String message) {
        return failure(HttpStatus.NOT_FOUND, code, message);
    }

    private static LiveDevWorkflowException failure(
        HttpStatus status,
        String code,
        String message
    ) {
        return new LiveDevWorkflowException(status, code, message);
    }

    private static Duration requireTtl(Duration value) {
        if (value == null || value.isZero() || value.isNegative() || value.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("Live developer TTL must be between one nanosecond and one hour.");
        }
        return value;
    }

    private static String safetyIdentifier() {
        return "livedev_" + UUID.randomUUID().toString().replace("-", "");
    }

    private void cleanupExpiredSafely() {
        try {
            cleanupExpired();
        } catch (RuntimeException ignored) {
            // Cleanup failure must not stop the scheduler; no request/provider data is logged here.
        }
    }

    private static ThreadFactory daemonThreadFactory(String prefix) {
        AtomicInteger index = new AtomicInteger();
        return task -> {
            Thread thread = new Thread(task, prefix + index.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }

    private enum DraftStatus {
        EXTRACTED,
        CONFIRMED
    }

    private enum RunStatus {
        QUEUED,
        RUNNING,
        COMPLETED,
        FAILED,
        CANCELLED;

        boolean terminal() {
            return this == COMPLETED || this == FAILED || this == CANCELLED;
        }
    }

    private final class DraftState {
        private final UUID id;
        private final String requestText;
        private final DraftRecommendationCondition extracted;
        private final List<String> warnings;
        private final Instant createdAt;
        private final Instant expiresAt;
        private DraftStatus status = DraftStatus.EXTRACTED;
        private ConfirmedRecommendationCondition confirmed;

        private DraftState(
            UUID id,
            String requestText,
            DraftRecommendationCondition extracted,
            List<String> warnings,
            Instant createdAt,
            Instant expiresAt
        ) {
            this.id = id;
            this.requestText = requestText;
            this.extracted = extracted;
            this.warnings = List.copyOf(warnings);
            this.createdAt = createdAt;
            this.expiresAt = expiresAt;
        }

        private DraftView view() {
            return new DraftView(
                id,
                status.name(),
                confirmed == null
                    ? ConditionView.from(extracted)
                    : ConditionView.from(confirmed),
                warnings,
                createdAt,
                expiresAt
            );
        }
    }

    private final class RunState {
        private final UUID id;
        private final UUID draftId;
        private final Instant createdAt;
        private final Instant expiresAt;
        private final List<TraceEventView> trace = new ArrayList<>();
        private final List<SseEmitter> emitters = new ArrayList<>();
        private long sequence;
        private RunStatus status = RunStatus.QUEUED;
        private Instant updatedAt;
        private ResultView result;
        private FailureView failure;
        private Future<?> future;

        private RunState(UUID id, UUID draftId, Instant createdAt, Instant expiresAt) {
            this.id = id;
            this.draftId = draftId;
            this.createdAt = createdAt;
            this.updatedAt = createdAt;
            this.expiresAt = expiresAt;
        }

        private synchronized void attach(Future<?> task) {
            this.future = task;
            if (status == RunStatus.CANCELLED) {
                task.cancel(true);
            }
        }

        private synchronized boolean start() {
            if (status != RunStatus.QUEUED) {
                return false;
            }
            status = RunStatus.RUNNING;
            updatedAt = clock.instant();
            return true;
        }

        private synchronized void emit(
            String stage,
            String eventStatus,
            Map<String, Object> data
        ) {
            if (status == RunStatus.CANCELLED) {
                return;
            }
            TraceEventView event = new TraceEventView(
                ++sequence,
                stage,
                eventStatus,
                clock.instant(),
                data
            );
            trace.add(event);
            updatedAt = event.occurredAt();
            sendToSubscribers(event);
        }

        private synchronized void complete(RecommendationCoreResult value) {
            if (status == RunStatus.CANCELLED) {
                return;
            }
            result = ResultView.from(value);
            status = RunStatus.COMPLETED;
            emit("RECOMMENDATION_WORKFLOW_COMPLETED", "completed", Map.of(
                "result", result
            ));
            completeEmitters();
        }

        private synchronized void fail(String errorCode, String message) {
            if (status == RunStatus.CANCELLED) {
                return;
            }
            failure = new FailureView(errorCode, message);
            status = RunStatus.FAILED;
            emit("RECOMMENDATION_WORKFLOW_FAILED", "failed", Map.of(
                "failure", failure
            ));
            completeEmitters();
        }

        private synchronized void cancel() {
            if (status.terminal()) {
                completeEmitters();
                return;
            }
            status = RunStatus.CANCELLED;
            updatedAt = clock.instant();
            TraceEventView event = new TraceEventView(
                ++sequence,
                "RECOMMENDATION_WORKFLOW_CANCELLED",
                "cancelled",
                updatedAt,
                Map.of()
            );
            trace.add(event);
            sendToSubscribers(event);
            if (future != null) {
                future.cancel(true);
            }
            completeEmitters();
        }

        private synchronized RunView view() {
            return new RunView(
                id,
                draftId,
                status.name(),
                trace,
                result,
                failure,
                createdAt,
                updatedAt,
                expiresAt
            );
        }

        private synchronized void subscribe(SseEmitter emitter) {
            for (TraceEventView event : trace) {
                if (!send(emitter, event)) {
                    emitter.complete();
                    return;
                }
            }
            if (status.terminal()) {
                emitter.complete();
            } else {
                emitters.add(emitter);
            }
        }

        private synchronized void remove(SseEmitter emitter) {
            emitters.remove(emitter);
        }

        private void sendToSubscribers(TraceEventView event) {
            for (SseEmitter emitter : List.copyOf(emitters)) {
                if (!send(emitter, event)) {
                    emitters.remove(emitter);
                    emitter.complete();
                }
            }
        }

        private boolean send(SseEmitter emitter, TraceEventView event) {
            try {
                emitter.send(SseEmitter.event()
                    .id(Long.toString(event.id()))
                    .name(EVENT_NAME)
                    .data(event));
                return true;
            } catch (IOException | IllegalStateException exception) {
                return false;
            }
        }

        private void completeEmitters() {
            List<SseEmitter> completed = List.copyOf(emitters);
            emitters.clear();
            completed.forEach(SseEmitter::complete);
        }
    }
}
