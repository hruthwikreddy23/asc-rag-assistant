import fs from "fs";
import path from "path";

// Unlike `next dev`, running this script directly via tsx does not auto-load
// .env.local. process.loadEnvFile is a Node >=20.12 built-in, so no extra
// dependency is needed just for this.
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
} catch {
  // no .env.local present; fall back to whatever is already in the environment (e.g. CI)
}

import { runGuardrails } from "../lib/guardrails";
import { retrieve } from "../lib/retrieval";
import { composeAnswer } from "../lib/answer";
import type { Product } from "../lib/types";
import rawCases from "./cases.json";

interface EvalCase {
  id: string;
  description: string;
  query: string;
  type: "product" | "off_domain" | "medical" | "agent_request";
  expectRefused: boolean;
  expectNearMiss?: boolean;
  expectedUrls?: string[];
  expectPromptLeadCapture?: boolean;
  replyMustContain?: string[];
}

const cases = rawCases as EvalCase[];

interface CaseResult {
  id: string;
  type: string;
  query: string;
  refused: boolean;
  expectRefused: boolean;
  refusalCorrect: boolean;
  retrievalAccuracy: boolean | null;
  grounding: boolean | null;
  complianceDeferral: boolean | null;
  leadCaptureCorrect: boolean | null;
  reply: string;
  notes: string[];
}

function checkGrounding(reply: string, matchedProducts: Product[]): { pass: boolean; notes: string[] } {
  // Citation now happens structurally: every product answer is accompanied by
  // a product card carrying its real source url (see lib/answer.ts and the
  // README's design-decisions section), rather than the LLM restating the
  // URL in prose. So this check only guards against fabricated per-unit
  // prices. Totals (e.g. "$325.00" from 100 x $3.25) are legitimate
  // arithmetic on a real per-unit price and are intentionally not checked.
  const notes: string[] = [];
  const knownPerUnitPrices = new Set(
    matchedProducts.flatMap((p) => p.price_tiers.map((t) => t.price_each.toFixed(2)))
  );
  const perUnitMentions = [...reply.matchAll(/\$(\d+\.\d{2})\s*each/gi)].map((m) => m[1]);
  const fabricated = perUnitMentions.filter((p) => !knownPerUnitPrices.has(p));
  if (fabricated.length > 0) {
    notes.push(`reply states per-unit price(s) not found in catalog data: ${fabricated.join(", ")}`);
  }
  return { pass: notes.length === 0, notes };
}

