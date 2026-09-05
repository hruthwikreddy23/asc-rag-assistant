import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export interface LeadRecord {
  id: string;
  firstName: string;
  mobile: string;
  email: string;
  company: string;
  need: string;
  createdAt: string;
}

const LEADS_FILE = path.join(process.cwd(), "data", "leads.json");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function appendLead(lead: LeadRecord): Promise<void> {
  let existing: LeadRecord[] = [];
  try {
    const raw = await fs.readFile(LEADS_FILE, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    existing = [];
  }
  existing.push(lead);
  await fs.writeFile(LEADS_FILE, JSON.stringify(existing, null, 2), "utf-8");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { firstName, mobile, email, company, need } = (body as Record<string, unknown>) ?? {};
  if (typeof firstName !== "string" || firstName.trim().length === 0) {
    return NextResponse.json({ error: "firstName is required" }, { status: 400 });
  }
  if (typeof mobile !== "string" || mobile.trim().length === 0) {
    return NextResponse.json({ error: "mobile is required" }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return NextResponse.json({ error: "a valid email is required" }, { status: 400 });
  }

  // Mobile is required, but its format/shape is only soft-validated
  // client-side via libphonenumber-js (see components/LeadCaptureInline.tsx)
  // — an implausible-looking number still gets through. Confirming it's a
  // real, reachable number would need an SMS OTP step (e.g. Twilio), out of
  // scope for this demo.
  const lead: LeadRecord = {
    id: randomUUID(),
    firstName: firstName.trim(),
    mobile: mobile.trim(),
    email: email.trim(),
    company: typeof company === "string" ? company.trim() : "",
    need: typeof need === "string" ? need.trim() : "",
    createdAt: new Date().toISOString(),
  };

  // This is a portfolio project: there is no real CRM integration. We log the
  // lead to console and best-effort persist it to a local JSON file. On
  // filesystem-read-only deployments (e.g. serverless), the write is skipped
  // and only the console log + mocked response occur — see README limitations.
  console.log("[MOCK CRM PUSH]", lead);
  try {
    await appendLead(lead);
  } catch (err) {
    console.warn("Could not persist lead to data/leads.json (read-only filesystem?):", err);
  }

  return NextResponse.json({
    success: true,
    leadId: lead.id,
    crm: {
      system: "HubSpot (simulated — no real CRM is connected)",
      status: "queued",
      pushedAt: lead.createdAt,
    },
  });
}
