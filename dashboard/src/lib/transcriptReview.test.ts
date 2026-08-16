import { describe, expect, it } from "vitest";
import type { Call, Opportunity, ReviewProposal, Task } from "../types";
import { blankProspect } from "./prospectSchema";
import { blankOpportunity } from "./opportunities";
import { detectConflicts, isEditableField } from "./reviews";
import { analyzeTranscript, matchProspect, proposalFromReview } from "./transcriptReview";
import { buildDailyBrief, dueFollowUps, previousDay, todaysSchedule, triageCorrespondence } from "./dailyBrief";

const TODAY = "2026-08-20";

const HOT = `# Discovery call with Dana Reed
Date: 2026-08-20
Talked to Dana about home and auto. She said the rates went up at renewal.
Currently with Progressive, paying $2,400 a year.
Roof replaced 2021. Two vehicles — a 2019 Ford F-150 and a 2021 Honda CR-V.
She said "send me a quote" and wants to see if we can beat it.
Wife handles homeowners decisions.`;

const BOOKED = `Call with Ken Ames
Date: 2026-08-20
Ken was happy to talk. We booked a review for next week to go through everything.
He has a boat and a camper as well.`;

const REFUSED = `Call with Rita Nolan
Date: 2026-08-20
Rita said not interested, take me off the list.`;

/* ------------------------------------------------------------------ */

describe("the five required review fields", () => {
  const review = analyzeTranscript(HOT, { ownerName: "Zach Hayes" });

  it("gathers information from the transcript", () => {
    expect(review.informationGathered.length).toBeGreaterThan(0);
    const joined = review.informationGathered.join(" ");
    expect(joined).toMatch(/Ford|Honda/);
    expect(joined).toMatch(/Progressive|Premium|2,400/);
  });

  it("reads the prospect's attitude", () => {
    expect(review.attitude).toBeTruthy();
    expect(review.attitude.toLowerCase()).toContain("open");
  });

  it("suggests a quality grade", () => {
    expect(["A", "B", "C", "D"]).toContain(review.quality);
  });

  it("keeps notes", () => {
    expect(review.notes.length).toBeGreaterThan(0);
  });

  it("scores it on the agreed 1–10 scale, with a reason", () => {
    expect(review.conversionScore).toBeGreaterThanOrEqual(1);
    expect(review.conversionScore).toBeLessThanOrEqual(10);
    // "send me a quote" is an 8 on the agreed scale.
    expect(review.conversionScore).toBe(8);
    expect(review.scoreReason).toContain("quote");
  });

  it("never returns a bare score with no explanation", () => {
    for (const text of [HOT, BOOKED, REFUSED, "nothing much happened"]) {
      expect(analyzeTranscript(text).scoreReason).toBeTruthy();
    }
  });
});

describe("what it proposes", () => {
  it("reads a booked review as an appointment outcome", () => {
    const review = analyzeTranscript(BOOKED);
    expect(review.suggestedOutcome).toBe("Insurance Review Scheduled");
    expect(review.suggestedNextAction).toBe("Insurance review");
    expect(review.conversionScore).toBe(9);
  });

  it("reads a refusal as such, and scores it low", () => {
    const review = analyzeTranscript(REFUSED);
    expect(review.suggestedOutcome).toBe("Definitely Not Interested");
    expect(review.conversionScore).toBeLessThanOrEqual(3);
  });

  it("proposes nothing decisive when the transcript says nothing decisive", () => {
    const review = analyzeTranscript("We chatted about the weather for a while.");
    expect(review.suggestedOutcome).toBeNull();
    expect(review.conversionScore).toBe(5);
  });

  it("lifts human context into Important Notes", () => {
    const review = analyzeTranscript(HOT);
    expect(review.suggestedImportantNotes.toLowerCase()).toMatch(/rate|wife/);
  });
});

