import { describe, expect, it } from "vitest";
import type { Call, CallOutcome } from "../types";
import { callOutcomes } from "./defaultData";
import {
  attemptCounts,
  blankCall,
  callsFor,
  fromLocalInput,
  isNoAnswer,
  latestCall,
  toLocalInput,
  withLatestCallFields,
} from "./calls";
import { blankProspect } from "./prospectSchema";

function call(id: string, prospectId: string, at: string, outcome: CallOutcome): Call {
  return {
    ...blankCall(prospectId),
    id,
    at,
    outcome,
  };
}

describe("the eight outcomes", () => {
  it("offers exactly the approved list, in order", () => {
    expect(callOutcomes).toEqual([
      "No Answer — No Voicemail",
      "No Answer — Voicemail",
      "Bad Number",
      "Definitely Not Interested",
      "Not At This Time",
      "Somewhat Interested",
      "Hot Lead",
      "Insurance Review Scheduled",
    ]);
  });

  it("treats only the two no-answer outcomes as unanswered", () => {
    expect(isNoAnswer("No Answer — No Voicemail")).toBe(true);
    expect(isNoAnswer("No Answer — Voicemail")).toBe(true);
    for (const outcome of callOutcomes.slice(2)) {
      expect(isNoAnswer(outcome)).toBe(false);
    }
  });

  it("round-trips every outcome through a saved call", () => {
    for (const outcome of callOutcomes) {
      const saved = call("c", "p1", "2026-08-15T14:00:00.000Z", outcome);
      expect(saved.outcome).toBe(outcome);
      expect(withLatestCallFields(blankProspect({ id: "p1" }), [saved]).lastOutcome).toBe(outcome);
    }
  });
});

describe("a call belongs to exactly one household", () => {
  const calls = [
    call("a", "p1", "2026-08-10T10:00:00.000Z", "Somewhat Interested"),
    call("b", "p2", "2026-08-11T10:00:00.000Z", "Bad Number"),
    call("c", "p1", "2026-08-12T10:00:00.000Z", "Not At This Time"),
  ];

  it("returns only that household's calls", () => {
    expect(callsFor(calls, "p1").map((c) => c.id)).toEqual(["c", "a"]);
    expect(callsFor(calls, "p2").map((c) => c.id)).toEqual(["b"]);
  });

  it("returns nothing for a household with no calls", () => {
    expect(callsFor(calls, "p3")).toEqual([]);
  });

  it("sorts newest first", () => {
    const ordered = callsFor(calls, "p1");
    expect(ordered[0].at > ordered[1].at).toBe(true);
  });
});

describe("latest-call fields", () => {
  const prospect = blankProspect({ id: "p1", name: "Dana Reed" });

  it("takes the outcome from the newest call, not the last one entered", () => {
    // Entered out of order on purpose.
    const calls = [
      call("late", "p1", "2026-08-14T09:00:00.000Z", "Hot Lead"),
      call("early", "p1", "2026-08-02T09:00:00.000Z", "No Answer — No Voicemail"),
    ];
    const updated = withLatestCallFields(prospect, calls);
    expect(updated.lastOutcome).toBe("Hot Lead");
    expect(updated.lastOutcomeAt).toBe("2026-08-14T09:00:00.000Z");
  });

  it("sets last contacted from any call, answered or not", () => {
    const calls = [call("x", "p1", "2026-08-14T09:00:00.000Z", "No Answer — No Voicemail")];
    expect(withLatestCallFields(prospect, calls).lastContactedAt).toBe("2026-08-14T09:00:00.000Z");
  });

  it("falls back to the previous call when the newest is deleted", () => {
    const older = call("older", "p1", "2026-08-02T09:00:00.000Z", "Not At This Time");
    const newer = call("newer", "p1", "2026-08-14T09:00:00.000Z", "Somewhat Interested");

    const after = withLatestCallFields(prospect, [older, newer]);
    expect(after.lastOutcome).toBe("Somewhat Interested");

    const deleted = withLatestCallFields(after, [older]);
    expect(deleted.lastOutcome).toBe("Not At This Time");
    expect(deleted.lastOutcomeAt).toBe("2026-08-02T09:00:00.000Z");
  });

  it("clears the fields when the only call is deleted", () => {
    const withCall = withLatestCallFields(prospect, [
      call("only", "p1", "2026-08-14T09:00:00.000Z", "Somewhat Interested"),
    ]);
    expect(withCall.lastOutcome).toBe("Somewhat Interested");

    const emptied = withLatestCallFields(withCall, []);
    expect(emptied.lastOutcome).toBeNull();
    expect(emptied.lastOutcomeAt).toBe("");
    expect(emptied.lastContactedAt).toBe("");
  });

  it("follows an edit that changes the outcome of the newest call", () => {
    const original = call("c1", "p1", "2026-08-14T09:00:00.000Z", "No Answer — No Voicemail");
    const before = withLatestCallFields(prospect, [original]);
    expect(before.lastOutcome).toBe("No Answer — No Voicemail");

    const corrected = { ...original, outcome: "Insurance Review Scheduled" as CallOutcome };
    const after = withLatestCallFields(before, [corrected]);
    expect(after.lastOutcome).toBe("Insurance Review Scheduled");
  });

  it("follows an edit that moves a call's date to the top", () => {
    const a = call("a", "p1", "2026-08-02T09:00:00.000Z", "Not At This Time");
    const b = call("b", "p1", "2026-08-14T09:00:00.000Z", "Somewhat Interested");
    expect(withLatestCallFields(prospect, [a, b]).lastOutcome).toBe("Somewhat Interested");

    const movedForward = { ...a, at: "2026-08-20T09:00:00.000Z" };
    expect(withLatestCallFields(prospect, [movedForward, b]).lastOutcome).toBe("Not At This Time");
  });

  it("leaves stage, grade and score untouched — phase 4 owns those", () => {
    const graded = blankProspect({
      id: "p1",
      stage: "Quoting",
      priorityGrade: "B",
      conversionScore: 7,
    });
    const updated = withLatestCallFields(graded, [
      call("c", "p1", "2026-08-14T09:00:00.000Z", "Definitely Not Interested"),
    ]);
    expect(updated.stage).toBe("Quoting");
    expect(updated.priorityGrade).toBe("B");
    expect(updated.conversionScore).toBe(7);
    expect(updated.closedReason).toBeNull();
  });

  it("finds nothing to do with an empty list", () => {
    expect(latestCall([])).toBeNull();
  });
});

