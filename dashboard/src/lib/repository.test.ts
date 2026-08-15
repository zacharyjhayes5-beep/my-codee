import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { readAll, readMeta } from "./db";
import { blankProspect } from "./prospectSchema";
import {
  LEGACY_RECORD_KEYS,
  SETTING_KEYS,
  get,
  initRepository,
  resetRepository,
  set,
  whenPersisted,
} from "./repository";
import type { PolicyEntry, Prospect, Suggestion, Task } from "../types";

/**
 * These cover the one-way door in this phase: moving a real book out of
 * localStorage and into IndexedDB. A failure here means somebody's prospects
 * did not arrive, which is the only genuinely unrecoverable outcome in the
 * whole migration.
 */

function freshEnvironment() {
  // A brand new factory is a brand new empty database — no deletion races.
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  resetRepository();
}

function prospect(id: string, name: string): Prospect {
  return blankProspect({
    id,
    name,
    stage: "Contacted",
    lines: ["property"],
    area: "Howell, MI",
    phone: "(517) 555-0100",
    email: `${id}@example.com`,
    nextAction: "send quote",
    notes: [{ id: `${id}-n1`, date: "2026-05-02", title: "Call", body: "Talked roof.", source: "granola" }],
    createdAt: "2026-05-01",
    updatedAt: "2026-05-02",
  });
}

function policy(id: string): PolicyEntry {
  return {
    id,
    book: "personal",
    effectiveDate: "2026-03-15",
    firstName: "Dana",
    lastName: "Reed",
    companyName: "",
    deathBenefit: 0,
    lineOfBusiness: "homeowners",
    policyNumber: `H-${id}`,
    premium: 1450,
    percentEarned: 0.15,
    multiplier: 0.5,
    lastReview: "",
    notes: "",
  };
}

function task(id: string): Task {
  return {
    id,
    text: `Task ${id}`,
    detail: "",
    urgency: "week",
    done: false,
    dueDate: "2026-08-20",
    source: "manual",
    createdAt: "2026-08-15",
  };
}

function suggestion(id: string): Suggestion {
  return {
    id,
    text: `Suggested ${id}`,
    detail: "context",
    urgency: "soon",
    source: "obsidian",
    sourceRef: "Vault note",
    reason: "Unchecked task in the note",
    createdAt: "2026-08-15",
  };
}

const legacyBook = {
  prospects: [prospect("p1", "Dana Reed"), prospect("p2", "Tom & Linda Vargas")],
  policies: [policy("a"), policy("b"), policy("c")],
  tasks: [task("t1"), task("t2")],
  suggestions: [suggestion("s1")],
  dismissed: ["call dana", "email tom"],
};

function seedLegacy() {
  localStorage.setItem(LEGACY_RECORD_KEYS.prospects, JSON.stringify(legacyBook.prospects));
  localStorage.setItem(LEGACY_RECORD_KEYS.policies, JSON.stringify(legacyBook.policies));
  localStorage.setItem(LEGACY_RECORD_KEYS.tasks, JSON.stringify(legacyBook.tasks));
  localStorage.setItem(LEGACY_RECORD_KEYS.suggestions, JSON.stringify(legacyBook.suggestions));
  localStorage.setItem(LEGACY_RECORD_KEYS.dismissed, JSON.stringify(legacyBook.dismissed));
  localStorage.setItem(SETTING_KEYS.period, JSON.stringify({ start: "2026-01-01", end: "2027-01-01" }));
  localStorage.setItem(SETTING_KEYS.owner, JSON.stringify("Zach Hayes"));
  localStorage.setItem(SETTING_KEYS.persistency, JSON.stringify(88.5));
}

beforeEach(() => {
  freshEnvironment();
});

