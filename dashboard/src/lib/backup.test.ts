import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { BackupError, buildBackup, parseBackup } from "./backup";
import { readAll } from "./db";
import { blankProspect } from "./prospectSchema";
import {
  LEGACY_RECORD_KEYS,
  SETTING_KEYS,
  get,
  initRepository,
  replaceAll,
  resetRepository,
  set,
  whenPersisted,
} from "./repository";
import type { PolicyEntry, Prospect, Task } from "../types";

function freshEnvironment() {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  resetRepository();
}

function prospect(id: string, name: string): Prospect {
  return blankProspect({
    id,
    name,
    stage: "Quoting",
    lines: ["property", "casualty"],
    area: "Fenton, MI",
    phone: "(810) 555-0177",
    email: `${id}@example.com`,
    nextAction: "bundle quote",
    notes: [{ id: `${id}-n`, date: "2026-06-01", title: "Discovery", body: "Two cars, one home.", source: "granola" }],
    createdAt: "2026-05-20",
    updatedAt: "2026-06-01",
  });
}

/** A prospect exactly as v1 and v2 backups stored it, before the split. */
function legacyProspect(id: string, name: string, status: string) {
  return {
    id,
    name,
    status,
    lines: ["casualty"],
    area: "Brighton, MI",
    phone: "(810) 555-0122",
    email: `${id}@example.com`,
    nextStep: "first call",
    notes: [{ id: `${id}-n`, date: "2026-07-02", title: "Cold call", body: "Asked about auto.", source: "granola" }],
    createdAt: "2026-07-01",
    updatedAt: "2026-07-02",
  };
}

function policy(id: string, premium: number): PolicyEntry {
  return {
    id,
    book: "life",
    effectiveDate: "2026-04-02",
    firstName: "Dana",
    lastName: "Reed",
    companyName: "",
    deathBenefit: 250_000,
    lineOfBusiness: "term-life",
    policyNumber: `L-${id}`,
    premium,
    percentEarned: 0.5,
    multiplier: 0.5,
    lastReview: "",
    notes: "",
  };
}

function task(id: string): Task {
  return {
    id,
    text: `Follow up ${id}`,
    detail: "",
    urgency: "now",
    done: false,
    source: "manual",
    createdAt: "2026-08-15",
  };
}

async function seedThroughRepository() {
  await initRepository();
  set("prospects", [prospect("p1", "Dana Reed"), prospect("p2", "Ana Fields")]);
  set("policies", [policy("a", 900), policy("b", 1200)]);
  set("tasks", [task("t1")]);
  set("suggestions", []);
  set("dismissed", ["already rejected"]);
  set("owner", "Zach Hayes");
  set("persistency", 88.5);
  set("period", { start: "2026-01-01", end: "2027-01-01" });
  await whenPersisted();
}

beforeEach(() => {
  freshEnvironment();
});

describe("current-format export", () => {
  it("includes records that exist only in IndexedDB", async () => {
    await seedThroughRepository();

    // Prove the records are not sitting in localStorage at all.
    expect(localStorage.getItem(LEGACY_RECORD_KEYS.prospects)).toBeNull();
    expect(localStorage.getItem(LEGACY_RECORD_KEYS.policies)).toBeNull();

    const file = await buildBackup();

    expect(file.version).toBe(3);
    expect(file.records.prospects).toHaveLength(2);
    expect(file.records.policies).toHaveLength(2);
    expect(file.records.tasks).toHaveLength(1);
    expect(file.meta.dismissed).toEqual(["already rejected"]);
  });

  it("carries the settings that stayed in localStorage", async () => {
    await seedThroughRepository();
    const file = await buildBackup();

    expect(file.settings[SETTING_KEYS.owner]).toBe("Zach Hayes");
    expect(file.settings[SETTING_KEYS.persistency]).toBe(88.5);
    expect(file.settings[SETTING_KEYS.period]).toEqual({ start: "2026-01-01", end: "2027-01-01" });
  });

  it("reads from storage rather than the in-memory cache", async () => {
    await seedThroughRepository();

    // Write straight past the cache, then export.
    set("policies", [policy("a", 900), policy("b", 1200), policy("c", 400)]);
    await whenPersisted();

    const file = await buildBackup();
    expect(file.records.policies).toHaveLength(3);
  });
});

