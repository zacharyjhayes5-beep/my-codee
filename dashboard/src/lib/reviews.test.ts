import { describe, expect, it } from "vitest";
import type { Prospect, ReviewProposal, Suggestion, Task } from "../types";
import { blankProspect } from "./prospectSchema";
import { appendAudit, auditEntry, sortAudit } from "./audit";
import {
  applyProposal,
  blankProposal,
  detectConflicts,
  reviewFromSuggestion,
  rejectProposal,
  summarize,
  type WorldState,
} from "./reviews";

/**
 * The promise this phase makes is that nothing moves without approval, and
 * that an approval either lands whole or not at all. These are the tests that
 * hold it to that.
 */

const AT = "2026-08-20T10:00:00.000Z";

function household(overrides: Partial<Prospect> = {}): Prospect {
  return blankProspect({
    id: "p1",
    name: "Dana Reed",
    stage: "Contacted",
    priorityGrade: "C",
    nextAction: "send quote",
    ...overrides,
  });
}

function world(overrides: Partial<WorldState> = {}): WorldState {
  return { prospects: [household()], calls: [], tasks: [], audit: [], ...overrides };
}

function proposal(overrides: Partial<ReviewProposal> = {}): ReviewProposal {
  return blankProposal({
    id: "rp1",
    prospectId: "p1",
    source: "granola",
    sourceRef: "Reed — discovery call",
    reason: "Call notes mention a quote",
    dedupeKey: "reed discovery",
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */

describe("a pending proposal changes nothing", () => {
  it("leaves the household untouched until approved", () => {
    const p = proposal({
      changes: [{ field: "stage", from: "Contacted", to: "Quoting", rationale: "asked for a quote" }],
    });
    const before = world();
    // Merely holding the proposal does nothing — no call to applyProposal.
    expect(before.prospects[0].stage).toBe("Contacted");
    expect(p.status).toBe("pending");
  });

  it("writes no audit entries while pending", () => {
    expect(world().audit).toHaveLength(0);
  });
});

describe("approving applies the changes", () => {
  const p = proposal({
    changes: [
      { field: "stage", from: "Contacted", to: "Quoting" },
      { field: "priorityGrade", from: "C", to: "A" },
    ],
  });

  it("applies every field", () => {
    const result = applyProposal(p, world(), [p], { at: AT });
    expect(result.ok).toBe(true);
    expect(result.prospects[0].stage).toBe("Quoting");
    expect(result.prospects[0].priorityGrade).toBe("A");
  });

  it("marks a review-set stage as a person's decision, not a rule's", () => {
    const result = applyProposal(p, world(), [p], { at: AT });
    expect(result.prospects[0].stageSource).toBe("manual");
    expect(result.prospects[0].stageCallId).toBeNull();
  });

  it("creates the proposed tasks, linked to the household", () => {
    const withTask = proposal({
      proposedTasks: [{ text: "Send the bundle quote", urgency: "now", dueDate: "2026-08-21" }],
    });
    const result = applyProposal(withTask, world(), [withTask], { at: AT });
    const made = result.tasks[0];
    expect(made.text).toBe("Send the bundle quote");
    expect(made.prospectId).toBe("p1");
    expect(made.dueDate).toBe("2026-08-21");
  });

  it("adds the proposed call and marks where it came from", () => {
    const withCall = proposal({
      proposedCall: { outcome: "Somewhat Interested", summary: "Wants home and auto" },
    });
    const result = applyProposal(withCall, world(), [withCall], { at: AT });
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].createdBy).toBe("review");
    expect(result.calls[0].reviewId).toBe("rp1");
    expect(result.calls[0].prospectId).toBe("p1");
  });

  it("updates the latest-call fields when a call is added", () => {
    const withCall = proposal({
      proposedCall: { outcome: "Somewhat Interested", at: AT },
    });
    const result = applyProposal(withCall, world(), [withCall], { at: AT });
    expect(result.prospects[0].lastOutcome).toBe("Somewhat Interested");
  });

  it("stores no transcript with the call it creates", () => {
    const withCall = proposal({ proposedCall: { outcome: "Somewhat Interested" } });
    const result = applyProposal(withCall, world(), [withCall], { at: AT });
    expect(result.calls[0].transcriptExcerpt).toBeUndefined();
  });
});

describe("edit then approve applies the edited values", () => {
  it("uses the edited field value, not the original proposal", () => {
    const original = proposal({
      changes: [{ field: "stage", from: "Contacted", to: "Quoting" }],
    });
    // What the inbox does when the value is changed in place.
    const edited: ReviewProposal = {
      ...original,
      status: "edited",
      changes: [{ field: "stage", from: "Contacted", to: "Opportunity" }],
    };

    const result = applyProposal(edited, world(), [edited], { at: AT });
    expect(result.prospects[0].stage).toBe("Opportunity");
    expect(result.prospects[0].stage).not.toBe("Quoting");
  });

  it("uses the edited task text", () => {
    const edited = proposal({
      status: "edited",
      proposedTasks: [{ text: "Call before Friday instead", urgency: "now" }],
    });
    const result = applyProposal(edited, world(), [edited], { at: AT });
    expect(result.tasks[0].text).toBe("Call before Friday instead");
  });
});

describe("conflicts protect newer data", () => {
  const stale = proposal({
    changes: [{ field: "stage", from: "Contacted", to: "Quoting" }],
  });

  it("refuses when the field has moved since the proposal was written", () => {
    const moved = world({ prospects: [household({ stage: "Opportunity" })] });
    const result = applyProposal(stale, moved, [stale], { at: AT });

    expect(result.ok).toBe(false);
    expect(result.conflicts[0].field).toBe("stage");
    expect(result.conflicts[0].expected).toBe("Contacted");
    expect(result.conflicts[0].actual).toBe("Opportunity");
    expect(result.conflicts[0].reason).toBe("changed-since");
  });

  it("leaves the newer value exactly as it was", () => {
    const moved = world({ prospects: [household({ stage: "Opportunity" })] });
    const result = applyProposal(stale, moved, [stale], { at: AT });
    expect(result.prospects[0].stage).toBe("Opportunity");
  });

  it("refuses a field that may not be set from a review", () => {
    const forbidden = proposal({
      changes: [{ field: "lastOutcome", from: null, to: "Hot Lead" }],
    });
    const result = applyProposal(forbidden, world(), [forbidden], { at: AT });
    expect(result.ok).toBe(false);
    expect(result.conflicts[0].reason).toBe("field-not-editable");
  });

  it("refuses when the household no longer exists", () => {
    const orphan = proposal({ changes: [{ field: "stage", from: "Contacted", to: "Quoting" }] });
    const empty = world({ prospects: [] });
    const result = applyProposal(orphan, empty, [orphan], { at: AT });
    expect(result.ok).toBe(false);
    expect(result.conflicts[0].reason).toBe("prospect-missing");
  });

  it("detects conflicts without applying anything", () => {
    const moved = household({ stage: "Opportunity" });
    expect(detectConflicts(stale, moved)).toHaveLength(1);
    expect(moved.stage).toBe("Opportunity");
  });
});

describe("a refused proposal leaves nothing behind", () => {
  const mixed = proposal({
    proposedCall: { outcome: "Somewhat Interested" },
    proposedTasks: [{ text: "Build the quote" }],
    changes: [{ field: "stage", from: "Contacted", to: "Quoting" }],
  });

  it("applies no part of a proposal that conflicts", () => {
    const moved = world({ prospects: [household({ stage: "Won" })] });
    const result = applyProposal(mixed, moved, [mixed], { at: AT });

    expect(result.ok).toBe(false);
    expect(result.calls).toHaveLength(0);
    expect(result.tasks).toHaveLength(0);
    expect(result.audit).toHaveLength(0);
    expect(result.prospects[0].stage).toBe("Won");
  });

  it("applies all three parts when there is no conflict", () => {
    const result = applyProposal(mixed, world(), [mixed], { at: AT });
    expect(result.ok).toBe(true);
    expect(result.calls).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.prospects[0].stage).toBe("Quoting");
  });
});

