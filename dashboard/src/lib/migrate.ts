import type { LineId, PolicyLine, Prospect, ProspectStatus } from "../types";
import { defaultPolicyLines } from "./defaultData";
import { newId, readJson, today } from "./storage";

/* Shapes written by the first version of the dashboard. */
interface LegacyLine {
  id: string;
  policyCount?: number;
  premium?: number;
}

interface LegacyLead {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: string;
  line?: string;
  notes?: string;
  createdAt?: string;
}

const LEGACY_LINES_KEY = "fb-dashboard:lines";
const LEGACY_LEADS_KEY = "fb-dashboard:leads";

export const LINES_KEY = "fb-dashboard:lines:v2";
export const PROSPECTS_KEY = "fb-dashboard:prospects";

/**
 * Carry counts forward from the first version while taking names and goals
 * from the current defaults. Lines that no longer exist are dropped.
 */
export function migratedLines(): PolicyLine[] {
  const legacy = readJson<LegacyLine[]>(LEGACY_LINES_KEY);
  if (!Array.isArray(legacy)) return defaultPolicyLines;

  return defaultPolicyLines.map((line) => {
    const old = legacy.find((l) => l?.id === line.id);
    if (!old) return line;
    return {
      ...line,
      policyCount: Number(old.policyCount) || 0,
      premium: Number(old.premium) || 0,
    };
  });
}

const legacyStatusMap: Record<string, ProspectStatus> = {
  New: "New",
  Contacted: "Contacted",
  Quoted: "Open to Quote",
  Sold: "Closed",
  Lost: "Lost",
};

export function migratedProspects(): Prospect[] {
  const legacy = readJson<LegacyLead[]>(LEGACY_LEADS_KEY);
  if (!Array.isArray(legacy)) return [];

  return legacy.map((lead) => {
    const created = lead.createdAt || today();
    const line = lead.line as LineId | undefined;
    return {
      id: lead.id || newId(),
      name: lead.name || "Untitled",
      status: legacyStatusMap[lead.status ?? ""] ?? "New",
      lines: line && ["property", "casualty", "life"].includes(line) ? [line] : [],
      area: "",
      phone: lead.phone || "",
      email: lead.email || "",
      nextStep: "",
      notes: lead.notes
        ? [
            {
              id: newId(),
              date: created,
              title: "Imported note",
              body: lead.notes,
              source: "manual" as const,
            },
          ]
        : [],
      createdAt: created,
      updatedAt: created,
    };
  });
}
