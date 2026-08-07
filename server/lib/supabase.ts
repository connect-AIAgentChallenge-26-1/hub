import type { CreateQuestLogRequest, GetQuestLogsQuery, QuestLogRecord } from "../contracts/questLogs.js";
import type { CreateQuestEventRequest, GetQuestEventsQuery, QuestEventRecord } from "../contracts/questEvents.js";
import { buildManagerContext } from "../contracts/questEvents.js";
import type { ManagerPlanStore, SaveManagerGoalPlanInput, SaveManagerPlanRevisionInput } from "./managerPlanStore.js";
import type { QuestEventStore } from "./questEventStore.js";

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export interface QuestLogStore {
  insertQuestLog(input: CreateQuestLogRequest): Promise<QuestLogRecord>;
  listQuestLogs(query: GetQuestLogsQuery): Promise<{ records: QuestLogRecord[]; nextCursor: string | null }>;
}

export const supabaseEnvNames = {
  url: "SUPABASE_URL",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

export function createSupabaseConfigFromEnv(getEnv: (name: string) => string | undefined): SupabaseConfig {
  const url = getEnv(supabaseEnvNames.url);
  const serviceRoleKey = getEnv(supabaseEnvNames.serviceRoleKey);

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return { url, serviceRoleKey };
}

export function createSupabaseQuestLogStore(config: SupabaseConfig): QuestLogStore {
  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/quest_logs`;
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };

  return {
    async insertQuestLog(input) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, prefer: "return=representation" },
        body: JSON.stringify(toInsertRow(input)),
      });

      if (!response.ok) throw new Error(`Supabase insert failed: ${response.status}`);

      const rows = (await response.json()) as QuestLogRecord[];
      const record = rows[0];
      if (!record) throw new Error("Supabase insert returned no rows.");
      return record;
    },
    async listQuestLogs(query) {
      const url = new URL(endpoint);
      url.searchParams.set("select", "*");
      url.searchParams.set("order", "created_at.desc");
      url.searchParams.set("limit", String(query.limit));
      if (query.result) url.searchParams.set("result", `eq.${query.result}`);
      if (query.cursor) url.searchParams.set("created_at", `lt.${query.cursor}`);

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Supabase select failed: ${response.status}`);

      const records = (await response.json()) as QuestLogRecord[];
      const nextCursor = records.length === query.limit ? records[records.length - 1]?.created_at ?? null : null;
      return { records, nextCursor };
    },
  };
}

export function createSupabaseQuestEventStore(config: SupabaseConfig): QuestEventStore {
  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/quest_logs`;
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };

  return {
    async insertQuestEvent(input) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, prefer: "return=representation" },
        body: JSON.stringify(toQuestEventInsertRow(input)),
      });

      if (!response.ok) throw new Error(`Supabase insert failed: ${response.status}`);

      const rows = (await response.json()) as QuestEventRecord[];
      const record = rows[0];
      if (!record) throw new Error("Supabase insert returned no rows.");
      return record;
    },
    async listQuestEvents(query: GetQuestEventsQuery) {
      const url = new URL(endpoint);
      url.searchParams.set("select", "*");
      url.searchParams.set("order", "created_at.desc");
      url.searchParams.set("limit", String(query.limit));
      if (query.type) url.searchParams.set("event_type", `eq.${query.type}`);
      if (query.result) url.searchParams.set("result", `eq.${query.result}`);
      if (query.cursor) url.searchParams.set("created_at", `lt.${query.cursor}`);

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Supabase select failed: ${response.status}`);

      const records = (await response.json()) as QuestEventRecord[];
      const nextCursor = records.length === query.limit ? records[records.length - 1]?.created_at ?? null : null;
      return { records, nextCursor };
    },
    async getManagerContext() {
      const url = new URL(endpoint);
      url.searchParams.set("select", "*");
      url.searchParams.set("order", "created_at.desc");
      url.searchParams.set("limit", "20");

      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`Supabase select failed: ${response.status}`);

      return buildManagerContext((await response.json()) as QuestEventRecord[]);
    },
  };
}