describe("rejecting keeps it from coming back", () => {
  it("marks the proposal rejected and remembers its key", () => {
    const p = proposal();
    const result = rejectProposal(p, [p], [], { at: AT });
    expect(result.reviews[0].status).toBe("rejected");
    expect(result.dismissed).toContain("reed discovery");
  });

  it("does not add the same key twice", () => {
    const p = proposal();
    const once = rejectProposal(p, [p], ["reed discovery"], { at: AT });
    expect(once.dismissed.filter((k) => k === "reed discovery")).toHaveLength(1);
  });

  it("changes no household data", () => {
    const p = proposal({ changes: [{ field: "stage", from: "Contacted", to: "Quoting" }] });
    const before = world();
    rejectProposal(p, [p], [], { at: AT });
    expect(before.prospects[0].stage).toBe("Contacted");
  });
});

describe("existing suggestions stay usable", () => {
  const suggestion: Suggestion = {
    id: "s1",
    text: "Call Mike about the renewal",
    detail: "From the vault note",
    urgency: "week",
    dueDate: "2026-08-25",
    source: "obsidian",
    sourceRef: "Weekly review",
    reason: "Unchecked task in the note",
    createdAt: "2026-08-15",
  };

  const converted = reviewFromSuggestion(suggestion);

  it("becomes a proposal with one task and no field changes", () => {
    expect(converted.kind).toBe("task-suggestion");
    expect(converted.proposedTasks).toHaveLength(1);
    expect(converted.changes).toHaveLength(0);
    expect(converted.proposedCall).toBeNull();
  });

  it("keeps the text, urgency, due date and origin", () => {
    const task = converted.proposedTasks[0];
    expect(task.text).toBe("Call Mike about the renewal");
    expect(task.urgency).toBe("week");
    expect(task.dueDate).toBe("2026-08-25");
    expect(converted.sourceRef).toBe("Weekly review");
    expect(converted.reason).toBe("Unchecked task in the note");
  });

  it("keeps its id so approving twice cannot duplicate it", () => {
    expect(converted.id).toBe("s1");
  });

  it("approves into a real task", () => {
    const result = applyProposal(converted, world(), [converted], { at: AT });
    expect(result.ok).toBe(true);
    expect(result.tasks[0].text).toBe("Call Mike about the renewal");
  });

  it("carries a dedupe key so rejecting it sticks", () => {
    expect(converted.dedupeKey).toBeTruthy();
    const rejected = rejectProposal(converted, [converted], [], { at: AT });
    expect(rejected.dismissed).toContain(converted.dedupeKey);
  });
});

