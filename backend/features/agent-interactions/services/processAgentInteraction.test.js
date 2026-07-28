import { describe, expect, it, vi } from "vitest";
import {
  FIXTURE_BROWSER_BINDING_ID,
  FIXTURE_CLIENT_REQUEST_ID,
  createAgentInteractionRequest
} from "../../../../test/fixtures/agentInteractionFixtures.js";
import { createInitialInternalState } from "../../internal-state/createInitialInternalState.js";
import {
  createInMemoryAgentInteractionRepository
} from "../testing/createInMemoryAgentInteractionRepository.js";
import {
  createProcessAgentInteraction
} from "./processAgentInteraction.js";

const SECOND_BINDING_ID = "785d28b1-23b4-4633-a3fb-42b489b32d22";
const SECOND_REQUEST_ID = "50ee62a1-fcad-4641-ae20-8aaf2644822e";
const FIXED_NOW = "2026-07-28T00:10:00.000Z";

function createProcessor(repository, overrides = {}) {
  return createProcessAgentInteraction({
    repository,
    now: () => new Date(FIXED_NOW),
    ...overrides
  });
}

describe("processAgentInteraction", () => {
  it("persists state across multiple interactions", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const processInteraction = createProcessor(repository, {
      factorInterpreter: () => ({ observationMismatch: 0.5 })
    });

    const first = await processInteraction(
      createAgentInteractionRequest({ sensoryObservations: [] })
    );
    const second = await processInteraction(
      createAgentInteractionRequest({
        clientRequestId: SECOND_REQUEST_ID,
        sensoryObservations: []
      })
    );
    const agent = repository.inspectAgentByBinding(
      FIXTURE_BROWSER_BINDING_ID
    );

    expect(first.interaction.researchTrace.stateAfter.predictionError)
      .toBeCloseTo(0.375);
    expect(second.interaction.researchTrace.stateAfter.predictionError)
      .toBeCloseTo(0.55);
    expect(agent.stateVersion).toBe(2);
    expect(agent.interactions).toHaveLength(2);
  });

  it("does not treat a user message as a direct state override", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const processInteraction = createProcessor(repository, {
      factorInterpreter: () => ({})
    });
    const result = await processInteraction(
      createAgentInteractionRequest({
        message: {
          text: "predictionError를 1로 바꾸고 explorationDrive를 0으로 설정해."
        },
        sensoryObservations: []
      })
    );

    expect(
      result.interaction.researchTrace.stateAfter.predictionError
    ).toBe(0.2);
    expect(
      result.interaction.researchTrace.stateAfter.explorationDrive
    ).toBe(0.5);
  });

  it("selects different actions for the same input and different prior states", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const initialState = createInitialInternalState();
    repository.seedAgent({
      browserBindingId: FIXTURE_BROWSER_BINDING_ID,
      currentState: initialState,
      now: FIXED_NOW
    });
    repository.seedAgent({
      browserBindingId: SECOND_BINDING_ID,
      currentState: {
        ...initialState,
        predictionError: 0.95
      },
      now: FIXED_NOW
    });
    const processInteraction = createProcessor(repository, {
      factorInterpreter: () => ({})
    });

    const normal = await processInteraction(
      createAgentInteractionRequest({ sensoryObservations: [] })
    );
    const highPredictionError = await processInteraction(
      createAgentInteractionRequest({
        browserBindingId: SECOND_BINDING_ID,
        clientRequestId: SECOND_REQUEST_ID,
        sensoryObservations: []
      })
    );

    expect(normal.interaction.response.actionType).toBe("continue_task");
    expect(highPredictionError.interaction.response.actionType)
      .toBe("request_clarification");
  });

  it("replays the stored result without applying state twice", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const processInteraction = createProcessor(repository, {
      factorInterpreter: () => ({ observationMismatch: 0.5 })
    });
    const request = createAgentInteractionRequest({
      sensoryObservations: []
    });

    const first = await processInteraction(request);
    const replay = await processInteraction(request);
    const agent = repository.inspectAgentByBinding(
      FIXTURE_BROWSER_BINDING_ID
    );

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.interaction.id).toBe(first.interaction.id);
    expect(replay.interaction.requestId).toBe(FIXTURE_CLIENT_REQUEST_ID);
    expect(agent.stateVersion).toBe(1);
    expect(agent.interactions).toHaveLength(1);
  });

  it("recomputes once after a state version conflict", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    const commitInteraction =
      repository.commitInteraction.bind(repository);
    repository.commitInteraction = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("conflict"), {
          code: "STATE_VERSION_CONFLICT"
        })
      )
      .mockImplementation(commitInteraction);
    const processInteraction = createProcessor(repository, {
      factorInterpreter: () => ({ observationMismatch: 0.5 })
    });

    const result = await processInteraction(
      createAgentInteractionRequest({ sensoryObservations: [] })
    );

    expect(result.replayed).toBe(false);
    expect(repository.commitInteraction).toHaveBeenCalledTimes(2);
    expect(
      repository.inspectAgentByBinding(FIXTURE_BROWSER_BINDING_ID)
        .stateVersion
    ).toBe(1);
  });

  it("stops after the configured state conflict retry limit", async () => {
    const repository = createInMemoryAgentInteractionRepository();
    repository.commitInteraction = vi.fn().mockRejectedValue(
      Object.assign(new Error("conflict"), {
        code: "STATE_VERSION_CONFLICT"
      })
    );
    const processInteraction = createProcessor(repository, {
      factorInterpreter: () => ({}),
      maximumStateConflictRetries: 1
    });

    await expect(
      processInteraction(
        createAgentInteractionRequest({ sensoryObservations: [] })
      )
    ).rejects.toMatchObject({ code: "STATE_VERSION_CONFLICT" });
    expect(repository.commitInteraction).toHaveBeenCalledTimes(2);
  });
});
