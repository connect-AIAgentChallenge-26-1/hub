import { describe, expect, it } from "vitest";
import { mockDraft, mockRun, mockTrace } from "../fixtures/mock-data";
import { initialPlaygroundState, playgroundReducer } from "../model/state";

describe("playgroundReducer", () => {
  it("입력→Draft 검토→추천 실행→완료의 명시적 사용자 흐름을 유지한다", () => {
    const extracting = playgroundReducer(initialPlaygroundState, {
      type: "EXTRACTION_REQUESTED",
    });
    const review = playgroundReducer(extracting, { type: "DRAFT_READY", draft: mockDraft });
    const starting = playgroundReducer(review, { type: "RUN_REQUESTED", draft: mockDraft });
    const running = playgroundReducer(starting, {
      type: "RUN_ACCEPTED",
      run: { ...mockRun, status: "QUEUED", trace: [], result: null },
    });
    const completed = playgroundReducer(running, { type: "RUN_COMPLETED", run: mockRun });

    expect(extracting.phase).toBe("EXTRACTING");
    expect(review.phase).toBe("REVIEW");
    expect(starting.phase).toBe("STARTING");
    expect(running.phase).toBe("RUNNING");
    expect(completed.phase).toBe("COMPLETED");
    expect(completed.run?.result?.places).toHaveLength(3);
  });

  it("같은 trace event를 재수신해도 중복 표시하지 않고 순서대로 정렬한다", () => {
    const base = {
      ...initialPlaygroundState,
      phase: "RUNNING" as const,
      run: { ...mockRun, status: "RUNNING" as const, trace: [], result: null },
    };
    const second = playgroundReducer(base, {
      type: "TRACE_RECEIVED",
      runId: mockRun.runId,
      event: mockTrace[1]!,
    });
    const first = playgroundReducer(second, {
      type: "TRACE_RECEIVED",
      runId: mockRun.runId,
      event: mockTrace[0]!,
    });
    const duplicate = playgroundReducer(first, {
      type: "TRACE_RECEIVED",
      runId: mockRun.runId,
      event: mockTrace[0]!,
    });

    expect(duplicate.trace.map((event) => event.sequence)).toEqual([1, 2]);
  });

  it("현재 run과 다른 늦은 이벤트를 무시한다", () => {
    const state = {
      ...initialPlaygroundState,
      phase: "RUNNING" as const,
      run: { ...mockRun, status: "RUNNING" as const, trace: [], result: null },
    };
    const result = playgroundReducer(state, {
      type: "TRACE_RECEIVED",
      runId: "stale-run",
      event: mockTrace[0]!,
    });
    expect(result).toBe(state);
  });
});
