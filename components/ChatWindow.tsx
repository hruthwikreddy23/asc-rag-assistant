"use client";

import { useState, useRef, useEffect } from "react";
import { Send, MessageCircleQuestion } from "lucide-react";
import type { UiChatMessage } from "@/lib/types";
import type { ChatApiResponse } from "@/app/api/chat/route";
import { timeAwareGreeting } from "@/lib/time";
import MessageBubble from "./MessageBubble";

const EXAMPLE_QUERIES = [
  "I need a CLIA-waived 12-panel cup with fentanyl for a rehab clinic, roughly what's bulk price?",
  "Do you have an alcohol breathalyzer?",
  "What's your cheapest 5-panel dip card?",
];

export default function ChatWindow() {
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      { role: "assistant", content: `${timeAwareGreeting()}! I'm Ria 👋 How can I help you find a screening product today?` },
    ]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const hasUserSentMessage = messages.some((m) => m.role === "user");

  function offerContactForm() {
    const lastUserQuery = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Sure — here's how to share your contact info:",
        promptLeadCapture: true,
        leadCaptureContext: lastUserQuery,
      },
    ]);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: UiChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })) }),
      });
      const data = (await res.json()) as ChatApiResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          products: data.products,
          isNearMiss: data.isNearMiss,
          refused: data.refused,
          promptLeadCapture: data.promptLeadCapture,
          leadCaptureReason: data.leadCaptureReason,
          leadCaptureContext: trimmed,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-window">
      <header className="chat-header">
        <div className="chat-header-identity">
          <div className="chat-avatar chat-avatar-header">R</div>
          <div>
            <h1>Ria</h1>
            <p>ASC Product &amp; Compliance Assistant</p>
          </div>
        </div>
        <button className="contact-team-link" onClick={offerContactForm}>
          <MessageCircleQuestion size={15} />
          Contact the team
        </button>
      </header>

      <div className="chat-log">
        {!hasUserSentMessage && (
          <div className="chat-empty-state">
            <p>Try asking:</p>
            <div className="example-queries">
              {EXAMPLE_QUERIES.map((q) => (
                <button key={q} onClick={() => sendMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {loading && (
          <div className="message-row message-row-assistant">
            <div className="chat-avatar">R</div>
            <div className="message-bubble message-bubble-assistant message-bubble-loading">
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}

        {error && <p className="chat-error">{error}</p>}

        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a screening product..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Send">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
