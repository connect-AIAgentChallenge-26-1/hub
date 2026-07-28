import { getSupabaseClient } from "../config/supabaseClient.js";

const AGENT_INSTANCE_COLUMNS = [
  "id",
  "browser_binding_id",
  "owner_user_id",
  "current_state",
  "state_version",
  "state_profile_version",
  "last_state_updated_at",
  "created_at",
  "updated_at",
  "disabled_at"
].join(",");

const AGENT_INTERACTION_COLUMNS = [
  "id",
  "agent_id",
  "client_request_id",
  "sequence_number",
  "user_message",
  "sensory_observations",
  "chosen_action",
  "response_text",
  "decision_trace",
  "state_before_version",
  "state_after_version",
  "created_at"
].join(",");

export class AgentInteractionRepositoryError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = "AgentInteractionRepositoryError";
    this.code = "AGENT_REPOSITORY_FAILED";
  }
}

export class AgentStateVersionConflictError extends Error {
  constructor(cause) {
    super("The agent state changed before the interaction could be saved.", {
      cause
    });
    this.name = "AgentStateVersionConflictError";
    this.code = "STATE_VERSION_CONFLICT";
  }
}

function toAgentInstance(record) {
  return {
    id: record.id,
    browserBindingId: record.browser_binding_id,
    ownerUserId: record.owner_user_id ?? null,
    currentState: record.current_state,
    stateVersion: record.state_version,
    stateProfileVersion: record.state_profile_version,
    lastStateUpdatedAt: record.last_state_updated_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    disabledAt: record.disabled_at ?? null
  };
}

function toAgentInteraction(record) {
  return {
    id: record.id,
    agentId: record.agent_id,
    requestId: record.client_request_id,
    sequenceNumber: record.sequence_number,
    userMessage: record.user_message,
    sensoryObservations: record.sensory_observations || [],
    response: {
      actionType: record.chosen_action,
      text: record.response_text
    },
    stateBeforeVersion: record.state_before_version,
    stateAfterVersion: record.state_after_version,
    createdAt: record.created_at,
    researchTrace: record.decision_trace
  };
}

function throwRepositoryError(message, error) {
  throw new AgentInteractionRepositoryError(message, error);
}

function isUniqueViolation(error) {
  return error?.code === "23505";
}

function isStateVersionConflict(error) {
  return (
    error?.code === "40001" ||
    error?.message === "STATE_VERSION_CONFLICT" ||
    String(error?.message || "").includes("STATE_VERSION_CONFLICT")
  );
}

export function createSupabaseAgentInteractionRepository({
  client
} = {}) {
  if (
    client !== undefined &&
    (!client ||
      typeof client.from !== "function" ||
      typeof client.rpc !== "function")
  ) {
    throw new TypeError(
      "client must provide Supabase from and rpc functions."
    );
  }

  function readClient() {
    return client || getSupabaseClient();
  }

  async function findAgentByBinding(browserBindingId) {
    const { data, error } = await readClient()
      .from("agent_instances")
      .select(AGENT_INSTANCE_COLUMNS)
      .eq("browser_binding_id", browserBindingId)
      .maybeSingle();

    if (error) {
      throwRepositoryError("Failed to find the agent instance.", error);
    }

    return data ? toAgentInstance(data) : null;
  }

  return {
    async getOrCreateAgentByBinding({
      browserBindingId,
      initialState,
      now,
      stateProfileVersion
    }) {
      const existing = await findAgentByBinding(browserBindingId);
      if (existing) return existing;

      const record = {
        browser_binding_id: browserBindingId,
        current_state: initialState,
        state_version: 0,
        state_profile_version: stateProfileVersion,
        last_state_updated_at: now,
        created_at: now,
        updated_at: now
      };
      const { data, error } = await readClient()
        .from("agent_instances")
        .insert(record)
        .select(AGENT_INSTANCE_COLUMNS)
        .single();

      if (error && isUniqueViolation(error)) {
        const concurrentlyCreated = await findAgentByBinding(browserBindingId);
        if (concurrentlyCreated) return concurrentlyCreated;
      }

      if (error) {
        throwRepositoryError("Failed to create the agent instance.", error);
      }

      return toAgentInstance(data);
    },

    async findInteractionByRequestId(agentId, clientRequestId) {
      const { data, error } = await readClient()
        .from("agent_interactions")
        .select(AGENT_INTERACTION_COLUMNS)
        .eq("agent_id", agentId)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();

      if (error) {
        throwRepositoryError(
          "Failed to find the agent interaction by request ID.",
          error
        );
      }

      return data ? toAgentInteraction(data) : null;
    },

    async getAgentContext(agentId) {
      const agentResult = await readClient()
        .from("agent_instances")
        .select(AGENT_INSTANCE_COLUMNS)
        .eq("id", agentId)
        .single();

      if (agentResult.error) {
        throwRepositoryError(
          "Failed to read the current agent state.",
          agentResult.error
        );
      }

      const interactionResult = await readClient()
        .from("agent_interactions")
        .select(AGENT_INTERACTION_COLUMNS)
        .eq("agent_id", agentId)
        .order("sequence_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (interactionResult.error) {
        throwRepositoryError(
          "Failed to read the previous agent interaction.",
          interactionResult.error
        );
      }

      const agent = toAgentInstance(agentResult.data);
      return {
        currentState: agent.currentState,
        stateVersion: agent.stateVersion,
        lastStateUpdatedAt: agent.lastStateUpdatedAt,
        previousInteraction: interactionResult.data
          ? toAgentInteraction(interactionResult.data)
          : null
      };
    },

    async commitInteraction(input) {
      const memory = input.experienceMemory || {};
      const decisionTrace = {
        stateBefore: input.stateBefore,
        decayedState: input.decayedState,
        stateAfter: input.nextState,
        stateDelta: input.stateDelta,
        changeCauses: input.changeCauses,
        factors: input.factors,
        actionCandidates: input.actionSelection.candidates,
        selectedAction: input.actionSelection.selectedAction,
        stateProfileVersion: input.stateProfileVersion
      };
      const { data, error } = await readClient().rpc(
        "commit_agent_interaction",
        {
          p_agent_id: input.agentId,
          p_expected_state_version: input.expectedStateVersion,
          p_client_request_id: input.clientRequestId,
          p_user_message: input.userMessage,
          p_sensory_observations: input.sensoryObservations,
          p_chosen_action: input.actionSelection.selectedAction.actionType,
          p_response_text: input.responseText,
          p_decision_trace: decisionTrace,
          p_next_state: input.nextState,
          p_state_delta: input.stateDelta,
          p_change_causes: input.changeCauses,
          p_state_profile_version: input.stateProfileVersion,
          p_created_at: input.createdAt,
          p_memory_attributes: memory.attributes ?? null,
          p_memory_base_importance: memory.baseImportance ?? null,
          p_memory_current_strength: memory.currentStrength ?? null,
          p_memory_state_influence: memory.stateInfluence ?? null,
          p_memory_expires_at: memory.expiresAt ?? null
        }
      );

      if (error && isStateVersionConflict(error)) {
        throw new AgentStateVersionConflictError(error);
      }

      if (error) {
        throwRepositoryError(
          "Failed to commit the agent interaction.",
          error
        );
      }

      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.interaction) {
        throwRepositoryError(
          "The commit RPC did not return an interaction.",
          new Error("Missing RPC interaction result.")
        );
      }

      return {
        interaction: toAgentInteraction(result.interaction),
        replayed: Boolean(result.replayed)
      };
    }
  };
}
