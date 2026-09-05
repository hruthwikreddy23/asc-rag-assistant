import { retrieve, parseIntent, type PriceQuote } from "./retrieval";
import { toProductCardData, buildRetrievalContext } from "./format";
import { SYSTEM_PROMPT } from "./prompt";
import { getLlmClient } from "./llm";
import { detectAgentRequestIntent, detectMoreOptionsIntent } from "./intent";
import { isWithinOfficeHours } from "./time";
import type { ChatMessage, LeadCaptureReason, Product, ProductCardData } from "./types";
import type { RetrievalResult } from "./retrieval";

export type { LeadCaptureReason };

export interface AnswerResult {
  reply: string;
  products: ProductCardData[];
  isNearMiss: boolean;
  promptLeadCapture: boolean;
  leadCaptureReason: LeadCaptureReason;
}

const DEFAULT_CARD_LIMIT = 2;
const MORE_CARD_LIMIT = 5;

type ReplyMode = "no_match" | "near_miss" | "normal";

const COMPLIANCE_MENTION_RULE = `Prefer not mentioning compliance status (CLIA/FDA/Forensic) at all — the product card already shows it with proper verification language. If you do mention it (e.g. because the buyer used that term themselves), you MUST pair it with a brief hedge in the same sentence, such as "per ASC's listing — verify on the product page." Never state a compliance status as bare, unhedged fact.`;

const MODE_INSTRUCTIONS: Record<ReplyMode, string> = {
  no_match: `No product in the catalog matches this request, and there are no close alternatives either.
Reply in exactly 1-2 short sentences: state plainly and honestly that you don't carry a matching product (name what they asked for in a few words), then ask "Is there anything else I can help you with?"
Do not list unrelated products, do not offer to escalate to the team, do not apologize excessively.`,

  near_miss: `No exact match was found, but the CLOSEST AVAILABLE OPTIONS are listed above.
Reply in 2-4 short, conversational sentences: say there's no exact match, name at most the top 1-2 alternatives by name only (their full details are already in the product cards below your reply — do not repeat panels, drug lists, or price ladders), and end by offering to pass the buyer's info to the team so they can help confirm the right fit.
${COMPLIANCE_MENTION_RULE}`,

  normal: `A matching product (or products) was found and is shown in the product card(s) below your reply.
Reply in 2-4 short, conversational sentences summarizing the recommendation in plain language. Do not restate the full drug list, the full price ladder, or the source URL — all of that is already in the product card(s).
${COMPLIANCE_MENTION_RULE}`,
};

const MORE_OPTIONS_ADDENDUM =
  "\n\nThe buyer asked to see more options, so you may briefly name a couple more alternatives by name.";

function hasParsedSignal(query: string): boolean {
  const intent = parseIntent(query);
  return (
    intent.category !== null ||
    intent.panelCount !== null ||
    intent.requiredFlags.length > 0 ||
    intent.compliancePreference !== null ||
    intent.keywords.length > 0
  );
}

/**
 * "Show me more options" carries no product signal on its own — it refers
 * back to whatever the buyer was just asking about. Falls back to the most
 * recent prior user message that actually parses to a product intent.
 */
function resolveRetrievalQuery(messages: ChatMessage[]): string {
  const current = messages[messages.length - 1].content;
  if (hasParsedSignal(current)) return current;

  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === "user" && hasParsedSignal(messages[i].content)) {
      return messages[i].content;
    }
  }
  return current;
}

function isHighestTier(product: Product, tier: PriceQuote["tier"]): boolean {
  const maxMinQty = Math.max(...product.price_tiers.map((t) => t.min_qty));
  return tier.min_qty === maxMinQty;
}

function buildQuoteReply(product: Product, quantity: number, quote: PriceQuote): string {
  const unit = quote.tier.price_each;
  const total = quantity * unit;
  const lines = [`For ${quantity} units of the ${product.name}:`];

  if (quote.belowMinimum) {
    lines.push(
      `Requested quantity is below our lowest price break (${quote.tier.min_qty}+ units) — the best available rate is $${unit.toFixed(2)} each.`
    );
  } else {
    const bulkNote = isHighestTier(product, quote.tier) ? "" : " (bulk orders drop the per-unit price further)";
    lines.push(`Applicable tier: ${quote.tier.min_qty}+ units @ $${unit.toFixed(2)} each${bulkNote}.`);
  }

  lines.push(`Estimated total: ${quantity} × $${unit.toFixed(2)} = $${total.toFixed(2)}.`);
  lines.push(`This pricing is illustrative. For an exact quote with current pricing and any available offers, share your details below.`);
  return lines.join("\n");
}

