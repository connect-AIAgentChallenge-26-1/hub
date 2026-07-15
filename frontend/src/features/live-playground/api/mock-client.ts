import { mockCondition, mockDraft, mockResult, mockTrace } from "../fixtures/mock-data";
import type {
  CreateDraftRequest,
  DraftSnapshot,
  PlaygroundApi,
  RunAccepted,
  RunSnapshot,
  RunStreamListener,
  UpdateDraftRequest,
} from "./types";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export class MockPlaygroundApi implements PlaygroundApi {
  private drafts = new Map<string, DraftSnapshot>();
  private runs = new Map<string, RunSnapshot>();
  private sequence = 0;

  async createDraft(request: CreateDraftRequest): Promise<DraftSnapshot> {
    await delay(450);
    const draftId = `draft-mock-${++this.sequence}`;
    const placeType = request.requestText.includes("음식점") ? "RESTAURANT" : "CAFE";
    const condition = {
      ...mockCondition,
      placeType,
      partySize: request.requestText.includes("2명") ? 2 : null,
      budgetPerPersonMax: request.requestText.includes("20000") || request.requestText.includes("2만")
        ? 20_000
        : null,
      preferences: request.requestText.includes("디저트")
        ? [{ value: "디저트", priority: null }]
        : request.requestText.includes("조용")
          ? [{ value: "조용한", priority: null }]
          : [],
      exclusions: request.requestText.includes("흡연") ? ["흡연"] : [],
    } satisfies DraftSnapshot["condition"];
    const warnings = [
      ...(condition.partySize == null ? ["PARTY_SIZE_NOT_PROVIDED"] : []),
      ...(condition.budgetPerPersonMax == null ? ["BUDGET_NOT_PROVIDED"] : []),
    ];
    const draft = {
      ...mockDraft,
      draftId,
      condition,
      warnings,
    };
    this.drafts.set(draftId, draft);
    return structuredClone(draft);
  }

  async updateDraft(draftId: string, request: UpdateDraftRequest): Promise<DraftSnapshot> {
    await delay(220);
    const current = this.drafts.get(draftId);
    if (!current) throw new Error("Mock Draft를 찾을 수 없습니다.");
    const updated = {
      ...current,
      status: "CONFIRMED" as const,
      condition: structuredClone(request.condition),
    };
    this.drafts.set(draftId, updated);
    return structuredClone(updated);
  }

  async startRun(draftId: string): Promise<RunAccepted> {
    await delay(180);
    if (!this.drafts.has(draftId)) throw new Error("확정할 Mock Draft가 없습니다.");
    const runId = `run-mock-${++this.sequence}`;
    const snapshot: RunSnapshot = {
      runId,
      draftId,
      status: "QUEUED",
      stage: "USER_CONDITION_CONFIRMED",
      trace: structuredClone(mockTrace.slice(0, 3)),
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1_000).toISOString(),
    };
    this.runs.set(runId, snapshot);
    return {
      runId,
      status: "QUEUED",
      location: `/__dev/api/runs/${runId}`,
      eventsUrl: `/__dev/api/runs/${runId}/events`,
      snapshot: structuredClone(snapshot),
    };
  }

  async getRun(runId: string): Promise<RunSnapshot> {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Mock Run을 찾을 수 없습니다.");
    return structuredClone(run);
  }

  async cancelRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (run) this.runs.set(runId, { ...run, status: "CANCELLED" });
  }

  subscribeToRun(
    runId: string,
    _eventsUrl: string,
    listener: RunStreamListener,
  ): () => void {
    let stopped = false;
    const timers: number[] = [];
    const run = this.runs.get(runId);
    if (!run) throw new Error("Mock Run을 찾을 수 없습니다.");

    listener.onSnapshot(structuredClone({ ...run, status: "RUNNING" }));
    mockTrace.forEach((event, index) => {
      timers.push(window.setTimeout(() => {
        if (stopped) return;
        const current = this.runs.get(runId);
        if (!current || current.status === "CANCELLED") return;
        const trace = current.trace.some((value) => value.eventId === event.eventId)
          ? current.trace
          : [...current.trace, event];
        const completed = index === mockTrace.length - 1;
        const next: RunSnapshot = {
          ...current,
          status: completed ? "COMPLETED" : "RUNNING",
          stage: event.stage,
          trace,
          result: completed ? structuredClone(mockResult) : null,
          updatedAt: new Date().toISOString(),
        };
        this.runs.set(runId, next);
        listener.onTrace(structuredClone(event));
        if (completed) listener.onCompleted(structuredClone(next));
      }, 160 * (index + 1)));
    });
    return () => {
      stopped = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }
}
