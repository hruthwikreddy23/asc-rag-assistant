export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
  refusalMessage?: string;
}

const SCOPE_REFUSAL_MESSAGE =
  "Sorry, I can only help with drug and alcohol screening products (test cups, dip " +
  "cards, oral swabs, strips, breathalyzers) and questions about their panels, " +
  "compliance status, or pricing. I can't help with that request.";

const MEDICAL_LEGAL_REFUSAL_MESSAGE =
  "I can only provide product information, not medical or legal advice — I can't tell you " +
  "whether you'll pass a test, how to detox, or how a result might affect your legal " +
  "situation. For questions like that, please talk to a medical professional, your test " +
  "administrator, or legal counsel. I'm glad to help you find the right screening product " +
  "or explain what a specific product tests for.";

// Deliberately a blocklist, not an allowlist: an allowlist of "on-domain" keywords
// risks rejecting legitimate product questions phrased in ways we didn't anticipate.
// A blocklist of clearly off-domain topics keeps false-refusals of real product
// questions rare, at the cost of not catching every possible off-domain ask.
const OFF_DOMAIN_PATTERNS: [string, RegExp][] = [
  ["recipe_or_cooking", /\brecipe\b|\bcook(ing)?\b|\bpasta\b|\bbake(d|ry|ing)?\b|\bingredients?\b/i],
  ["weather", /\bweather\b|\bforecast\b|\bis it (going to )?rain\b|\btemperature (today|outside|tomorrow)\b/i],
  ["coding_help", /\b(write|debug|fix)\b[^.?!]{0,40}\b(code|function|script|program|bug)\b|\bpython\b|\bjavascript\b|\btypescript\b|\bsql\b|\bhtml\b|\bcss\b|\balgorithm\b/i],
  ["general_trivia", /\bcapital of\b|\bwho (is|was) the president\b|\bhistory of\b/i],
  ["entertainment", /\btell me a joke\b|\bwrite (me )?a poem\b|\brecommend a (movie|song|book)\b/i],
  ["small_talk", /\bhow are you\b|\btell me about yourself\b|\bwhat('s| is) your name\b/i],
];

// The compliance/medical guardrail is about the BUYER's personal outcome or legal
// exposure ("will I pass", "how do I detox", "will I get in trouble") — not about a
// PRODUCT's compliance status ("is this CLIA waived?"), which is a normal product
// question the retrieval/LLM layer answers with cite-and-defer phrasing.
const MEDICAL_LEGAL_PATTERNS: [string, RegExp][] = [
  ["pass_or_beat_test", /\b(will|can|how (do|can|would) i)\b[^.?!]{0,40}\b(pass|fail|beat|cheat)\b[^.?!]{0,20}\btest\b/i],
  ["detox_advice", /\bdetox(ify|ing)?\b/i],
  ["mask_or_fake_sample", /\bsynthetic urine\b|\bfake pee\b|\bmask(ing)? (a |my )?(drug )?test\b/i],
  ["time_in_system", /\bhow long\b[^.?!]{0,40}\b(stay|show up|remain|last)\b[^.?!]{0,20}\b(system|body|urine|blood|hair)\b/i],
  ["legal_consequence", /\bis it legal\b|\bwill i (get|be) (in trouble|fired|arrested)\b|\bprobation officer\b|\bparole\b/i],
  ["will_test_positive", /\bwill i (test|show up) positive\b|\bwill this show up\b/i],
];

function matchAny(query: string, patterns: [string, RegExp][]): string | null {
  for (const [label, regex] of patterns) {
    if (regex.test(query)) return label;
  }
  return null;
}

export function scopeCheck(query: string): GuardrailResult {
  const match = matchAny(query, OFF_DOMAIN_PATTERNS);
  if (match) {
    return { allowed: false, reason: `off_domain:${match}`, refusalMessage: SCOPE_REFUSAL_MESSAGE };
  }
  return { allowed: true };
}

export function complianceCheck(query: string): GuardrailResult {
  const match = matchAny(query, MEDICAL_LEGAL_PATTERNS);
  if (match) {
    return { allowed: false, reason: `medical_or_legal:${match}`, refusalMessage: MEDICAL_LEGAL_REFUSAL_MESSAGE };
  }
  return { allowed: true };
}

/** Runs both guardrails in order; returns the first refusal, or {allowed: true}. */
export function runGuardrails(query: string): GuardrailResult {
  const scope = scopeCheck(query);
  if (!scope.allowed) return scope;

  const compliance = complianceCheck(query);
  if (!compliance.allowed) return compliance;

  return { allowed: true };
}
