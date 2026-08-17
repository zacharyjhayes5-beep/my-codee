/**
 * Turning raw GIS attributes into stable values.
 *
 * Two things have to be exactly right here, because the whole ledger rests on
 * them:
 *
 *   - the parcel number must normalize identically on every run, or a parcel
 *     is surfaced twice as a "new" lead;
 *   - the owner must normalize identically for the same owner and differently
 *     for a genuine sale, or ownership changes are either missed or invented.
 *
 * GIS pads every string field with trailing spaces, so trimming is not
 * cosmetic — an untrimmed comparison never matches.
 */

export interface GisAttributes {
  PNUM?: string | null;
  OWNERNAME1?: string | null;
  OWNERNAME2?: string | null;
  OWNERADDRESS?: string | null;
  OWNERCITY?: string | null;
  OWNERZIPCODE?: string | null;
  PROPERTYADDRESS?: string | null;
  PROPADDRESSCITY?: string | null;
  PROPERTYCLASS?: string | null;
  GOVERNMENTALUNIT?: string | null;
  ACREAGE?: number | null;
}

export interface ParcelRecord {
  pnum: string;
  govtUnit: string;
  ownerRaw: string;
  ownerNormalized: string;
  propertyAddress: string;
  propertyCity: string;
  ownerAddress: string;
  ownerCity: string;
  ownerZip: string;
  acreage: number | null;
}

/** Collapse internal runs of whitespace and trim the ends. */
export function squash(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Parcel numbers are already formatted consistently; this guards the edges. */
export function normalizePnum(value: string | null | undefined): string {
  return squash(value).toUpperCase();
}

/**
 * The owner identity used for change detection.
 *
 * Both owner name fields are folded in, so a change to either — a spouse
 * added, a trust replacing an individual — reads as a change of ownership.
 * A trailing ampersand is dropped because GIS uses it to mean "continued in
 * OWNERNAME2" rather than as part of the name.
 */
export function normalizeOwner(
  name1: string | null | undefined,
  name2?: string | null | undefined,
): string {
  const clean = (v: string | null | undefined) =>
    squash(v)
      .toUpperCase()
      .replace(/[.,]/g, "")
      .replace(/\s*&\s*$/, "")
      .trim();

  return [clean(name1), clean(name2)].filter(Boolean).join(" & ");
}

/** The name shown to a human. Owner 1 only, tidied. */
export function displayOwner(
  name1: string | null | undefined,
  name2?: string | null | undefined,
): string {
  const a = squash(name1).replace(/\s*&\s*$/, "");
  const b = squash(name2);
  return b ? `${a} & ${b}` : a;
}

/**
 * Build a parcel record, or null when the row lacks the two fields that make
 * it usable. A parcel with no number cannot be deduplicated and a parcel with
 * no owner cannot be classified, so neither is worth carrying forward.
 */
export function toParcelRecord(attrs: GisAttributes): ParcelRecord | null {
  const pnum = normalizePnum(attrs.PNUM);
  const ownerNormalized = normalizeOwner(attrs.OWNERNAME1, attrs.OWNERNAME2);
  if (!pnum || !ownerNormalized) return null;

  return {
    pnum,
    govtUnit: squash(attrs.GOVERNMENTALUNIT),
    ownerRaw: displayOwner(attrs.OWNERNAME1, attrs.OWNERNAME2),
    ownerNormalized,
    propertyAddress: squash(attrs.PROPERTYADDRESS),
    propertyCity: squash(attrs.PROPADDRESSCITY),
    ownerAddress: squash(attrs.OWNERADDRESS),
    ownerCity: squash(attrs.OWNERCITY),
    ownerZip: squash(attrs.OWNERZIPCODE),
    acreage: typeof attrs.ACREAGE === "number" ? attrs.ACREAGE : null,
  };
}

/**
 * A deterministic lead id.
 *
 * Derived from the parcel and the owner, so re-running a failed ingestion
 * produces the same id and the insert is ignored rather than duplicated. A
 * genuine sale changes the owner and therefore yields a different id, which is
 * how the same parcel can legitimately produce a second lead years later.
 */
export function leadId(pnum: string, ownerNormalized: string): string {
  return `${pnum}|${fnv1a(ownerNormalized)}`;
}

/** Small, stable, dependency-free hash. Not cryptographic — it does not need to be. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