describe("audit entries", () => {
  it("records one entry per changed field, with before and after", () => {
    const p = proposal({
      changes: [
        { field: "stage", from: "Contacted", to: "Quoting" },
        { field: "priorityGrade", from: "C", to: "A" },
      ],
    });
    const result = applyProposal(p, world(), [p], { at: AT });

    const fields = result.audit.map((a) => a.field).sort();
    expect(fields).toEqual(["priorityGrade", "stage"]);

    const stageEntry = result.audit.find((a) => a.field === "stage")!;
    expect(stageEntry.from).toBe("Contacted");
    expect(stageEntry.to).toBe("Quoting");
    expect(stageEntry.actor).toBe("review");
    expect(stageEntry.reviewId).toBe("rp1");
  });

  it("records the call and task it created", () => {
    const p = proposal({
      proposedCall: { outcome: "Somewhat Interested" },
      proposedTasks: [{ text: "Build the quote" }],
    });
    const result = applyProposal(p, world(), [p], { at: AT });
    expect(result.audit.some((a) => a.entity === "call" && a.field === "created")).toBe(true);
    expect(result.audit.some((a) => a.entity === "task" && a.field === "created")).toBe(true);
  });

  it("appends rather than replacing", () => {
    const existing = auditEntry({
      entity: "prospect",
      entityId: "p1",
      field: "stage",
      actor: "user",
      summary: "earlier change",
      at: "2026-08-01T09:00:00.000Z",
    });
    const p = proposal({ changes: [{ field: "stage", from: "Contacted", to: "Quoting" }] });
    const result = applyProposal(p, world({ audit: [existing] }), [p], { at: AT });

    expect(result.audit).toHaveLength(2);
    expect(result.audit[0]).toEqual(existing);
  });

  it("never rewrites an existing entry", () => {
    const first = auditEntry({
      entity: "prospect",
      entityId: "p1",
      field: "stage",
      from: "New",
      to: "Contacted",
      actor: "user",
      summary: "first",
    });
    const kept = appendAudit([first], [
      auditEntry({ entity: "prospect", entityId: "p1", field: "stage", actor: "rule", summary: "second" }),
    ]);
    expect(kept[0]).toEqual(first);
    expect(kept).toHaveLength(2);
  });

  it("reads newest first when sorted", () => {
    const older = auditEntry({ entity: "prospect", entityId: "p1", field: "a", actor: "user", summary: "older", at: "2026-08-01T00:00:00.000Z" });
    const newer = auditEntry({ entity: "prospect", entityId: "p1", field: "b", actor: "user", summary: "newer", at: "2026-08-09T00:00:00.000Z" });
    expect(sortAudit([older, newer])[0].summary).toBe("newer");
  });
});

describe("summaries", () => {
  it("describes what a proposal would do", () => {
    expect(
      summarize(
        proposal({
          proposedCall: { outcome: "Somewhat Interested" },
          changes: [{ field: "stage", from: "Contacted", to: "Quoting" }],
          proposedTasks: [{ text: "Build the quote" }],
        }),
      ),
    ).toBe("1 call · 1 field · 1 task");
  });

  it("says so when there is nothing in it", () => {
    expect(summarize(proposal())).toBe("nothing to apply");
  });
});

describe("tasks the user typed are never touched by a review", () => {
  it("leaves an unrelated task alone", () => {
    const mine: Task = {
      id: "t-user",
      text: "Drop off a card",
      detail: "",
      urgency: "soon",
      done: false,
      source: "manual",
      createdAt: "2026-08-01",
    };
    const p = proposal({ proposedTasks: [{ text: "Build the quote" }] });
    const result = applyProposal(p, world({ tasks: [mine] }), [p], { at: AT });
    expect(result.tasks).toContainEqual(mine);
    expect(result.tasks).toHaveLength(2);
  });
});