async function callLlmForMode(
  messages: ChatMessage[],
  result: RetrievalResult,
  mode: ReplyMode,
  wantsMore: boolean
): Promise<string> {
  const context = buildRetrievalContext(result);
  const instructions = MODE_INSTRUCTIONS[mode] + (wantsMore ? MORE_OPTIONS_ADDENDUM : "");
  const llm = getLlmClient();
  const completion = await llm.complete({
    system: `${SYSTEM_PROMPT}\n\n${instructions}\n\n--- RETRIEVED CONTEXT FOR THIS TURN ---\n${context}`,
    messages,
    maxTokens: 400,
  });
  return enforceComplianceDeferral(completion.text);
}

const COMPLIANCE_MENTION_PATTERN = /\b(CLIA|FDA|forensic)\b/i;
const DEFERRAL_LANGUAGE_PATTERN = /\b(verify|verifying|confirm|confirming|double-check|double check)\b/i;

/**
 * Non-negotiable golden rule (CLAUDE.md #1): never assert compliance status
 * as settled fact. The system prompt instructs the model to hedge or omit
 * it, but instruction-following on this is not 100% reliable across calls —
 * so this is a deterministic safety net, not just a prompt request. If the
 * model mentions a compliance status without hedging language, append a
 * fixed caveat rather than trust sampling variance for a non-negotiable rule.
 */
function enforceComplianceDeferral(reply: string): string {
  if (COMPLIANCE_MENTION_PATTERN.test(reply) && !DEFERRAL_LANGUAGE_PATTERN.test(reply)) {
    return `${reply} (Please verify current compliance status on the product page before purchase.)`;
  }
  return reply;
}

/** Assumes the query has already passed lib/guardrails.ts. */
export async function composeAnswer(messages: ChatMessage[]): Promise<AnswerResult> {
  const query = messages[messages.length - 1].content;

  if (detectAgentRequestIntent(query)) {
    const reply = isWithinOfficeHours()
      ? "Sure — I can pass your contact info to the team so they can reach out."
      : "Our team is offline right now (office hours are Mon–Fri, 9am–5pm Central). Share your contact info and I'll pass it along so they reach out as soon as they're back.";
    return { reply, products: [], isNearMiss: false, promptLeadCapture: true, leadCaptureReason: "agent_request" };
  }

  const wantsMore = detectMoreOptionsIntent(query);
  const retrievalQuery = wantsMore ? resolveRetrievalQuery(messages) : query;
  const result = retrieve(retrievalQuery);
  const quoteIntent = result.intent.quantity !== null && result.matches.length > 0;

  if (quoteIntent) {
    const top = result.matches[0];
    const quote = top.priceQuote!;
    const reply = buildQuoteReply(top.product, result.intent.quantity!, quote);
    return {
      reply,
      products: [toProductCardData(top)],
      isNearMiss: false,
      promptLeadCapture: true,
      leadCaptureReason: "quote",
    };
  }

  if (result.matches.length === 0 && result.nearMisses.length === 0) {
    const reply = await callLlmForMode(messages, result, "no_match", wantsMore);
    return { reply, products: [], isNearMiss: false, promptLeadCapture: false, leadCaptureReason: null };
  }

  if (result.matches.length === 0 && result.nearMisses.length > 0) {
    const limit = wantsMore ? MORE_CARD_LIMIT : DEFAULT_CARD_LIMIT;
    const cards = result.nearMisses.slice(0, limit).map(toProductCardData);
    const reply = await callLlmForMode(messages, result, "near_miss", wantsMore);
    return { reply, products: cards, isNearMiss: true, promptLeadCapture: true, leadCaptureReason: "near_miss" };
  }

  const limit = wantsMore ? MORE_CARD_LIMIT : DEFAULT_CARD_LIMIT;
  const cards = result.matches.slice(0, limit).map(toProductCardData);
  const reply = await callLlmForMode(messages, result, "normal", wantsMore);
  return { reply, products: cards, isNearMiss: false, promptLeadCapture: false, leadCaptureReason: null };
}
