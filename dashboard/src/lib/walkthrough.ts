import type { Prospect, PropertyProfile } from "../types";
import { blankPropertyProfile } from "./prospectSchema";

/**
 * The walkthrough's areas, and what each one reads off the household.
 *
 * This file is deliberately free of any 3D: it is data and derivation only.
 * The scene imports it, never the other way round, which is what lets the
 * placeholder geometry be swapped for a real GLB without touching any of the
 * interaction logic or any of the panel contents.
 */

export type AreaId = "exterior" | "roof" | "garage" | "interior" | "basement" | "grounds";

/** Where the camera sits, and what it looks at. Metres, y up. */
export interface Waypoint {
  position: [number, number, number];
  target: [number, number, number];
}

export interface Area {
  id: AreaId;
  label: string;
  /** One line under the heading. What this area is for, not what it contains. */
  blurb: string;
  camera: Waypoint;
  /** Where the marker sits on the house. */
  hotspot: [number, number, number];
}

/**
 * The establishing shot. Returning here is always one click away, and it is
 * also where the camera starts.
 */
export const HOME: AreaId = "exterior";

/**
 * The six shots.
 *
 * Interior and Basement are framed from outside the building on purpose. The
 * placeholder is a solid shell standing on a ground plane, so a camera placed
 * indoors sees a closed box and one placed below grade sees the underside of
 * the ground. When a real GLB with an interior and a cutaway arrives, these two
 * are the waypoints to re-aim — and they are the only thing that needs to
 * change, because nothing else in the tab knows where the camera goes.
 */
export const AREAS: Area[] = [
  {
    id: "exterior",
    label: "Exterior",
    blurb: "The dwelling itself — how it is built, and what it would cost to rebuild.",
    camera: { position: [13.5, 6.2, 17.5], target: [-1.6, 1.6, 3.2] },
    hotspot: [0, 2.4, 3.2],
  },
  {
    id: "roof",
    label: "Roof",
    blurb: "Usually the first thing an underwriter asks about, and the first thing to fail.",
    camera: { position: [5.5, 8.6, 6.5], target: [0, 4.1, 0] },
    hotspot: [0, 5.1, 0],
  },
  {
    id: "garage",
    label: "Garage",
    blurb: "What is parked here is often a second policy.",
    camera: { position: [-10.2, 3.6, 9.8], target: [-4.2, 1.2, 1.4] },
    hotspot: [-4.1, 2.5, 2.1],
  },
  {
    id: "interior",
    label: "Interior",
    blurb: "Living space and how it is finished.",
    camera: { position: [3.6, 2.7, 9.2], target: [0.2, 1.7, 3.4] },
    hotspot: [1.5, 1.8, 2.9],
  },
  {
    id: "basement",
    label: "Basement",
    blurb: "Where water gets in, and where the coverage question actually lives.",
    camera: { position: [6.8, 0.85, 8.6], target: [0.4, 0.15, 3.4] },
    hotspot: [2.6, -0.9, 3.0],
  },
  {
    id: "grounds",
    label: "Property",
    blurb: "Everything that is not the house, and still on the policy.",
    camera: { position: [3, 24, 28], target: [1, 0, -2] },
    hotspot: [6.4, 0.35, -3.4],
  },
];

/**
 * The property profile, whatever state the record is in.
 *
 * Normalisation should guarantee this field exists, but a record can reach a
 * component without having been through it — a hand-edited store, a restore
 * that half-finished, an import written directly. This has already cost this
 * app once, when `tags` was undefined on one record and took the whole page
 * down with it. A missing profile reads as "nothing recorded", which is both
 * true and survivable.
 */
export function profileOf(prospect: Prospect): PropertyProfile {
  return prospect.assets?.property ?? blankPropertyProfile();
}

export function areaById(id: AreaId): Area {
  return AREAS.find((a) => a.id === id) ?? AREAS[0];
}

/* ---------------------------------------------------------------------------
   What each area reads
   --------------------------------------------------------------------------- */

/** One line in a panel. `value: null` renders as "Not recorded", never as 0. */
export interface Reading {
  label: string;
  value: string | null;
  /** Longer free text renders as a paragraph rather than a value. */
  prose?: boolean;
  /** The field to write back to, when the panel is editable. */
  field?: keyof PropertyProfile;
  kind?: "text" | "number";
  hint?: string;
}

const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const num = (v: number | null, suffix = "") =>
  v === null ? null : `${v.toLocaleString("en-US")}${suffix}`;
const money = (v: number | null) =>
  v === null ? null : `$${Math.round(v).toLocaleString("en-US")}`;

/**
 * Roof age is derived, never stored.
 *
 * The same reason attempt counts and temperature are derived: a stored age is
 * wrong by next January, and nobody remembers to update it. The year installed
 * is the durable fact.
 */
