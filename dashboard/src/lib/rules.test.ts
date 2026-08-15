import { describe, expect, it } from "vitest";
import type { Call, CallOutcome, Contact, Prospect, Task } from "../types";
import { blankCall } from "./calls";
import { blankProspect } from "./prospectSchema";
import {
  RULE_CONSTANTS,
  addDays,
  addMonths,
  isRuleTask,
  quoteReadiness,
  reconcileProspect,
  replayCalls,
} from "./rules";

/**
 * Every rule, both caps, and what happens when a call in the middle of a run
 * is corrected or removed. The dates here are worked out by hand from the
 * constants rather than by calling the same helper the code uses.
 */

const DAY = "2026-08-03T14:00:00.000Z";

function call(overrides: Partial<Call> & { outcome: CallOutcome }): Call {
  return { ...blankCall("p1"), at: DAY, ...overrides };
}

function household(overrides: Partial<Prospect> = {}): Prospect {
  return blankProspect({ id: "p1", name: "Dana Reed", ...overrides });
}

function readyHousehold(): Prospect {
  const contact: Contact = {
    id: "c1",
    firstName: "Dana",
    lastName: "Reed",
    dob: "1984-04-02",
    phone: "(517) 555-0134",
    email: "dana@example.com",
    isPrimary: true,
    quoteReadyNote: "",
  };
  return household({
    contacts: [contact],
    address: { line1: "12 Maple St", city: "Howell", state: "MI", zip: "48843" },
  });
}

function run(prospect: Prospect, outcomes: CallOutcome[]) {
  const calls = outcomes.map((outcome, i) =>
    call({ id: `c${i}`, outcome, at: `2026-08-${String(i + 1).padStart(2, "0")}T14:00:00.000Z` }),
  );
  return { state: replayCalls(prospect, calls), calls };
}

/* ------------------------------------------------------------------ */

describe("constants are the single source", () => {
  it("holds the locked caps and cadences", () => {
    expect(RULE_CONSTANTS.maxAttempts).toBe(7);
    expect(RULE_CONSTANTS.maxVoicemails).toBe(3);
    expect(RULE_CONSTANTS.callbackDaysNoVoicemail).toBe(2);
    expect(RULE_CONSTANTS.callbackDaysAfterVoicemail).toBe(3);
    expect(RULE_CONSTANTS.nurtureFollowUpMonths).toEqual([1, 2]);
  });
});

describe("rule 1 — No Answer, no voicemail", () => {
  it("moves to Attempting and asks for a callback in two days", () => {
    const { state } = run(household(), ["No Answer — No Voicemail"]);
    expect(state.stage).toBe("Attempting");
    expect(state.pendingTask?.ruleId).toBe("no-answer-callback");
    expect(state.pendingTask?.dueDate).toBe("2026-08-03");
    expect(state.attempts).toBe(1);
  });

  it("links the task back to the call that made it", () => {
    const { state, calls } = run(household(), ["No Answer — No Voicemail"]);
    expect(state.pendingTask?.callId).toBe(calls[0].id);
  });
});

describe("rule 2 — No Answer, voicemail left", () => {
  it("moves to Attempting and asks for a callback in three days", () => {
    const { state } = run(household(), ["No Answer — Voicemail Left"]);
    expect(state.stage).toBe("Attempting");
    expect(state.pendingTask?.ruleId).toBe("voicemail-callback");
    expect(state.pendingTask?.dueDate).toBe("2026-08-04");
    expect(state.voicemails).toBe(1);
  });

  it("counts a voicemail as one of the seven, not as an extra", () => {
    const { state } = run(household(), [
      "No Answer — Voicemail Left",
      "No Answer — No Voicemail",
      "No Answer — Voicemail Left",
    ]);
    expect(state.attempts).toBe(3);
    expect(state.voicemails).toBe(2);
  });
});

describe("the combined seven-dial cap", () => {
  const sevenMixed: CallOutcome[] = [
    "No Answer — No Voicemail",
    "No Answer — Voicemail Left",
    "No Answer — No Voicemail",
    "No Answer — Voicemail Left",
    "No Answer — No Voicemail",
    "No Answer — Voicemail Left",
    "No Answer — No Voicemail",
  ];

  it("does not close on the sixth", () => {
    const { state } = run(household(), sevenMixed.slice(0, 6));
    expect(state.stage).toBe("Attempting");
    expect(state.exhausted).toBe(false);
    expect(state.pendingTask).not.toBeNull();
  });

  it("closes as unreachable on the seventh", () => {
    const { state } = run(household(), sevenMixed);
    expect(state.stage).toBe("Closed");
    expect(state.closedReason).toBe("unreachable");
    expect(state.exhausted).toBe(true);
  });

  it("cancels the callback task when it closes", () => {
    const { state } = run(household(), sevenMixed);
    expect(state.pendingTask).toBeNull();
  });

  it("counts both no-answer kinds toward the same seven", () => {
    const allVoicemail = Array<CallOutcome>(7).fill("No Answer — Voicemail Left");
    const { state } = run(household(), allVoicemail);
    expect(state.attempts).toBe(7);
    expect(state.stage).toBe("Closed");
    expect(state.closedReason).toBe("unreachable");
  });
});

