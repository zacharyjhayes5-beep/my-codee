import type { LineId, PolicyLine, Prospect, ProspectStatus } from "../types";
import { defaultPolicyLines } from "./defaultData";
import { newId, readJson, today } from "./storage";

/* Shapes written by the first version of the dashboard. */
interface LegacyLine {
  id: string;
  policyGoal?: number;
  premiumGoal?: number;
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

const LEGACY_LINES_KEY = "fb-dashboard:lines:v2";
const LEGACY_LEADS_KEY = "fb-dashboard:leads";

export const LINES_KEY = "fb-dashboard:lines:v3";
export const PROSPECTS_KEY = "fb-dashboard:prospects";
export const ENTRIES_KEY = "fb-dashboard:policies";

/**
 * Policy counts now come from the book of business, so only the goals carry
 * forward from the previous shape.
 */
export function migratedLines(): PolicyLine[] {
  const legacy = readJson<LegacyLine[]>(LEGACY_LINES_KEY);
  if (!Array.isArray(legacy)) return defaultPolicyLines;

  return defaultPolicyLines.map((line) => {
    const old = legacy.find((l) => l?.id === line.id);
    if (!old) return line;
    return {
      ...line,
      policyGoal: Number(old.policyGoal) || line.policyGoal,
      premiumGoal: Number(old.premiumGoal) || line.premiumGoal,
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
