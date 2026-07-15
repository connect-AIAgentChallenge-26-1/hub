package com.placepick.livedev;

import com.placepick.livedev.LiveDevApiDto.ConfirmDraftRequest;
import com.placepick.livedev.LiveDevApiDto.CreateDraftRequest;
import com.placepick.livedev.LiveDevApiDto.CreateRunRequest;
import com.placepick.livedev.LiveDevApiDto.DraftView;
import com.placepick.livedev.LiveDevApiDto.RunView;
import java.net.URI;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Local-only HTTP surface for visibly exercising the real recommendation workflow. */
@RestController
@Profile("live-dev")
@RequestMapping(path = "/__dev/api", produces = MediaType.APPLICATION_JSON_VALUE)
public final class LiveDevController {

    private final LiveDevWorkflowService workflowService;

    public LiveDevController(LiveDevWorkflowService workflowService) {
        this.workflowService = workflowService;
    }

    @PostMapping(path = "/drafts", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<DraftView> createDraft(@RequestBody CreateDraftRequest request) {
        if (request == null) {
            throw new LiveDevWorkflowException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "REQUEST_BODY_REQUIRED",
                "요청 본문이 필요합니다."
            );
        }
        DraftView created = workflowService.createDraft(request.requestText());
        return ResponseEntity.created(URI.create("/__dev/api/drafts/" + created.draftId()))
            .body(created);
    }

    @PutMapping(
        path = "/drafts/{draftId}",
        consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public DraftView confirmDraft(
        @PathVariable UUID draftId,
        @RequestBody ConfirmDraftRequest request
    ) {
        if (request == null) {
            throw new LiveDevWorkflowException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "REQUEST_BODY_REQUIRED",
                "요청 본문이 필요합니다."
            );
        }
        return workflowService.confirmDraft(draftId, request.condition());
    }

    @PostMapping(path = "/runs", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<RunView> startRun(@RequestBody CreateRunRequest request) {
        if (request == null) {
            throw new LiveDevWorkflowException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "REQUEST_BODY_REQUIRED",
                "요청 본문이 필요합니다."
            );
        }
        RunView created = workflowService.startRun(request.draftId());
        return ResponseEntity.accepted()
            .location(URI.create("/__dev/api/runs/" + created.runId()))
            .body(created);
    }

    @GetMapping("/runs/{runId}")
    public RunView getRun(@PathVariable UUID runId) {
        return workflowService.getRun(runId);
    }

    @GetMapping(path = "/runs/{runId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@PathVariable UUID runId) {
        return workflowService.subscribe(runId);
    }

    @DeleteMapping("/runs/{runId}")
    public ResponseEntity<Void> deleteRun(@PathVariable UUID runId) {
        workflowService.deleteRun(runId);
        return ResponseEntity.noContent().build();
    }
}
