export interface PriceTier {
  min_qty: number;
  price_each: number;
}

export type ComplianceStatus =
  | "CLIA Waived + FDA Cleared"
  | "CLIA Waived"
  | "FDA Cleared"
  | "Forensic Use Only"
  | "Not Specified";

export interface Product {
  name: string;
  category: string;
  panels: number | null;
  drugs_tested: string;
  compliance_status: ComplianceStatus | string;
  has_fentanyl: boolean;
  has_alcohol: boolean;
  has_etg: boolean;
  has_k2: boolean;
  base_price: number;
  price_tiers: PriceTier[];
  case_size: string | null;
  sku: string | null;
  units_available: number | null;
  offers: string[];
  url: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface QuotedPrice {
  quantity: number;
  pricePerUnit: number;
  belowMinimum: boolean;
}

export type LeadCaptureReason = "quote" | "agent_request" | "near_miss" | null;

export interface UiChatMessage extends ChatMessage {
  products?: ProductCardData[];
  isNearMiss?: boolean;
  refused?: boolean;
  /** When true, an inline contact-info block renders below this message. */
  promptLeadCapture?: boolean;
  leadCaptureReason?: LeadCaptureReason;
  /** The user query that triggered this offer — sent silently with the lead, never shown/edited. */
  leadCaptureContext?: string;
}

export interface ProductCardData {
  name: string;
  category: string;
  panels: number | null;
  drugsTested: string;
  complianceStatus: string;
  url: string;
  priceTiers: PriceTier[];
  basePrice: number;
  quotedPrice: QuotedPrice | null;
  caseSize: string | null;
  unitsAvailable: number | null;
  offers: string[];
}
