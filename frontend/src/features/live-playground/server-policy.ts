export function isLivePlaygroundEnabled(
  nodeEnvironment = process.env.NODE_ENV,
): boolean {
  return nodeEnvironment !== "production";
}
