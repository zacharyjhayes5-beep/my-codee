import type { PolicyEntry, Prospect, Suggestion, Task } from "../types";
import { LEGACY_RECORD_KEYS, SETTING_KEYS, type RepositorySnapshot, snapshot } from "./repository";

/**
 * Backup file format.
 *
 * v1 was a flat dump of every `fb-dashboard:` localStorage key. v2 separates
 * the three things that now live in different places — records in IndexedDB,
 * a small meta store, and settings still in localStorage — so a restore can
 * put each back where it belongs.
 *
 * v1 files still restore. They are the only copy of the book that exists for
 * anyone who exported before this phase, so reading them is not optional.
 */

export const FILE_MARKER = "agency-dashboard-backup";
export const CURRENT_VERSION = 2;

export interface BackupV2 {
  app: typeof FILE_MARKER;
  version: 2;
  exportedAt: string;
  records: {
    prospects: Prospect[];
    policies: PolicyEntry[];
    tasks: Task[];
    suggestions: Suggestion[];
  };
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
export async function buildBackup(): Promise<BackupV2> {
  const snap = await snapshot();
  return {
    app: FILE_MARKER,
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
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
    dismissed: snap.meta.dismissed.length,
    settings: Object.keys(snap.settings).length,
  };
}

function parseV2(file: BackupV2): RepositorySnapshot {
  return {
    records: {
      prospects: asArray<Prospect>(file.records?.prospects),
      policies: asArray<PolicyEntry>(file.records?.policies),
      tasks: asArray<Task>(file.records?.tasks),
      suggestions: asArray<Suggestion>(file.records?.suggestions),
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
      prospects: asArray<Prospect>(data[LEGACY_RECORD_KEYS.prospects]),
      policies: asArray<PolicyEntry>(data[LEGACY_RECORD_KEYS.policies]),
      tasks: asArray<Task>(data[LEGACY_RECORD_KEYS.tasks]),
      suggestions: asArray<Suggestion>(data[LEGACY_RECORD_KEYS.suggestions]),
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
    version === 1 ? parseV1(file as BackupV1) : parseV2(file as BackupV2);

  const counts = countsOf(snap);
  const hasAnything =
    counts.prospects + counts.policies + counts.tasks + counts.suggestions + counts.settings > 0;

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
