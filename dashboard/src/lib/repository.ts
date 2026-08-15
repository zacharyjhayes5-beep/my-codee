import { useCallback, useSyncExternalStore } from "react";
import {
  META_STORE,
  RECORD_STORES,
  type RecordStore,
  isAvailable,
  openDb,
  readAll,
  readMeta,
  resetDbHandle,
  writeAll,
  writeMeta,
} from "./db";
import { RESERVED_STORES, type ReservedStore } from "./db";
import { defaultOwnerName, defaultPeriod } from "./defaultData";
import { migratedLines, migratedProspects, migratedTasks } from "./migrate";
import { PROSPECT_SCHEMA_VERSION, normalizeProspects } from "./prospectSchema";
import type {
  AuditEntry,
  Call,
  Period,
  PolicyEntry,
  PolicyLine,
  Prospect,
  ReviewProposal,
  Suggestion,
  Task,
} from "../types";

/**
 * The single door to stored data. Components never touch localStorage or
 * IndexedDB — they call the hooks at the bottom of this file.
 *
 * Records (prospects, policies, tasks, suggestions) live in IndexedDB, which
 * is where call history will go without running into the ~5MB localStorage
 * ceiling. Small configuration stays in localStorage, because reading it
 * synchronously keeps the app simple.
 *
 * Everything is mirrored in an in-memory cache that is filled once, before the
 * first render. That is what lets the hooks stay synchronous and the UI stay
 * byte-for-byte what it was — the async storage sits behind the boot, not
 * inside the components.
 */

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

export const SETTING_KEYS = {
  period: "fb-dashboard:period",
  owner: "fb-dashboard:owner",
  persistency: "fb-dashboard:persistency",
  lines: "fb-dashboard:lines:v3",
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;

/**
 * Legacy localStorage keys for the collections that moved to IndexedDB. Only
 * the four that ever lived there — calls, reviews and audit were born in the
 * database and have no legacy key.
 */
export const LEGACY_RECORD_KEYS: Record<
  "prospects" | "policies" | "tasks" | "suggestions" | "dismissed",
  string
> = {
  prospects: "fb-dashboard:prospects",
  policies: "fb-dashboard:policies",
  tasks: "fb-dashboard:tasks",
  suggestions: "fb-dashboard:suggestions",
  dismissed: "fb-dashboard:dismissed",
};

const MIGRATION_FLAG = "migratedFromLocalStorage";
const SCHEMA_FLAG = "prospectSchemaVersion";
const DISMISSED_KEY = "dismissed";

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

interface Cache {
  prospects: Prospect[];
  policies: PolicyEntry[];
  tasks: Task[];
  suggestions: Suggestion[];
  calls: Call[];
  dismissed: string[];
  period: Period;
  owner: string;
  persistency: number;
  lines: PolicyLine[];
}

export type StoreKey = keyof Cache;

let cache: Cache | null = null;
let ready = false;

const listeners = new Set<() => void>();
function emit() {
  for (const fn of listeners) fn();
}

function requireCache(): Cache {
  if (!cache) throw new Error("Repository used before initRepository() finished");
  return cache;
}

/* ------------------------------------------------------------------ */
/* localStorage helpers (settings only)                                */
/* ------------------------------------------------------------------ */

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — the in-memory value still stands */
  }
}

/* ------------------------------------------------------------------ */
/* Migration                                                           */
/* ------------------------------------------------------------------ */

/**
 * Reads the collections exactly the way the old `useLocalStorage` hook did,
 * including the v2-era fallbacks in `migrate.ts`, so a book that had never
 * been opened since those shapes changed still lands intact.
 */
function collectionsFromLegacy() {
  return {
    // Whatever shape the old key holds, it comes out as v4.
    prospects: normalizeProspects(
      readLocal<unknown[]>(LEGACY_RECORD_KEYS.prospects) ?? migratedProspects(),
    ),
    policies: readLocal<PolicyEntry[]>(LEGACY_RECORD_KEYS.policies) ?? [],
    tasks: readLocal<Task[]>(LEGACY_RECORD_KEYS.tasks) ?? migratedTasks(),
    suggestions: readLocal<Suggestion[]>(LEGACY_RECORD_KEYS.suggestions) ?? [],
    dismissed: readLocal<string[]>(LEGACY_RECORD_KEYS.dismissed) ?? [],
  };
}

export interface MigrationReport {
  ran: boolean;
  moved: Record<string, number>;
  legacyRetained: boolean;
  at: string;
}

/**
 * One-time copy of localStorage records into IndexedDB. The legacy keys are
 * deliberately left in place — this phase keeps them as a rollback point, and
 * a later phase removes them once the new path has been lived in.
 */
