import { describe, expect, it, vi } from "vitest";
import {
  AgentInteractionRepositoryError,
  AgentStateVersionConflictError,
  createSupabaseAgentInteractionRepository
} from "./agentInteractionRepository.js";

const AGENT_ID = "8f6d76fb-a59d-4784-a747-0446ae9c2e69";
const BINDING_ID = "44c96b3d-c657-4a41-876b-a26b53178f59";
const REQUEST_ID = "5d8afe40-bdb7-4d9d-9118-c7b43174cd0e";
const NOW = "2026-07-28T00:10:00.000Z";

function createAgentRecord(overrides = {}) {
  return {
    id: AGENT_ID,
    browser_binding_id: BINDING_ID,
    owner_user_id: null,
    current_state: { predictionError: 0.2 },
    state_version: 0,
    state_profile_version: "v0",
    last_state_updated_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    disabled_at: null,
    ...overrides
  };
}

function createInteractionRecord(overrides = {}) {
  return {
    id: "34ae25d6-e2f0-42e8-8190-50e85360a7d8",
    agent_id: AGENT_ID,
    client_request_id: REQUEST_ID,
    sequence_number: 1,
    user_message: "계속 진행해줘.",
    sensory_observations: [],
    chosen_action: "continue_task",
    response_text: "요청한 작업을 이어서 처리할게.",
    decision_trace: { selectedAction: { actionType: "continue_task" } },
    state_before_version: 0,
    state_after_version: 1,
    created_at: NOW,
    ...overrides
  };
}

function createBuilder({ maybeSingle, single } = {}) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(
      maybeSingle ?? { data: null, error: null }
    ),
    single: vi.fn().mockResolvedValue(
      single ?? { data: null, error: null }
    )
  };
  return builder;
}

describe("createSupabaseAgentInteractionRepository", () => {
  it("returns an existing agent without inserting a duplicate", async () => {
    const findBuilder = createBuilder({
      maybeSingle: { data: createAgentRecord(), error: null }
    });
    const client = {
      from: vi.fn(() => findBuilder),
      rpc: vi.fn()
    };
    const repository = createSupabaseAgentInteractionRepository({ client });

    await expect(
      repository.getOrCreateAgentByBinding({
        browserBindingId: BINDING_ID,
        initialState: { predictionError: 0.2 },
        now: NOW,
        stateProfileVersion: "v0"
      })
    ).resolves.toMatchObject({
      id: AGENT_ID,
      browserBindingId: BINDING_ID,
      stateVersion: 0
    });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(findBuilder.insert).not.toHaveBeenCalled();
  });

  it("creates an agent when the browser binding is new", async () => {
    const findBuilder = createBuilder();
    const insertBuilder = createBuilder({
      single: { data: createAgentRecord(), error: null }
    });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(findBuilder)
        .mockReturnValueOnce(insertBuilder),
      rpc: vi.fn()
    };
    const repository = createSupabaseAgentInteractionRepository({ client });

    await repository.getOrCreateAgentByBinding({
      browserBindingId: BINDING_ID,
      initialState: { predictionError: 0.2 },
      now: NOW,
      stateProfileVersion: "v0"
    });

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      browser_binding_id: BINDING_ID,
      current_state: { predictionError: 0.2 },
      state_version: 0,
      state_profile_version: "v0",
      last_state_updated_at: NOW,
      created_at: NOW,
      updated_at: NOW
    });
  });

  it("returns the current state and previous interaction as a context", async () => {
    const agentBuilder = createBuilder({
      single: {
        data: createAgentRecord({ state_version: 3 }),
        error: null
      }
    });
    const interactionBuilder = createBuilder({
      maybeSingle: {
        data: createInteractionRecord({ sequence_number: 3 }),
        error: null
      }
    });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(agentBuilder)
        .mockReturnValueOnce(interactionBuilder),
      rpc: vi.fn()
    };
    const repository = createSupabaseAgentInteractionRepository({ client });

    await expect(repository.getAgentContext(AGENT_ID)).resolves.toMatchObject({
      currentState: { predictionError: 0.2 },
      stateVersion: 3,
      previousInteraction: {
        sequenceNumber: 3,
        userMessage: "계속 진행해줘."
      }
    });
  });

  it("commits an interaction through the atomic RPC", async () => {
    const interaction = createInteractionRecord();
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: [{ interaction, replayed: false }],
        error: null
      })
    };
    const repository = createSupabaseAgentInteractionRepository({ client });

    const result = await repository.commitInteraction({
      agentId: AGENT_ID,
      expectedStateVersion: 0,
      clientRequestId: REQUEST_ID,
      userMessage: "계속 진행해줘.",
      sensoryObservations: [],
      stateProfileVersion: "v0",
      stateBefore: { predictionError: 0.2 },
      decayedState: { predictionError: 0.2 },
      nextState: { predictionError: 0.3 },
      stateDelta: { predictionError: 0.1 },
      changeCauses: [],
      factors: {},
      actionSelection: {
        selectedAction: {
          actionType: "continue_task",
          score: 0.5,
          contributions: []
        },
        candidates: []
      },
      responseText: "요청한 작업을 이어서 처리할게.",
      createdAt: NOW
    });

    expect(result).toMatchObject({
      replayed: false,
      interaction: {
        id: interaction.id,
        requestId: REQUEST_ID,
        response: { actionType: "continue_task" }
      }
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "commit_agent_interaction",
      expect.objectContaining({
        p_agent_id: AGENT_ID,
        p_expected_state_version: 0,
        p_client_request_id: REQUEST_ID,
        p_memory_attributes: null
      })
    );
  });

  it("maps an RPC serialization failure to a state conflict", async () => {
    const client = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "40001",
          message: "STATE_VERSION_CONFLICT"
        }
      })
    };
    const repository = createSupabaseAgentInteractionRepository({ client });

    await expect(
      repository.commitInteraction({
        actionSelection: {
          selectedAction: { actionType: "continue_task" },
          candidates: []
        }
      })
    ).rejects.toBeInstanceOf(AgentStateVersionConflictError);
  });

  it("wraps non-conflict Supabase errors at the repository boundary", async () => {
    const builder = createBuilder({
      maybeSingle: {
        data: null,
        error: { code: "PGRST000", message: "unavailable" }
      }
    });
    const client = {
      from: vi.fn(() => builder),
      rpc: vi.fn()
    };
    const repository = createSupabaseAgentInteractionRepository({ client });

    await expect(
      repository.findInteractionByRequestId(AGENT_ID, REQUEST_ID)
    ).rejects.toBeInstanceOf(AgentInteractionRepositoryError);
  });
});
