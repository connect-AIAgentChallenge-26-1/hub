export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export interface SessionState {
  loggedIn: boolean;
  github_login?: string;
  github_avatar_url?: string;
}

export interface RepoSummary {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
}

export interface Step {
  id: number;
  name: string;
  status: "pending" | "active" | "done";
  progress_pct: number;
  agent_name: string;
}

// Minimal shape StepSidebar/StepRow actually need — Step (9-step workflow)
// structurally satisfies this as-is, and the Feature Expansion Workflow's
// own steps (no agent_name) satisfy it too, so both sidebars can share the
// exact same components without a cast.
export interface SidebarStep {
  id: number;
  name: string;
  status: "pending" | "active" | "done";
  progress_pct: number;
}

export interface ChatMessage {
  id: string;
  from: "user" | "agent";
  text: string;
  created_at: string;
}

export interface DocumentRecord {
  path: string;
  content: string;
  version: number;
  updated_at: string;
  history: { content: string; version: number; updated_at: string }[];
}

export interface FileChange {
  path: string;
  changeType: "new" | "modified" | "deleted";
  newContent: string;
  // Unified diff computed server-side (oldContent vs newContent) — never
  // Agent-authored, see Day 12's fileChanges.ts.
  diff: string;
  suggestedCommitMessage: string;
  // v6: Syntax-only pre-commit check (no compilation/type-check) — always
  // true/empty for "deleted" files.
  syntaxValid: boolean;
  syntaxErrors: string[];
  approved: boolean;
}