async function migrateIfNeeded(): Promise<MigrationReport> {
  const already = await readMeta<MigrationReport>(MIGRATION_FLAG);
  if (already) return already;

  const legacy = collectionsFromLegacy();

  await writeAll("prospects", legacy.prospects);
  await writeAll("policies", legacy.policies);
  await writeAll("tasks", legacy.tasks);
  await writeAll("suggestions", legacy.suggestions);
  await writeMeta(DISMISSED_KEY, legacy.dismissed);

  const report: MigrationReport = {
    ran: true,
    moved: {
      prospects: legacy.prospects.length,
      policies: legacy.policies.length,
      tasks: legacy.tasks.length,
      suggestions: legacy.suggestions.length,
      dismissed: legacy.dismissed.length,
    },
    legacyRetained: true,
    at: new Date().toISOString(),
  };

  await writeMeta(MIGRATION_FLAG, report);
  return report;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

export interface SchemaReport {
  ran: boolean;
  from: number | null;
  to: number;
  prospectsRewritten: number;
}

export interface BootResult {
  usingIndexedDb: boolean;
  migration: MigrationReport | null;
  schema: SchemaReport | null;
}

/**
 * Brings stored prospects up to the current schema. Separate from the
 * localStorage migration above because it has to run for books that already
 * moved to IndexedDB in phase 1 — those are sitting in the old v3 shape.
 */
async function upgradeProspectSchema(): Promise<SchemaReport> {
  const storedVersion = (await readMeta<number>(SCHEMA_FLAG)) ?? null;

  if (storedVersion === PROSPECT_SCHEMA_VERSION) {
    return { ran: false, from: storedVersion, to: PROSPECT_SCHEMA_VERSION, prospectsRewritten: 0 };
  }

  // The stored version is behind, so every record is rewritten through the
  // conversion — not only the ones missing a `stage`. A later version can add
  // a field that older records simply lack, and checking for one specific
  // field would silently skip them.
  const rows = await readAll<unknown>("prospects");
  const upgraded = normalizeProspects(rows);
  if (upgraded.length > 0) await writeAll("prospects", upgraded);
  await writeMeta(SCHEMA_FLAG, PROSPECT_SCHEMA_VERSION);

  return {
    ran: upgraded.length > 0,
    from: storedVersion,
    to: PROSPECT_SCHEMA_VERSION,
    prospectsRewritten: upgraded.length,
  };
}

/**
 * Fills the cache before the first render. If IndexedDB is unavailable — a
 * locked-down browser, private mode in some engines — the app falls back to
 * reading localStorage directly rather than starting up empty.
 */
export async function initRepository(): Promise<BootResult> {
  const usable = await isAvailable();

  if (!usable) {
    const legacy = collectionsFromLegacy();
    // Calls were born in IndexedDB — there is no localStorage fallback for them.
    cache = { ...legacy, calls: [], ...loadSettings() };
    ready = true;
    emit();
    return { usingIndexedDb: false, migration: null, schema: null };
  }

  const migration = await migrateIfNeeded();
  const schema = await upgradeProspectSchema();

  cache = {
    prospects: await readAll<Prospect>("prospects"),
    policies: await readAll<PolicyEntry>("policies"),
    tasks: await readAll<Task>("tasks"),
    suggestions: await readAll<Suggestion>("suggestions"),
    calls: await readAll<Call>("calls"),
    dismissed: (await readMeta<string[]>(DISMISSED_KEY)) ?? [],
    ...loadSettings(),
  };
  ready = true;
  emit();
  return { usingIndexedDb: true, migration, schema };
}

function loadSettings() {
  return {
    period: readLocal<Period>(SETTING_KEYS.period) ?? defaultPeriod,
    owner: readLocal<string>(SETTING_KEYS.owner) ?? defaultOwnerName,
    persistency: readLocal<number>(SETTING_KEYS.persistency) ?? 0,
    lines: readLocal<PolicyLine[]>(SETTING_KEYS.lines) ?? migratedLines(),
  };
}

export function isReady() {
  return ready;
}

/** Test seam — forgets the cache and the open database handle. */
export function resetRepository() {
  cache = null;
  ready = false;
  resetDbHandle();
  listeners.clear();
}

/* ------------------------------------------------------------------ */
/* Reads and writes                                                    */
/* ------------------------------------------------------------------ */

export function get<K extends StoreKey>(key: K): Cache[K] {
  return requireCache()[key];
}

const RECORD_KEYS = new Set<string>(RECORD_STORES);

/**
 * Updates the cache immediately and persists in the background. The UI never
 * waits on storage, which is what keeps typing in the book of business feeling
 * the same as it did on localStorage.
 */
export function set<K extends StoreKey>(key: K, value: Cache[K]): void {
  const current = requireCache();
  current[key] = value;
  emit();
  enqueue(() => persist(key, value));
}

/**
 * Writes are chained rather than fired in parallel. Two rapid edits to the
 * same collection would otherwise race on a store-wide clear-and-rewrite, and
 * the slower one could land last with older contents.
 */
let queue: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work, work);
  return queue;
}

