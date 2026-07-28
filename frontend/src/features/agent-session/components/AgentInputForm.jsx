import React, { useState } from "react";
import {
  AGENT_INTERACTION_LIMITS
} from "../../../../../shared/contracts/agentInteractionContract";

export default function AgentInputForm({
  disabled = false,
  onSend
}) {
  const [messageText, setMessageText] = useState("");
  const [validationError, setValidationError] = useState("");

  const submitMessage = async () => {
    const trimmedText = messageText.trim();

    if (!trimmedText) {
      setValidationError("에이전트에게 전달할 요청을 입력해 주세요.");
      return;
    }

    setValidationError("");
    const accepted = await onSend(trimmedText);
    if (accepted !== false) setMessageText("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!disabled) void submitMessage();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled) void submitMessage();
    }
  };

  return (
    <form className="agent-input" onSubmit={handleSubmit} noValidate>
      <div className="agent-input-heading">
        <label htmlFor="agent-message">에이전트에게 전달할 요청</label>
        <span aria-live="polite">
          {messageText.length}/{AGENT_INTERACTION_LIMITS.messageTextLength}자
        </span>
      </div>
      <textarea
        id="agent-message"
        value={messageText}
        onChange={(event) => {
          setMessageText(event.target.value);
          if (validationError) setValidationError("");
        }}
        onKeyDown={handleKeyDown}
        placeholder="작업, 질문 또는 관찰 내용을 입력하세요..."
        maxLength={AGENT_INTERACTION_LIMITS.messageTextLength}
        disabled={disabled}
        aria-describedby="agent-input-description"
        rows={3}
      />
      <span id="agent-input-description" className="sr-only">
        Enter 키로 요청을 보내고 Shift와 Enter 키를 함께 누르면 줄을
        바꿉니다.
      </span>
      <div className="agent-input-actions">
        <div
          className="validation-message"
          role={validationError ? "alert" : undefined}
        >
          {validationError}
        </div>
        <button type="submit" disabled={disabled || !messageText.trim()}>
          {disabled ? "상태 갱신 중..." : "상호작용 실행"}
        </button>
      </div>
    </form>
  );
}