describe("first-load migration", () => {
  it("reports that it ran, and what it moved", async () => {
    seedLegacy();
    const boot = await initRepository();

    expect(boot.usingIndexedDb).toBe(true);
    expect(boot.migration?.ran).toBe(true);
    expect(boot.migration?.moved).toEqual({
      prospects: 2,
      policies: 3,
      tasks: 2,
      suggestions: 1,
      dismissed: 2,
    });
  });

  it("moves every record into IndexedDB without losing one", async () => {
    seedLegacy();
    await initRepository();

    expect(await readAll<Prospect>("prospects")).toHaveLength(2);
    expect(await readAll<PolicyEntry>("policies")).toHaveLength(3);
    expect(await readAll<Task>("tasks")).toHaveLength(2);
    expect(await readAll<Suggestion>("suggestions")).toHaveLength(1);
    expect(await readMeta<string[]>("dismissed")).toEqual(legacyBook.dismissed);
  });

  it("preserves record contents exactly, nested notes included", async () => {
    seedLegacy();
    await initRepository();

    const stored = await readAll<Prospect>("prospects");
    const dana = stored.find((p) => p.id === "p1");
    expect(dana).toEqual(legacyBook.prospects[0]);
    expect(dana?.notes[0].body).toBe("Talked roof.");
  });

  it("keeps the legacy localStorage copy as a rollback point", async () => {
    seedLegacy();
    await initRepository();

    for (const key of Object.values(LEGACY_RECORD_KEYS)) {
      expect(localStorage.getItem(key)).not.toBeNull();
    }
    expect(JSON.parse(localStorage.getItem(LEGACY_RECORD_KEYS.prospects)!)).toHaveLength(2);
  });

  it("loads settings from localStorage, where they stay", async () => {
    seedLegacy();
    await initRepository();

    expect(get("owner")).toBe("Zach Hayes");
    expect(get("persistency")).toBe(88.5);
    expect(get("period")).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });

  it("starts clean rather than crashing when there is nothing to migrate", async () => {
    const boot = await initRepository();

    expect(boot.migration?.ran).toBe(true);
    expect(get("prospects")).toEqual([]);
    expect(get("policies")).toEqual([]);
    expect(get("owner")).toBe("Zach Hayes"); // the built-in default
  });

  it("still honours the older v2-era shapes in migrate.ts", async () => {
    // A book last opened before prospects and tasks got their current keys.
    localStorage.setItem(
      "fb-dashboard:leads",
      JSON.stringify([{ id: "old1", name: "Pat Gray", status: "Quoted", line: "life", notes: "wants term" }]),
    );
    localStorage.setItem(
      "fb-dashboard:todos",
      JSON.stringify([{ id: "old-t", text: "Ring Pat back", done: false, dueDate: "2026-08-20" }]),
    );

    await initRepository();

    const prospects = get("prospects");
    expect(prospects).toHaveLength(1);
    expect(prospects[0].name).toBe("Pat Gray");
    // v1 "Quoted" -> v3 "Open to Quote" -> v4 "Quoting", in one hop.
    expect(prospects[0].stage).toBe("Quoting");
    expect(prospects[0].lines).toEqual(["life"]);

    const tasks = get("tasks");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("Ring Pat back");
  });
});

describe("migration runs exactly once", () => {
  it("does not re-copy legacy data over later edits", async () => {
    seedLegacy();
    await initRepository();

    // Delete a prospect the way the app would, and let it land.
    set(
      "prospects",
      get("prospects").filter((p) => p.id !== "p1"),
    );
    await whenPersisted();

    // Reopen the app against the same database.
    resetRepository();
    const second = await initRepository();

    expect(second.migration?.ran).toBe(true);
    expect(get("prospects")).toHaveLength(1);
    expect(get("prospects")[0].id).toBe("p2");
    // The legacy copy still holds both — it is a snapshot, not a live mirror.
    expect(JSON.parse(localStorage.getItem(LEGACY_RECORD_KEYS.prospects)!)).toHaveLength(2);
  });
});

describe("writes", () => {
  it("persists records to IndexedDB, not localStorage", async () => {
    await initRepository();

    set("policies", [policy("z")]);
    await whenPersisted();

    expect(await readAll<PolicyEntry>("policies")).toHaveLength(1);
    // The legacy key was never written to by the new path.
    expect(localStorage.getItem(LEGACY_RECORD_KEYS.policies)).toBeNull();
  });

  it("persists settings to localStorage", async () => {
    await initRepository();

    set("persistency", 91.2);
    await whenPersisted();

    expect(JSON.parse(localStorage.getItem(SETTING_KEYS.persistency)!)).toBe(91.2);
  });

  it("keeps the newest value when two edits land back to back", async () => {
    await initRepository();

    set("tasks", [task("first")]);
    set("tasks", [task("first"), task("second")]);
    await whenPersisted();

    const stored = await readAll<Task>("tasks");
    expect(stored).toHaveLength(2);
    expect(stored.map((t) => t.id).sort()).toEqual(["first", "second"]);
  });
});
