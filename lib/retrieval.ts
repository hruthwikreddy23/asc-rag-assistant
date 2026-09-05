import rawProducts from "../data/products.json";
import type { ComplianceStatus, PriceTier, Product } from "./types";

const CATALOG = rawProducts as Product[];

export type SubstanceFlag = "has_fentanyl" | "has_alcohol" | "has_etg" | "has_k2";

export interface ParsedIntent {
  /** Raw query, unchanged, for logging/eval. */
  query: string;
  /** Detected product category, if any (must be an exact category value from the catalog). */
  category: string | null;
  /** Detected panel count, e.g. "12-panel" -> 12. */
  panelCount: number | null;
  /** Substance flags explicitly required by the query. */
  requiredFlags: SubstanceFlag[];
  /** Compliance status the buyer asked for, normalized to a catalog value. */
  compliancePreference: ComplianceStatus | null;
  /** Requested quantity, if a number was mentioned (for price-tier lookup). */
  quantity: number | null;
  /** Leftover free-text tokens used for keyword ranking. */
  keywords: string[];
}

export interface PriceQuote {
  tier: PriceTier;
  /** True if the requested quantity is below the lowest price-break — the tier shown is the best available reference, not a match to the exact quantity. */
  belowMinimum: boolean;
}

export interface ScoredProduct {
  product: Product;
  score: number;
  matchedOn: string[];
  priceQuote: PriceQuote | null;
}

export interface RetrievalResult {
  intent: ParsedIntent;
  /** Products that satisfy every hard filter detected in the query. */
  matches: ScoredProduct[];
  /**
   * Populated only when `matches` is empty: the closest catalog products found
   * by relaxing the panel-count filter, so the assistant can honestly say
   * "no exact match, but here's the closest option" instead of fabricating one.
   */
  nearMisses: ScoredProduct[];
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  cup: ["cup", "cups"],
  "dip card": ["dip card", "dip cards", "dipcard", "dip-card"],
  oral: ["oral", "saliva", "mouth swab", "swab"],
  strip: ["strip", "strips"],
  breathalyzer: ["breathalyzer", "breathalyzer test", "breath test", "breath alcohol"],
  specimen: ["specimen", "specimen cup", "validity cup"],
};

// Words used purely to detect a category (e.g. "saliva" implying category
// "oral") don't tell us anything about whether the buyer's actual named
// substance/ask is covered by that category's products — they'd trivially
// keyword-match every product in the category. Stripped out before the
// category-only relevance check below.
const CATEGORY_ONLY_KEYWORDS = new Set([
  "cup", "cups", "dip", "card", "cards", "dipcard", "oral", "saliva", "mouth",
  "swab", "strip", "strips", "breathalyzer", "breath", "specimen", "validity",
]);

const SUBSTANCE_PATTERNS: Record<SubstanceFlag, RegExp> = {
  has_fentanyl: /\bfentanyl\b|\bfen\b/i,
  has_alcohol: /\balcohol\b|\bbreathalyzer\b|\betoh\b/i,
  has_etg: /\betg\b|\bethyl glucuronide\b/i,
  has_k2: /\bk2\b|\bspice\b|\bsynthetic (marijuana|cannabinoid)s?\b/i,
};

const PANEL_PATTERN = /(\d{1,2})\s*[- ]?panel/i;

// Ordered most-specific first: "CLIA Waived + FDA Cleared" must not be mistaken for a plain "FDA Cleared" ask.
const COMPLIANCE_PATTERNS: [RegExp, ComplianceStatus][] = [
  [/clia[\s-]?waived.{0,20}fda[\s-]?cleared|fda[\s-]?cleared.{0,20}clia[\s-]?waived/i, "CLIA Waived + FDA Cleared"],
  [/clia[\s-]?waived/i, "CLIA Waived"],
  [/fda[\s-]?cleared/i, "FDA Cleared"],
  [/forensic/i, "Forensic Use Only"],
];

const STOPWORDS = new Set([
  "a", "an", "the", "for", "and", "or", "with", "of", "to", "in", "on", "is",
  "are", "need", "needs", "want", "wants", "roughly", "what", "whats", "i",
  "we", "our", "my", "some", "any", "please", "can", "you", "get", "me",
  "this", "that", "about", "price", "pricing", "cost", "bulk",
  "test", "tests", "testing", "panel", "panels", "have", "do", "does",
]);

function detectCategory(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return null;
}

function detectPanelCount(query: string): number | null {
  const match = query.match(PANEL_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}

function detectRequiredFlags(query: string): SubstanceFlag[] {
  const flags = (Object.keys(SUBSTANCE_PATTERNS) as SubstanceFlag[]).filter((flag) =>
    SUBSTANCE_PATTERNS[flag].test(query)
  );
  // has_alcohol (breathalyzers) and has_etg (urine-based alcohol-abstinence
  // monitoring) never co-occur in the catalog. A query like "alcohol abstinence
  // monitoring using ETG" legitimately mentions both words but means the ETG
  // product line — ANDing both flags as hard filters would always return zero
  // results, so ETG (the more specific term) wins.
  if (flags.includes("has_etg") && flags.includes("has_alcohol")) {
    return flags.filter((f) => f !== "has_alcohol");
  }
  return flags;
}

function detectCompliance(query: string): ComplianceStatus | null {
  for (const [pattern, status] of COMPLIANCE_PATTERNS) {
    if (pattern.test(query)) return status;
  }
  return null;
}

function detectQuantity(query: string, panelCount: number | null): number | null {
  // Strip the panel-count mention first so "12-panel" isn't mistaken for a quantity of 12.
  const withoutPanel = panelCount !== null ? query.replace(PANEL_PATTERN, "") : query;
  const numbers = [...withoutPanel.matchAll(/\b(\d{2,6})\b/g)].map((m) => parseInt(m[1], 10));
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 2 && !STOPWORDS.has(tok));
}

