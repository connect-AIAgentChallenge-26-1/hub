import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../server.js";
import {
  createProcessAgentInteraction
} from "../../../backend/features/agent-interactions/services/processAgentInteraction.js";
import {
  createInMemoryAgentInteractionRepository
} from "../../../backend/features/agent-interactions/testing/createInMemoryAgentInteractionRepository.js";
import AgentInputForm from "../features/agent-session/components/AgentInputForm.jsx";
import {
  createAgentInteractionApi
} from "../features/agent-session/api/agentInteractionApi.js";

const browserBindingId = "44c96b3d-c657-4a41-876b-a26b53178f59";
let server;
let baseUrl;
let interactionApi;
let repository;

describe("화면 → Express → 내부 상태 저장 경계 E2E", () => {
  beforeAll(async () => {
    repository = createInMemoryAgentInteractionRepository();
    const processAgentInteraction = createProcessAgentInteraction({
      repository,
      now: () => new Date("2026-07-28T02:00:00.000Z")
    });
    const app = createApp({ processAgentInteraction });

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    interactionApi = createAgentInteractionApi({ baseUrl });
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("메시지가 상태 전이와 행동 선택을 거쳐 공개 응답으로 돌아온다", async () => {
    let apiResult;
    const onSend = vi.fn(async (messageText) => {
      apiResult = await interactionApi.createInteraction({
        browserBindingId,
        clientRequestId: crypto.randomUUID(),
        message: { text: messageText },
        sensoryObservations: []
      });
      return true;
    });

    render(<AgentInputForm onSend={onSend} />);
    const input = screen.getByLabelText("에이전트에게 전달할 요청");

    fireEvent.change(input, {
      target: { value: "현재 작업의 다음 단계를 계속 진행해줘." }
    });
    fireEvent.submit(input.closest("form"));

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    await waitFor(() => expect(apiResult).toBeDefined());

    const storedAgent = repository.inspectAgentByBinding(browserBindingId);

    expect(storedAgent.stateVersion).toBe(1);
    expect(storedAgent.currentState).toEqual(
      expect.objectContaining({
        predictionError: expect.any(Number),
        resourcePressure: expect.any(Number),
        goalConflict: expect.any(Number),
        continuityIntegrity: expect.any(Number),
        interactionSynchrony: expect.any(Number),
        explorationDrive: expect.any(Number)
      })
    );
    expect(storedAgent.interactions).toHaveLength(1);
    expect(apiResult.interaction).toMatchObject({
      sequenceNumber: 1,
      userMessage: "현재 작업의 다음 단계를 계속 진행해줘.",
      response: {
        actionType: expect.any(String),
        text: expect.any(String)
      }
    });
    expect(apiResult.interaction).not.toHaveProperty("internalState");
    expect(apiResult.interaction).not.toHaveProperty("researchTrace");
    expect(input).toHaveValue("");
  });
});
