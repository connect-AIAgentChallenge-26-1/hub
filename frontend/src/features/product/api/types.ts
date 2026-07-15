export const PRODUCT_PLACE_TYPES = ["RESTAURANT", "CAFE", "BAR", "OTHER"] as const;
export type ProductPlaceType = (typeof PRODUCT_PLACE_TYPES)[number];

export interface ProductPreference {
  value: string;
  priority: number | null;
}

export interface ProductCondition {
  locationQuery: string;
  placeType: ProductPlaceType;
  placeTypeDetail: string | null;
  partySize: number | null;
  budgetPerPersonMin: number | null;
  budgetPerPersonMax: number | null;
  preferences: ProductPreference[];
  exclusions: string[];
}

export interface AnonymousSession {
  csrfToken: string;
  expiresAt: string;
}

export interface ProductDraft {
  draftId: string;
  status: "EXTRACTED" | "CONFIRMED" | "CONSUMED";
  extractedCondition: ProductCondition;
  warnings: string[];
  expiresAt: string;
}

export type JobStatus = "ACCEPTED" | "PROCESSING" | "COMPLETED" | "FAILED";
export type JobStage =
  | "QUEUED"
  | "LOCAL_SEARCH"
  | "BLOG_SEARCH"
  | "SCORING"
  | "REASON_GENERATION"
  | "PERSISTING"
  | "FINISHED";

export interface ProductScoreBreakdown {
  location: number;
  placeType: number;
  budget: number;
  preference: number;
  blogEvidence: number;
}

export interface ProductReasonStatement {
  text: string;
  evidenceIds: string[];
}

export interface ProductPlace {
  placeId: string;
  name: string;
  category: string;
  roadAddress: string;
  address: string;
  sourceUrl: string;
  score: number;
  scoreBreakdown: ProductScoreBreakdown;
  reasonStatements: ProductReasonStatement[];
  cautions: string[];
  shareText: string;
  evidenceLevel: "LOCAL_AND_BLOG" | "LOCAL_ONLY";
  warnings: string[];
}

export interface ProductJob {
  jobId: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  degraded: boolean;
  warnings: string[];
  condition: ProductCondition;
  places: ProductPlace[];
  failure: { errorCode: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface JobAccepted {
  jobId: string;
  status: "ACCEPTED";
  location: string;
}

export type VoteValue = "LIKE" | "DISLIKE";

export interface VoteAggregate {
  placeId: string;
  likeCount: number;
  dislikeCount: number;
}

export interface ProductRoom {
  roomId: string;
  shareToken: string;
  status: "OPEN" | "FINALIZED";
  places: ProductPlace[];
  aggregate: VoteAggregate[];
  myVotes: Record<string, VoteValue>;
  canFinalize: boolean;
  finalizedPlaceId: string | null;
  expiresAt: string;
}

export interface RoomCreated {
  shareToken: string;
  shareUrl: string;
  expiresAt: string;
}

export interface VoteMutationResult {
  placeId: string;
  myVote: VoteValue;
  aggregate: VoteAggregate[];
  updatedAt: string;
}

export interface FinalResult {
  place: ProductPlace;
  finalizedAt: string;
}

export interface ProductProblem {
  type?: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errorCode?: string;
  traceId?: string;
  fieldErrors?: Array<{ field: string; code: string; message: string }>;
}

export interface StreamMeta {
  eventId: string;
  occurredAt: string;
  aggregateId: string;
}

export interface JobStreamHandlers {
  onSnapshot(job: ProductJob, meta: StreamMeta): void;
  onProgress(job: ProductJob, meta: StreamMeta): void;
  onCompleted(job: ProductJob, meta: StreamMeta): void;
  onFailed(job: ProductJob, meta: StreamMeta): void;
  onHeartbeat(meta: StreamMeta): void;
  onConnectionError(): void;
}

export interface RoomStreamHandlers {
  onSnapshot(room: ProductRoom, meta: StreamMeta): void;
  onChanged(room: ProductRoom, meta: StreamMeta): void;
  onFinalized(room: ProductRoom, meta: StreamMeta): void;
  onHeartbeat(meta: StreamMeta): void;
  onConnectionError(): void;
}
