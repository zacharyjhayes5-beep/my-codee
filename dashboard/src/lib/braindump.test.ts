import { describe, expect, it } from "vitest";
import type { BraindumpRow } from "../types";
import {
  categorise,
  clock,
  dayKey,
  dayTabs,
  heuristic,
  itemsFor,
  labelFor,
  rowsFromDump,
  splitSentences,
  toggleDone,
} from "./braindump";

describe("the day a dump belongs to", () => {
  it("uses the local day, not the UTC one", () => {
    // Late evening in Michigan is already tomorrow in UTC. The day has to be
    // his day, or an evening dump files itself under tomorrow.
    const lateEvening = new Date(2026, 8, 7, 22, 30);
    expect(dayKey(lateEvening)).toBe("2026-09-07");
    expect(lateEvening.toISOString().slice(0, 10)).not.toBe("2026-09-07");
  });

  it("names today, yesterday and everything else", () => {
    expect(labelFor("2026-09-07", "2026-09-07")).toBe("Today");
    expect(labelFor("2026-09-06", "2026-09-07")).toBe("Yesterday");
    expect(labelFor("2026-09-04", "2026-09-07")).toBe("Fri 4 Sep");
  });

  it("always offers today, newest first, and stops at a fortnight", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ day: `2026-08-${String(i + 1).padStart(2, "0")}` })) as BraindumpRow[];
    const tabs = dayTabs(rows, "2026-09-07");
    expect(tabs[0]).toBe("2026-09-07");
    expect(tabs).toHaveLength(14);
    expect([...tabs].sort((a, b) => b.localeCompare(a))).toEqual(tabs);
  });

  it("reads a timestamp as a clock time", () => {
    expect(clock(new Date(2026, 8, 7, 14, 14).toISOString())).toBe("2:14pm");
    expect(clock("not a date")).toBe("");
  });
});

describe("the local splitter", () => {
  it("breaks dictation on terminators and on spoken joins", () => {
    const parts = splitSentences(
      "Called the Vogel family and then I sent the Silva quote. Need to chase Nate",
    );
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("Called the Vogel family");
  });

  it("drops the noises dictation leaves behind", () => {
    // The join itself is consumed, so "also I" leaves the clause behind it.
    expect(splitSentences("um, called Dave. So also I sent the quote")).toEqual([
      "called Dave.",
      "sent the quote",
    ]);
  });

  it("puts past tense in completed", () => {
    expect(categorise("Called the Vogel family this morning")).toBe("completed");
    expect(categorise("Sent the Silva quote")).toBe("completed");
  });

  it("puts an obligation in to-do", () => {
    expect(categorise("Need to chase Nate on the approval")).toBe("todo");
    expect(categorise("Don't forget the Kacher review")).toBe("todo");
  });

  it("puts a gap in knowledge in questions, mark or not", () => {
    expect(categorise("What is the umbrella limit on that policy?")).toBe("questions");
    expect(categorise("Not sure whether the roof year matters here")).toBe("questions");
  });

  it("puts everything else in thoughts", () => {
    expect(categorise("The Ada leads feel warmer than the Cascade ones")).toBe("thoughts");
  });

  /** A question about something owed is a question, not a to-do. */
  it("reads a question ahead of an obligation", () => {
    expect(categorise("Should I follow up with Katie today?")).toBe("questions");
  });

  it("splits a real dump into the four buckets", () => {
    const items = heuristic(
      "Called the Vogel family. Need to send the Silva quote tomorrow. " +
        "What is the umbrella limit on the Credo account? " +
        "The Ada leads feel warmer than the Cascade ones",
    );
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.category)).toEqual([
      "completed",
      "todo",
      "questions",
      "thoughts",
    ]);
    expect(items[0].text).toBe("Called the Vogel family.");
  });
});

describe("what a dump becomes", () => {
  const dump = () =>
    rowsFromDump(
      "Called Dave. Need to send the quote",
      heuristic("Called Dave. Need to send the quote"),
      "2026-09-07",
      "2026-09-07T14:14:00.000Z",
    );

  it("keeps the raw text verbatim beside the items", () => {
    const rows = dump();
    const raw = rows.find((r) => r.kind === "dump");
    expect(raw?.text).toBe("Called Dave. Need to send the quote");
    expect(rows.filter((r) => r.kind === "item")).toHaveLength(2);
  });

  it("files every row on the day it was given", () => {
    expect(dump().every((r) => r.day === "2026-09-07")).toBe(true);
  });

  it("remembers which items were to-dos", () => {
    const todo = dump().find((r) => r.category === "todo");
    expect(todo?.wasTodo).toBe(true);
    expect(todo?.done).toBe(false);
  });

  it("drops empty items rather than filing blanks", () => {
    const rows = rowsFromDump("x", [{ category: "todo", text: "   " }], "2026-09-07");
    expect(rows.filter((r) => r.kind === "item")).toHaveLength(0);
  });
});

describe("ticking a to-do", () => {
  const rows = rowsFromDump(
    "Need to send the quote",
    heuristic("Need to send the quote"),
    "2026-09-07",
  );
  const todoId = rows.find((r) => r.kind === "item")!.id;

  it("moves it into completed", () => {
    const after = toggleDone(rows, todoId);
    const item = after.find((r) => r.id === todoId)!;
    expect(item.done).toBe(true);
    expect(item.category).toBe("completed");
    expect(itemsFor(after, "2026-09-07", "completed")).toHaveLength(1);
    expect(itemsFor(after, "2026-09-07", "todo")).toHaveLength(0);
  });

  /** `wasTodo` is the only thing that makes the return trip possible. */
  it("sends it back to to-do when unticked", () => {
    const there = toggleDone(rows, todoId);
    const back = toggleDone(there, todoId);
    const item = back.find((r) => r.id === todoId)!;
    expect(item.done).toBe(false);
    expect(item.category).toBe("todo");
  });

  it("leaves every other row alone", () => {
    const after = toggleDone(rows, todoId);
    expect(after.find((r) => r.kind === "dump")!.text).toBe("Need to send the quote");
  });
});

describe("reading a day back", () => {
  it("shows only that day's items", () => {
    const monday = rowsFromDump("Called Dave", heuristic("Called Dave"), "2026-09-07");
    const tuesday = rowsFromDump("Called Sue", heuristic("Called Sue"), "2026-09-08");
    const all = [...monday, ...tuesday];
    expect(itemsFor(all, "2026-09-07", "completed")).toHaveLength(1);
    expect(itemsFor(all, "2026-09-07", "completed")[0].text).toContain("Dave");
  });
});
