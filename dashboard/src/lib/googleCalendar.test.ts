import { describe, expect, it } from "vitest";
import { isGoogleClientId, normalizeGoogleEvents } from "./googleCalendar";

describe("Google Calendar seam", () => {
  it("accepts web OAuth client IDs and rejects unrelated text", () => {
    expect(isGoogleClientId("12345-demo.apps.googleusercontent.com")).toBe(true);
    expect(isGoogleClientId("not-a-client-id")).toBe(false);
  });

  it("normalizes, sorts and removes cancelled events", () => {
    expect(
      normalizeGoogleEvents([
        {
          id: "late",
          summary: "Client review",
          start: { dateTime: "2026-08-23T14:00:00-04:00" },
          end: { dateTime: "2026-08-23T15:00:00-04:00" },
        },
        {
          id: "all-day",
          start: { date: "2026-08-23" },
          end: { date: "2026-08-24" },
        },
        {
          id: "gone",
          status: "cancelled",
          start: { date: "2026-08-23" },
          end: { date: "2026-08-24" },
        },
      ]),
    ).toEqual([
      {
        id: "all-day",
        title: "Busy",
        start: "2026-08-23",
        end: "2026-08-24",
        allDay: true,
        location: "",
        htmlLink: "",
      },
      {
        id: "late",
        title: "Client review",
        start: "2026-08-23T14:00:00-04:00",
        end: "2026-08-23T15:00:00-04:00",
        allDay: false,
        location: "",
        htmlLink: "",
      },
    ]);
  });
});
