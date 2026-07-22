export const PLACE_TYPES = ["RESTAURANT", "CAFE", "BAR", "OTHER"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const SAFE_DIAGNOSTIC_CODES = [
  "NONE",
  "UNKNOWN",
  "UNPROCESSABLE_LOCATION_AND_TYPE_MISSING",
  "UNPROCESSABLE_LOCATION_MISSING",
  "UNPROCESSABLE_PLACE_TYPE_MISSING",
  "UNPROCESSABLE_DOMAIN_CONSTRAINT",
  "CONDITION_OTHER_DETAIL_MISSING",
  "CONDITION_BUDGET_ORDER_INVALID",
  "CONDITION_DOMAIN_CONSTRAINT_INVALID",
  "UPSTREAM_INVALID_RESPONSE",
  "UPSTREAM_RESPONSE_TOO_LARGE",
  "UPSTREAM_AUTHENTICATION_FAILED",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_INVALID_REQUEST",
  "UPSTREAM_UNAVAILABLE",
  "REASON_REQUEST_SERIALIZATION",
  "REASON_TRANSPORT",
  "REASON_HTTP_CONTENT_TYPE",
  "REASON_HTTP_RESPONSE_TOO_LARGE",
  "REASON_ENVELOPE_JSON",
  "REASON_ENVELOPE_METADATA",
  "REASON_ENVELOPE_CHOICES",
  "REASON_ENVELOPE_MESSAGE",
  "REASON_ENVELOPE_CONTENT",
  "REASON_ENVELOPE_USAGE",
  "REASON_CONTENT_ROOT_SCHEMA",
  "REASON_CONTENT_PLACES_SCHEMA",
  "REASON_CONTENT_SCHEMA",
  "REASON_CONTENT_PLACE_REFERENCE",
  "REASON_CONTENT_EVIDENCE_OWNERSHIP",
  "REASON_CONTENT_PLACE_SET",
  "REASON_CONTENT_PLACE_SCHEMA",
  "REASON_CONTENT_STATEMENTS_SCHEMA",
  "REASON_CONTENT_STATEMENT_SCHEMA",
  "REASON_CONTENT_EVIDENCE_SCHEMA",
  "REASON_CONTENT_STATEMENT_CONSTRAINT",
  "REASON_CONTENT_UNKNOWN_EVIDENCE",
  "REASON_CONTENT_TEMPLATE_EVIDENCE_TYPE_MISMATCH",
  "REASON_CONTENT_FORBIDDEN_CLAIM",
  "REASON_CONTENT_NO_LEXICAL_GROUNDING",
  "SCHEMA_OR_SIZE",
  "PLACE_REFERENCE",
  "DUPLICATE_PLACE",
  "DUPLICATE_STATEMENT",
  "INCOMPLETE_PLACE_SET",
  "UNKNOWN_EVIDENCE",
  "TEMPLATE_EVIDENCE_TYPE_MISMATCH",
  "FORBIDDEN_CLAIM",
  "NO_LEXICAL_GROUNDING",
] as const;
export type SafeDiagnosticCode = (typeof SAFE_DIAGNOSTIC_CODES)[number];

export const LLM_FAILURE_STAGES = [
  "NONE",
  "UNSPECIFIED",
  "HTTP_STATUS",
  "TRANSPORT",
  "CLIENT",
  "MEDIA_TYPE",
  "RESPONSE_SIZE",
  "JSON",
  "CHAT_METADATA",
  "CHAT_MODEL",
  "CHAT_CHOICES",
  "CHAT_MESSAGE",
  "CHAT_REFUSAL",
  "CHAT_INCOMPLETE",
  "CHAT_CONTENT",
  "CHAT_CONTENT_SCHEMA",
  "CHAT_CONTENT_CONDITION",
  "CHAT_CONTENT_WARNINGS",
  "CHAT_USAGE",
  "UNEXPECTED",
] as const;
export type LlmFailureStage = (typeof LLM_FAILURE_STAGES)[number];

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

export interface DraftRecommendationCondition {
  locationQuery: string | null;
  placeType: PlaceType | null;
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
  condition: DraftRecommendationCondition;
  warnings: string[];
  manualEntryRequired: boolean;
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
  | "ELICE_REASON_VALIDATION_FAILED"
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
  locationConfidence: number;
  searchRelevance: number;
  preferenceEvidence: number;
  evidenceQuality: number;
  total: number;
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
  sourceUrl: string | null;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasonSource: "GENERATED" | "TEMPLATE";
  reasonStatements: ReasonStatement[];
  cautions: string[];
  evidenceLevel: "LOCAL_AND_BLOG" | "LOCAL_ONLY";
  evidence: RecommendationEvidence[];
}

export interface RecommendationResult {
  places: RecommendationPlace[];
  degraded: boolean;
  partial: boolean;
  resultCount: number;
  explorationRound: number;
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
  diagnosticCode?: SafeDiagnosticCode;
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
  diagnosticCode?: SafeDiagnosticCode;
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
