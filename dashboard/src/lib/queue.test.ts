import { describe, expect, it } from "vitest";
import type { Call, CallOutcome, Opportunity, Prospect, Task } from "../types";
import { blankCall } from "./calls";
import { currentOutcome, normalizeCalls, callsNeedMigration } from "./callSchema";
import { blankOpportunity } from "./opportunities";
import { blankProspect } from "./prospectSchema";
import { TIERS, buildQueue, eligibilityOf, nextCall, queueStats } from "./queue";

/**
 * The queue makes two separate promises: it never rings somebody it should not,
 * and it never buries a hot lead under cold names. These test each one on its
 * own so a failure says which promise broke.
 */

const TODAY = "2026-08-20";

function household(id: string, overrides: Partial<Prospect> = {}): Prospect {
  return blankProspect({ id, name: `Household ${id}`, createdAt: "2026-01-01", ...overrides });
}

function call(id: string, prospectId: string, outcome: CallOutcome, at = "2026-08-10T10:00:00.000Z"): Call {
  return { ...blankCall(prospectId), id, at, outcome };
}

function task(id: string, prospectId: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    text: "Call again",
    detail: "",
    urgency: "week",
    done: false,
    source: "manual",
    createdAt: "2026-08-10",
    prospectId,
    ruleId: "no-answer-callback",
    ...overrides,
  };
}

