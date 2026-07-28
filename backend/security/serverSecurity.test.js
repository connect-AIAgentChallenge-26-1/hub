import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../server.js";

const servers = [];

async function startServer(options) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("Express security baseline", () => {
  it("exposes a dependency-free health check", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("adds security headers without exposing Express", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/missing`);

    expect(response.headers.get("x-powered-by")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toBeTruthy();
  });

  it("returns 429 when an API client exceeds the configured limit", async () => {
    const baseUrl = await startServer({
      rateLimitOptions: { windowMs: 60_000, limit: 2 }
    });
    const url = `${baseUrl}/api/agent-interactions`;

    expect((await fetch(url)).status).toBe(404);
    expect((await fetch(url)).status).toBe(404);

    const blockedResponse = await fetch(url);
    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "RATE_LIMIT_EXCEEDED" }
    });
  });

  it("returns a stable error for invalid JSON", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/agent-interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{"
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_JSON" }
    });
  });

  it("returns 413 when the JSON body exceeds the configured limit", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/agent-interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "a".repeat(101 * 1024) })
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" }
    });
  });
});
