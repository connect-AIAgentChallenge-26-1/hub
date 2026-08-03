import path from "path";

export const DATA_DIR = path.resolve(__dirname, "../../../data");
export const ANALYZER_DIR = path.resolve(__dirname, "../../../tools/analyzer");

// v7: the ONLY place that assembles a per-user data path — every util/route
// must go through this (never dataPath directly) so no per-user file can
// accidentally resolve to the old flat data/ root and leak across users.
export function getUserDataPath(userId: number, ...segments: string[]): string {
  return path.join(DATA_DIR, "users", String(userId), ...segments);
}

export function sessionsPath(...segments: string[]): string {
  return path.join(DATA_DIR, "sessions", ...segments);
}