describe("rule 3 — Bad Phone Number", () => {
  const { state } = run(household(), ["Bad Phone Number"]);

  it("closes with the bad-number reason", () => {
    expect(state.stage).toBe("Closed");
    expect(state.closedReason).toBe("bad-number");
  });

  it("raises an undated task so it never reads as due today", () => {
    expect(state.pendingTask?.ruleId).toBe("bad-number");
    expect(state.pendingTask?.dueDate).toBe("");
    expect(state.pendingTask?.urgency).toBe("someday");
  });

  it("does not mark the household do-not-contact", () => {
    expect(state.doNotContact).toBe(false);
  });
});

describe("rule 4 — Definitely Not Interested", () => {
  const { state } = run(household(), ["Definitely Not Interested"]);

  it("closes and sets do-not-contact", () => {
    expect(state.stage).toBe("Closed");
    expect(state.closedReason).toBe("not-interested");
    expect(state.doNotContact).toBe(true);
  });

  it("creates no follow-up at all", () => {
    expect(state.pendingTask).toBeNull();
  });
});

describe("rule 5 — Not at This Time", () => {
  it("first time: Nurture, one month out", () => {
    const { state } = run(household(), ["Not at This Time"]);
    expect(state.stage).toBe("Nurture");
    expect(state.pendingTask?.dueDate).toBe("2026-09-01");
  });

  it("second time: still Nurture, two months out", () => {
    const { state } = run(household(), ["Not at This Time", "Not at This Time"]);
    expect(state.stage).toBe("Nurture");
    expect(state.notAtThisTimeCount).toBe(2);
    // Second call is 2 Aug; two months on is 2 Oct.
    expect(state.pendingTask?.dueDate).toBe("2026-10-02");
  });

  it("third time: closed as dormant with nothing scheduled", () => {
    const { state } = run(household(), [
      "Not at This Time",
      "Not at This Time",
      "Not at This Time",
    ]);
    expect(state.stage).toBe("Closed");
    expect(state.closedReason).toBe("dormant");
    expect(state.pendingTask).toBeNull();
  });

  it("never puts a dormant household back on a timer", () => {
    const { state } = run(household(), Array<CallOutcome>(5).fill("Not at This Time"));
    expect(state.stage).toBe("Closed");
    expect(state.closedReason).toBe("dormant");
    expect(state.pendingTask).toBeNull();
  });
});

describe("rule 6 — Somewhat Interested", () => {
  it("goes to Quoting when the details are complete", () => {
    const { state } = run(readyHousehold(), ["Somewhat Interested"]);
    expect(state.stage).toBe("Quoting");
    expect(state.pendingTask?.ruleId).toBe("build-quote");
    expect(state.pendingTask?.dueDate).toBe("2026-08-02");
  });

  it("goes to Qualifying when anything is missing", () => {
    const { state } = run(household(), ["Somewhat Interested"]);
    expect(state.stage).toBe("Qualifying");
    expect(state.pendingTask?.ruleId).toBe("collect-details");
    expect(state.pendingTask?.dueDate).toBe("2026-08-03");
  });

  it("names exactly what is missing, and invents nothing", () => {
    const partial = household({
      contacts: [
        {
          id: "c1",
          firstName: "Dana",
          lastName: "Reed",
          dob: "",
          phone: "",
          email: "",
          isPrimary: true,
          quoteReadyNote: "",
        },
      ],
      address: { line1: "12 Maple St", city: "Howell", state: "MI", zip: "" },
    });
    const { state } = run(partial, ["Somewhat Interested"]);
    expect(state.pendingTask?.detail).toContain("date of birth");
    expect(state.pendingTask?.detail).toContain("ZIP");
    expect(state.pendingTask?.detail).not.toContain("first name");
    expect(state.pendingTask?.detail).not.toContain("city");
  });

  it("reports every gap when the household is empty", () => {
    const { missing, ready } = quoteReadiness(household());
    expect(ready).toBe(false);
    expect(missing).toEqual([
      "first name",
      "last name",
      "date of birth",
      "street address",
      "city",
      "state",
      "ZIP",
    ]);
  });
});

