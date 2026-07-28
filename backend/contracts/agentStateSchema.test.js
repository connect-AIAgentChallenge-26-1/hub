import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AGENT_ACTION_TYPES
} from "../../shared/contracts/agentInteractionContract.js";

const MIGRATION_PATH = resolve(
  process.cwd(),
  "backend/migrations/20260728_add_agent_state_system.sql"
);

let migration;

beforeAll(async () => {
  migration = await readFile(MIGRATION_PATH, "utf8");
});

describe("agent state database migration", () => {
  it.each([
    "agent_instances",
    "agent_interactions",
    "agent_state_snapshots",
    "experience_memories"
  ])("creates the additive %s table", (tableName) => {
    expect(migration).toMatch(
      new RegExp(`create table public\\.${tableName}\\s*\\(`, "i")
    );
  });

  it("does not couple the new schema to the retired analysis model", () => {
    expect(migration).not.toMatch(/legacy_[a-z_]+_id/i);
  });

  it("enforces request idempotency and ordered state versions", () => {
    expect(migration).toContain(
      "unique (agent_id, client_request_id)"
    );
    expect(migration).toContain(
      "unique (agent_id, sequence_number)"
    );
    expect(migration).toContain(
      "state_after_version = state_before_version + 1"
    );
    expect(migration).toContain(
      "unique (agent_id, state_version)"
    );
  });

  it("keeps database action constraints aligned with the shared contract", () => {
    AGENT_ACTION_TYPES.forEach((actionType) => {
      expect(migration).toContain(`'${actionType}'`);
    });
  });

  it("limits internal state values without requiring a normalized sum", () => {
    expect(migration).toContain(
      "create or replace function public.is_valid_agent_state"
    );
    expect(migration).toContain(
      "then not ((value #>> '{}')::numeric between 0 and 1)"
    );
    expect(migration).not.toMatch(/sum\s*\([^)]*state/i);
  });

  it("uses a row lock and one RPC for the atomic write set", () => {
    expect(migration).toContain(
      "create or replace function public.commit_agent_interaction"
    );
    expect(migration).toMatch(
      /from public\.agent_instances[\s\S]*for update;/i
    );
    expect(migration).toContain(
      "insert into public.agent_interactions"
    );
    expect(migration).toContain(
      "update public.agent_instances"
    );
    expect(migration).toContain(
      "insert into public.agent_state_snapshots"
    );
    expect(migration).toContain(
      "insert into public.experience_memories"
    );
    expect(migration).toContain(
      "raise exception 'STATE_VERSION_CONFLICT'"
    );
  });

  it("keeps every new table behind the server-only boundary", () => {
    [
      "agent_instances",
      "agent_interactions",
      "agent_state_snapshots",
      "experience_memories"
    ].forEach((tableName) => {
      expect(migration).toContain(
        `alter table public.${tableName} enable row level security;`
      );
      expect(migration).toContain(
        `revoke all on table public.${tableName} from anon, authenticated;`
      );
    });

    expect(migration).toMatch(
      /grant execute on function public\.commit_agent_interaction[\s\S]*to service_role;/i
    );
  });
});
