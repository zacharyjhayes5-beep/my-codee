import { describe, expect, it } from "vitest";
import type { Call, CallOutcome, Prospect, ReviewProposal, Task } from "../types";
import { blankCall } from "./calls";
import { blankProspect } from "./prospectSchema";
import { blankOpportunity, opportunityFromCall } from "./opportunities";
import { whatNeedsMe } from "./attention";
import { DAILY_GOALS, countDay, dayElapsed, endOfDay, readGoals } from "./goals";

const TODAY = "2026-08-20";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 20, hour, minute, 0);
}

function call(id: string, prospectId: string, outcome: CallOutcome, day = TODAY): Call {
  return { ...blankCall(prospectId), id, outcome, at: `${day}T10:00:00.000Z` };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    text: `Task ${id}`,
    detail: "",
    urgency: "week",
    done: false,
    source: "manual",
    createdAt: TODAY,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

describe("the agreed daily targets", () => {
  it("holds the exact numbers", () => {
    const byId = Object.fromEntries(DAILY_GOALS.map((g) => [g.id, g]));
    expect(byId.coldCalls.goal).toBe(30);
    expect(byId.coldCalls.stretch).toBe(50);
    expect(byId.referralOutreach.goal).toBe(2);
    expect(byId.targetedProspects.goal).toBe(3);
    expect(byId.quoteFollowUps.goal).toBe(2);
  });
});

describe("counting the day", () => {
  const prospects: Prospect[] = [
    blankProspect({ id: "ref", leadSource: "Referral — Dana" }),
    blankProspect({ id: "targeted", whyTheyFit: "Lakefront, two cars" }),
    blankProspect({ id: "plain" }),
  ];

  it("counts every dial logged today", () => {
    const calls = [
      call("a", "plain", "No Answer — No Voicemail"),
      call("b", "plain", "Somewhat Interested"),
      call("c", "plain", "No Answer — No Voicemail", "2026-08-19"),
    ];
    expect(countDay(calls, prospects, [], TODAY).coldCalls).toBe(2);
  });

  it("counts a conversation only when somebody picked up", () => {
    const calls = [
      call("a", "plain", "No Answer — No Voicemail"),
      call("b", "plain", "No Answer — Voicemail"),
      call("c", "plain", "Bad Number"),
      call("d", "plain", "Not At This Time"),
      call("e", "plain", "Hot Lead"),
    ];
    expect(countDay(calls, prospects, [], TODAY).conversations).toBe(2);
  });

  it("counts referral outreach from the lead source", () => {
    const calls = [call("a", "ref", "Somewhat Interested"), call("b", "plain", "Somewhat Interested")];
    expect(countDay(calls, prospects, [], TODAY).referralOutreach).toBe(1);
  });

  it("counts a targeted call by whether the household was researched", () => {
    const calls = [call("a", "targeted", "Hot Lead"), call("b", "plain", "Hot Lead")];
    expect(countDay(calls, prospects, [], TODAY).targetedProspects).toBe(1);
  });

  it("counts quote follow-ups when the work is finished, not when scheduled", () => {
    const tasks = [
      task("open", { kind: "quote" }),
      task("done", { kind: "quote", done: true, completedAt: TODAY }),
      task("yesterday", { kind: "quote", done: true, completedAt: "2026-08-19" }),
    ];
    expect(countDay([], prospects, tasks, TODAY).quoteFollowUps).toBe(1);
  });

  it("counts the valuable outcomes separately", () => {
    const calls = [
      call("a", "plain", "Somewhat Interested"),
      call("b", "plain", "Hot Lead"),
      call("c", "plain", "Insurance Review Scheduled"),
    ];
    const counts = countDay(calls, prospects, [], TODAY);
    expect(counts.somewhatInterested).toBe(1);
    expect(counts.hotLeads).toBe(1);
    expect(counts.reviewsScheduled).toBe(1);
  });
});

describe("a call counts on the day it was made, where you are", () => {
  const prospects = [blankProspect({ id: "p1" })];

  it("counts an evening call toward today, not tomorrow", () => {
    // 8pm local on the 20th is already the 21st in UTC.
    const evening = new Date(2026, 7, 20, 20, 0, 0).toISOString();
    const calls = [{ ...blankCall("p1"), id: "e", outcome: "Hot Lead" as CallOutcome, at: evening }];
    expect(countDay(calls, prospects, [], TODAY).coldCalls).toBe(1);
  });

  it("does not count an early call from yesterday", () => {
    const yesterday = new Date(2026, 7, 19, 9, 0, 0).toISOString();
    const calls = [{ ...blankCall("p1"), id: "y", outcome: "Hot Lead" as CallOutcome, at: yesterday }];
    expect(countDay(calls, prospects, [], TODAY).coldCalls).toBe(0);
  });

  it("spots an appointment booked for this evening", () => {
    const evening = new Date(2026, 7, 20, 19, 0, 0).toISOString();
    const withAppointment = blankOpportunity("p1", {
      nextAction: "Review",
      nextActionDate: "2026-09-01",
      appointments: [{ id: "a1", at: evening, kind: "insurance-review", notes: "" }],
    });
    const items = whatNeedsMe({
      prospects,
      opportunities: [withAppointment],
      tasks: [],
      reviews: [],
      today: TODAY,
    });
    expect(items.some((i) => i.kind === "appointment-today")).toBe(true);
  });
});

describe("pace", () => {
  const counts = { ...countDay([], [], [], TODAY), coldCalls: 10 };

  it("is nothing before the day starts", () => {
    expect(dayElapsed(at(7))).toBe(0);
  });

  it("is halfway at the middle of the working day", () => {
    // 8am to 5pm, so the midpoint is half past twelve.
    expect(dayElapsed(at(12, 30))).toBeCloseTo(0.5, 2);
  });

  it("is finished after the day ends", () => {
    expect(dayElapsed(at(19))).toBe(1);
  });

  it("calls you behind when the clock is ahead of the count", () => {
    // 10 of 30 dials with most of the day gone.
    const reading = readGoals(counts, at(15)).find((g) => g.id === "coldCalls")!;
    expect(reading.onPace).toBe(false);
    expect(reading.advice).toContain("Behind");
  });

  it("says what per hour it now takes to recover", () => {
    const reading = readGoals(counts, at(15)).find((g) => g.id === "coldCalls")!;
    // 20 to go, two hours left.
    expect(reading.perHourNeeded).toBeCloseTo(10, 1);
    expect(reading.advice).toContain("10/hr");
  });

  it("calls you on pace early in the day", () => {
    const reading = readGoals(counts, at(9)).find((g) => g.id === "coldCalls")!;
    expect(reading.onPace).toBe(true);
  });

  it("points at the stretch once the goal is met", () => {
    const met = { ...counts, coldCalls: 32 };
    const reading = readGoals(met, at(15)).find((g) => g.id === "coldCalls")!;
    expect(reading.remaining).toBe(0);
    expect(reading.advice).toContain("stretch");
  });

  it("stops nagging once the stretch is met too", () => {
    const smashed = { ...counts, coldCalls: 55 };
    expect(readGoals(smashed, at(16)).find((g) => g.id === "coldCalls")!.advice).toBe("Goal met");
  });

  it("says the day is over rather than an impossible rate", () => {
    const reading = readGoals(counts, at(19)).find((g) => g.id === "coldCalls")!;
    expect(reading.advice).toContain("day is over");
  });
});

/* ------------------------------------------------------------------ */
/* What needs me                                                       */
/* ------------------------------------------------------------------ */

describe("what needs me", () => {
  const prospects = [blankProspect({ id: "p1", name: "Dana Reed" })];
  const base = { prospects, opportunities: [], tasks: [], reviews: [] as ReviewProposal[], today: TODAY };

  it("puts a due opportunity above an overdue task", () => {
    const items = whatNeedsMe({
      ...base,
      opportunities: [
        blankOpportunity("p1", { nextAction: "Present the quote", nextActionDate: TODAY }),
      ],
      tasks: [task("t1", { dueDate: "2026-08-01" })],
    });
    expect(items[0].kind).toBe("hot-opportunity");
  });

  it("puts today's appointment near the very top", () => {
    const withAppointment = blankOpportunity("p1", {
      nextAction: "Review",
      nextActionDate: "2026-09-01",
      appointments: [{ id: "a1", at: `${TODAY}T15:00:00.000Z`, kind: "insurance-review", notes: "" }],
    });
    const items = whatNeedsMe({ ...base, opportunities: [withAppointment] });
    expect(items[0].kind).toBe("appointment-today");
  });

  it("surfaces overdue follow-ups", () => {
    const items = whatNeedsMe({ ...base, tasks: [task("t1", { dueDate: "2026-08-01" })] });
    expect(items[0].kind).toBe("overdue-follow-up");
    expect(items[0].detail).toContain("Overdue");
  });

  it("surfaces households that hit the attempt cap", () => {
    const items = whatNeedsMe({
      ...base,
      prospects: [blankProspect({ id: "p1", name: "Dana", needsReview: true })],
    });
    expect(items.some((i) => i.kind === "attempt-review")).toBe(true);
  });

  it("flags an opportunity that has gone quiet", () => {
    const quiet = blankOpportunity("p1", {
      stage: "Quote Presented",
      nextAction: "Chase",
      nextActionDate: "2026-09-30",
      updatedAt: "2026-08-01",
    });
    const items = whatNeedsMe({ ...base, opportunities: [quiet] });
    expect(items.some((i) => i.kind === "stalled-quote")).toBe(true);
  });

  it("ignores written and lost business", () => {
    const won = blankOpportunity("p1", { stage: "Won", nextActionDate: "2026-08-01" });
    expect(whatNeedsMe({ ...base, opportunities: [won] })).toHaveLength(0);
  });

  it("shows at most five things", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task(`t${i}`, { dueDate: "2026-08-01" }));
    expect(whatNeedsMe({ ...base, tasks })).toHaveLength(5);
  });

  it("says nothing when there is nothing", () => {
    expect(whatNeedsMe(base)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Opportunities from a call                                           */
/* ------------------------------------------------------------------ */

describe("a call that means business creates an opportunity", () => {
  const review: Call = {
    ...blankCall("p1"),
    outcome: "Insurance Review Scheduled",
    appointmentAt: "2026-09-04T15:00:00.000Z",
  };

  it("attaches the review as an appointment, not a stage", () => {
    const result = opportunityFromCall(review, [], false)!;
    const made = result.next[0];
    expect(result.created).toBe(true);
    expect(made.appointments).toHaveLength(1);
    expect(made.appointments[0].kind).toBe("insurance-review");
    expect(made.stage).not.toBe("Review Scheduled" as never);
  });

  it("always gives the new opportunity a next action and a date", () => {
    const made = opportunityFromCall(review, [], false)!.next[0];
    expect(made.nextAction).toBeTruthy();
    expect(made.nextActionDate).toBe("2026-09-04");
  });

  it("routes Somewhat Interested by whether a quote can be built", () => {
    const warm: Call = { ...blankCall("p1"), outcome: "Somewhat Interested", nextActionAt: "2026-08-25" };
    expect(opportunityFromCall(warm, [], true)!.next[0].stage).toBe("Quoting");
    expect(opportunityFromCall(warm, [], false)!.next[0].stage).toBe(
      "Fact-Find / Information Gathering",
    );
  });

  it("updates the existing opportunity rather than making a second", () => {
    const existing = [
      blankOpportunity("p1", { stage: "Quoting", nextAction: "Quote", nextActionDate: "2026-08-21" }),
    ];
    const result = opportunityFromCall(review, existing, false)!;
    expect(result.created).toBe(false);
    expect(result.next).toHaveLength(1);
    expect(result.next[0].appointments).toHaveLength(1);
  });

  it("does not drag an opportunity backwards down the pipeline", () => {
    const advanced = [
      blankOpportunity("p1", {
        stage: "Decision Pending",
        nextAction: "Chase",
        nextActionDate: "2026-08-21",
      }),
    ];
    expect(opportunityFromCall(review, advanced, false)!.next[0].stage).toBe("Decision Pending");
  });

  it("makes nothing for an outcome that is not business", () => {
    const nobody: Call = { ...blankCall("p1"), outcome: "No Answer — No Voicemail" };
    expect(opportunityFromCall(nobody, [], false)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* End of day                                                          */
/* ------------------------------------------------------------------ */

describe("end of day", () => {
  const prospects = [blankProspect({ id: "p1", name: "Dana Reed" })];

  it("reports the day's real activity", () => {
    const calls = [
      call("a", "p1", "No Answer — No Voicemail"),
      call("b", "p1", "Hot Lead"),
    ];
    const report = endOfDay(calls, prospects, [], [], TODAY, at(17));
    expect(report.counts.coldCalls).toBe(2);
    expect(report.counts.hotLeads).toBe(1);
  });

  it("counts opportunities opened today", () => {
    const opps = [
      blankOpportunity("p1", { createdAt: TODAY }),
      blankOpportunity("p1", { createdAt: "2026-08-01" }),
    ];
    expect(endOfDay([], prospects, [], opps, TODAY, at(17)).newOpportunities).toBe(1);
  });

  it("lists the stage changes that happened today", () => {
    const moved = blankOpportunity("p1", {
      history: [
        { id: "h1", at: `${TODAY}T11:00:00.000Z`, field: "stage", from: "Quoting", to: "Quote Presented", summary: "stage: Quoting → Quote Presented" },
        { id: "h2", at: "2026-08-01T11:00:00.000Z", field: "stage", from: "a", to: "b", summary: "old" },
      ],
    });
    const report = endOfDay([], prospects, [], [moved], TODAY, at(17));
    expect(report.pipelineMoves).toHaveLength(1);
    expect(report.pipelineMoves[0].name).toBe("Dana Reed");
  });

  it("names tomorrow's priorities from what is due", () => {
    const tasks = [task("t1", { dueDate: "2026-08-21", text: "Call Dana back" })];
    const report = endOfDay([], prospects, tasks, [], TODAY, at(17));
    expect(report.tomorrow.some((t) => t.text === "Call Dana back")).toBe(true);
  });

  it("includes what is already overdue in tomorrow's list", () => {
    const tasks = [task("t1", { dueDate: "2026-08-10", text: "Chase the quote" })];
    const report = endOfDay([], prospects, tasks, [], TODAY, at(17));
    expect(report.tomorrow.find((t) => t.text === "Chase the quote")?.why).toBe("overdue");
  });
});
