"use client";

import { useState } from "react";
import { X } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import { isValidPhoneNumber } from "libphonenumber-js";
import "react-phone-number-input/style.css";

interface LeadResponse {
  success: boolean;
  leadId: string;
  crm: { system: string; status: string; pushedAt: string };
}

interface LeadCaptureInlineProps {
  /** Conversation context sent silently with the lead — never shown/edited by the user. */
  need: string;
}

export default function LeadCaptureInline({ need }: LeadCaptureInlineProps) {
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LeadResponse | null>(null);

  if (dismissed) return null;

  // Soft validation only: libphonenumber-js checks that the number's shape
  // (length, digit pattern) is plausible for the selected country. It cannot
  // confirm the number is real or reachable — that would require an SMS OTP
  // step (e.g. Twilio), which is out of scope for this demo. The hint below
  // never blocks submission.
  const phoneLooksInvalid = !!phone && !isValidPhoneNumber(phone);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, mobile: phone ?? "", email, company, need }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="lead-inline lead-inline-success">
        <strong>You&rsquo;re all set</strong>
        <p>
          Lead <code>{result.leadId}</code> queued in {result.crm.system} at{" "}
          {new Date(result.crm.pushedAt).toLocaleString()}. (No real CRM is connected — this is a
          mocked step for demonstration.)
        </p>
      </div>
    );
  }

  return (
    <div className="lead-inline">
      <button className="lead-inline-close" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <X size={16} />
      </button>

      <form onSubmit={handleSubmit}>
        <p className="lead-inline-title">Share your contact info</p>
        <p className="lead-inline-subtitle">
          Optional — the team will follow up. This is a simulated step; no real CRM is connected.
        </p>

        <label>
          First name
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </label>

        <label>
          Mobile number
          <PhoneInput
            international
            defaultCountry="US"
            value={phone}
            onChange={setPhone}
            className="phone-input"
            required
          />
          {phoneLooksInvalid && (
            <span className="field-hint">This doesn&rsquo;t look like a valid phone number — please double-check.</span>
          )}
        </label>

        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label>
          Company <span className="optional-tag">(optional)</span>
          <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>

        {error && <p className="modal-error">{error}</p>}

        <div className="lead-inline-actions">
          <button type="button" className="modal-secondary-button" onClick={() => setDismissed(true)} disabled={submitting}>
            Skip
          </button>
          <button type="submit" className="modal-primary-button" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