describe("rule 7 — Hot Lead", () => {
  it("goes to Opportunity with the stated next action due today", () => {
    const hot = call({ id: "h1", outcome: "Hot Lead — Very Interested", nextAction: "Send bundle quote" });
    const state = replayCalls(household(), [hot]);
    expect(state.stage).toBe("Opportunity");
    expect(state.nextAction).toBe("Send bundle quote");
    expect(state.pendingTask?.text).toBe("Send bundle quote");
    expect(state.pendingTask?.dueDate).toBe("2026-08-03");
    expect(state.pendingTask?.urgency).toBe("now");
  });

  it("never invents a conversion score", () => {
    const hot = call({ id: "h1", outcome: "Hot Lead — Very Interested", nextAction: "Call back" });
    const { prospect } = reconcileProspect(household(), [hot], [], {
      applyStage: true,
      today: "2026-08-03",
    });
    expect(prospect.conversionScore).toBeNull();
    expect(prospect.priorityGrade).toBe("");
  });
});

describe("rule 8 — Insurance Review Scheduled", () => {
  it("books the appointment task on the review date", () => {
    const booked = call({
      id: "r1",
      outcome: "Insurance Review Scheduled",
      appointmentAt: "2026-08-20T15:00:00.000Z",
    });
    const state = replayCalls(household(), [booked]);
    expect(state.stage).toBe("Review Scheduled");
    expect(state.pendingTask?.ruleId).toBe("review-appointment");
    expect(state.pendingTask?.kind).toBe("appointment");
    expect(state.pendingTask?.dueDate).toBe("2026-08-20");
  });
});

/* ------------------------------------------------------------------ */

describe("reconciliation", () => {
  const handTyped: Task = {
    id: "user-1",
    text: "Drop off a business card",
    detail: "",
    urgency: "soon",
    done: false,
    source: "manual",
    createdAt: "2026-08-01",
    prospectId: "p1",
  };

  it("links every generated task to household, call and rule", () => {
    const c = call({ id: "c1", outcome: "No Answer — No Voicemail" });
    const { tasks } = reconcileProspect(household(), [c], [], {
      applyStage: true,
      today: "2026-08-03",
    });
    const made = tasks.find(isRuleTask)!;
    expect(made.prospectId).toBe("p1");
    expect(made.callId).toBe("c1");
    expect(made.ruleId).toBe("no-answer-callback");
  });

  it("never touches a task somebody typed", () => {
    const c = call({ id: "c1", outcome: "Definitely Not Interested" });
    const { tasks } = reconcileProspect(household(), [c], [handTyped], {
      applyStage: true,
      today: "2026-08-03",
    });
    expect(tasks).toContainEqual(handTyped);
  });

  it("leaves other households' rule tasks alone", () => {
    const otherHouse: Task = { ...handTyped, id: "other", prospectId: "p2", ruleId: "no-answer-callback" };
    const c = call({ id: "c1", outcome: "Definitely Not Interested" });
    const { tasks } = reconcileProspect(household(), [c], [otherHouse], {
      applyStage: true,
      today: "2026-08-03",
    });
    expect(tasks).toContainEqual(otherHouse);
  });

  it("replaces the open callback rather than stacking a second one", () => {
    const first = call({ id: "c1", outcome: "No Answer — No Voicemail", at: "2026-08-01T14:00:00.000Z" });
    const second = call({ id: "c2", outcome: "No Answer — No Voicemail", at: "2026-08-04T14:00:00.000Z" });

    const afterFirst = reconcileProspect(household(), [first], [], {
      applyStage: true,
      today: "2026-08-01",
    });
    const afterSecond = reconcileProspect(afterFirst.prospect, [first, second], afterFirst.tasks, {
      applyStage: true,
      today: "2026-08-04",
    });

    expect(afterSecond.tasks.filter(isRuleTask)).toHaveLength(1);
    expect(afterSecond.tasks.find(isRuleTask)?.callId).toBe("c2");
  });

  it("keeps a completed rule task as a record of what happened", () => {
    const doneTask: Task = {
      ...handTyped,
      id: "done-1",
      done: true,
      ruleId: "no-answer-callback",
      callId: "c1",
    };
    const c = call({ id: "c2", outcome: "Definitely Not Interested" });
    const { tasks } = reconcileProspect(household(), [c], [doneTask], {
      applyStage: true,
      today: "2026-08-03",
    });
    expect(tasks).toContainEqual(doneTask);
  });

  it("cancels the open callback when the cap closes the household", () => {
    const outcomes = Array<CallOutcome>(7).fill("No Answer — No Voicemail");
    const calls = outcomes.map((outcome, i) =>
      call({ id: `c${i}`, outcome, at: `2026-08-0${i + 1}T14:00:00.000Z` }),
    );
    const { prospect, tasks } = reconcileProspect(household(), calls, [], {
      applyStage: true,
      today: "2026-08-07",
    });
    expect(prospect.stage).toBe("Closed");
    expect(prospect.closedReason).toBe("unreachable");
    expect(tasks.filter(isRuleTask)).toHaveLength(0);
  });
});