describe("attempt and voicemail counts", () => {
  it("counts only unanswered dials as attempts", () => {
    const calls = [
      call("1", "p1", "2026-08-01T09:00:00.000Z", "No Answer — No Voicemail"),
      call("2", "p1", "2026-08-02T09:00:00.000Z", "No Answer — Voicemail"),
      call("3", "p1", "2026-08-03T09:00:00.000Z", "Somewhat Interested"),
      call("4", "p1", "2026-08-04T09:00:00.000Z", "Insurance Review Scheduled"),
    ];
    const counts = attemptCounts(calls);
    expect(counts.attempts).toBe(2);
    expect(counts.voicemails).toBe(1);
    expect(counts.total).toBe(4);
  });

  it("counts a voicemail as one of the attempts, not as an extra", () => {
    const calls = [
      call("1", "p1", "2026-08-01T09:00:00.000Z", "No Answer — Voicemail"),
      call("2", "p1", "2026-08-02T09:00:00.000Z", "No Answer — Voicemail"),
      call("3", "p1", "2026-08-03T09:00:00.000Z", "No Answer — Voicemail"),
    ];
    const counts = attemptCounts(calls);
    // Three dials, three of which left a message — the combined cap reading.
    expect(counts.attempts).toBe(3);
    expect(counts.voicemails).toBe(3);
  });

  it("reaches the seven-dial cap across a mixed run", () => {
    const outcomes: CallOutcome[] = [
      "No Answer — No Voicemail",
      "No Answer — Voicemail",
      "No Answer — No Voicemail",
      "No Answer — Voicemail",
      "No Answer — No Voicemail",
      "No Answer — Voicemail",
      "No Answer — No Voicemail",
    ];
    const calls = outcomes.map((o, i) =>
      call(String(i), "p1", `2026-08-0${i + 1}T09:00:00.000Z`, o),
    );
    const counts = attemptCounts(calls);
    expect(counts.attempts).toBe(7);
    expect(counts.voicemails).toBe(3);
  });

  it("does not count a bad number as an unanswered attempt", () => {
    const counts = attemptCounts([
      call("1", "p1", "2026-08-01T09:00:00.000Z", "Bad Number"),
    ]);
    expect(counts.attempts).toBe(0);
    expect(counts.total).toBe(1);
  });

  it("is zero for a household that has never been dialled", () => {
    expect(attemptCounts([])).toEqual({ attempts: 0, voicemails: 0, total: 0 });
  });
});

describe("new call defaults", () => {
  const fresh = blankCall("p9");

  it("is outbound, manual, and attached to the household", () => {
    expect(fresh.direction).toBe("outbound");
    expect(fresh.createdBy).toBe("manual");
    expect(fresh.prospectId).toBe("p9");
  });

  it("holds no transcript and no source until one is given", () => {
    expect(fresh.sourceRef).toBeNull();
    expect(fresh.transcriptExcerpt).toBeUndefined();
  });

  it("defaults to roughly now", () => {
    const drift = Math.abs(new Date(fresh.at).getTime() - Date.now());
    expect(drift).toBeLessThan(5000);
  });
});

describe("form date conversion", () => {
  it("round-trips an instant through the input format", () => {
    const iso = new Date(2026, 7, 15, 14, 30).toISOString();
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
  });

  it("returns empty for unusable input rather than an invalid date", () => {
    expect(fromLocalInput("")).toBe("");
    expect(fromLocalInput("not a date")).toBe("");
    expect(toLocalInput("nonsense")).toBe("");
  });
});
