import type {
  AuditEntry,
  Call,
  Prospect,
  ReviewProposal,
  ReviewSource,
  Suggestion,
  Task,
} from "../types";
import { appendAudit, auditEntry, describeValue } from "./audit";
import { blankCall, withLatestCallFields } from "./calls";
import { dedupeKey } from "./suggest";
import { newId } from "./storage";

/**
 * Review proposals.
 *
 * A proposal is a request, not a change. It sits in the inbox showing exactly
 * which fields it wants to move and what it expects to find there now. Nothing
 * reaches a household until it is approved, and an approval that would
 * overwrite newer data is refused rather than applied.
 */

/**
 * The prospect fields a proposal is allowed to touch. Everything else is
 * refused — most importantly the outcome fields, which are derived from call
 * records and must never be written directly.
 */
export const EDITABLE_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "stage",
  "closedReason",
  "priorityGrade",
  "conversionScore",
  "nextAction",
  "nextActionDate",
  "area",
  "phone",
  "email",
  "lines",
  "contacts",
  "address",
  "doNotContact",
  "source",
  // Added when households gained them. A field that a proposal can produce but
  // this list does not name is refused at approval — which is safe, but it
  // silently breaks the workflow that proposes it.
  "leadSource",
  "whyTheyFit",
  "importantNotes",
  "assets",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export function isEditableField(field: string): field is EditableField {
  return (EDITABLE_FIELDS as readonly string[]).includes(field);
}

/* ------------------------------------------------------------------ */
/* Building proposals                                                  */
/* ------------------------------------------------------------------ */

export function blankProposal(overrides: Partial<ReviewProposal> = {}): ReviewProposal {
  return {
    id: newId(),
    kind: "call-review",
    prospectId: null,
    source: "manual",
    sourceRef: "",
    proposedCall: null,
    changes: [],
    proposedTasks: [],
    status: "pending",
    dedupeKey: "",
    createdAt: new Date().toISOString().slice(0, 10),
    reason: "",
    ...overrides,
  };
}

/**
 * Carries an old to-do suggestion into the review model unchanged in meaning:
 * one proposed task, no prospect changes, same dedupe key so anything already
 * turned down stays turned down.
 */
export function reviewFromSuggestion(suggestion: Suggestion): ReviewProposal {
  return blankProposal({
    id: suggestion.id,
    kind: "task-suggestion",
    prospectId: null,
    source: suggestion.source as ReviewSource,
    sourceRef: suggestion.sourceRef,
    proposedTasks: [
      {
        text: suggestion.text,
        detail: suggestion.detail,
        urgency: suggestion.urgency,
        dueDate: suggestion.dueDate,
        source: suggestion.source,
        sourceRef: suggestion.sourceRef,
      },
    ],
    dedupeKey: dedupeKey(suggestion.text),
    createdAt: suggestion.createdAt,
    reason: suggestion.reason,
  });
}

export function reviewsFromSuggestions(suggestions: Suggestion[]): ReviewProposal[] {
  return suggestions.map(reviewFromSuggestion);
}

/** Idempotent tidy-up for proposals arriving from a backup file. */
export function normalizeProposal(input: unknown): ReviewProposal {
  const raw = (input ?? {}) as Partial<ReviewProposal>;
  return blankProposal({
    ...raw,
    id: raw.id || newId(),
    changes: Array.isArray(raw.changes) ? raw.changes : [],
    proposedTasks: Array.isArray(raw.proposedTasks) ? raw.proposedTasks : [],
    status: raw.status ?? "pending",
    dedupeKey: raw.dedupeKey ?? "",
  });
}

export function normalizeProposals(input: unknown): ReviewProposal[] {
  return Array.isArray(input) ? input.map(normalizeProposal) : [];
}