describe("current-format round trip", () => {
  it("restores every record and setting exactly", async () => {
    await seedThroughRepository();
    const exported = JSON.stringify(await buildBackup());

    // Wipe absolutely everything.
    freshEnvironment();
    await initRepository();
    expect(get("prospects")).toEqual([]);
    expect(get("policies")).toEqual([]);

    const parsed = parseBackup(exported);
    await replaceAll(parsed.snapshot);

    expect(parsed.version).toBe(3);
    expect(get("prospects")).toHaveLength(2);
    expect(get("policies")).toHaveLength(2);
    expect(get("dismissed")).toEqual(["already rejected"]);
    expect(get("owner")).toBe("Zach Hayes");
    expect(get("persistency")).toBe(88.5);

    // And it really landed in the database, not just the cache.
    expect(await readAll<Prospect>("prospects")).toHaveLength(2);
    expect(await readAll<PolicyEntry>("policies")).toHaveLength(2);
  });

  it("survives a second export after a restore, byte for byte", async () => {
    await seedThroughRepository();
    const first = await buildBackup();

    freshEnvironment();
    await initRepository();
    await replaceAll(parseBackup(JSON.stringify(first)).snapshot);

    const second = await buildBackup();

    expect(second.records).toEqual(first.records);
    expect(second.meta).toEqual(first.meta);
    expect(second.settings).toEqual(first.settings);
  });

  it("does not re-run the legacy migration over restored data", async () => {
    // Legacy keys present and different from what we restore.
    localStorage.setItem(LEGACY_RECORD_KEYS.prospects, JSON.stringify([prospect("old", "Stale Person")]));

    await seedThroughRepository();
    const exported = JSON.stringify(await buildBackup());

    freshEnvironment();
    localStorage.setItem(LEGACY_RECORD_KEYS.prospects, JSON.stringify([prospect("old", "Stale Person")]));
    await initRepository();
    await replaceAll(parseBackup(exported).snapshot);

    resetRepository();
    await initRepository();

    const names = get("prospects").map((p) => p.name);
    expect(names).toContain("Dana Reed");
    expect(names).not.toContain("Stale Person");
  });
});

describe("call records", () => {
  function call(id: string, prospectId: string, at: string) {
    return {
      id,
      prospectId,
      at,
      direction: "outbound" as const,
      outcome: "No Answer — Voicemail Left" as const,
      durationMin: null,
      summary: "Left a message about the renewal",
      notes: "Try evenings",
      sourceRef: { system: "granola" as const, title: "Reed follow-up" },
      createdBy: "manual" as const,
      createdAt: at,
    };
  }

  it("persists to IndexedDB, not localStorage", async () => {
    await initRepository();
    set("calls", [call("c1", "p1", "2026-08-14T09:00:00.000Z")]);
    await whenPersisted();

    expect(await readAll("calls")).toHaveLength(1);
    expect(localStorage.getItem("fb-dashboard:calls")).toBeNull();
  });

  it("is included in the backup file", async () => {
    await initRepository();
    set("calls", [
      call("c1", "p1", "2026-08-14T09:00:00.000Z"),
      call("c2", "p2", "2026-08-15T09:00:00.000Z"),
    ]);
    await whenPersisted();

    const file = await buildBackup();
    expect(file.records.calls).toHaveLength(2);
    expect(file.records.calls[0].summary).toBe("Left a message about the renewal");
  });

  it("round-trips through a full wipe with its source reference intact", async () => {
    await initRepository();
    set("prospects", [prospect("p1", "Dana Reed")]);
    set("calls", [call("c1", "p1", "2026-08-14T09:00:00.000Z")]);
    await whenPersisted();
    const exported = JSON.stringify(await buildBackup());

    freshEnvironment();
    await initRepository();
    expect(get("calls")).toEqual([]);

    await replaceAll(parseBackup(exported).snapshot);

    const restored = get("calls");
    expect(restored).toHaveLength(1);
    expect(restored[0].outcome).toBe("No Answer — Voicemail Left");
    expect(restored[0].sourceRef?.title).toBe("Reed follow-up");
    expect(restored[0].notes).toBe("Try evenings");
    expect(restored[0].prospectId).toBe("p1");
  });

  it("stores no transcript body", async () => {
    await initRepository();
    set("calls", [call("c1", "p1", "2026-08-14T09:00:00.000Z")]);
    await whenPersisted();

    const file = await buildBackup();
    expect(file.records.calls[0].transcriptExcerpt).toBeUndefined();
  });

  it("is dropped when the household it belongs to is deleted", async () => {
    await initRepository();
    set("prospects", [prospect("p1", "Dana Reed"), prospect("p2", "Ana Fields")]);
    set("calls", [call("c1", "p1", "2026-08-14T09:00:00.000Z"), call("c2", "p2", "2026-08-15T09:00:00.000Z")]);
    await whenPersisted();

    // What the card's delete does: remove the household and its calls.
    set("calls", get("calls").filter((c) => c.prospectId !== "p1"));
    set("prospects", get("prospects").filter((p) => p.id !== "p1"));
    await whenPersisted();

    const remaining = await readAll<{ prospectId: string }>("calls");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].prospectId).toBe("p2");
  });
});

