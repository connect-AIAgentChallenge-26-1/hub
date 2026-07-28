import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../../server.js";
import {
  createAgentInteractionRequest
} from "../../../test/fixtures/agentInteractionFixtures.js";
import {
  createProcessAgentInteraction
} from "./services/processAgentInteraction.js";
import {
  createInMemoryAgentInteractionRepository
} from "./testing/createInMemoryAgentInteractionRepository.js";
import {
  AgentInteractionRepositoryError,
  AgentStateVersionConflictError
} from "../../repositories/agentInteractionRepository.js";

const servers = [];

async function startServer(options = {}) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    response,
    payload: await response.json()
  };
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

describe("agent interaction HTTP boundary", () => {
  it("does not mount the new route without an injected processor", async () => {
    const baseUrl = await startServer();
    const result = await postJson(
      `${baseUrl}/api/agent-interactions`,
      createAgentInteractionRequest()
    );

    expect(result.response.status).toBe(404);
    expect(result.payload.error.code).toBe("NOT_FOUND");
  });

  it("returns a public DTO without internal research state", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const processAgentInteraction = createProcessAgentInteraction({
      repository,
      now: () => new Date("2026-07-28T00:10:00.000Z")
    });
    const baseUrl = await startServer({ processAgentInteraction });
    const result = await postJson(
      `${baseUrl}/api/agent-interactions`,
      createAgentInteractionRequest()
    );

    expect(result.response.status).toBe(201);
    expect(result.payload).toMatchObject({
      success: true,
      data: {
        interaction: {
          sequenceNumber: 1,
          userMessage: "이전과 같은 작업을 계속해줘.",
          response: {
            actionType: expect.any(String),
            text: expect.any(String)
          }
        }
      },
      meta: { replayed: false }
    });
    expect(result.payload.data.interaction).not.toHaveProperty(
      "researchTrace"
    );
    expect(result.payload.data.interaction).not.toHaveProperty(
      "internalState"
    );
  });

  it("returns the stored interaction for a repeated request ID", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const processAgentInteraction = createProcessAgentInteraction({
      repository,
      now: () => new Date("2026-07-28T00:10:00.000Z")
    });
    const baseUrl = await startServer({ processAgentInteraction });
    const url = `${baseUrl}/api/agent-interactions`;
    const request = createAgentInteractionRequest();

    const first = await postJson(url, request);
    const replay = await postJson(url, request);

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(200);
    expect(replay.payload.meta.replayed).toBe(true);
    expect(replay.payload.data.interaction.id)
      .toBe(first.payload.data.interaction.id);
  });

  it("rejects client-controlled state fields at the HTTP boundary", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const processAgentInteraction = createProcessAgentInteraction({
      repository
    });
    const baseUrl = await startServer({ processAgentInteraction });
    const result = await postJson(
      `${baseUrl}/api/agent-interactions`,
      createAgentInteractionRequest({
        internalState: { predictionError: 1 }
      })
    );

    expect(result.response.status).toBe(400);
    expect(result.payload).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        details: [
          expect.objectContaining({ field: "internalState" })
        ]
      }
    });
  });

  it("returns 409 when state conflicts remain after processing retries", async () => {
    const baseUrl = await startServer({
      processAgentInteraction: async () => {
        throw new AgentStateVersionConflictError({
          code: "40001",
          message: "STATE_VERSION_CONFLICT"
        });
      }
    });
    const result = await postJson(
      `${baseUrl}/api/agent-interactions`,
      createAgentInteractionRequest()
    );

    expect(result.response.status).toBe(409);
    expect(result.payload.error.code).toBe("STATE_VERSION_CONFLICT");
  });

  it("returns 502 without leaking repository error details", async () => {
    const baseUrl = await startServer({
      processAgentInteraction: async () => {
        throw new AgentInteractionRepositoryError(
          "Internal Supabase detail.",
          { message: "secret database detail" }
        );
      }
    });
    const result = await postJson(
      `${baseUrl}/api/agent-interactions`,
      createAgentInteractionRequest()
    );

    expect(result.response.status).toBe(502);
    expect(result.payload).toEqual({
      success: false,
      error: {
        code: "AGENT_REPOSITORY_FAILED",
        message: "The agent data operation failed."
      }
    });
  });
});
