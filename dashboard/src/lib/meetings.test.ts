import { describe, expect, it } from "vitest";
import type { Meeting } from "../types";
import { addDays, bucketOf, dayName, isPast, meetingsIn, weekStart } from "./meetings";

function meeting(date: string, name = "Someone"): Meeting {
  return { id: date + name, name, date, time: "", place: "", createdAt: "" };
}

describe("which week a meeting falls in", () => {
  // A Wednesday. The week containing it runs Sun 23rd to Sat 29th.
  const WED = "2026-08-26";

  it("starts the week on Sunday", () => {
    expect(weekStart(WED)).toBe("2026-08-23");
    expect(weekStart("2026-08-23")).toBe("2026-08-23"); // the Sunday itself
    expect(weekStart("2026-08-29")).toBe("2026-08-23"); // the Saturday
  });

  it("puts every day of the current week in this week", () => {
    for (let i = 0; i < 7; i += 1) {
      expect(bucketOf(meeting(addDays("2026-08-23", i)), WED)).toBe("this");
    }
  });

  it("puts every day of the following week in next week", () => {
    for (let i = 7; i < 14; i += 1) {
      expect(bucketOf(meeting(addDays("2026-08-23", i)), WED)).toBe("next");
    }
  });

  it("keeps a day already gone this week in this week, not in the past", () => {
    // Monday, when today is Wednesday. The week is not over.
    expect(bucketOf(meeting("2026-08-24"), WED)).toBe("this");
    expect(isPast(meeting("2026-08-24"), WED)).toBe(true);
  });

  it("drops anything before this week, and holds anything beyond next", () => {
    expect(bucketOf(meeting("2026-08-22"), WED)).toBe("past");
    expect(bucketOf(meeting("2026-09-06"), WED)).toBe("later");
  });

  /**
   * The point of deriving the bucket rather than storing it: nobody has to
   * move anything on a Sunday night.
   */
  it("moves a meeting from next week into this week when the week turns", () => {
    const m = meeting("2026-09-01"); // Tuesday of the following week
    expect(bucketOf(m, WED)).toBe("next");
    // Same meeting, read the following Monday.
    expect(bucketOf(m, "2026-08-31")).toBe("this");
  });

  it("reads the day name off the date so the two cannot disagree", () => {
    expect(dayName("2026-08-26")).toBe("Wed");
    expect(dayName("2026-09-01")).toBe("Tue");
    expect(dayName("")).toBe("");
  });

  it("sorts each list earliest first", () => {
    const rows = [meeting("2026-08-28", "C"), meeting("2026-08-24", "A"), meeting("2026-08-26", "B")];
    expect(meetingsIn(rows, "this", WED).map((m) => m.name)).toEqual(["A", "B", "C"]);
  });

  it("tolerates a meeting with no date rather than throwing", () => {
    expect(bucketOf(meeting(""), WED)).toBe("later");
    expect(isPast(meeting(""), WED)).toBe(false);
  });
});