/** Resolves once every queued write has landed. */
export function whenPersisted(): Promise<void> {
  return queue;
}

async function persist(key: StoreKey, value: unknown): Promise<void> {
  try {
    if (RECORD_KEYS.has(key)) {
      await writeAll(key as RecordStore, value as { id: string }[]);
      return;
    }
    if (key === DISMISSED_KEY) {
      await writeMeta(DISMISSED_KEY, value);
      return;
    }
    writeLocal(SETTING_KEYS[key as SettingKey], value);
  } catch (error) {
    console.error(`Failed to persist ${key}`, error);
  }
}

/* ------------------------------------------------------------------ */
/* Backup surface                                                      */
/* ------------------------------------------------------------------ */

export interface RepositorySnapshot {
  records: {
    prospects: Prospect[];
    policies: PolicyEntry[];
    tasks: Task[];
    suggestions: Suggestion[];
    /** Empty until later phases, but carried so a backup is never partial. */
    calls: Call[];
    reviews: ReviewProposal[];
    audit: AuditEntry[];
  };
  meta: { dismissed: string[] };
  settings: Record<string, unknown>;
}

/**
 * Reads straight from storage rather than the cache, so an export can never
 * quietly ship a stale or partial picture of what is actually saved.
 */
export async function snapshot(): Promise<RepositorySnapshot> {
  const usable = await isAvailable();

  const records = usable
    ? {
        prospects: await readAll<Prospect>("prospects"),
        policies: await readAll<PolicyEntry>("policies"),
        tasks: await readAll<Task>("tasks"),
        suggestions: await readAll<Suggestion>("suggestions"),
        calls: await readAll<Call>("calls"),
        reviews: await readAll<ReviewProposal>("reviews"),
        audit: await readAll<AuditEntry>("audit"),
      }
    : {
        prospects: get("prospects"),
        policies: get("policies"),
        tasks: get("tasks"),
        suggestions: get("suggestions"),
        calls: [],
        reviews: [],
        audit: [],
      };

  const dismissed = usable ? ((await readMeta<string[]>(DISMISSED_KEY)) ?? []) : get("dismissed");

  const settings: Record<string, unknown> = {};
  for (const key of Object.values(SETTING_KEYS)) {
    const raw = readLocal<unknown>(key);
    if (raw !== null) settings[key] = raw;
  }

  return { records, meta: { dismissed }, settings };
}

/** Replaces everything in storage, then refills the cache. */
export async function replaceAll(next: RepositorySnapshot): Promise<void> {
  const usable = await isAvailable();

  if (usable) {
    await openDb();
    // Prospects from a v1 or v2 file arrive in the old shape; normalising here
    // means a restore lands already migrated rather than relying on the next
    // boot to fix it.
    await writeAll("prospects", normalizeProspects(next.records.prospects));
    await writeAll("policies", next.records.policies);
    await writeAll("tasks", next.records.tasks);
    await writeAll("suggestions", next.records.suggestions);
    await writeAll("calls", next.records.calls ?? []);
    for (const store of RESERVED_STORES) {
      const rows = (next.records[store as ReservedStore] ?? []) as { id: string }[];
      await writeAll(store, rows);
    }
    await writeMeta(DISMISSED_KEY, next.meta.dismissed);
    // A restore is a legitimate migrated state — don't re-run migration and
    // overwrite what was just put in.
    await writeMeta(MIGRATION_FLAG, {
      ran: true,
      moved: {},
      legacyRetained: true,
      at: new Date().toISOString(),
    } satisfies MigrationReport);
    await writeMeta(SCHEMA_FLAG, PROSPECT_SCHEMA_VERSION);
  }

  for (const [key, value] of Object.entries(next.settings)) {
    writeLocal(key, value);
  }

  cache = {
    prospects: normalizeProspects(next.records.prospects),
    policies: next.records.policies,
    tasks: next.records.tasks,
    suggestions: next.records.suggestions,
    calls: next.records.calls ?? [],
    dismissed: next.meta.dismissed,
    ...loadSettings(),
  };
  emit();
}

export { META_STORE, RECORD_STORES };

/* ------------------------------------------------------------------ */
/* React binding                                                       */
/* ------------------------------------------------------------------ */

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Same shape the old `useLocalStorage` hook returned, so the components that
 * consume it did not have to change.
 */
export function useStored<K extends StoreKey>(
  key: K
): readonly [Cache[K], (next: Cache[K] | ((prev: Cache[K]) => Cache[K])) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => requireCache()[key],
    () => requireCache()[key]
  );

  const update = useCallback(
    (next: Cache[K] | ((prev: Cache[K]) => Cache[K])) => {
      const resolved =
        typeof next === "function" ? (next as (prev: Cache[K]) => Cache[K])(get(key)) : next;
      set(key, resolved);
    },
    [key]
  );

  return [value, update] as const;
}