describe("edits and deletions reconcile", () => {
  const first = call({ id: "c1", outcome: "No Answer — No Voicemail", at: "2026-08-01T14:00:00.000Z" });
  const second = call({ id: "c2", outcome: "Somewhat Interested", at: "2026-08-05T14:00:00.000Z" });

  it("falls back to the earlier call's rule when the newest is deleted", () => {
    const both = reconcileProspect(household(), [first, second], [], {
      applyStage: true,
      today: "2026-08-05",
    });
    expect(both.prospect.stage).toBe("Qualifying");

    const afterDelete = reconcileProspect(both.prospect, [first], both.tasks, {
      applyStage: false,
      today: "2026-08-06",
    });
    expect(afterDelete.prospect.stage).toBe("Attempting");
    expect(afterDelete.tasks.find(isRuleTask)?.callId).toBe("c1");
  });

  it("follows an edit that changes the newest call's outcome", () => {
    const before = reconcileProspect(household(), [first, second], [], {
      applyStage: true,
      today: "2026-08-05",
    });
    const corrected = { ...second, outcome: "Definitely Not Interested" as CallOutcome };

    const after = reconcileProspect(before.prospect, [first, corrected], before.tasks, {
      applyStage: false,
      today: "2026-08-06",
    });
    expect(after.prospect.stage).toBe("Closed");
    expect(after.prospect.closedReason).toBe("not-interested");
    expect(after.prospect.doNotContact).toBe(true);
    expect(after.tasks.filter(isRuleTask)).toHaveLength(0);
  });

  it("un-sets do-not-contact when the call that set it is removed", () => {
    const refusal = call({ id: "c9", outcome: "Definitely Not Interested" });
    const set = reconcileProspect(household(), [refusal], [], {
      applyStage: true,
      today: "2026-08-03",
    });
    expect(set.prospect.doNotContact).toBe(true);

    const removed = reconcileProspect(set.prospect, [], set.tasks, {
      applyStage: false,
      today: "2026-08-04",
    });
    expect(removed.prospect.doNotContact).toBe(false);
  });

  it("stops claiming a rule set the stage once every call is gone", () => {
    const set = reconcileProspect(household(), [first], [], {
      applyStage: true,
      today: "2026-08-01",
    });
    expect(set.prospect.stageSource).toBe("rule");
    expect(set.prospect.stageCallId).toBe("c1");

    const emptied = reconcileProspect(set.prospect, [], set.tasks, {
      applyStage: false,
      today: "2026-08-02",
    });
    expect(emptied.prospect.stageSource).toBe("manual");
    expect(emptied.prospect.stageCallId).toBeNull();
    expect(emptied.tasks.filter(isRuleTask)).toHaveLength(0);
  });
});

describe("a stage moved by hand is respected", () => {
  const c = call({ id: "c1", outcome: "No Answer — No Voicemail" });

  it("survives a later correction to an old call", () => {
    const moved = household({ stage: "Opportunity", stageSource: "manual", stageCallId: null });
    const { prospect } = reconcileProspect(moved, [c], [], {
      applyStage: false,
      today: "2026-08-03",
    });
    expect(prospect.stage).toBe("Opportunity");
    expect(prospect.stageSource).toBe("manual");
  });

  it("still reconciles that household's tasks", () => {
    const moved = household({ stage: "Opportunity", stageSource: "manual", stageCallId: null });
    const { tasks } = reconcileProspect(moved, [c], [], {
      applyStage: false,
      today: "2026-08-03",
    });
    expect(tasks.filter(isRuleTask)).toHaveLength(1);
  });

  it("is overridden by newly logging a call, which is an explicit act", () => {
    const moved = household({ stage: "Opportunity", stageSource: "manual", stageCallId: null });
    const { prospect } = reconcileProspect(moved, [c], [], {
      applyStage: true,
      today: "2026-08-03",
    });
    expect(prospect.stage).toBe("Attempting");
    expect(prospect.stageSource).toBe("rule");
  });
});

describe("date helpers", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-08-30T12:00:00.000Z", 3)).toBe("2026-09-02");
  });

  it("clamps a month addition onto a short month", () => {
    expect(addMonths("2026-01-31T12:00:00.000Z", 1)).toBe("2026-02-28");
  });

  it("adds two months normally", () => {
    expect(addMonths("2026-08-15T12:00:00.000Z", 2)).toBe("2026-10-15");
  });
});