export function parseIntent(query: string): ParsedIntent {
  const panelCount = detectPanelCount(query);
  return {
    query,
    category: detectCategory(query),
    panelCount,
    requiredFlags: detectRequiredFlags(query),
    compliancePreference: detectCompliance(query),
    quantity: detectQuantity(query, panelCount),
    keywords: extractKeywords(query),
  };
}

/** Does a product's compliance_status satisfy a buyer's requested compliance status? */
function satisfiesCompliance(product: Product, requested: ComplianceStatus): boolean {
  if (requested === "CLIA Waived + FDA Cleared") {
    return product.compliance_status === "CLIA Waived + FDA Cleared";
  }
  if (requested === "CLIA Waived") {
    return (
      product.compliance_status === "CLIA Waived" ||
      product.compliance_status === "CLIA Waived + FDA Cleared"
    );
  }
  if (requested === "FDA Cleared") {
    return (
      product.compliance_status === "FDA Cleared" ||
      product.compliance_status === "CLIA Waived + FDA Cleared"
    );
  }
  // "Forensic Use Only" and any other exact status: require an exact match.
  // "Not Specified" never satisfies an explicit compliance request — unknown is not a match.
  return product.compliance_status === requested;
}

function applyHardFilters(intent: ParsedIntent, opts: { ignorePanel?: boolean } = {}): Product[] {
  return CATALOG.filter((p) => {
    if (intent.category && p.category !== intent.category) return false;
    if (!opts.ignorePanel && intent.panelCount !== null && p.panels !== intent.panelCount) return false;
    if (intent.requiredFlags.some((flag) => !p[flag])) return false;
    if (intent.compliancePreference && !satisfiesCompliance(p, intent.compliancePreference)) return false;
    return true;
  });
}

export function quotePrice(product: Product, quantity: number | null): PriceQuote | null {
  if (quantity === null || product.price_tiers.length === 0) return null;
  const sorted = [...product.price_tiers].sort((a, b) => a.min_qty - b.min_qty);
  const eligible = sorted.filter((t) => t.min_qty <= quantity);
  if (eligible.length > 0) {
    return { tier: eligible[eligible.length - 1], belowMinimum: false };
  }
  return { tier: sorted[0], belowMinimum: true };
}

function scoreProduct(product: Product, intent: ParsedIntent): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];

  if (intent.category && product.category === intent.category) {
    score += 3;
    matchedOn.push(`category:${product.category}`);
  }
  if (intent.panelCount !== null && product.panels === intent.panelCount) {
    score += 3;
    matchedOn.push(`panels:${product.panels}`);
  }
  for (const flag of intent.requiredFlags) {
    if (product[flag]) {
      score += 4;
      matchedOn.push(flag);
    }
  }
  if (intent.compliancePreference && satisfiesCompliance(product, intent.compliancePreference)) {
    score += 2;
    matchedOn.push(`compliance:${product.compliance_status}`);
  }

  const haystack = `${product.name} ${product.drugs_tested}`.toLowerCase();
  for (const kw of intent.keywords) {
    if (haystack.includes(kw)) {
      score += 1;
      matchedOn.push(`keyword:${kw}`);
    }
  }

  return { score, matchedOn };
}

function toScoredProducts(products: Product[], intent: ParsedIntent): ScoredProduct[] {
  return products
    .map((product) => {
      const { score, matchedOn } = scoreProduct(product, intent);
      return {
        product,
        score,
        matchedOn,
        priceQuote: quotePrice(product, intent.quantity),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function retrieve(query: string): RetrievalResult {
  const intent = parseIntent(query);
  let filtered = applyHardFilters(intent);

  // If category was the ONLY hard filter that applied (no panel/substance/
  // compliance signal), a query naming a specific, unsupported substance
  // (e.g. "saliva test for steroids" — steroids isn't a flag we track) would
  // otherwise return every product in that category as a false "match",
  // since the category itself always satisfies the hard filter. Require that
  // at least one candidate's name/drugs_tested actually mentions whatever
  // else the buyer named, or treat it as no match instead.
  const isCategoryOnlyFilter =
    intent.category !== null &&
    intent.panelCount === null &&
    intent.requiredFlags.length === 0 &&
    intent.compliancePreference === null;
  if (isCategoryOnlyFilter) {
    const specificKeywords = intent.keywords.filter((k) => !CATEGORY_ONLY_KEYWORDS.has(k));
    if (specificKeywords.length > 0) {
      const anyRelevant = filtered.some((p) => {
        const haystack = `${p.name} ${p.drugs_tested}`.toLowerCase();
        return specificKeywords.some((k) => haystack.includes(k));
      });
      if (!anyRelevant) filtered = [];
    }
  }

  // A score of 0 means nothing about the query actually matched this product —
  // without this, a query with no detected signal (no category/panel/flags/
  // compliance/keyword overlap) would fall through applyHardFilters' no-op
  // filter and return the entire catalog as if it were a match.
  const scored = toScoredProducts(filtered, intent).filter((m) => m.score > 0);

  if (scored.length > 0) {
    return { intent, matches: scored, nearMisses: [] };
  }

  // No exact match: relax the panel-count filter only, so we can honestly
  // surface the closest catalog options instead of fabricating a match.
  const relaxed = intent.panelCount !== null ? applyHardFilters(intent, { ignorePanel: true }) : [];
  const relaxedScored = toScoredProducts(relaxed, intent).filter((m) => m.score > 0);

  return { intent, matches: [], nearMisses: relaxedScored.slice(0, 3) };
}

export function getCatalog(): Product[] {
  return CATALOG;
}
