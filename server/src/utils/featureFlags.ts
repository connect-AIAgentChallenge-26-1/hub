// The original "new project from scratch" 9-step workflow (Agent workspace
// screen + sidebar step list) is feature-flagged off by default in favor of
// the Feature Expansion Workflow's entry point — none of its code, routes,
// or data model are touched by this, only whether the client UI shows it.
export function isNewProjectWorkflowEnabled(): boolean {
  return process.env.ENABLE_NEW_PROJECT_WORKFLOW === "true";
}