describe("v1 backups still restore", () => {
  const v1File = {
    app: "agency-dashboard-backup",
    version: 1,
    exportedAt: "2026-08-13T12:35:34.918Z",
    data: {
      "fb-dashboard:prospects": [legacyProspect("legacy1", "Marcus Webb", "Meeting Scheduled")],
      "fb-dashboard:policies": [policy("legacy-a", 780)],
      "fb-dashboard:tasks": [task("legacy-t")],
      "fb-dashboard:suggestions": [],
      "fb-dashboard:dismissed": ["old rejection"],
      "fb-dashboard:period": { start: "2026-01-01", end: "2027-01-01" },
      "fb-dashboard:owner": "Zach Hayes",
      "fb-dashboard:persistency": 84,
      "fb-dashboard:lines:v3": [
        { id: "property", name: "Property", policyGoal: 40, premiumGoal: 0 },
        { id: "casualty", name: "Casualty", policyGoal: 40, premiumGoal: 0 },
        { id: "life", name: "Life", policyGoal: 25, premiumGoal: 0 },
      ],
    },
  };

  it("is recognised as version 1", () => {
    const parsed = parseBackup(JSON.stringify(v1File));
    expect(parsed.version).toBe(1);
  });

  it("sorts the flat key dump into records, meta and settings", () => {
    const { snapshot } = parseBackup(JSON.stringify(v1File));

    expect(snapshot.records.prospects).toHaveLength(1);
    expect(snapshot.records.policies).toHaveLength(1);
    expect(snapshot.records.tasks).toHaveLength(1);
    expect(snapshot.meta.dismissed).toEqual(["old rejection"]);
    expect(snapshot.settings[SETTING_KEYS.owner]).toBe("Zach Hayes");
    expect(snapshot.settings[SETTING_KEYS.persistency]).toBe(84);
  });

  it("restores into IndexedDB and the app reads it back", async () => {
    await initRepository();
    await replaceAll(parseBackup(JSON.stringify(v1File)).snapshot);

    expect(get("prospects")[0].name).toBe("Marcus Webb");
    expect(get("policies")[0].policyNumber).toBe("L-legacy-a");
    expect(get("persistency")).toBe(84);
    expect(await readAll<Prospect>("prospects")).toHaveLength(1);
  });

  it("upgrades to the current format on the next export", async () => {
    await initRepository();
    await replaceAll(parseBackup(JSON.stringify(v1File)).snapshot);

    const upgraded = await buildBackup();
    expect(upgraded.version).toBe(3);
    expect(upgraded.prospectSchema).toBe(5);
    expect(upgraded.records.prospects).toHaveLength(1);
    expect(upgraded.records.prospects[0].stage).toBe("Review Scheduled");
    expect(upgraded.settings[SETTING_KEYS.persistency]).toBe(84);
  });

  it("converts the old status to a stage on the way in", async () => {
    await initRepository();
    await replaceAll(parseBackup(JSON.stringify(v1File)).snapshot);

    const restored = get("prospects")[0];
    expect(restored.stage).toBe("Review Scheduled");
    expect(restored.nextAction).toBe("first call");
    expect(restored.nextActionDate).toBe("");
    expect(restored.notes[0].body).toBe("Asked about auto.");
  });
});

