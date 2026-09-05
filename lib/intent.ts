// Conversational meta-intents — distinct from lib/guardrails.ts (safety
// refusals) and lib/retrieval.ts (product-attribute parsing). These detect
// what kind of turn this is in the conversation flow.

const AGENT_REQUEST_PATTERNS: RegExp[] = [
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(real\s+)?(person|agent|human|rep|representative|someone)\b/i,
  /\bconnect me\s+(to|with)\s+(a\s+)?(rep|representative|agent|someone|sales)\b/i,
  /\bcustomer service\b/i,
  /\blive\s+(agent|chat|person)\b/i,
  /\bhuman\s+(agent|being)\b/i,
  /\breal\s+(person|agent|human)\b/i,
  /\btalk to sales\b/i,
];

export function detectAgentRequestIntent(query: string): boolean {
  return AGENT_REQUEST_PATTERNS.some((r) => r.test(query));
}

const MORE_OPTIONS_PATTERNS: RegExp[] = [
  /\bmore options\b/i,
  /\bother options\b/i,
  /\bwhat else\b/i,
  /\banything else (do you have|available)\b/i,
  /\bshow me more\b/i,
  /\bsee more\b/i,
  /\bany other (option|product)s?\b/i,
];

export function detectMoreOptionsIntent(query: string): boolean {
  return MORE_OPTIONS_PATTERNS.some((r) => r.test(query));
}