export function pendingProposals(reviews: ReviewProposal[]): ReviewProposal[] {
  return reviews.filter((r) => r.status === "pending");
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                           */
/* ------------------------------------------------------------------ */

export interface Conflict {
  field: string;
  /** What the proposal expected to find. */
  expected: unknown;
  /** What is actually there now. */
  actual: unknown;
  proposed: unknown;
  reason: "changed-since" | "field-not-editable" | "prospect-missing";
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Compares each proposed change against the record as it stands. A field that
 * has moved since the proposal was written is reported rather than
 * overwritten — the newer value is assumed to be the deliberate one.
 */
export function detectConflicts(
  proposal: ReviewProposal,
  prospect: Prospect | undefined,
): Conflict[] {
  if (proposal.changes.length === 0) return [];

  if (!prospect) {
    return proposal.changes.map((c) => ({
      field: c.field,
      expected: c.from,
      actual: null,
      proposed: c.to,
      reason: "prospect-missing" as const,
    }));
  }

  const conflicts: Conflict[] = [];

  for (const change of proposal.changes) {
    if (!isEditableField(change.field)) {
      conflicts.push({
        field: change.field,
        expected: change.from,
        actual: (prospect as unknown as Record<string, unknown>)[change.field],
        proposed: change.to,
        reason: "field-not-editable",
      });
      continue;
    }

    const actual = (prospect as unknown as Record<string, unknown>)[change.field];
    if (!sameValue(actual, change.from)) {
      conflicts.push({
        field: change.field,
        expected: change.from,
        actual,
        proposed: change.to,
        reason: "changed-since",
      });
    }
  }

  return conflicts;
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

export interface WorldState {
  prospects: Prospect[];
  calls: Call[];
  tasks: Task[];
  audit: AuditEntry[];
}

export interface ApplyResult extends WorldState {
  ok: boolean;
  conflicts: Conflict[];
  reviews: ReviewProposal[];
}

/**
 * Applies one proposal, or nothing at all.
 *
 * Every part is assembled against copies first; the caller only ever sees the
 * finished state or the untouched one. A conflict anywhere stops the whole
 * proposal — a half-applied review would be worse than a refused one, because
 * there would be no record of which half landed.
 */
export function applyProposal(
  proposal: ReviewProposal,
  world: WorldState,
  reviews: ReviewProposal[],
  options: { at?: string } = {},
): ApplyResult {
  const at = options.at ?? new Date().toISOString();
  const target = proposal.prospectId
    ? world.prospects.find((p) => p.id === proposal.prospectId)
    : undefined;

  const conflicts = detectConflicts(proposal, target);

  if (conflicts.length > 0) {
    // Nothing moves. The proposal stays pending so it can be re-examined.
    return { ok: false, conflicts, ...world, reviews };
  }

  const newAudit: AuditEntry[] = [];
  let nextProspects = world.prospects;
  let nextCalls = world.calls;
  let nextTasks = world.tasks;

  /* --- the proposed call --- */
  let createdCall: Call | null = null;
  if (proposal.proposedCall && proposal.prospectId) {
    createdCall = {
      ...blankCall(proposal.prospectId),
      ...proposal.proposedCall,
      id: proposal.proposedCall.id ?? newId(),
      prospectId: proposal.prospectId,
      createdBy: "review",
      reviewId: proposal.id,
    };
    nextCalls = [...nextCalls, createdCall];
    newAudit.push(
      auditEntry({
        at,
        entity: "call",
        entityId: createdCall.id,
        field: "created",
        to: createdCall.outcome,
        actor: "review",
        reviewId: proposal.id,
        summary: `Call added from a review: ${createdCall.outcome}`,
      }),
    );
  }

  /* --- the proposed field changes --- */
  if (target && proposal.changes.length > 0) {
    const patched: Record<string, unknown> = { ...(target as unknown as Record<string, unknown>) };
    for (const change of proposal.changes) {
      patched[change.field] = change.to;
      newAudit.push(
        auditEntry({
          at,
          entity: "prospect",
          entityId: target.id,
          field: change.field,
          from: change.from,
          to: change.to,
          actor: "review",
          reviewId: proposal.id,
          summary: `${change.field}: ${describeValue(change.from)} → ${describeValue(change.to)}`,
        }),
      );
    }
    // A stage set through a review is a person's decision, not a rule's.
    if (proposal.changes.some((c) => c.field === "stage")) {
      patched.stageSource = "manual";
      patched.stageCallId = null;
    }
    const updated = patched as unknown as Prospect;
    nextProspects = nextProspects.map((p) => (p.id === target.id ? updated : p));
  }

  /* --- latest-call fields, if a call was added --- */
  if (createdCall) {
    const mine = nextCalls.filter((c) => c.prospectId === createdCall!.prospectId);
    nextProspects = nextProspects.map((p) =>
      p.id === createdCall!.prospectId ? withLatestCallFields(p, mine) : p,
    );
  }

  /* --- the proposed tasks --- */
  for (const draft of proposal.proposedTasks) {
    const task: Task = {
      id: draft.id ?? newId(),
      text: draft.text ?? "Untitled task",
      detail: draft.detail ?? "",
      urgency: draft.urgency ?? "soon",
      done: false,
      dueDate: draft.dueDate,
      source: draft.source ?? "manual",
      sourceRef: draft.sourceRef,
      createdAt: at.slice(0, 10),
      prospectId: proposal.prospectId ?? draft.prospectId,
      callId: createdCall?.id ?? draft.callId,
      kind: draft.kind,
    };
    nextTasks = [...nextTasks, task];
    newAudit.push(
      auditEntry({
        at,
        entity: "task",
        entityId: task.id,
        field: "created",
        to: task.text,
        actor: "review",
        reviewId: proposal.id,
        summary: `Task added from a review: ${task.text}`,
      }),
    );
  }

  const nextReviews = reviews.map((r) =>
    r.id === proposal.id ? { ...proposal, status: proposal.status, resolvedAt: at } : r,
  );

  return {
    ok: true,
    conflicts: [],
    prospects: nextProspects,
    calls: nextCalls,
    tasks: nextTasks,
    audit: appendAudit(world.audit, newAudit),
    reviews: nextReviews,
  };
}

/**
 * Turning a proposal down keeps its dedupe key on the record, which is what
 * stops the same suggestion arriving again next time the note is imported.
 */
export function rejectProposal(
  proposal: ReviewProposal,
  reviews: ReviewProposal[],
  dismissed: string[],
  options: { at?: string } = {},
): { reviews: ReviewProposal[]; dismissed: string[] } {
  const at = options.at ?? new Date().toISOString();
  return {
    reviews: reviews.map((r) =>
      r.id === proposal.id ? { ...r, status: "rejected", resolvedAt: at } : r,
    ),
    dismissed: proposal.dedupeKey ? [...new Set([...dismissed, proposal.dedupeKey])] : dismissed,
  };
}

/** True when this proposal has been seen and turned down before. */
export function alreadyDismissed(proposal: ReviewProposal, dismissed: string[]): boolean {
  return Boolean(proposal.dedupeKey) && dismissed.includes(proposal.dedupeKey);
}

/** A short line describing what a proposal would do, for the card header. */
export function summarize(proposal: ReviewProposal): string {
  const parts: string[] = [];
  if (proposal.proposedCall) parts.push("1 call");
  if (proposal.changes.length > 0) {
    parts.push(`${proposal.changes.length} field${proposal.changes.length === 1 ? "" : "s"}`);
  }
  if (proposal.proposedTasks.length > 0) {
    parts.push(`${proposal.proposedTasks.length} task${proposal.proposedTasks.length === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "nothing to apply";
}
