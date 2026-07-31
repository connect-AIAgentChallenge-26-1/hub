import type { Request, Response, NextFunction } from "express";
import { getSessionById, type StoredSession } from "../utils/session";

export const SESSION_COOKIE = "session_id";

declare global {
  namespace Express {
    interface Request {
      // Numeric GitHub user id — set by resolveSession whenever the request
      // carries a valid session_id cookie. Every per-user data path in the
      // app is derived from this, never from anything else on the request.
      userId?: number;
      authSession?: StoredSession;
    }
  }
}

// Always calls next() — resolves the session_id cookie into req.userId /
// req.authSession if valid, otherwise leaves both undefined. Mounted
// globally (including on /api/auth/*) so routes like GET /api/auth/session
// can see "is there a valid session" without being blocked by requireAuth.
export async function resolveSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  const session = await getSessionById(sessionId);
  if (session) {
    req.userId = session.github_user_id;
    req.authSession = session;
  }
  next();
}

// Blocks with 401 unless resolveSession already found a valid session for
// this request. Mounted in front of every route that touches per-user data
// (everything except /api/auth/github/login, /callback, /session, /logout).
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId || !req.authSession) {
    res.status(401).json({ error: "Not logged in." });
    return;
  }
  next();
}
