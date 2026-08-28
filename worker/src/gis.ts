/**
 * Reading parcels out of the Kent County ArcGIS service.
 *
 * The service is public — no key, no login — and returns at most 1000 features
 * per request, so every query is paged with resultOffset until it stops
 * reporting exceededTransferLimit.
 *
 * Any failed page throws. That is deliberate: a partial scan must never reach
 * the ledger, because a parcel missing from a truncated read would look like a
 * parcel that no longer exists.
 */

import {
  GIS_LAYER_URL,
  MAX_PAGES,
  PAGE_SIZE,
  PROPERTY_CLASS,
  UNIT_CODES,
} from "./config";
import type { GisAttributes } from "./normalize";

const OUT_FIELDS = [
  "PNUM",
  "OWNERNAME1",
  "OWNERNAME2",
  "OWNERADDRESS",
  "OWNERCITY",
  "OWNERZIPCODE",
  "PROPERTYADDRESS",
  "PROPADDRESSCITY",
  "PROPADDRESSSTATE_ZIPCODE",
  "PROPERTYCLASS",
  "GOVERNMENTALUNIT",
  "ACREAGE",
].join(",");

export class GisError extends Error {}

/** Both filter fields are string columns, so the values are quoted. */
export function whereClause(units: readonly string[] = UNIT_CODES): string {
  const list = units.map((u) => `'${u}'`).join(",");
  return `PROPERTYCLASS='${PROPERTY_CLASS}' AND GOVERNMENTALUNIT IN (${list})`;
}

export function pageUrl(offset: number, units: readonly string[] = UNIT_CODES): string {
  const params = new URLSearchParams({
    where: whereClause(units),
    outFields: OUT_FIELDS,
    returnGeometry: "false",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
    // Without an explicit order the service does not guarantee a stable window
    // across pages, which can drop or repeat rows near page boundaries.
    orderByFields: "PNUM",
    f: "json",
  });
  return `${GIS_LAYER_URL}?${params.toString()}`;
}

interface GisPage {
  features?: { attributes: GisAttributes }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; details?: string[] };
}

export type Fetcher = (url: string) => Promise<Response>;

/**
 * Fetch every matching parcel, following pagination to the end.
 *
 * `fetcher` is injected so the paging logic can be tested without touching the
 * network.
 */
export async function fetchAllParcels(
  fetcher: Fetcher = fetch,
  units: readonly string[] = UNIT_CODES,
): Promise<GisAttributes[]> {
  const all: GisAttributes[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = pageUrl(page * PAGE_SIZE, units);
    let response: Response;
    try {
      response = await fetcher(url);
    } catch (cause) {
      throw new GisError(`GIS request failed on page ${page}: ${String(cause)}`);
    }

    if (!response.ok) {
      throw new GisError(`GIS returned HTTP ${response.status} on page ${page}`);
    }

    let body: GisPage;
    try {
      body = (await response.json()) as GisPage;
    } catch (cause) {
      throw new GisError(`GIS returned unreadable JSON on page ${page}: ${String(cause)}`);
    }

    // ArcGIS reports query errors in a 200 response body, so status is not enough.
    if (body.error) {
      throw new GisError(`GIS error on page ${page}: ${body.error.message ?? "unknown"}`);
    }

    const features = body.features ?? [];

    // A complete residential scan has thousands of rows. The county service
    // occasionally returns a successful-looking empty first page; accepting
    // that response creates a false "ok" run with zero leads. Treat it as a
    // transient source failure so the ledger stays untouched and the run is
    // visibly retryable.
    if (page === 0 && features.length === 0) {
      throw new GisError("GIS returned an empty first page; refusing a false successful scan");
    }

    for (const f of features) all.push(f.attributes);

    if (!body.exceededTransferLimit || features.length === 0) return all;
  }

  throw new GisError(`GIS paging exceeded ${MAX_PAGES} pages; aborting rather than looping`);
}
