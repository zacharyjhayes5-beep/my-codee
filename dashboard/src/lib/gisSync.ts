/**
 * Pulling GIS leads from the ingestion Worker into the local dashboard.
 *
 * The Worker is an upstream *source*, not the application's database. Leads
 * arrive, are turned into ordinary Prospect records through the same
 * `normalizeProspect` seam everything else uses, and from that point on they
 * are indistinguishable from a household typed in by hand. Nothing about the
 * existing storage, rules, queue or backup changes.
 *
 * The read and the acknowledgement are two separate calls on purpose. The
 * server only marks a lead as taken after the records are committed locally,
 * so a sync that dies halfway leaves them unsynced and they arrive again next
 * time rather than being silently lost.
 */

import type { Prospect } from "../types";
import { blankProspect, normalizeProspect } from "./prospectSchema";
import { today } from "./storage";

export interface GisLead {
  id: string;
  pnum: string;
  govt_unit: string;
  owner_raw: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  owner_address: string | null;
  owner_city: string | null;
  owner_zip: string | null;
  acreage: number | null;
  reason: string;
  created_at: string;
}

export interface SyncSettings {
  /** Base URL of the Worker, e.g. https://gis-ingest.example.workers.dev */
  endpoint: string;
  token: string;
}

export interface SyncResult {
  fetched: number;
  added: number;
  duplicates: number;
  acknowledged: number;
}

export class GisSyncError extends Error {}

const UNIT_NAMES: Record<string, string> = {
  "11": "Ada",
  "18": "Cascade",
  "44": "East Grand Rapids",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Ne|Nw|Se|Sw)\b/g, (m) => m.toUpperCase());
}

/**
 * Turn one GIS lead into a Prospect.
 *
 * Only what the county actually supplies is filled in. There is no phone and
 * no email, so those stay empty and `needsPhoneNumber` is set — which is what
 * puts the household in the research queue and makes the Leads table read
 * "Needs research" rather than implying it is ready to call.
 */
export function prospectFromLead(lead: GisLead): Prospect {
  const city = titleCase((lead.property_city ?? "").trim());
  const area = city ? `${city}, MI` : (UNIT_NAMES[lead.govt_unit] ?? "");

  return normalizeProspect({
    ...blankProspect(),
    name: titleCase(lead.owner_raw),
    area,
    address: {
      line1: titleCase((lead.property_address ?? "").trim()),
      city,
      // The property's own state and postcode. The owner's mailing postcode is a
      // different field and often a different state — an East Grand Rapids house
      // in this dataset is owned from Florida.
      state: (lead.property_state ?? "MI").trim() || "MI",
      zip: (lead.property_zip ?? "").trim(),
    },
    stage: "New",
    stageSource: "manual",
    source: "gis",
    parcelId: lead.pnum,
    leadSource: "Kent County GIS",
    // Honest provenance, and the reason it needs work before it can be called.
    whyTheyFit:
      lead.reason === "owner-change"
        ? `Kent County parcel ${lead.pnum} changed hands.`
        : `Kent County residential parcel ${lead.pnum}.`,
    needsPhoneNumber: true,
    createdAt: today(),
    updatedAt: today(),
  });
}

async function call(settings: SyncSettings, path: string, init?: RequestInit): Promise<unknown> {
  const base = settings.endpoint.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${settings.token}`,
        "content-type": "application/json",
      },
    });
  } catch (cause) {
    throw new GisSyncError(`Could not reach the lead service: ${String(cause)}`);
  }

  if (response.status === 401) {
    throw new GisSyncError("The lead service rejected the access token.");
  }
  if (!response.ok) {
    throw new GisSyncError(`The lead service returned HTTP ${response.status}.`);
  }
  return response.json();
}

export async function fetchNewLeads(settings: SyncSettings): Promise<GisLead[]> {
  const body = (await call(settings, "/leads")) as { leads?: GisLead[] };
  return body.leads ?? [];
}

export async function acknowledgeLeads(
  settings: SyncSettings,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const body = (await call(settings, "/leads/ack", {
    method: "POST",
    body: JSON.stringify({ ids }),
  })) as { acknowledged?: number };
  return body.acknowledged ?? 0;
}

/**
 * Merge freshly fetched leads into the households already held locally.
 *
 * Parcel number is the identity. The server ledger already guarantees a parcel
 * is not surfaced twice, but a restored backup or a re-run against a database
 * that was reset could still present one, so the same check is made here. A
 * lead whose parcel is already known is counted and dropped.
 */
export function mergeLeads(
  existing: Prospect[],
  leads: GisLead[],
): { next: Prospect[]; added: Prospect[]; duplicates: GisLead[] } {
  const known = new Set(existing.map((p) => p.parcelId).filter(Boolean));
  const added: Prospect[] = [];
  const duplicates: GisLead[] = [];

  for (const lead of leads) {
    if (known.has(lead.pnum)) {
      duplicates.push(lead);
      continue;
    }
    known.add(lead.pnum);
    added.push(prospectFromLead(lead));
  }

  return { next: [...existing, ...added], added, duplicates };
}

/* ---------------------------------------------------------------------------
   Where the connection settings live

   Deliberately *not* under the `fb-dashboard:` prefix that the repository and
   the backup file use. Backups sweep that prefix wholesale, and an exported
   backup carrying a live API token would hand whoever opened the file access
   to the lead service. The endpoint is not secret; the token is, so neither is
   allowed into a backup.

   This is the one place outside the repository that touches localStorage, and
   it does so precisely because these values must be excluded from it.
   --------------------------------------------------------------------------- */

const ENDPOINT_KEY = "gis-sync-endpoint";
const TOKEN_KEY = "gis-sync-token";

export function readSyncSettings(): SyncSettings | null {
  try {
    const endpoint = window.localStorage.getItem(ENDPOINT_KEY) ?? "";
    const token = window.localStorage.getItem(TOKEN_KEY) ?? "";
    return endpoint && token ? { endpoint, token } : null;
  } catch {
    return null;
  }
}

export function writeSyncSettings(settings: SyncSettings): void {
  try {
    window.localStorage.setItem(ENDPOINT_KEY, settings.endpoint.trim());
    window.localStorage.setItem(TOKEN_KEY, settings.token.trim());
  } catch {
    // A browser with storage disabled simply cannot remember the connection.
  }
}

export function clearSyncSettings(): void {
  try {
    window.localStorage.removeItem(ENDPOINT_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do.
  }
}
