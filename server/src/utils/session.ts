import crypto from "crypto";
import { promises as fs } from "fs";
import { readJson, writeJson } from "./jsonStore";
import { sessionsPath } from "./paths";

export interface StoredSession {
  // Numeric GitHub user id (not `login` — a username can change, the id can't).
  github_user_id: number;
  github_login: string;
  github_avatar_url: string;
  access_token: string;
  created_at: string;
  expires_at: string | null;
}

function sessionFile(sessionId: string): string {
  return sessionsPath(`${sessionId}.json`);
}

export async function getSessionById(sessionId: string | undefined | null): Promise<StoredSession | null> {
  if (!sessionId) return null;
  try {
    return await readJson<StoredSession>(sessionFile(sessionId));
  } catch {
    return null;
  }
}

// access_token is stored as plaintext JSON with the file restricted to the
// owner (chmod 600, same as the previous single-session.json) rather than
// encrypted — this is a local, single-machine dev tool with no separate
// secrets-management story, so an extra encryption layer would need its own
// key management without reducing real risk here.
export async function createSession(
  data: Omit<StoredSession, "created_at">
): Promise<{ sessionId: string; session: StoredSession }> {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const session: StoredSession = { ...data, created_at: new Date().toISOString() };
  const file = sessionFile(sessionId);
  await writeJson(file, session);
  await fs.chmod(file, 0o600).catch(() => {});
  return { sessionId, session };
}

export async function deleteSession(sessionId: string | undefined | null): Promise<void> {
  if (!sessionId) return;
  await fs.rm(sessionFile(sessionId), { force: true });
}
