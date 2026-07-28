import { describe, expect, it, vi } from "vitest";
import {
  createAgentInteractionApi
} from "./agentInteractionApi";

function createJsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload)
  };
}

function createInteractionResponse() {
  return {
    id: "interaction-1",
    sequenceNumber: 1,
    response: {
      actionType: "continue_task",
      text: "요청한 작업을 이어서 처리할게."
    }
  };
}

describe("createAgentInteractionApi", () => {
  it("posts an interaction to the injected API base URL", async () => {
    const interaction = createInteractionResponse();
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        success: true,
        data: { interaction },
        meta: { replayed: false }
      })
    );
    const api = createAgentInteractionApi({
      baseUrl: "http://127.0.0.1:4321/",
      fetchImpl
    });

    await expect(
      api.createInteraction({ message: { text: "계속 진행해줘." } })
    ).resolves.toEqual({ interaction, replayed: false });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4321/api/agent-interactions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("maps server failures to a stable API error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          success: false,
          error: {
            code: "AGENT_REPOSITORY_FAILED",
            message: "The agent data operation failed."
          }
        },
        { ok: false, status: 502 }
      )
    );
    const api = createAgentInteractionApi({
      baseUrl: "http://test.local",
      fetchImpl
    });

    await expect(
      api.createInteraction({ message: { text: "테스트" } })
    ).rejects.toMatchObject({
      name: "AgentInteractionApiError",
      status: 502,
      code: "AGENT_REPOSITORY_FAILED"
    });
  });

  it("rejects invalid JSON and incomplete success responses", async () => {
    const invalidJsonApi = createAgentInteractionApi({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("invalid JSON"))
      })
    });
    const incompleteApi = createAgentInteractionApi({
      fetchImpl: vi.fn().mockResolvedValue(
        createJsonResponse({ success: true, data: {} })
      )
    });

    await expect(
      invalidJsonApi.createInteraction({})
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    await expect(
      incompleteApi.createInteraction({})
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
  });
});