function input(over: Partial<Parameters<typeof buildQueue>[0]> = {}) {
  return {
    prospects: [],
    calls: [],
    tasks: [],
    opportunities: [] as Opportunity[],
    today: TODAY,
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

describe("who may not be called", () => {
  it("never rings a do-not-contact household", () => {
    const p = household("a", { doNotContact: true });
    const e = eligibilityOf(p, [], [], TODAY);
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe("do-not-contact");
  });

  it("never rings a bad number", () => {
    const p = household("a", { needsPhoneNumber: true });
    expect(eligibilityOf(p, [], [], TODAY).reason).toBe("bad-number");
  });

  it("never rings a closed household", () => {
    const p = household("a", { stage: "Closed", closedReason: "not-interested" });
    expect(eligibilityOf(p, [], [], TODAY).reason).toBe("not-interested");
  });

  it("never rings one already written", () => {
    expect(eligibilityOf(household("a", { stage: "Won" }), [], [], TODAY).reason).toBe("won");
  });

  it("holds one flagged for review after the attempt cap", () => {
    const p = household("a", { needsReview: true });
    const e = eligibilityOf(p, [], [], TODAY);
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe("attempts-exhausted");
  });

  it("holds one that has used seven attempts even without the flag", () => {
    const p = household("a");
    const calls = Array.from({ length: 7 }, (_, i) =>
      call(`c${i}`, "a", "No Answer — No Voicemail"),
    );
    expect(eligibilityOf(p, calls, [], TODAY).reason).toBe("attempts-exhausted");
  });

  it("holds one until its scheduled callback comes due", () => {
    const p = household("a");
    const scheduled = [task("t1", "a", { dueDate: "2026-08-25" })];
    const e = eligibilityOf(p, [], scheduled, TODAY);
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe("scheduled-later");
    expect(e.nextEligibleOn).toBe("2026-08-25");
  });

  it("releases it on the day the callback is due", () => {
    const p = household("a");
    const due = [task("t1", "a", { dueDate: TODAY })];
    expect(eligibilityOf(p, [], due, TODAY).eligible).toBe(true);
  });

  it("allows a plain new household", () => {
    expect(eligibilityOf(household("a"), [], [], TODAY).eligible).toBe(true);
  });

  it("does not close a bad number, but holds it for research", () => {
    const p = household("a", { stage: "Contacted", needsPhoneNumber: true });
    const e = eligibilityOf(p, [], [], TODAY);
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe("bad-number");
    // Still an open, recoverable record.
    expect(p.stage).not.toBe("Closed");
    expect(p.closedReason).toBeNull();
  });

  it("holds a dormant Nurture household with nothing scheduled", () => {
    const p = household("a", { stage: "Nurture" });
    const e = eligibilityOf(p, [], [], TODAY);
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe("dormant");
  });

  it("calls a Nurture household again once its revisit comes due", () => {
    const p = household("a", { stage: "Nurture" });
    const scheduled = [task("t1", "a", { dueDate: TODAY, ruleId: "nurture-follow-up" })];
    expect(eligibilityOf(p, [], scheduled, TODAY).eligible).toBe(true);
  });

  it("never says never-called about a household that has been spoken to", () => {
    const spoken = [call("c1", "a", "Not At This Time")];
    const queue = buildQueue(input({ prospects: [household("a")], calls: spoken }));
    expect(queue[0].why).not.toContain("Never called");
  });

  it("holds a hot lead whose next action is booked for later", () => {
    const p = household("a", {
      stage: "Opportunity",
      nextAction: "Present the quote",
      nextActionDate: "2026-08-25",
    });
    const e = eligibilityOf(p, [], [], TODAY);
    expect(e.eligible).toBe(false);
    expect(e.reason).toBe("scheduled-later");
    expect(e.nextEligibleOn).toBe("2026-08-25");
  });

  it("releases that hot lead on the day it is due", () => {
    const p = household("a", { stage: "Opportunity", nextActionDate: TODAY });
    expect(eligibilityOf(p, [], [], TODAY).eligible).toBe(true);
  });

  it("keeps a hot lead callable when nothing is scheduled", () => {
    expect(eligibilityOf(household("a", { stage: "Opportunity" }), [], [], TODAY).eligible).toBe(true);
  });

  it("stops the same household being served twice in a row", () => {
    // What logging a hot lead with a future date leaves behind.
    const worked = household("worked", {
      stage: "Opportunity",
      nextAction: "Schedule review",
      nextActionDate: "2026-08-22",
    });
    const waiting = household("waiting", { priorityGrade: "A" });
    expect(nextCall(input({ prospects: [worked, waiting] }))?.prospect.id).toBe("waiting");
  });

  it("keeps dialling after three voicemails, but says to stop leaving them", () => {
    const calls = Array.from({ length: 3 }, (_, i) => call(`c${i}`, "a", "No Answer — Voicemail"));
    const e = eligibilityOf(household("a"), calls, [], TODAY);
    expect(e.eligible).toBe(true);
    expect(e.voicemailCapReached).toBe(true);
  });

  it("does not claim the voicemail cap early", () => {
    const calls = [call("c0", "a", "No Answer — Voicemail")];
    expect(eligibilityOf(household("a"), calls, [], TODAY).voicemailCapReached).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Priority                                                            */
/* ------------------------------------------------------------------ */

describe("who gets called first", () => {
  it("puts an opportunity with work due today above everything", () => {
    const cold = household("cold");
    const hot = household("hot");
    const opp: Opportunity = blankOpportunity("hot", {
      stage: "Quote Presented",
      nextAction: "Present the quote",
      nextActionDate: "2026-08-19",
    });

    const queue = buildQueue(input({ prospects: [cold, hot], opportunities: [opp] }));
    expect(queue[0].prospect.id).toBe("hot");
    expect(queue[0].tier).toBe(TIERS.hotOpportunityDue);
  });

  it("treats a hot-lead stage as top tier even with no opportunity record", () => {
    const queue = buildQueue(
      input({ prospects: [household("cold"), household("hot", { stage: "Opportunity" })] }),
    );
    expect(queue[0].prospect.id).toBe("hot");
  });

  it("puts a due follow-up above a never-called name", () => {
    const queue = buildQueue(
      input({
        prospects: [household("new"), household("due")],
        tasks: [task("t1", "due", { dueDate: "2026-08-18", ruleId: undefined })],
      }),
    );
    expect(queue[0].prospect.id).toBe("due");
    expect(queue[0].tier).toBe(TIERS.followUpDue);
  });

  it("puts a graded, never-called household above an ungraded one", () => {
    const queue = buildQueue(
      input({ prospects: [household("plain"), household("graded", { priorityGrade: "A" })] }),
    );
    expect(queue[0].prospect.id).toBe("graded");
    expect(queue[0].tier).toBe(TIERS.newQualified);
  });

  it("puts a targeted household above a bare cold name", () => {
    const queue = buildQueue(
      input({
        prospects: [household("plain"), household("targeted", { whyTheyFit: "Lakefront, two cars" })],
      }),
    );
    expect(queue[0].prospect.id).toBe("targeted");
    expect(queue[0].tier).toBe(TIERS.targeted);
  });

  it("puts a prior no-answer below fresh qualified work", () => {
    const queue = buildQueue(
      input({
        prospects: [household("tried"), household("fresh", { priorityGrade: "B" })],
        calls: [call("c1", "tried", "No Answer — No Voicemail")],
      }),
    );
    expect(queue[0].prospect.id).toBe("fresh");
    expect(queue[1].tier).toBe(TIERS.priorNoAnswer);
  });

  it("never picks the oldest record just for being oldest", () => {
    const old = household("old", { createdAt: "2020-01-01" });
    const hot = household("hot", { stage: "Opportunity", createdAt: "2026-08-19" });
    expect(nextCall(input({ prospects: [old, hot] }))?.prospect.id).toBe("hot");
  });

  it("breaks a tie by who has waited longest", () => {
    const recent = household("recent", { priorityGrade: "A", lastContactedAt: "2026-08-19T10:00:00.000Z" });
    const stale = household("stale", { priorityGrade: "A", lastContactedAt: "2026-05-01T10:00:00.000Z" });
    const queue = buildQueue(input({ prospects: [recent, stale] }));
    expect(queue[0].prospect.id).toBe("stale");
  });

  it("explains why each one is where it is", () => {
    const queue = buildQueue(input({ prospects: [household("a", { whyTheyFit: "Lakefront" })] }));
    expect(queue[0].why).toBe("Lakefront");
    expect(queue[0].tierLabel).toBeTruthy();
  });
});

describe("NEXT CALL", () => {
  it("skips anyone who may not be called", () => {
    const blocked = household("blocked", { stage: "Opportunity", doNotContact: true });
    const callable = household("callable", { priorityGrade: "A" });
    expect(nextCall(input({ prospects: [blocked, callable] }))?.prospect.id).toBe("callable");
  });

  it("returns nothing when everyone is held back", () => {
    expect(
      nextCall(input({ prospects: [household("a", { doNotContact: true })] })),
    ).toBeNull();
  });

  it("counts what is callable and why the rest are not", () => {
    const entries = buildQueue(
      input({
        prospects: [
          household("ok"),
          household("dnc", { doNotContact: true }),
          household("flagged", { needsReview: true }),
        ],
      }),
    );
    const stats = queueStats(entries);
    expect(stats.callable).toBe(1);
    expect(stats.held).toBe(2);
    expect(stats.needingReview).toBe(1);
    expect(stats.byReason["do-not-contact"]).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* The outcome rename                                                  */
/* ------------------------------------------------------------------ */

describe("older outcome names still read", () => {
  it("maps every retired name onto its replacement", () => {
    expect(currentOutcome("No Answer — Voicemail Left")).toBe("No Answer — Voicemail");
    expect(currentOutcome("Bad Phone Number")).toBe("Bad Number");
    expect(currentOutcome("Hot Lead — Very Interested")).toBe("Hot Lead");
    expect(currentOutcome("Not at This Time")).toBe("Not At This Time");
  });

  it("leaves a current name alone", () => {
    expect(currentOutcome("Somewhat Interested")).toBe("Somewhat Interested");
  });

  it("returns null for something it has never seen", () => {
    expect(currentOutcome("Left A Carrier Pigeon")).toBeNull();
    expect(currentOutcome(undefined)).toBeNull();
  });

  it("spots records that still need migrating", () => {
    const old = [{ ...blankCall("p1"), outcome: "Bad Phone Number" as CallOutcome }];
    expect(callsNeedMigration(old)).toBe(true);
    expect(callsNeedMigration(normalizeCalls(old))).toBe(false);
  });

  it("rewrites the stored value so the rules match on it again", () => {
    const old = [{ ...blankCall("p1"), outcome: "Hot Lead — Very Interested" as CallOutcome }];
    expect(normalizeCalls(old)[0].outcome).toBe("Hot Lead");
  });
});
