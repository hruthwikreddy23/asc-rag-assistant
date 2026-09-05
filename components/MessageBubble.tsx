import type { UiChatMessage } from "@/lib/types";
import ProductCard from "./ProductCard";
import LeadCaptureInline from "./LeadCaptureInline";

export default function MessageBubble({ message }: { message: UiChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "message-row-user" : "message-row-assistant"}`}>
      {!isUser && <div className="chat-avatar">R</div>}

      <div className="message-col">
        {!isUser && <span className="message-author">Ria</span>}

        <div
          className={`message-bubble ${isUser ? "message-bubble-user" : "message-bubble-assistant"} ${
            message.refused ? "message-bubble-refused" : ""
          }`}
        >
          {message.content.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>

        {!isUser && message.isNearMiss && message.products && message.products.length > 0 && (
          <p className="near-miss-label">No exact match — closest available options:</p>
        )}

        {!isUser && message.products && message.products.length > 0 && (
          <div className="product-card-grid">
            {message.products.map((p) => (
              <ProductCard key={p.url} product={p} />
            ))}
          </div>
        )}

        {!isUser && message.promptLeadCapture && <LeadCaptureInline need={message.leadCaptureContext ?? ""} />}
      </div>
    </div>
  );
}
