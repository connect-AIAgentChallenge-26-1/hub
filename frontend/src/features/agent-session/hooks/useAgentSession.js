import { useRef, useState } from "react";
import { mockMessages } from "../../conversation";
import { createInteraction } from "../api/agentInteractionApi";
import { getOrCreateBrowserBindingId } from "../utils/browserBinding";
import useManagedAsync from "./useManagedAsync";

const ERROR_MESSAGES = Object.freeze({
  NOT_FOUND: "에이전트 상호작용 API가 아직 활성화되지 않았습니다.",
  SUPABASE_NOT_CONFIGURED: "에이전트 저장소가 아직 구성되지 않았습니다.",
  AGENT_REPOSITORY_FAILED: "에이전트 상태를 저장하지 못했습니다.",
  STATE_VERSION_CONFLICT: "상태가 동시에 변경되었습니다. 다시 시도해 주세요.",
  RATE_LIMIT_EXCEEDED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
});

export default function useAgentSession() {
  const [browserBindingId] = useState(getOrCreateBrowserBindingId);
  const [messages, setMessages] = useState(mockMessages);
  const [agentStatus, setAgentStatus] = useState("waiting");
  const [lastInteraction, setLastInteraction] = useState(null);
  const [interactionError, setInteractionError] = useState("");
  const isSendingRef = useRef(false);
  const {
    schedule,
    createController,
    releaseController,
    isMounted
  } = useManagedAsync();

  const handleSend = async (messageText) => {
    const text = String(messageText || "").trim();

    if (!text || isSendingRef.current) return false;

    isSendingRef.current = true;
    setInteractionError("");
    setAgentStatus("thinking");
    const controller = createController();

    try {
      const clientRequestId = window.crypto.randomUUID();
      const result = await createInteraction(
        {
          browserBindingId,
          clientRequestId,
          message: { text },
          sensoryObservations: []
        },
        { signal: controller.signal }
      );

      if (!isMounted()) return false;

      setLastInteraction(result.interaction);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `${clientRequestId}-user`,
          role: "user",
          content: text
        },
        {
          id: `${clientRequestId}-agent`,
          role: "agent",
          content: result.interaction.response.text
        }
      ]);
      setAgentStatus("speaking");
      schedule(() => setAgentStatus("waiting"), 600);
      return true;
    } catch (error) {
      if (error?.name === "AbortError") return false;
      if (isMounted()) {
        setInteractionError(
          ERROR_MESSAGES[error?.code] ||
            "상호작용을 처리하지 못했습니다. 다시 시도해 주세요."
        );
        setAgentStatus("waiting");
      }
      return false;
    } finally {
      releaseController(controller);
      isSendingRef.current = false;
    }
  };

  return {
    messages,
    agentStatus,
    lastInteraction,
    interactionError,
    isInputDisabled: agentStatus !== "waiting",
    handleSend
  };
}