describe("v2 backups still restore", () => {
  /** What phase 1 wrote: separated sections, but pre-v4 prospects. */
  const v2File = {
    app: "agency-dashboard-backup",
    version: 2,
    exportedAt: "2026-08-15T18:00:00.000Z",
    records: {
      prospects: [legacyProspect("v2a", "Rita Nolan", "Lost"), legacyProspect("v2b", "Ken Ames", "New")],
      policies: [policy("v2p", 640)],
      tasks: [task("v2t")],
      suggestions: [],
    },
    meta: { dismissed: ["v2 rejection"] },
    settings: {
      "fb-dashboard:owner": "Zach Hayes",
      "fb-dashboard:persistency": 86,
    },
  };

  it("is recognised as version 2", () => {
    expect(parseBackup(JSON.stringify(v2File)).version).toBe(2);
  });

  it("migrates its prospects to v4 on the way in", () => {
    const { snapshot } = parseBackup(JSON.stringify(v2File));
    const [rita, ken] = snapshot.records.prospects;

    expect(rita.stage).toBe("Closed");
    expect(rita.closedReason).toBe("lost");
    expect(ken.stage).toBe("New");
    expect(ken.closedReason).toBeNull();
  });

  it("fills the stores it predates with empty arrays, not undefined", () => {
    const { snapshot } = parseBackup(JSON.stringify(v2File));
    expect(snapshot.records.calls).toEqual([]);
    expect(snapshot.records.reviews).toEqual([]);
    expect(snapshot.records.audit).toEqual([]);
  });

  it("restores into the app and keeps every original field", async () => {
    await initRepository();
    await replaceAll(parseBackup(JSON.stringify(v2File)).snapshot);

    const rita = get("prospects").find((p) => p.id === "v2a")!;
    expect(rita.name).toBe("Rita Nolan");
    expect(rita.phone).toBe("(810) 555-0122");
    expect(rita.area).toBe("Brighton, MI");
    expect(rita.lines).toEqual(["casualty"]);
    expect(rita.notes).toHaveLength(1);
    expect(rita.createdAt).toBe("2026-07-01");
    expect(get("persistency")).toBe(86);
  });
});

describe("bad files are refused, and change nothing", () => {
  it("rejects a file that is not a dashboard backup", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow(BackupError);
  });

  it("rejects unreadable text", () => {
    expect(() => parseBackup("{not json")).toThrow(BackupError);
  });

  it("rejects an empty backup rather than wiping the book", () => {
    const empty = { app: "agency-dashboard-backup", version: 2, exportedAt: "", records: {}, meta: {}, settings: {} };
    expect(() => parseBackup(JSON.stringify(empty))).toThrow(/empty/i);
  });

  it("refuses a file from a newer format instead of dropping what it cannot read", () => {
    const future = { app: "agency-dashboard-backup", version: 99, exportedAt: "", records: {}, meta: {}, settings: {} };
    expect(() => parseBackup(JSON.stringify(future))).toThrow(/newer version/i);
  });

  it("leaves existing data untouched when a bad file is picked", async () => {
    await seedThroughRepository();

    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow();

    expect(get("prospects")).toHaveLength(2);
    expect(await readAll<PolicyEntry>("policies")).toHaveLength(2);
  });
});
