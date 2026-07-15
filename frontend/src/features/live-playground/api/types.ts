export const PLACE_TYPES = ["RESTAURANT", "CAFE", "BAR", "OTHER"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export interface Preference {
  value: string;
  priority: number | null;
}

export interface RecommendationCondition {
  locationQuery: string;
  placeType: PlaceType;
  placeTypeDetail: string | null;
  partySize: number | null;
  budgetPerPersonMin: number | null;
  budgetPerPersonMax: number | null;
  preferences: Preference[];
  exclusions: string[];
}

export interface DraftSnapshot {
  draftId: string;
  status: "EXTRACTED" | "CONFIRMED";
  condition: RecommendationCondition;
  warnings: string[];
  createdAt: string;
  expiresAt: string;
}

export interface CreateDraftRequest {
  requestText: string;
}

export interface UpdateDraftRequest {
  condition: RecommendationCondition;
}

export type RunStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type TraceStage =
  | "USER_REQUEST_ACCEPTED"
  | "CONDITION_EXTRACTED"
  | "USER_CONDITION_CONFIRMED"
  | "RECOMMENDATION_WORKFLOW_STARTED"
  | "SEARCH_QUERY_PLANNED"
  | "NAVER_LOCAL_COMPLETED"
  | "CANDIDATES_NORMALIZED"
  | "PRELIMINARY_RANKING_COMPLETED"
  | "NAVER_BLOG_COMPLETED"
  | "NAVER_BLOG_FAILED"
  | "FINAL_RANKING_COMPLETED"
  | "ELICE_REASON_REQUESTED"
  | "ELICE_REASON_COMPLETED"
  | "RECOMMENDATION_WORKFLOW_COMPLETED"
  | "RECOMMENDATION_WORKFLOW_FAILED"
  | "RECOMMENDATION_WORKFLOW_CANCELLED";

export type TraceStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "SKIPPED"
  | "FAILED"
  | "CANCELLED";

export interface TraceCandidate {
  label: string;
  category: string;
  status: "KEPT" | "FILTERED" | "RANKED";
  explanation: string;
}

export interface WorkflowTraceEvent {
  eventId: string;
  sequence: number;
  stage: TraceStage;
  status: TraceStatus;
  title: string;
  description: string;
  occurredAt: string;
  metrics: Record<string, string | number | boolean>;
  candidates: TraceCandidate[];
}

export interface ScoreBreakdown {
  location: number;
  placeType: number;
  budget: number;
  preference: number;
  blogEvidence: number;
}

export interface ReasonStatement {
  text: string;
  evidenceIds: string[];
}

export interface RecommendationEvidence {
  evidenceId: string;
  type: "LOCAL" | "BLOG";
  title: string;
  summary: string;
  sourceUrl: string | null;
}

export interface RecommendationPlace {
  placeId: string;
  rank: number;
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  sourceUrl: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasonStatements: ReasonStatement[];
  cautions: string[];
  evidenceLevel: "LOCAL_AND_BLOG" | "LOCAL_ONLY";
  evidence: RecommendationEvidence[];
}

export interface RecommendationResult {
  places: RecommendationPlace[];
  degraded: boolean;
  reasonFallback: boolean;
  relaxed: boolean;
  warnings: string[];
  placeSearchCalls: number;
  blogSearchCalls: number;
  reasonGenerationCalls: number;
}

export interface RunAccepted {
  runId: string;
  status: RunStatus;
  location: string;
  eventsUrl: string;
  snapshot: RunSnapshot;
}

export interface RunFailure {
  errorCode: string;
  title: string;
  detail: string;
  traceId?: string;
}

export interface RunSnapshot {
  runId: string;
  draftId: string;
  status: RunStatus;
  stage: TraceStage;
  trace: WorkflowTraceEvent[];
  result: RecommendationResult | null;
  error: RunFailure | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail: string;
  errorCode?: string;
  traceId?: string;
  fieldErrors?: Array<{ field: string; code: string; message: string }>;
}

export interface RunStreamListener {
  onSnapshot(snapshot: RunSnapshot): void;
  onTrace(event: WorkflowTraceEvent): void;
  onCompleted(snapshot: RunSnapshot): void;
  onFailed(failure: RunFailure): void;
  onConnectionError(): void;
}

export interface PlaygroundApi {
  createDraft(request: CreateDraftRequest): Promise<DraftSnapshot>;
  updateDraft(draftId: string, request: UpdateDraftRequest): Promise<DraftSnapshot>;
  startRun(draftId: string): Promise<RunAccepted>;
  getRun(runId: string): Promise<RunSnapshot>;
  cancelRun(runId: string): Promise<void>;
  subscribeToRun(
    runId: string,
    eventsUrl: string,
    listener: RunStreamListener,
  ): () => void;
}
