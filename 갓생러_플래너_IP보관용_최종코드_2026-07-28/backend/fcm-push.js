'use strict';

const crypto = require('node:crypto');

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
}

function createFcmSender(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const projectId = String(options.projectId || '').trim();
  const clientEmail = String(options.clientEmail || '').trim();
  const privateKey = String(options.privateKey || '').replace(/\\n/g, '\n').trim();
  const configured = Boolean(projectId && clientEmail && privateKey);
  let cachedAccessToken = null;
  let cachedUntil = 0;

  async function getAccessToken() {
    if (!configured) return null;
    if (cachedAccessToken && Date.now() < cachedUntil - 60_000) return cachedAccessToken;
    const now = Math.floor(Date.now() / 1000);
    const header = base64url({ alg: 'RS256', typ: 'JWT' });
    const claims = base64url({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    });
    const unsigned = `${header}.${claims}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url');
    const assertion = `${unsigned}.${signature}`;
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    });
    if (!response.ok) return null;
    const data = await response.json();
    cachedAccessToken = data.access_token;
    cachedUntil = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    return cachedAccessToken;
  }

  async function send(token, notification, data = {}) {
    const accessToken = await getAccessToken();
    if (!accessToken) return { configured, ok: false, error: configured ? 'FCM access token 발급 실패' : 'FCM 미설정' };
    try {
      const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token, notification, data } })
      });
      const result = await response.json().catch(() => ({}));
      return { configured: true, ok: response.ok, result };
    } catch (error) {
      return { configured: true, ok: false, error: error.message };
    }
  }

  return { status: () => ({ configured, projectId: configured ? projectId : '' }), send };
}

module.exports = { createFcmSender };