export function createSupabaseManagerPlanStore(config: SupabaseConfig): ManagerPlanStore {
  const baseUrl = config.url.replace(/\/$/, "");
  const headers = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };

  return {
    async saveGoalPlan(input) {
      const response = await fetch(`${baseUrl}/rest/v1/manager_goal_plans`, {
        method: "POST",
        headers: { ...headers, prefer: "return=representation" },
        body: JSON.stringify(toGoalPlanInsertRow(input)),
      });
      if (!response.ok) throw new Error(`Supabase manager goal plan insert failed: ${response.status}`);
      return readInsertedRow(response);
    },
    async savePlanRevision(input) {
      const response = await fetch(`${baseUrl}/rest/v1/rpc/append_manager_plan_revision_v3`, {
        method: "POST",
        headers: { ...headers, prefer: "return=representation" },
        body: JSON.stringify(toPlanRevisionRpcInput(input)),
      });
      if (!response.ok) throw new Error(`Supabase manager plan revision transaction failed: ${response.status}`);
      return readInsertedRow(response);
    },
  };
}

async function readInsertedRow(response: Response): Promise<{ id: string; createdAt: string }> {
  const rows = (await response.json()) as Array<{ id?: unknown; created_at?: unknown }>;
  const row = rows[0];
  if (typeof row?.id !== "string" || typeof row.created_at !== "string") throw new Error("Supabase insert returned no plan row.");
  return { id: row.id, createdAt: row.created_at };
}

function toGoalPlanInsertRow(input: SaveManagerGoalPlanInput) {
  return {
    goal: input.goalPlan.finalGoal.statement,
    raw_goal_text: input.rawGoalText,
    daily_minutes: input.dailyMinutes,
    target_date: input.targetDate,
    manager_tone: input.managerTone,
    nickname: input.nickname,
    clarification_answer: input.clarificationAnswer ?? null,
    status: "active",
    source: input.source,
    fallback_reason: input.fallbackReason ?? null,
    prompt_version: input.promptVersion,
    plan_version: 3,
    goal_brief_json: input.goalPlan.goalBrief,
    plan_json: input.goalPlan,
  };
}

function toPlanRevisionRpcInput(input: SaveManagerPlanRevisionInput) {
  return {
    p_plan_id: input.planId ?? null,
    p_trigger_event_id: input.triggerEventId ?? null,
    p_raw_goal_text: input.rawGoalText,
    p_source: input.source,
    p_fallback_reason: input.fallbackReason ?? null,
    p_prompt_version: input.promptVersion,
    p_revision_reason: input.rebalance.changes[0]?.reason ?? "anomaly",
    p_changes_json: input.rebalance.changes,
    p_after_plan_json: input.rebalance.rebalancedPlan,
    p_goal_brief_json: input.rebalance.rebalancedPlan.goalBrief,
    p_next_quest_json: input.rebalance.nextQuest,
  };
}

function toInsertRow(input: CreateQuestLogRequest) {
  return {
    title: input.quest.title,
    quest_type: input.quest.type,
    amount: input.quest.amount,
    unit: input.quest.unit,
    difficulty: input.quest.difficulty,
    deadline_at: input.quest.deadlineAt ?? null,
    result: input.result,
    exp_delta: input.expDelta,
    failure_reason: input.failureReason ?? null,
    previous_quest_title: input.previousQuestTitle ?? null,
    recovery_from_log_id: input.recoveryFromLogId ?? null,
    manager_mood_after: input.managerMoodAfter ?? null,
    client_created_at: input.clientCreatedAt ?? null,
    visibility: "private",
    event_version: 1,
    metadata: input.metadata ?? {},
  };
}

function toQuestEventInsertRow(input: CreateQuestEventRequest) {
  return {
    event_type: input.type,
    title: input.quest.title,
    quest_type: input.quest.type,
    amount: input.quest.amount,
    unit: input.quest.unit,
    difficulty: input.quest.difficulty,
    deadline_at: input.quest.deadlineAt ?? null,
    result: input.result ?? null,
    exp_delta: input.expDelta,
    failure_reason: input.failureReason ?? null,
    previous_quest_title: input.previousQuestTitle ?? null,
    recovery_from_event_id: input.recoveryFromEventId ?? null,
    manager_mood_after: input.managerMoodAfter ?? null,
    manager_line: input.managerLine ?? null,
    client_created_at: input.clientCreatedAt ?? null,
    visibility: "private",
    event_version: 1,
    metadata: input.metadata ?? {},
  };
}
