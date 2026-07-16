import type {
  DraftSnapshot,
  RunFailure,
  RunSnapshot,
  WorkflowTraceEvent,
} from "../api/types";

export type FlowPhase =
  | "INPUT"
  | "EXTRACTING"
  | "REVIEW"
  | "STARTING"
  | "RUNNING"
  | "COMPLETED"
  | "ERROR";

export interface PlaygroundState {
  phase: FlowPhase;
  requestText: string;
  draft: DraftSnapshot | null;
  run: RunSnapshot | null;
  trace: WorkflowTraceEvent[];
  failure: RunFailure | null;
  reconnecting: boolean;
}

export const initialPlaygroundState: PlaygroundState = {
  phase: "INPUT",
  requestText: "서울에서 2명이 1인당 2만원 이하로 조용한 카페를 찾습니다. 흡연 장소는 제외합니다.",
  draft: null,
  run: null,
  trace: [],
  failure: null,
  reconnecting: false,
};

export type PlaygroundAction =
  | { type: "INPUT_CHANGED"; value: string }
  | { type: "EXTRACTION_REQUESTED" }
  | { type: "DRAFT_READY"; draft: DraftSnapshot }
  | { type: "RUN_REQUESTED"; draft: DraftSnapshot }
  | { type: "RUN_ACCEPTED"; run: RunSnapshot }
  | { type: "SNAPSHOT_RECEIVED"; run: RunSnapshot }
  | { type: "TRACE_RECEIVED"; runId: string; event: WorkflowTraceEvent }
  | { type: "RUN_COMPLETED"; run: RunSnapshot }
  | { type: "FAILED"; failure: RunFailure }
  | { type: "CONNECTION_STATE"; reconnecting: boolean }
  | { type: "RESET" };

export function playgroundReducer(
  state: PlaygroundState,
  action: PlaygroundAction,
): PlaygroundState {
  switch (action.type) {
    case "INPUT_CHANGED":
      return state.phase === "INPUT" ? { ...state, requestText: action.value } : state;
    case "EXTRACTION_REQUESTED":
      return { ...state, phase: "EXTRACTING", failure: null };
    case "DRAFT_READY":
      return { ...state, phase: "REVIEW", draft: action.draft, failure: null };
    case "RUN_REQUESTED":
      return { ...state, phase: "STARTING", draft: action.draft, failure: null, trace: [] };
    case "RUN_ACCEPTED":
      return { ...state, phase: "RUNNING", run: action.run, trace: action.run.trace };
    case "SNAPSHOT_RECEIVED":
      if (state.run && state.run.runId !== action.run.runId) return state;
      return {
        ...state,
        phase: action.run.status === "COMPLETED" ? "COMPLETED" : "RUNNING",
        run: action.run,
        trace: mergeTrace(state.trace, action.run.trace),
        reconnecting: false,
      };
    case "TRACE_RECEIVED":
      if (state.run?.runId !== action.runId) return state;
      return { ...state, trace: mergeTrace(state.trace, [action.event]), reconnecting: false };
    case "RUN_COMPLETED":
      if (state.run && state.run.runId !== action.run.runId) return state;
      return {
        ...state,
        phase: "COMPLETED",
        run: action.run,
        trace: mergeTrace(state.trace, action.run.trace),
        reconnecting: false,
      };
    case "FAILED":
      return { ...state, phase: "ERROR", failure: action.failure, reconnecting: false };
    case "CONNECTION_STATE":
      return { ...state, reconnecting: action.reconnecting };
    case "RESET":
      return { ...initialPlaygroundState, requestText: state.requestText };
  }
}

function mergeTrace(
  current: WorkflowTraceEvent[],
  incoming: WorkflowTraceEvent[],
): WorkflowTraceEvent[] {
  const result = new Map(current.map((event) => [event.eventId, event]));
  incoming.forEach((event) => result.set(event.eventId, event));
  return [...result.values()].sort((left, right) => left.sequence - right.sequence);
}
