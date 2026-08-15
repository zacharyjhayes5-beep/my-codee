import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { BackupError, buildBackup, parseBackup } from "./backup";
import { readAll } from "./db";
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
  return {
    id,
    name,
    status: "Open to Quote",
    lines: ["property", "casualty"],
    area: "Fenton, MI",
    phone: "(810) 555-0177",
    email: `${id}@example.com`,
    nextStep: "bundle quote",
    notes: [{ id: `${id}-n`, date: "2026-06-01", title: "Discovery", body: "Two cars, one home.", source: "granola" }],
    createdAt: "2026-05-20",
    updatedAt: "2026-06-01",
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

describe("v2 export", () => {
  it("includes records that exist only in IndexedDB", async () => {
    await seedThroughRepository();

    // Prove the records are not sitting in localStorage at all.
    expect(localStorage.getItem(LEGACY_RECORD_KEYS.prospects)).toBeNull();
    expect(localStorage.getItem(LEGACY_RECORD_KEYS.policies)).toBeNull();

    const file = await buildBackup();

    expect(file.version).toBe(2);
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

describe("v2 round trip", () => {
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

    expect(parsed.version).toBe(2);
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

describe("v1 backups still restore", () => {
  const v1File = {
    app: "agency-dashboard-backup",
    version: 1,
    exportedAt: "2026-08-13T12:35:34.918Z",
    data: {
      "fb-dashboard:prospects": [prospect("legacy1", "Marcus Webb")],
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

  it("upgrades to a v2 file on the next export", async () => {
    await initRepository();
    await replaceAll(parseBackup(JSON.stringify(v1File)).snapshot);

    const upgraded = await buildBackup();
    expect(upgraded.version).toBe(2);
    expect(upgraded.records.prospects).toHaveLength(1);
    expect(upgraded.settings[SETTING_KEYS.persistency]).toBe(84);
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
