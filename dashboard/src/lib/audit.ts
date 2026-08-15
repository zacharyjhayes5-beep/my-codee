import type { AuditEntry } from "../types";
import { newId } from "./storage";

/**
 * The audit log is append-only. Nothing in the app edits or deletes an entry —
 * it is the record of what happened, including the things that turned out to
 * be mistakes.
 *
 * It starts from the moment this shipped. No history is reconstructed for
 * records that predate it, because a fabricated "who changed this" is worse
 * than an honest gap.
 */

interface EntryInput {
  entity: AuditEntry["entity"];
  entityId: string;
  field: string;
  from?: unknown;
  to?: unknown;
  actor: AuditEntry["actor"];
  reviewId?: string;
  summary: string;
  at?: string;
}

export function auditEntry(input: EntryInput): AuditEntry {
  return {
    id: newId(),
    at: input.at ?? new Date().toISOString(),
    entity: input.entity,
    entityId: input.entityId,
    field: input.field,
    from: input.from ?? null,
    to: input.to ?? null,
    actor: input.actor,
    reviewId: input.reviewId,
    summary: input.summary,
  };
}

/** Readable enough for a log line without needing the raw value. */
export function describeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") return "details";
  return String(value);
}

/**
 * Compares two versions of a record and returns one entry per field that
 * actually moved. Fields that did not change produce nothing — an audit full
 * of no-ops is an audit nobody reads.
 */
export function diffEntries<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T & string)[],
  base: Omit<EntryInput, "field" | "from" | "to" | "summary"> & { label: string },
): AuditEntry[] {
  const entries: AuditEntry[] = [];

  for (const field of fields) {
    const from = before[field];
    const to = after[field];
    if (Object.is(from, to)) continue;
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;

    entries.push(
      auditEntry({
        ...base,
        field,
        from,
        to,
        summary: `${base.label} ${field}: ${describeValue(from)} → ${describeValue(to)}`,
      }),
    );
  }

  return entries;
}

/** Newest first — the order the log is read in. */
export function sortAudit(entries: AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) => b.at.localeCompare(a.at));
}

/** Keeps the log from growing without bound in a browser-only app. */
export const AUDIT_LIMIT = 2000;

export function appendAudit(existing: AuditEntry[], added: AuditEntry[]): AuditEntry[] {
  if (added.length === 0) return existing;
  const combined = [...existing, ...added];
  return combined.length > AUDIT_LIMIT ? combined.slice(combined.length - AUDIT_LIMIT) : combined;
}
