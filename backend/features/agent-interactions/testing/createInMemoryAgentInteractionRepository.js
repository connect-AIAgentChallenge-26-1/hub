import { randomUUID } from "node:crypto";

function clone(value) {
  return value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

export class InMemoryStateVersionConflictError extends Error {
  constructor() {
    super("The agent state version changed before the interaction was saved.");
    this.name = "InMemoryStateVersionConflictError";
    this.code = "STATE_VERSION_CONFLICT";
  }
}

export function createInMemoryAgentInteractionRepository() {
  const agentsById = new Map();
  const agentIdsByBinding = new Map();

  function createAgent({
    browserBindingId,
    initialState,
    now,
    stateProfileVersion,
    stateVersion = 0,
    interactions = []
  }) {
    const agent = {
      id: randomUUID(),
      browserBindingId,
      currentState: clone(initialState),
      stateVersion,
      stateProfileVersion,
      lastStateUpdatedAt: now,
      interactions: clone(interactions)
    };
    agentsById.set(agent.id, agent);
    agentIdsByBinding.set(browserBindingId, agent.id);
    return agent;
  }

  return {
    async getOrCreateAgentByBinding({
      browserBindingId,
      initialState,
      now,
      stateProfileVersion
    }) {
      const existingId = agentIdsByBinding.get(browserBindingId);
      const agent =
        agentsById.get(existingId) ||
        createAgent({
          browserBindingId,
          initialState,
          now,
          stateProfileVersion
        });
      return clone(agent);
    },

    async findInteractionByRequestId(agentId, clientRequestId) {
      const agent = agentsById.get(agentId);
      return clone(
        agent?.interactions.find(
          (interaction) => interaction.requestId === clientRequestId
        ) || null
      );
    },

    async getAgentContext(agentId) {
      const agent = agentsById.get(agentId);
      if (!agent) throw new TypeError("Unknown in-memory agent.");

      return clone({
        currentState: agent.currentState,
        stateVersion: agent.stateVersion,
        lastStateUpdatedAt: agent.lastStateUpdatedAt,
        previousInteraction: agent.interactions.at(-1) || null
      });
    },

    async commitInteraction(input) {
      const agent = agentsById.get(input.agentId);
      if (!agent) throw new TypeError("Unknown in-memory agent.");

      const existing = agent.interactions.find(
        (interaction) => interaction.requestId === input.clientRequestId
      );
      if (existing) {
        return {
          interaction: clone(existing),
          replayed: true
        };
      }

      if (agent.stateVersion !== input.expectedStateVersion) {
        throw new InMemoryStateVersionConflictError();
      }

      const nextVersion = agent.stateVersion + 1;
      const interaction = {
        id: randomUUID(),
        agentId: agent.id,
        sequenceNumber: agent.interactions.length + 1,
        requestId: input.clientRequestId,
        userMessage: input.userMessage,
        sensoryObservations: clone(input.sensoryObservations),
        response: {
          actionType: input.actionSelection.selectedAction.actionType,
          text: input.responseText
        },
        stateBeforeVersion: agent.stateVersion,
        stateAfterVersion: nextVersion,
        createdAt: input.createdAt,
        researchTrace: {
          stateBefore: clone(input.stateBefore),
          decayedState: clone(input.decayedState),
          stateAfter: clone(input.nextState),
          stateDelta: clone(input.stateDelta),
          changeCauses: clone(input.changeCauses),
          factors: clone(input.factors),
          actionCandidates: clone(input.actionSelection.candidates),
          selectedAction: clone(input.actionSelection.selectedAction),
          stateProfileVersion: input.stateProfileVersion
        }
      };

      agent.currentState = clone(input.nextState);
      agent.stateVersion = nextVersion;
      agent.stateProfileVersion = input.stateProfileVersion;
      agent.lastStateUpdatedAt = input.createdAt;
      agent.interactions.push(interaction);

      return {
        interaction: clone(interaction),
        replayed: false
      };
    },

    seedAgent({
      browserBindingId,
      currentState,
      now = "2026-07-28T00:00:00.000Z",
      stateProfileVersion = "v0",
      stateVersion = 0,
      interactions = []
    }) {
      return clone(
        createAgent({
          browserBindingId,
          initialState: currentState,
          now,
          stateProfileVersion,
          stateVersion,
          interactions
        })
      );
    },

    inspectAgentByBinding(browserBindingId) {
      const id = agentIdsByBinding.get(browserBindingId);
      return clone(agentsById.get(id) || null);
    }
  };
}
