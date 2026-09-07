"use client";

import { useState } from "react";
import { X, RotateCcw } from "lucide-react";

// Real pricing: Claude Sonnet at $2/M input tokens, $10/M output tokens,
// blended across a typical multi-turn product-finder conversation.
const COST_PER_CONVO = 0.0175;
// Of buyers who'd otherwise wait for a "specialist will email you" callback,
// assume roughly half are still actively evaluating a purchase.
const BUYING_SHARE = 0.5;

type Hosting = "aws" | "standalone";

const DEFAULTS = {
  inquiries: 500,
  staffRate: 20,
  deflectionPct: 75,
  staffMinutes: 8,
  recoveryPct: 3,
  avgOrderValue: 300,
  hosting: "aws" as Hosting,
};

function currency(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function RoiCalculator({ onClose }: { onClose: () => void }) {
  const [inquiries, setInquiries] = useState(DEFAULTS.inquiries);
  const [staffRate, setStaffRate] = useState(DEFAULTS.staffRate);
  const [deflectionPct, setDeflectionPct] = useState(DEFAULTS.deflectionPct);
  const [staffMinutes, setStaffMinutes] = useState(DEFAULTS.staffMinutes);
  const [recoveryPct, setRecoveryPct] = useState(DEFAULTS.recoveryPct);
  const [avgOrderValue, setAvgOrderValue] = useState(DEFAULTS.avgOrderValue);
  const [hosting, setHosting] = useState<Hosting>(DEFAULTS.hosting);

  function resetToDefaults() {
    setInquiries(DEFAULTS.inquiries);
    setStaffRate(DEFAULTS.staffRate);
    setDeflectionPct(DEFAULTS.deflectionPct);
    setStaffMinutes(DEFAULTS.staffMinutes);
    setRecoveryPct(DEFAULTS.recoveryPct);
    setAvgOrderValue(DEFAULTS.avgOrderValue);
    setHosting(DEFAULTS.hosting);
  }

  const hostingCostMonth = hosting === "aws" ? 3 : 20;
  const llmCostMonth = inquiries * COST_PER_CONVO;
  const runCostMonth = llmCostMonth + hostingCostMonth;
  const deflected = inquiries * (deflectionPct / 100);
  const staffHoursMonth = deflected * (staffMinutes / 60);
  const staffValueMonth = staffHoursMonth * staffRate;
  const netYear = (staffValueMonth - runCostMonth) * 12;
  const roi = runCostMonth > 0 ? (staffValueMonth * 12) / (runCostMonth * 12) : 0;
  const costPerHumanAnswer = staffRate * (staffMinutes / 60);
  const revenueMonth = inquiries * BUYING_SHARE * (recoveryPct / 100) * avgOrderValue;
  const revenueYear = revenueMonth * 12;

  return (
    <div className="roi-calculator">
      <div className="roi-header">
        <div>
          <h2>What this assistant is worth</h2>
          <p>
            Every input is adjustable. Cost-to-run figures use real API pricing; savings
            figures are assumptions you can change — these are not ASC&rsquo;s actual numbers.
          </p>
        </div>
        <button className="roi-close" onClick={onClose} aria-label="Close ROI calculator">
          <X size={18} />
        </button>
      </div>

      <div className="roi-stat-grid">
        <div className="roi-stat-card">
          <span className="roi-stat-label">Cost per answer (assistant)</span>
          <span className="roi-stat-value">{currency(COST_PER_CONVO, 4)}</span>
        </div>
        <div className="roi-stat-card">
          <span className="roi-stat-label">Cost per answer (staff time)</span>
          <span className="roi-stat-value">{currency(costPerHumanAnswer, 2)}</span>
        </div>
        <div className="roi-stat-card roi-stat-highlight">
          <span className="roi-stat-label">Net value / year (staff time alone)</span>
          <span className="roi-stat-value">{currency(netYear, 0)}</span>
        </div>
      </div>

      <div className="roi-section">
        <span className="roi-section-label">Hosting — ASC runs on their own AWS</span>
        <div className="roi-hosting-toggle">
          <button
            type="button"
            className={`roi-toggle-btn${hosting === "aws" ? " roi-toggle-btn-active" : ""}`}
            onClick={() => setHosting("aws")}
          >
            On AWS (eg: Lambda/container) — ~$3/mo
          </button>
          <button
            type="button"
            className={`roi-toggle-btn${hosting === "standalone" ? " roi-toggle-btn-active" : ""}`}
            onClick={() => setHosting("standalone")}
          >
            Standalone service — $20/mo (comparison only)
          </button>
        </div>
      </div>

      <div className="roi-sliders">
        <SliderRow
          label="Inquiries per month"
          value={inquiries}
          min={100}
          max={5000}
          step={50}
          onChange={setInquiries}
        />
        <SliderRow
          label="Loaded staff cost / hour"
          value={staffRate}
          min={15}
          max={60}
          step={1}
          prefix="$"
          onChange={setStaffRate}
        />
        <SliderRow
          label="Deflection rate"
          value={deflectionPct}
          min={20}
          max={90}
          step={1}
          suffix="%"
          onChange={setDeflectionPct}
        />
        <SliderRow
          label="Avg staff time per inquiry"
          value={staffMinutes}
          min={3}
          max={20}
          step={1}
          suffix=" min"
          onChange={setStaffMinutes}
        />
        <SliderRow
          label="Revenue recovery rate"
          value={recoveryPct}
          min={0}
          max={10}
          step={0.5}
          suffix="%"
          onChange={setRecoveryPct}
        />
        <SliderRow
          label="Avg order value"
          value={avgOrderValue}
          min={100}
          max={1000}
          step={10}
          prefix="$"
          onChange={setAvgOrderValue}
        />
      </div>

      <button type="button" className="roi-reset-button" onClick={resetToDefaults}>
        <RotateCcw size={14} />
        Reset to defaults
      </button>

      <div className="roi-results">
        <span className="roi-section-label">Live results</span>
        <dl className="roi-results-grid">
          <div>
            <dt>LLM cost/mo</dt>
            <dd>{currency(llmCostMonth, 2)}</dd>
          </div>
          <div>
            <dt>Hosting/mo</dt>
            <dd>{currency(hostingCostMonth, 0)}</dd>
          </div>
          <div>
            <dt>Total run cost/mo</dt>
            <dd>{currency(runCostMonth, 2)}</dd>
          </div>
          <div>
            <dt>Inquiries deflected/mo</dt>
            <dd>{Math.round(deflected).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Staff hours freed/mo</dt>
            <dd>{staffHoursMonth.toFixed(1)} hrs</dd>
          </div>
          <div>
            <dt>Staff-time value/mo</dt>
            <dd>{currency(staffValueMonth, 2)}</dd>
          </div>
        </dl>

        <div className="roi-headline">
          <div>
            <span className="roi-headline-label">Net value / year</span>
            <span className="roi-headline-value">{currency(netYear, 0)}</span>
          </div>
          <div>
            <span className="roi-headline-label">ROI multiple</span>
            <span className="roi-headline-value">{roi.toFixed(1)}×</span>
          </div>
        </div>
      </div>

      <div className="roi-upside">
        <span className="roi-upside-label">Softer — treat as upside</span>
        <p>
          If it recovers {recoveryPct}% of high-intent buyers who&rsquo;d otherwise wait for a
          callback: <strong>+{currency(revenueYear, 0)}/yr</strong> on top. Least certain input —
          replace with ASC&rsquo;s real data.
        </p>
      </div>

      <p className="roi-footnote">
        This assistant deploys into ASC&rsquo;s existing AWS environment — the chat widget
        embeds in the Shopify site, and the backend runs as a Lambda function or container
        inside your own AWS account, under your own security and audit controls. Incremental
        hosting is negligible (a few dollars/month, folded into existing infrastructure); the
        only real ongoing cost is Claude API usage at ~1.8¢ per conversation. The
        &ldquo;standalone service&rdquo; option is shown only for comparison. Savings inputs
        are industry-typical placeholders, not ASC figures. Independent portfolio model.
      </p>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  prefix = "",
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="roi-slider-row">
      <div className="roi-slider-label-row">
        <span>{label}</span>
        <span className="roi-slider-value">
          {prefix}
          {value.toLocaleString()}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
