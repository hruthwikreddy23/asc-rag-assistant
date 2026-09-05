import { NextResponse } from "next/server";
import { runGuardrails } from "@/lib/guardrails";
import { composeAnswer, type LeadCaptureReason } from "@/lib/answer";
import type { ChatMessage, ProductCardData } from "@/lib/types";

export interface ChatApiResponse {
  reply: string;
  refused: boolean;
  guardrailReason?: string;
  products: ProductCardData[];
  isNearMiss: boolean;
  promptLeadCapture: boolean;
  leadCaptureReason: LeadCaptureReason;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.role === "user" || v.role === "assistant") && typeof v.content === "string";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    return NextResponse.json(
      { error: "Body must be { messages: { role: 'user'|'assistant', content: string }[] }" },
      { status: 400 }
    );
  }

  const chatMessages = messages as ChatMessage[];
  const last = chatMessages[chatMessages.length - 1];
  if (last.role !== "user" || last.content.trim().length === 0) {
    return NextResponse.json({ error: "Last message must be a non-empty user message" }, { status: 400 });
  }

  const query = last.content.trim();

  const guardrail = runGuardrails(query);
  if (!guardrail.allowed) {
    const response: ChatApiResponse = {
      reply: guardrail.refusalMessage ?? "I can't help with that request.",
      refused: true,
      guardrailReason: guardrail.reason,
      products: [],
      isNearMiss: false,
      promptLeadCapture: false,
      leadCaptureReason: null,
    };
    return NextResponse.json(response);
  }

  try {
    const answer = await composeAnswer(chatMessages);
    const response: ChatApiResponse = {
      reply: answer.reply,
      refused: false,
      products: answer.products,
      isNearMiss: answer.isNearMiss,
      promptLeadCapture: answer.promptLeadCapture,
      leadCaptureReason: answer.leadCaptureReason,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again shortly." },
      { status: 500 }
    );
  }
}
