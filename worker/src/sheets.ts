/**
 * Mirroring leads into the BSA Lead List spreadsheet.
 *
 * The sheet is a permanent ledger for reading, not a database the application
 * depends on. Everything here is best-effort by design: a failure is recorded
 * and retried, and none of it is allowed to reach the ingestion path.
 *
 * The write goes through an Apps Script Web App bound to the spreadsheet, so
 * no Google credentials exist on this side — only a URL and a shared secret,
 * both Worker secrets. The browser never talks to Google at all.
 */

import { municipalityName } from "./config";
import type { LeadRow } from "./store";

export interface SheetConfig {
  url: string;
  secret: string;
}

/**
 * The configuration, or null when it has not been set up yet.
 *
 * Returning null rather than throwing is deliberate: an unconfigured mirror
 * must be a quiet no-op, never something that can fail a GIS run.
 */
export function readSheetConfig(env: {
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
}): SheetConfig | null {
  const url = (env.SHEETS_WEBHOOK_URL ?? "").trim();
  const secret = (env.SHEETS_WEBHOOK_SECRET ?? "").trim();
  return url && secret ? { url, secret } : null;
}

/**
 * One spreadsheet row.
 *
 * Only what is useful for reading the ledger. Internal identifiers — run ids,
 * sync state, the lead's own primary key — stay out: they mean nothing to a
 * person and the sheet is not a backup of the database.
 *
 * Phone and email are deliberately empty. The county publishes neither, and
 * the researched number lives in the dashboard's local storage which this
 * Worker has no access to. Sending a blank column is honest; inventing one
 * would not be.
 */
export interface SheetRow {
  dateAdded: string;
  ownerName: string;
  propertyAddress: string;
  propertyCity: string;
  mailingAddress: string;
  mailingCity: string;
  municipality: string;
  parcelNumber: string;
  source: string;
  phone: string;
  email: string;
  lastUpdated: string;
}

/** ISO instant to a plain calendar day, which is what a ledger wants. */
function day(iso: string): string {
  return (iso ?? "").slice(0, 10);
}

export function buildSheetRow(lead: LeadRow, now: string): SheetRow {
  return {
    dateAdded: day(lead.created_at),
    ownerName: lead.owner_raw,
    propertyAddress: lead.property_address ?? "",
    propertyCity: [lead.property_city, lead.property_state, lead.property_zip]
      .filter(Boolean)
      .join(" "),
    mailingAddress: lead.owner_address ?? "",
    mailingCity: [lead.owner_city, lead.owner_zip].filter(Boolean).join(" "),
    municipality: municipalityName(lead.govt_unit),
    parcelNumber: lead.pnum,
    source: "Kent County GIS",
    phone: "",
    email: "",
    lastUpdated: day(now),
  };
}

export interface SheetResponse {
  ok: boolean;
  /** Short, safe message for the outbox. Never contains the URL or secret. */
  error?: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Deliver one parcel to the sheet.
 *
 * The Apps Script upserts on parcel number, so sending the same row twice is
 * harmless — which is what makes retrying safe.
 *
 * Errors are reduced to a short message. The URL is a secret and must never
 * reach the outbox, which is queryable through the API.
 */
/** Remove the shared secret from anything that will be stored or logged. */
function redact(message: string, secret: string): string {
  return secret ? message.split(secret).join("***") : message;
}

export async function postSheetRow(
  config: SheetConfig,
  row: SheetRow,
  fetcher: Fetcher = fetch,
): Promise<SheetResponse> {
  let response: Response;
  try {
    response = await fetcher(config.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: config.secret, row }),
    });
  } catch {
    // Deliberately not interpolating the cause: fetch errors can echo the URL.
    return { ok: false, error: "Could not reach the sheet endpoint" };
  }

  if (!response.ok) {
    return { ok: false, error: `Sheet endpoint returned HTTP ${response.status}` };
  }

  let body: { ok?: boolean; error?: string };
  try {
    body = (await response.json()) as { ok?: boolean; error?: string };
  } catch {
    // Apps Script answers HTML when a deployment is misconfigured.
    return { ok: false, error: "Sheet endpoint returned a non-JSON response" };
  }

  if (!body.ok) {
    // The remote message is passed through for troubleshooting, but redacted
    // first: the outbox is readable through the API, so anything echoed back
    // must not be able to publish the shared secret.
    const message = String(body.error ?? "Sheet rejected the row").slice(0, 200);
    return { ok: false, error: redact(message, config.secret) };
  }

  return { ok: true };
}
