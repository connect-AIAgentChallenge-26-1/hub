import React from "react";
import { ConversationPanel } from "./features/conversation";
import {
  AgentInputForm,
  AgentStatePanel,
  useAgentSession
} from "./features/agent-session";
import ServiceHeader from "./shared/components/ServiceHeader";

export default function App() {
  const {
    messages,
    agentStatus,
    lastInteraction,
    interactionError,
    isInputDisabled,
    handleSend
  } = useAgentSession();

  return (
    <div className="app-root">
      <aside className="sidebar">
        <ServiceHeader status={agentStatus} />
        <AgentStatePanel
          status={agentStatus}
          interaction={lastInteraction}
          error={interactionError}
        />
      </aside>

      <ConversationPanel messages={messages}>
        <AgentInputForm
          disabled={isInputDisabled}
          onSend={handleSend}
        />
      </ConversationPanel>
    </div>
  );
}
