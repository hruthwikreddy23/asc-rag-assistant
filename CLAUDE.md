# CLAUDE.md — Project guardrails for Claude Code

You are building the ASC Product & Compliance Assistant. Read `SPEC.md` for the full brief.
This file lists the non-negotiables to keep in mind on EVERY change.

## Golden rules (never violate)
1. **Never assert product compliance (CLIA/FDA/forensic) as fact.** Always phrase as
   "listed as {status} on ASC's page — verify on the linked page," and include the URL.
2. **Pricing is illustrative**, from public pages, possibly stale — never a binding quote.
3. **Refuse off-domain** (recipes, chit-chat, coding) and **medical/legal advice** requests.
   The assistant only gives product information for drug/alcohol screening supplies.
4. **No fabrication** of products, SKUs, prices, or statuses. No match → say so honestly.
5. All product answers **cite the source URL**.
6. The **disclaimer** (independent portfolio project, not affiliated, data illustrative)
   must be visible in the UI and present in the README.
7. Never disparage the target company anywhere in code, copy, or commits.

## Engineering conventions
- TypeScript, Next.js App Router, functional components.
- All LLM calls go through `lib/llm.ts` (provider-swappable via `LLM_PROVIDER` env:
  `anthropic` default, `openai` alternate). Never call a provider SDK directly elsewhere.
- API keys only from server-side env vars. Never expose keys to the client. Never commit
  a `.env`; provide `.env.example` with placeholder names only.
- Keep retrieval logic explainable and unit-testable (`lib/retrieval.ts`).
- Guardrails live in `lib/guardrails.ts` and run server-side before retrieval.
- The dataset is `data/products.json` (52 products, already cleaned). Do not hand-edit
  product facts; if a transform is needed, write a script under `scripts/`.

## Data notes (already applied, don't redo)
- `free_shipping_threshold` was removed (it was fabricated/over-generalized).
- "Alco Screen Alcohol Test Strips" compliance corrected to "CLIA Waived" (verified via product image).
- Derived boolean flags added: `has_fentanyl`, `has_alcohol`, `has_etg`, `has_k2`.
- `price_tiers` is the volume ladder; `base_price` == the lowest-qty tier's price.
- `compliance_status` values seen: "CLIA Waived + FDA Cleared", "CLIA Waived",
  "FDA Cleared", "Forensic Use Only", "Not Specified". Treat "Not Specified" as unknown
  and say so (never guess).

## Definition of done for v1
- `npm run dev` serves a working chat that answers the flagship query correctly.
- `npm run eval` prints a scorecard and writes `eval/results.json`; pasta case is refused,
  fentanyl-cup case is answered and grounded.
- README has problem statement, Mermaid architecture diagram, run instructions, design
  decisions, and a limitations/data-provenance section.
- Deployable to Vercel (document required env vars).
