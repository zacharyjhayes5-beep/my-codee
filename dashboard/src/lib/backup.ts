import type {
  AuditEntry,
  Call,
  Opportunity,
  PolicyEntry,
  Prospect,
  ReviewProposal,
  Suggestion,
  Task,
} from "../types";
import { PROSPECT_SCHEMA_VERSION, normalizeProspects } from "./prospectSchema";
import type { CampaignEntry } from "./campaigns";
import type { Meeting } from "../types";
import { LEGACY_RECORD_KEYS, SETTING_KEYS, type RepositorySnapshot, snapshot } from "./repository";

/**
 * Backup file format.
 *
 * - **v1** — a flat dump of every `fb-dashboard:` localStorage key.
 * - **v2** — records, meta and settings separated, once records moved to
 *   IndexedDB.
 * - **v3** — adds the calls, reviews and audit stores, and prospects in the
 *   v4 schema.
 *
 * Every older version still restores. For anyone who exported before a given
 * phase, that file is the only copy of the book that exists, so reading it is
 * not optional. Old prospects are run through the same v4 conversion the
 * database upgrade uses, so a restore lands already migrated.
 */

export const FILE_MARKER = "agency-dashboard-backup";
export const CURRENT_VERSION = 4;

export interface BackupRecords {
  prospects: Prospect[];
  policies: PolicyEntry[];
  tasks: Task[];
  suggestions: Suggestion[];
  calls: Call[];
  reviews: ReviewProposal[];
  audit: AuditEntry[];
  opportunities: Opportunity[];
  campaigns: CampaignEntry[];
  meetings: Meeting[];
}

export interface BackupV4 {
  app: typeof FILE_MARKER;
  version: 4;
  exportedAt: string;
  /** Schema of the prospect records inside, so a reader never has to guess. */
  prospectSchema: number;
  records: BackupRecords;
  meta: { dismissed: string[] };
  settings: Record<string, unknown>;
}

/**
 * v2 and v3 carry the same sectioned shape with fewer record collections, so
 * one reader handles all three — the gaps come back as empty arrays.
 */
interface BackupSectioned {
  app: typeof FILE_MARKER;
  version: 2 | 3 | 4;
  exportedAt: string;
  records: Partial<BackupRecords>;
  meta: { dismissed: string[] };
  settings: Record<string, unknown>;
}

interface BackupV1 {
  app: typeof FILE_MARKER;
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export interface ParsedBackup {
  snapshot: RepositorySnapshot;
  version: number;
  exportedAt: string;
  counts: Record<string, number>;
}

export class BackupError extends Error {}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Builds the file contents from what is actually in storage right now. */
export async function buildBackup(): Promise<BackupV4> {
  const snap = await snapshot();
  return {
    app: FILE_MARKER,
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    prospectSchema: PROSPECT_SCHEMA_VERSION,
    records: snap.records,
    meta: snap.meta,
    settings: snap.settings,
  };
}

export function countsOf(snap: RepositorySnapshot): Record<string, number> {
  return {
    prospects: snap.records.prospects.length,
    policies: snap.records.policies.length,
    tasks: snap.records.tasks.length,
    suggestions: snap.records.suggestions.length,
    calls: snap.records.calls.length,
    reviews: snap.records.reviews.length,
    audit: snap.records.audit.length,
    opportunities: snap.records.opportunities.length,
    campaigns: snap.records.campaigns.length,
    meetings: snap.records.meetings.length,
    dismissed: snap.meta.dismissed.length,
    settings: Object.keys(snap.settings).length,
  };
}

/**
 * v2 and v3 share a shape; v2 simply has no calls, reviews or audit rows, and
 * its prospects are pre-v4. Both gaps are filled the same way.
 */
function parseRecordSections(file: BackupSectioned): RepositorySnapshot {
  return {
    records: {
      prospects: normalizeProspects(file.records?.prospects),
      policies: asArray<PolicyEntry>(file.records?.policies),
      tasks: asArray<Task>(file.records?.tasks),
      suggestions: asArray<Suggestion>(file.records?.suggestions),
      calls: asArray<Call>(file.records?.calls),
      reviews: asArray<ReviewProposal>(file.records?.reviews),
      audit: asArray<AuditEntry>(file.records?.audit),
      opportunities: asArray<Opportunity>(file.records?.opportunities),
      // Absent from v2 and v3 files, where campaigns were still a setting.
      campaigns: asArray<CampaignEntry>(file.records?.campaigns),
      // Absent from every file written before meetings existed.
      meetings: asArray<Meeting>(file.records?.meetings),
    },
    meta: { dismissed: asArray<string>(file.meta?.dismissed) },
    settings: file.settings && typeof file.settings === "object" ? { ...file.settings } : {},
  };
}

/** Sorts a flat v1 key dump into the v2 shape. */
function parseV1(file: BackupV1): RepositorySnapshot {
  const data = file.data ?? {};

  const settings: Record<string, unknown> = {};
  for (const key of Object.values(SETTING_KEYS)) {
    if (key in data) settings[key] = data[key];
  }

  return {
    records: {
      prospects: normalizeProspects(data[LEGACY_RECORD_KEYS.prospects]),
      policies: asArray<PolicyEntry>(data[LEGACY_RECORD_KEYS.policies]),
      tasks: asArray<Task>(data[LEGACY_RECORD_KEYS.tasks]),
      suggestions: asArray<Suggestion>(data[LEGACY_RECORD_KEYS.suggestions]),
      calls: [],
      reviews: [],
      audit: [],
      opportunities: [],
      // v1 predates campaigns entirely; a later boot migrates the key if the
      // browser it is restored into still has one.
      campaigns: [],
      meetings: [],
    },
    meta: { dismissed: asArray<string>(data[LEGACY_RECORD_KEYS.dismissed]) },
    settings,
  };
}

/**
 * Reads a backup file of either version. Throws `BackupError` with a message
 * meant to be shown as-is — the person reading it is not a programmer.
 */
export function parseBackup(text: string): ParsedBackup {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new BackupError("That file isn't readable — it may be damaged or only partly downloaded.");
  }

  if (!file || typeof file !== "object") {
    throw new BackupError("That file isn't a dashboard backup.");
  }

  // Deliberately loose: the two versions disagree on the `version` literal, so
  // intersecting their types collapses to `never`.
  const candidate = file as {
    app?: unknown;
    version?: unknown;
    exportedAt?: unknown;
  };

  if (candidate.app !== FILE_MARKER) {
    throw new BackupError(
      "That file isn't a dashboard backup. Look for one named agency-dashboard-backup-….json"
    );
  }

  const version = Number(candidate.version) || 1;

  if (version > CURRENT_VERSION) {
    throw new BackupError(
      `That backup was made by a newer version of the dashboard (format ${version}). Update the dashboard first, then restore.`
    );
  }

  const snap =
    version === 1
      ? parseV1(file as BackupV1)
      : parseRecordSections(file as BackupSectioned);

  const counts = countsOf(snap);
  // Every collection counts, not just the four that existed when this guard was
  // written — a file holding only calls or only reviews is not an empty file.
  const hasAnything = Object.values(counts).some((n) => n > 0);

  if (!hasAnything) {
    throw new BackupError("That backup file is empty — there's nothing in it to restore.");
  }

  return {
    snapshot: snap,
    version,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
    counts,
  };
}

/** Filename used for downloads — dated so several backups sort sensibly. */
export function backupFilename(date = new Date()): string {
  return `agency-dashboard-backup-${date.toISOString().slice(0, 10)}.json`;
}
