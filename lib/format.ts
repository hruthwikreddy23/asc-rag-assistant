import type { RetrievalResult, ScoredProduct } from "./retrieval";
import type { ProductCardData } from "./types";

export function toProductCardData(scored: ScoredProduct): ProductCardData {
  const { product, priceQuote } = scored;
  return {
    name: product.name,
    category: product.category,
    panels: product.panels,
    drugsTested: product.drugs_tested,
    complianceStatus: product.compliance_status,
    url: product.url,
    priceTiers: product.price_tiers,
    basePrice: product.base_price,
    quotedPrice: priceQuote
      ? {
          quantity: Math.max(priceQuote.tier.min_qty, 0),
          pricePerUnit: priceQuote.tier.price_each,
          belowMinimum: priceQuote.belowMinimum,
        }
      : null,
    caseSize: product.case_size,
    unitsAvailable: product.units_available,
    offers: product.offers,
  };
}

/**
 * Renders retrieved products into a compact, LLM-readable context block.
 * This is the ONLY product data the model is given — it must ground its
 * answer in this text and cite the url for anything it mentions.
 */
export function buildRetrievalContext(result: RetrievalResult): string {
  const { intent, matches, nearMisses } = result;

  const intentLines = [
    `category: ${intent.category ?? "unspecified"}`,
    `panel count: ${intent.panelCount ?? "unspecified"}`,
    `required substances: ${intent.requiredFlags.length ? intent.requiredFlags.join(", ") : "none"}`,
    `compliance preference: ${intent.compliancePreference ?? "unspecified"}`,
    `requested quantity: ${intent.quantity ?? "unspecified"}`,
  ];

  if (matches.length > 0) {
    const productBlocks = matches.slice(0, 5).map((m) => formatProductBlock(m));
    return [
      "PARSED INTENT:",
      ...intentLines,
      "",
      "MATCHED PRODUCTS (only source of truth — do not mention any product not listed here):",
      ...productBlocks,
    ].join("\n");
  }

  if (nearMisses.length > 0) {
    const productBlocks = nearMisses.map((m) => formatProductBlock(m));
    return [
      "PARSED INTENT:",
      ...intentLines,
      "",
      "NO EXACT MATCH in the catalog for this request.",
      "CLOSEST AVAILABLE OPTIONS (only source of truth — present these as close alternatives, not as an exact match):",
      ...productBlocks,
    ].join("\n");
  }

  return [
    "PARSED INTENT:",
    ...intentLines,
    "",
    "NO MATCHING PRODUCTS FOUND IN THE CATALOG for this request, and no close alternatives either.",
    "Tell the buyer honestly that nothing in the catalog matches, and ask a clarifying question or suggest they browse by category.",
  ].join("\n");
}

function formatProductBlock(scored: ScoredProduct): string {
  const p = scored.product;
  const tiers = p.price_tiers.map((t) => `${t.min_qty}+ @ $${t.price_each.toFixed(2)}`).join(", ");
  const quote = scored.priceQuote
    ? scored.priceQuote.belowMinimum
      ? ` | requested quantity is below the lowest price break; best available rate shown is the ${scored.priceQuote.tier.min_qty}+ tier at $${scored.priceQuote.tier.price_each.toFixed(2)} each`
      : ` | at the requested quantity, applicable tier is ${scored.priceQuote.tier.min_qty}+ @ $${scored.priceQuote.tier.price_each.toFixed(2)} each`
    : "";
  return [
    `- ${p.name}`,
    `  category: ${p.category} | panels: ${p.panels ?? "n/a"}`,
    `  screens for: ${p.drugs_tested}`,
    `  compliance_status: ${p.compliance_status}`,
    `  base_price: $${p.base_price.toFixed(2)} | price ladder: ${tiers}${quote}`,
    `  url: ${p.url}`,
  ].join("\n");
}