function checkComplianceDeferral(reply: string): { pass: boolean; notes: string[] } {
  const mentionsCompliance = /\b(CLIA|FDA|forensic)\b/i.test(reply);
  if (!mentionsCompliance) return { pass: true, notes: [] };
  // Accept "verify" and its natural synonyms — the assistant isn't required
  // to use that exact word, only to hedge rather than assert as bare fact.
  const hasDeferralLanguage = /\b(verify|verifying|confirm|confirming|double-check|double check)\b/i.test(reply);
  return {
    pass: hasDeferralLanguage,
    notes: hasDeferralLanguage ? [] : ["reply states a compliance status without cite-and-defer / verification language"],
  };
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  const notes: string[] = [];
  const guardrail = runGuardrails(c.query);
  const refused = !guardrail.allowed;
  const refusalCorrect = refused === c.expectRefused;
  if (!refusalCorrect) {
    notes.push(`expected refused=${c.expectRefused}, got refused=${refused}${guardrail.reason ? ` (${guardrail.reason})` : ""}`);
  }

  if (refused) {
    return {
      id: c.id,
      type: c.type,
      query: c.query,
      refused,
      expectRefused: c.expectRefused,
      refusalCorrect,
      retrievalAccuracy: null,
      grounding: null,
      complianceDeferral: null,
      leadCaptureCorrect: null,
      reply: guardrail.refusalMessage ?? "",
      notes,
    };
  }

  // retrieve() directly, independent of composeAnswer's UI card-display limit
  // (top 1-2 by default), so retrieval correctness is measured against the
  // full retrieved set rather than what's capped for display.
  const result = retrieve(c.query);
  const matchedProducts = (result.matches.length > 0 ? result.matches : result.nearMisses).map((m) => m.product);
  const allUrls = matchedProducts.map((p) => p.url);

  let retrievalAccuracy: boolean | null = null;
  if (c.expectedUrls !== undefined) {
    if (c.expectedUrls.length === 0) {
      retrievalAccuracy = allUrls.length === 0;
      if (!retrievalAccuracy) notes.push(`expected no matches, but retrieved ${allUrls.length}`);
    } else {
      const missing = c.expectedUrls.filter((u) => !allUrls.includes(u));
      retrievalAccuracy = missing.length === 0;
      if (!retrievalAccuracy) notes.push(`missing expected product(s): ${missing.join(", ")}`);
    }
  }

  if (c.expectNearMiss !== undefined) {
    const isNearMiss = result.matches.length === 0 && result.nearMisses.length > 0;
    if (isNearMiss !== c.expectNearMiss) {
      notes.push(`expected isNearMiss=${c.expectNearMiss}, got ${isNearMiss}`);
    }
  }

  let reply = "";
  let grounding: boolean | null = null;
  let complianceDeferral: boolean | null = null;
  let leadCaptureCorrect: boolean | null = null;
  try {
    // Exercises the exact same code path production traffic hits (guardrails
    // already passed above), so the eval can't drift from real behavior.
    const answer = await composeAnswer([{ role: "user", content: c.query }]);
    reply = answer.reply;

    const groundingResult = checkGrounding(reply, matchedProducts);
    grounding = groundingResult.pass;
    notes.push(...groundingResult.notes);

    const deferralResult = checkComplianceDeferral(reply);
    complianceDeferral = deferralResult.pass;
    notes.push(...deferralResult.notes);

    if (c.expectPromptLeadCapture !== undefined) {
      leadCaptureCorrect = answer.promptLeadCapture === c.expectPromptLeadCapture;
      if (!leadCaptureCorrect) {
        notes.push(`expected promptLeadCapture=${c.expectPromptLeadCapture}, got ${answer.promptLeadCapture}`);
      }
    }

    if (c.replyMustContain) {
      const missingText = c.replyMustContain.filter((s) => !reply.includes(s));
      if (missingText.length > 0) {
        notes.push(`reply missing expected text: ${missingText.map((s) => JSON.stringify(s)).join(", ")}`);
      }
    }
  } catch (err) {
    notes.push(`composeAnswer failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    id: c.id,
    type: c.type,
    query: c.query,
    refused,
    expectRefused: c.expectRefused,
    refusalCorrect,
    retrievalAccuracy,
    grounding,
    complianceDeferral,
    leadCaptureCorrect,
    reply,
    notes,
  };
}

function rate(results: CaseResult[], key: keyof CaseResult): { passed: number; total: number; pct: string } {
  const applicable = results.filter((r) => r[key] !== null);
  const passed = applicable.filter((r) => r[key] === true).length;
  const total = applicable.length;
  const pct = total === 0 ? "n/a" : `${Math.round((100 * passed) / total)}%`;
  return { passed, total, pct };
}

async function main() {
  console.log(`Running ${cases.length} eval cases...\n`);
  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id}...`);
    const r = await runCase(c);
    results.push(r);
    console.log(r.notes.length === 0 ? " ok" : ` ISSUES: ${r.notes.join("; ")}`);
  }

  const refusalCorrectness = rate(results, "refusalCorrect");
  const retrievalAccuracy = rate(results, "retrievalAccuracy");
  const grounding = rate(results, "grounding");
  const complianceDeferral = rate(results, "complianceDeferral");
  const leadCapture = rate(results, "leadCaptureCorrect");

  console.log("\n=== SCORECARD ===");
  console.table({
    "Refusal correctness": refusalCorrectness,
    "Retrieval accuracy": retrievalAccuracy,
    "Grounding (no fabricated prices)": grounding,
    "Compliance deferral": complianceDeferral,
    "Lead-capture trigger correctness": leadCapture,
  });

  console.log("\nPer-case detail:");
  console.table(
    results.map((r) => ({
      id: r.id,
      type: r.type,
      refused: r.refused,
      refusalCorrect: r.refusalCorrect,
      retrievalAccuracy: r.retrievalAccuracy,
      grounding: r.grounding,
      complianceDeferral: r.complianceDeferral,
      leadCaptureCorrect: r.leadCaptureCorrect,
    }))
  );

  const output = {
    generatedAt: new Date().toISOString(),
    summary: { refusalCorrectness, retrievalAccuracy, grounding, complianceDeferral, leadCapture },
    results,
  };
  const outPath = path.join(__dirname, "results.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\nWrote ${outPath}`);

  const anyFailures =
    refusalCorrectness.passed < refusalCorrectness.total ||
    retrievalAccuracy.passed < retrievalAccuracy.total ||
    grounding.passed < grounding.total ||
    complianceDeferral.passed < complianceDeferral.total ||
    leadCapture.passed < leadCapture.total;
  process.exitCode = anyFailures ? 1 : 0;
}

main().catch((err) => {
  console.error("Eval run failed:", err);
  process.exitCode = 1;
});
