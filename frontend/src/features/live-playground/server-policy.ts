export function isLivePlaygroundEnabled(
  nodeEnvironment = process.env.NODE_ENV,
  e2eOptIn = process.env.PLACEPICK_E2E_MOCK_API,
): boolean {
  return nodeEnvironment !== "production" || e2eOptIn === "true";
}