describe("matching the household", () => {
  const prospects = [
    blankProspect({ id: "p1", name: "Dana Reed", firstName: "Dana", lastName: "Reed" }),
    blankProspect({ id: "p2", name: "Ken Ames", firstName: "Ken", lastName: "Ames" }),
  ];

  it("finds the household the call was with", () => {
    expect(matchProspect(HOT, prospects, "Zach Hayes")?.id).toBe("p1");
  });

  it("returns nothing rather than guessing when there is no match", () => {
    expect(matchProspect("Call with Somebody Unknown", prospects, "Zach Hayes")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("the proposal it produces", () => {
  const prospect = blankProspect({
    id: "p1",
    name: "Dana Reed",
    importantNotes: "Prefers evenings",
    conversionScore: 4,
    priorityGrade: "C",
    nextAction: "call back",
  });
  const review = analyzeTranscript(HOT, { ownerName: "Zach Hayes" });
  const proposal = proposalFromReview(review, prospect);

  it("is pending, and attached to the right household", () => {
    expect(proposal.status).toBe("pending");
    expect(proposal.prospectId).toBe("p1");
    expect(proposal.source).toBe("granola");
  });

  it("carries a source reference, not a copy of the transcript", () => {
    expect(proposal.sourceRef).toBeTruthy();
    const serialized = JSON.stringify(proposal);
    // Whole sentences lifted from the call must not survive into storage.
    expect(serialized).not.toContain("Talked to Dana about home and auto");
    expect(serialized).not.toContain("wants to see if we can beat it");
  });

  it("summarises rather than excerpting", () => {
    expect(proposal.proposedCall?.summary).toBe(review.attitude);
    expect(review.notes).not.toContain("Talked to Dana");
  });

  it("proposes the call rather than creating it", () => {
    expect(proposal.proposedCall?.outcome).toBe("Somewhat Interested");
    expect(proposal.proposedCall?.sourceRef?.system).toBe("granola");
  });

  it("adds to existing Important Notes instead of replacing them", () => {
    const change = proposal.changes.find((c) => c.field === "importantNotes")!;
    expect(String(change.from)).toBe("Prefers evenings");
    expect(String(change.to)).toContain("Prefers evenings");
    expect(String(change.to).length).toBeGreaterThan("Prefers evenings".length);
  });

  it("shows the score change with its reasoning", () => {
    const change = proposal.changes.find((c) => c.field === "conversionScore")!;
    expect(change.from).toBe(4);
    expect(change.to).toBe(8);
    expect(change.rationale).toBeTruthy();
  });

  it("proposes a next action and a date together", () => {
    expect(proposal.changes.some((c) => c.field === "nextAction")).toBe(true);
    expect(proposal.changes.some((c) => c.field === "nextActionDate")).toBe(true);
  });

  it("never proposes a field the review inbox would refuse", () => {
    // A proposal that names a field outside the allowlist is refused whole at
    // approval, which quietly breaks this workflow. Catch it here instead.
    for (const change of proposal.changes) {
      expect(isEditableField(change.field)).toBe(true);
    }
  });

  it("survives conflict detection against the household it was built from", () => {
    expect(detectConflicts(proposal, prospect)).toEqual([]);
  });

  it("holds every field this analyser can emit in the allowlist", () => {
    for (const field of [
      "importantNotes",
      "conversionScore",
      "priorityGrade",
      "nextAction",
      "nextActionDate",
    ]) {
      expect(isEditableField(field)).toBe(true);
    }
  });

  it("does not duplicate a note that is already there", () => {
    const already = blankProspect({
      id: "p1",
      importantNotes: review.suggestedImportantNotes,
    });
    const second = proposalFromReview(review, already);
    expect(second.changes.some((c) => c.field === "importantNotes")).toBe(false);
  });

  it("carries a dedupe key so turning it down sticks", () => {
    expect(proposal.dedupeKey).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Daily brief                                                         */
/* ------------------------------------------------------------------ */

describe("the daily brief", () => {
  const prospects = [
    blankProspect({ id: "p1", name: "Dana Reed", priorityGrade: "A" }),
    blankProspect({ id: "p2", name: "Ken Ames" }),
  ];

  function brief(over: {
    calls?: Call[];
    tasks?: Task[];
    opportunities?: Opportunity[];
    reviews?: ReviewProposal[];
  } = {}) {
    return buildDailyBrief({
      prospects,
      calls: over.calls ?? [],
      tasks: over.tasks ?? [],
      opportunities: over.opportunities ?? [],
      reviews: over.reviews ?? [],
      today: TODAY,
      yesterday: previousDay(TODAY),
      now: new Date(2026, 7, 20, 9, 0, 0),
    });
  }

  it("leads with today's appointment when there is one", () => {
    const withAppointment = blankOpportunity("p1", {
      nextAction: "Review",
      nextActionDate: "2026-09-01",
      appointments: [
        { id: "a1", at: new Date(2026, 7, 20, 15, 0, 0).toISOString(), kind: "insurance-review", notes: "" },
      ],
    });
    const result = brief({ opportunities: [withAppointment] });
    expect(result.headline).toContain("Insurance review");
    expect(result.appointments).toHaveLength(1);
  });

  it("leads with overdue work when nothing is booked", () => {
    const late: Task = {
      id: "t1",
      text: "Chase the quote",
      detail: "",
      urgency: "now",
      done: false,
      dueDate: "2026-08-01",
      source: "manual",
      createdAt: "2026-08-01",
    };
    expect(brief({ tasks: [late] }).headline).toContain("overdue");
  });

  it("tells you to clear overdue work before dialling", () => {
    const late: Task = {
      id: "t1",
      text: "Chase the quote",
      detail: "",
      urgency: "now",
      done: false,
      dueDate: "2026-08-01",
      source: "manual",
      createdAt: "2026-08-01",
    };
    const focus = brief({ tasks: [late] }).focus.join(" | ");
    expect(focus).toMatch(/overdue.*before new dials/i);
  });

  it("puts quote work above cold-call volume", () => {
    const quote: Task = {
      id: "t1",
      text: "Build the quote",
      detail: "",
      urgency: "now",
      done: false,
      dueDate: TODAY,
      kind: "quote",
      source: "manual",
      createdAt: TODAY,
    };
    const focus = brief({ tasks: [quote] }).focus;
    const quoteIndex = focus.findIndex((f) => f.toLowerCase().includes("quote"));
    const dialIndex = focus.findIndex((f) => f.toLowerCase().includes("dial"));
    expect(quoteIndex).toBeGreaterThanOrEqual(0);
    expect(quoteIndex).toBeLessThan(dialIndex);
  });

  it("tells you to work follow-ups that are due today, not just overdue ones", () => {
    const dueNow: Task = {
      id: "t1",
      text: "Call Dana back",
      detail: "",
      urgency: "now",
      done: false,
      dueDate: TODAY,
      source: "manual",
      createdAt: TODAY,
    };
    const result = brief({ tasks: [dueNow] });
    expect(result.headline).toContain("due today");
    expect(result.focus.join(" | ")).toMatch(/follow-up.*due today/i);
  });

  it("names households worth ringing today", () => {
    expect(brief().freshProspects.some((p) => p.name === "Dana Reed")).toBe(true);
  });

  it("reports yesterday rather than today", () => {
    const yesterdayCall: Call = {
      id: "c1",
      prospectId: "p1",
      at: new Date(2026, 7, 19, 10, 0, 0).toISOString(),
      direction: "outbound",
      outcome: "Hot Lead",
      durationMin: null,
      summary: "",
      notes: "",
      sourceRef: null,
      createdBy: "manual",
      createdAt: "2026-08-19",
    };
    const result = brief({ calls: [yesterdayCall] });
    expect(result.yesterday.dials).toBe(1);
    expect(result.yesterday.hotLeads).toBe(1);
  });

  it("says so plainly when the day is empty", () => {
    expect(brief().headline).toBeTruthy();
  });
});

describe("today's schedule and follow-ups", () => {
  const prospects = [blankProspect({ id: "p1", name: "Dana Reed" })];

  it("shows only today's appointments", () => {
    const opportunities = [
      blankOpportunity("p1", {
        appointments: [
          { id: "a1", at: new Date(2026, 7, 20, 10, 0, 0).toISOString(), kind: "insurance-review", notes: "" },
          { id: "a2", at: new Date(2026, 7, 25, 10, 0, 0).toISOString(), kind: "meeting", notes: "" },
        ],
      }),
    ];
    expect(todaysSchedule(opportunities, prospects, TODAY)).toHaveLength(1);
  });

  it("puts overdue follow-ups before ones due today", () => {
    const tasks: Task[] = [
      { id: "a", text: "Due today", detail: "", urgency: "now", done: false, dueDate: TODAY, source: "manual", createdAt: TODAY },
      { id: "b", text: "Late", detail: "", urgency: "now", done: false, dueDate: "2026-08-01", source: "manual", createdAt: "2026-08-01" },
    ];
    const items = dueFollowUps(tasks, [], prospects, TODAY);
    expect(items[0].title).toBe("Late");
    expect(items[0].priority).toBe("overdue");
  });

  it("leaves out anything not yet due", () => {
    const tasks: Task[] = [
      { id: "a", text: "Next week", detail: "", urgency: "soon", done: false, dueDate: "2026-09-01", source: "manual", createdAt: TODAY },
    ];
    expect(dueFollowUps(tasks, [], prospects, TODAY)).toHaveLength(0);
  });

  it("leaves out finished work", () => {
    const tasks: Task[] = [
      { id: "a", text: "Done", detail: "", urgency: "now", done: true, dueDate: "2026-08-01", source: "manual", createdAt: TODAY },
    ];
    expect(dueFollowUps(tasks, [], prospects, TODAY)).toHaveLength(0);
  });
});

describe("correspondence triage", () => {
  it("sorts into the three buckets and ignores handled items", () => {
    const notes = [
      { id: "1", at: "", from: "Dana", subject: "Dec pages", bucket: "action" as const, handled: false },
      { id: "2", at: "", from: "Ken", subject: "Thanks", bucket: "informational" as const, handled: false },
      { id: "3", at: "", from: "Old", subject: "Sorted", bucket: "action" as const, handled: true },
    ];
    const triaged = triageCorrespondence(notes);
    expect(triaged.action).toHaveLength(1);
    expect(triaged.informational).toHaveLength(1);
    expect(triaged.total).toBe(2);
  });
});
