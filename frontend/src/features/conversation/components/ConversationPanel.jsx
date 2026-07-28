import React, { useEffect, useRef } from "react";

export default function ConversationPanel({ messages, children }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <main className="main">
      <div
        className="messages"
        ref={scrollRef}
        role="log"
        aria-label="에이전트 상호작용 기록"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${
              message.role === "user" ? "user" : "agent"
            }`}
          >
            <div className="message-content">{message.content}</div>
          </div>
        ))}
      </div>
      {children}
    </main>
  );
}
