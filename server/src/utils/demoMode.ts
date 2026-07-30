// Central switch for DEMO_MODE — when on, the three Gemini call sites (chat,
// analysis report, code/refactor Agent) and the GitHub-writing calls
// (commit-batch, doc Approve) return canned data instead of going out over
// the network, so recording a demo never spends real API quota or creates
// real commits. Everything else (routing, storage, diff computation,
// progress calc) still runs for real.
//
// DEMO_MODE env var only sets the *starting* value — the repo-connect
// screen's toggle overrides it at runtime via setDemoMode() below, which is
// why this is a mutable module-level flag rather than reading process.env
// directly on every call. The override doesn't survive a server restart on
// purpose (falls back to the env var), same as any other in-memory dev state.
let demoModeOverride: boolean | null = null;

export function isDemoMode(): boolean {
  if (demoModeOverride !== null) return demoModeOverride;
  return process.env.DEMO_MODE === "true";
}

export function setDemoMode(enabled: boolean): void {
  demoModeOverride = enabled;
}

// A real Gemini/GitHub call takes noticeably longer than an in-memory mock
// return — without an artificial delay a demo recording looks suspiciously
// instant, so every mock response waits this long first.
export function demoDelay(): Promise<void> {
  const ms = 500 + Math.random() * 1000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
