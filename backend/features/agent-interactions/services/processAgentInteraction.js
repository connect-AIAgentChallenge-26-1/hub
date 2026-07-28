import { createInitialInternalState } from "../../internal-state/createInitialInternalState.js";
import { decayInternalState } from "../../internal-state/decayInternalState.js";
import {
  DEFAULT_ACTION_SELECTION_PROFILE,
  DEFAULT_INTERNAL_STATE_PROFILE
} from "../../internal-state/internalStateProfile.js";
import { selectAgentAction } from "../../internal-state/selectAgentAction.js";
import { updateInternalState } from "../../internal-state/updateInternalState.js";
import { deriveInteractionFactors } from "./deriveInteractionFactors.js";
import { generateMockAgentResponse } from "./generateMockAgentResponse.js";

function requireRepositoryFunction(repository, name) {
  if (typeof repository?.[name] !== "function") {
    throw new TypeError(`repository.${name} must be a function.`);
  }
}

function readNow(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("now must return a valid date.");
  }

  return date;
}

function isStateVersionConflict(error) {
  return error?.code === "STATE_VERSION_CONFLICT";
}

export function createProcessAgentInteraction({
  repository,
  now = () => new Date(),
  stateProfile = DEFAULT_INTERNAL_STATE_PROFILE,
  actionProfile = DEFAULT_ACTION_SELECTION_PROFILE,
  factorInterpreter = deriveInteractionFactors,
  responseGenerator = generateMockAgentResponse,
  maximumStateConflictRetries = 1
} = {}) {
  [
    "getOrCreateAgentByBinding",
    "findInteractionByRequestId",
    "getAgentContext",
    "commitInteraction"
  ].forEach((name) => requireRepositoryFunction(repository, name));

  if (
    !Number.isInteger(maximumStateConflictRetries) ||
    maximumStateConflictRetries < 0 ||
    maximumStateConflictRetries > 3
  ) {
    throw new TypeError(
      "maximumStateConflictRetries must be an integer between 0 and 3."
    );
  }

  return async function processAgentInteraction(input) {
    const currentTime = readNow(now);
    const initialState = createInitialInternalState(stateProfile);
    const agent = await repository.getOrCreateAgentByBinding({
      browserBindingId: input.browserBindingId,
      initialState,
      now: currentTime.toISOString(),
      stateProfileVersion: stateProfile.version
    });

    for (
      let attempt = 0;
      attempt <= maximumStateConflictRetries;
      attempt += 1
    ) {
      const existingInteraction =
        await repository.findInteractionByRequestId(
          agent.id,
          input.clientRequestId
        );

      if (existingInteraction) {
        return {
          interaction: existingInteraction,
          replayed: true
        };
      }

      const context = await repository.getAgentContext(agent.id);
      const lastUpdatedAt = new Date(context.lastStateUpdatedAt);
      const elapsedMs = Number.isFinite(lastUpdatedAt.getTime())
        ? Math.max(0, currentTime.getTime() - lastUpdatedAt.getTime())
        : 0;
      const decayedState = decayInternalState({
        state: context.currentState,
        elapsedMs,
        profile: stateProfile
      });
      const factors = await factorInterpreter({
        messageText: input.message.text,
        sensoryObservations: input.sensoryObservations,
        previousInteraction: context.previousInteraction
      });
      const stateTransition = updateInternalState({
        state: decayedState,
        factors,
        profile: stateProfile
      });
      const actionSelection = selectAgentAction({
        state: stateTransition.nextState,
        stateProfile,
        actionProfile
      });
      const responseText = await responseGenerator(
        actionSelection.selectedAction.actionType,
        {
          input,
          stateTransition,
          actionSelection
        }
      );

      try {
        const commitResult = await repository.commitInteraction({
          agentId: agent.id,
          expectedStateVersion: context.stateVersion,
          clientRequestId: input.clientRequestId,
          userMessage: input.message.text,
          sensoryObservations: input.sensoryObservations,
          stateProfileVersion: stateProfile.version,
          stateBefore: context.currentState,
          decayedState,
          nextState: stateTransition.nextState,
          stateDelta: stateTransition.delta,
          changeCauses: stateTransition.causes,
          factors,
          actionSelection,
          responseText,
          createdAt: currentTime.toISOString()
        });

        return {
          interaction: commitResult.interaction,
          replayed: Boolean(commitResult.replayed)
        };
      } catch (error) {
        if (
          !isStateVersionConflict(error) ||
          attempt >= maximumStateConflictRetries
        ) {
          throw error;
        }
      }
    }

    throw new Error("The agent interaction retry loop ended unexpectedly.");
  };
}