export function roofAge(p: PropertyProfile, today = new Date()): number | null {
  const year = Number.parseInt(p.roofYearInstalled, 10);
  if (!Number.isFinite(year) || year < 1850 || year > today.getFullYear() + 1) return null;
  return Math.max(0, today.getFullYear() - year);
}

export function readingsFor(area: AreaId, prospect: Prospect, today = new Date()): Reading[] {
  const a = prospect.assets ?? ({} as Prospect["assets"]);
  const p = profileOf(prospect);

  switch (area) {
    case "exterior":
      return [
        { label: "Year built", value: text(a.yearBuilt), hint: "From the county record" },
        { label: "Construction type", value: text(p.constructionType), field: "constructionType" },
        { label: "Exterior material", value: text(p.exteriorMaterial), field: "exteriorMaterial" },
        { label: "Square footage", value: num(p.squareFeet, " sq ft"), field: "squareFeet", kind: "number" },
        {
          label: "Dwelling replacement cost",
          value: money(p.dwellingReplacementCost),
          field: "dwellingReplacementCost",
          kind: "number",
          hint: "Cost to rebuild — not market value",
        },
      ];

    case "roof": {
      const age = roofAge(p, today);
      return [
        { label: "Year installed", value: text(p.roofYearInstalled), field: "roofYearInstalled" },
        {
          label: "Age",
          value: age === null ? null : `${age} ${age === 1 ? "year" : "years"}`,
          hint: "Derived from the year installed",
        },
        { label: "Material", value: text(p.roofMaterial), field: "roofMaterial" },
        { label: "Replacement concerns", value: text(p.roofConcerns), field: "roofConcerns", prose: true },
        { label: "Underwriting flags", value: text(p.underwritingFlags), field: "underwritingFlags", prose: true },
      ];
    }

    case "garage":
      return [
        { label: "Attached or detached", value: text(p.garageType), field: "garageType" },
        { label: "Stalls", value: num(p.garageStalls), field: "garageStalls", kind: "number" },
        { label: "Vehicles", value: text(a.vehicles), prose: true, hint: "From the household's indicators" },
        { label: "Cross-sell", value: crossSell(prospect), prose: true, hint: "Derived from what they own" },
      ];

    case "interior":
      return [
        { label: "Square footage", value: num(p.squareFeet, " sq ft"), field: "squareFeet", kind: "number" },
        { label: "Construction type", value: text(p.constructionType), field: "constructionType" },
        { label: "Property type", value: text(a.propertyType) },
        { label: "Ownership", value: a.ownership ? (a.ownership === "owner" ? "Owner" : "Renter") : null },
      ];

    case "basement":
      return [
        { label: "Type", value: text(p.basementType), field: "basementType" },
        {
          label: "Finished",
          value: p.basementFinishedPct === null ? null : `${p.basementFinishedPct}%`,
          field: "basementFinishedPct",
          kind: "number",
        },
        {
          label: "Water backup",
          value: text(p.waterBackupNotes),
          field: "waterBackupNotes",
          prose: true,
          hint: "Sump, backup valve, prior loss, hydrostatic pressure",
        },
      ];

    case "grounds":
      return [
        { label: "Acreage", value: num(p.acreage, " acres"), field: "acreage", kind: "number" },
        { label: "Pool", value: text(p.pool), field: "pool" },
        {
          label: "Other structures",
          value: text(p.otherStructures),
          field: "otherStructures",
          prose: true,
          hint: "Sheds, barns, outbuildings, fencing",
        },
        { label: "Lakefront", value: a.lakefront ? "Yes" : null },
      ];
  }
}

/**
 * What else this household plausibly needs, from what they already own.
 *
 * Derived and phrased as an opportunity, never as a fact about their coverage —
 * the indicators behind it are research, not policy data.
 */
export function crossSell(prospect: Prospect): string | null {
  const a = prospect.assets;
  if (!a) return null;
  const out: string[] = [];
  if (a.boat) out.push("boat");
  if (a.rv) out.push("RV or motorhome");
  const rec = text(a.recreational);
  if (rec) out.push(rec);
  if (a.secondHome) out.push("second home");
  const biz = text(a.businessOwnership);
  if (biz) out.push(`business — ${biz}`);
  if (!out.length) return null;
  return `Worth asking about: ${out.join(", ")}.`;
}

/** How much of an area has actually been filled in. Drives the nav rail. */
export function recordedCount(area: AreaId, prospect: Prospect): { filled: number; total: number } {
  const rs = readingsFor(area, prospect);
  return { filled: rs.filter((r) => r.value !== null).length, total: rs.length };
}
