import { describe, expect, it } from "vitest";
import {
  createServerConfig,
  SERVER_DEFAULTS
} from "./serverConfig.js";

describe("createServerConfig", () => {
  it("uses safe development defaults", () => {
    expect(createServerConfig({})).toEqual(SERVER_DEFAULTS);
  });

  it("reads valid server overrides and removes duplicate origins", () => {
    expect(
      createServerConfig({
        PORT: "4100",
        CLIENT_URL: "https://example.com, http://localhost:5173",
        API_RATE_LIMIT_WINDOW_MS: "60000",
        API_RATE_LIMIT_MAX: "25",
        JSON_BODY_LIMIT: "200kb",
        AGENT_INTERACTIONS_ENABLED: "true"
      })
    ).toMatchObject({
      port: 4100,
      allowedOrigins: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://example.com"
      ],
      rateLimitWindowMs: 60_000,
      rateLimitMaximum: 25,
      jsonBodyLimit: "200kb",
      agentInteractionsEnabled: true
    });
  });

  it("falls back when numeric or body limit overrides are invalid", () => {
    expect(
      createServerConfig({
        SERVER_PORT: "-1",
        CLIENT_URL: "not-a-url,ftp://example.com",
        API_RATE_LIMIT_WINDOW_MS: "not-a-number",
        API_RATE_LIMIT_MAX: "0",
        JSON_BODY_LIMIT: "unlimited",
        AGENT_INTERACTIONS_ENABLED: "yes"
      })
    ).toEqual(SERVER_DEFAULTS);
  });
});
