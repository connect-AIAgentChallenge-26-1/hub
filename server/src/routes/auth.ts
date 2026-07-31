import { Router } from "express";
import crypto from "crypto";
import { createSession, deleteSession } from "../utils/session";
import { ensureUserInitialized } from "../utils/userInit";
import { SESSION_COOKIE } from "../middleware/auth";

const router = Router();

const PORT = process.env.PORT ?? "4000";
const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? `http://localhost:${PORT}`;
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";
const CALLBACK_URL = `${SERVER_BASE_URL}/api/auth/github/callback`;
const OAUTH_STATE_COOKIE = "oauth_state";
// GitHub OAuth Apps normally issue non-expiring tokens (no expires_in) —
// the session cookie still needs some lifetime, so it defaults to 30 days
// and is only ever shortened when GitHub actually reports an expiry.
const DEFAULT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}

interface GithubUserResponse {
  id: number;
  login: string;
  avatar_url: string;
}

router.get("/github/login", (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) {
    return res.status(500).send("GITHUB_CLIENT_ID is not configured on the server.");
  }

  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    signed: true,
    maxAge: 5 * 60 * 1000,
    sameSite: "lax",
  });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope: "repo",
    state,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

function redirectWithError(res: import("express").Response, message: string) {
  res.redirect(`${CLIENT_URL}/repo?error=${encodeURIComponent(message)}`);
}

router.get("/github/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const expectedState = req.signedCookies?.[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE);

  // GitHub redirects here with ?error=access_denied (no code) when the user
  // cancels on the authorize screen instead of approving.
  if (oauthError) {
    return redirectWithError(res, "GitHub 로그인이 취소되었습니다.");
  }

  if (!code || typeof code !== "string" || !state || !expectedState || state !== expectedState) {
    return redirectWithError(res, "로그인 세션이 유효하지 않습니다. 다시 시도해주세요.");
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: CALLBACK_URL,
    }),
  });
  const tokenData = (await tokenRes.json()) as GithubTokenResponse;

  if (!tokenData.access_token) {
    return redirectWithError(res, "GitHub 인증에 실패했습니다. 다시 시도해주세요.");
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "GameForge-Agent",
    },
  });
  const userData = (await userRes.json()) as GithubUserResponse;

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;
  const maxAge = tokenData.expires_in ? tokenData.expires_in * 1000 : DEFAULT_SESSION_MAX_AGE_MS;

  const { sessionId } = await createSession({
    github_user_id: userData.id,
    github_login: userData.login,
    github_avatar_url: userData.avatar_url,
    access_token: tokenData.access_token,
    expires_at: expiresAt,
  });

  await ensureUserInitialized(userData.id);

  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    signed: true,
    maxAge,
    sameSite: "lax",
  });

  res.redirect(`${CLIENT_URL}/repo`);
});

// Mounted behind the global resolveSession middleware (not requireAuth), so
// a missing/invalid session lands here as req.userId === undefined rather
// than a 401 — this endpoint's whole purpose is answering "am I logged in?".
router.get("/session", async (req, res) => {
  if (!req.authSession) {
    return res.json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    github_login: req.authSession.github_login,
    github_avatar_url: req.authSession.github_avatar_url,
  });
});

router.post("/logout", async (req, res) => {
  const sessionId = req.signedCookies?.[SESSION_COOKIE];
  await deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE);
  res.json({ loggedIn: false });
});

export default router;
