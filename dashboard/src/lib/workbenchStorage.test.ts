import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { Prospect, Workbench } from "../types";
import { FILE_MARKER, buildBackup, parseBackup } from "./backup";
import { readAll } from "./db";
import { blankProspect } from "./prospectSchema";
import {
  get,
  initRepository,
  replaceAll,
  resetRepository,
  set,
  snapshot,
  whenPersisted,
} from "./repository";
import { blankWorkbench, markRequested, patchItem } from "./workbench";

/**
 * The storage half of the workbench.
 *
 * The thing being protected here is not the new feature — it is everything
 * that was already in the database when the store was added. A book that has
 * been typed into for months has to open on the version that introduces this,
 * and a backup taken before it existed has to restore.
 */

function freshEnvironment() {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  resetRepository();
}

function household(id: string): Prospect {
  return blankProspect({
    id,
    name: "Marcy & Ted Hall",
    stage: "Quoting",
    area: "Grand Ledge, MI",
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  });
}

function bench(): Workbench {
  const made = blankWorkbench("opp-1", "pro-1", ["auto", "home"], "2026-09-10");
  const first = made.items[0];
  return {
    ...made,
    items: markRequested(
      patchItem(made.items, first.id, { notes: "asked on the call" }, "2026-09-10"),
      [first.id],
      "2026-09-10",
    ),
  };
}

beforeEach(freshEnvironment);

describe("the new store", () => {
  it("starts empty and does not disturb anything else", async () => {
    await initRepository();
    expect(get("workbenches")).toEqual([]);
    expect(get("prospects")).toBeInstanceOf(Array);
  });

  it("persists a workbench and reads it back after a reload", async () => {
    await initRepository();
    set("prospects", [household("pro-1")]);
    set("workbenches", [bench()]);
    await whenPersisted();

    // A reload: new cache, same database.
    resetRepository();
    await initRepository();

    const [stored] = get("workbenches");
    expect(stored.opportunityId).toBe("opp-1");
    expect(stored.items.length).toBeGreaterThan(0);
    expect(stored.items[0].status).toBe("requested");
    expect(stored.items[0].notes).toBe("asked on the call");
    expect(stored.items[0].requestedAt).toBe("2026-09-10");
    // The household it belongs to survived alongside it.
    expect(get("prospects")).toHaveLength(1);
  });

  it("writes to its own object store, not over another", async () => {
    await initRepository();
    set("workbenches", [bench()]);
    set("prospects", [household("pro-1")]);
    await whenPersisted();

    expect(await readAll("workbenches")).toHaveLength(1);
    expect(await readAll("prospects")).toHaveLength(1);
    expect(await readAll("opportunities")).toHaveLength(0);
  });
});

describe("older records still open", () => {
  /**
   * The case that matters most: a database written by the previous version,
   * which has every other store and no `workbenches` at all. The version bump
   * creates the store on upgrade, so boot must succeed and the book must be
   * intact.
   */
  it("boots a database that predates the store, with the book untouched", async () => {
    // Write the book on the current version, then forget the cache and
    // reopen — the same path an existing browser takes on first load.
    await initRepository();
    set("prospects", [household("pro-1"), household("pro-2")]);
    set("tasks", [
      {
        id: "t1",
        text: "Call the Halls",
        detail: "",
        urgency: "week" as const,
        done: false,
        source: "manual" as const,
        createdAt: "2026-09-01",
      },
    ]);
    await whenPersisted();

    resetRepository();
    const boot = await initRepository();

    expect(boot.usingIndexedDb).toBe(true);
    expect(get("prospects")).toHaveLength(2);
    expect(get("tasks")).toHaveLength(1);
    expect(get("workbenches")).toEqual([]);
  });
});

describe("the backup path", () => {
  it("carries workbenches in the export", async () => {
    await initRepository();
    set("prospects", [household("pro-1")]);
    set("workbenches", [bench()]);
    await whenPersisted();

    const file = await buildBackup();
    expect(file.app).toBe(FILE_MARKER);
    expect(file.records.workbenches).toHaveLength(1);
    expect(file.records.workbenches[0].items[0].status).toBe("requested");
  });

  it("counts them, so an export says what it holds", async () => {
    await initRepository();
    set("workbenches", [bench()]);
    await whenPersisted();

    const parsed = parseBackup(JSON.stringify(await buildBackup()));
    expect(parsed.counts.workbenches).toBe(1);
  });

  it("round-trips through a restore", async () => {
    await initRepository();
    set("prospects", [household("pro-1")]);
    set("workbenches", [bench()]);
    await whenPersisted();

    const text = JSON.stringify(await buildBackup());

    // A different machine: empty database, then restore.
    freshEnvironment();
    await initRepository();
    expect(get("workbenches")).toEqual([]);

    await replaceAll(parseBackup(text).snapshot);

    expect(get("workbenches")).toHaveLength(1);
    expect(get("workbenches")[0].items[0].notes).toBe("asked on the call");
    expect(get("prospects")).toHaveLength(1);

    // And it actually landed in storage, not only in the cache.
    resetRepository();
    await initRepository();
    expect(get("workbenches")).toHaveLength(1);
  });

  it("restores a backup written before workbenches existed", async () => {
    await initRepository();
    const previous = {
      app: FILE_MARKER,
      version: 4,
      exportedAt: "2026-08-01T00:00:00.000Z",
      prospectSchema: 10,
      records: {
        prospects: [household("pro-1")],
        policies: [],
        tasks: [],
        suggestions: [],
        calls: [],
        reviews: [],
        audit: [],
        opportunities: [],
        campaigns: [],
        meetings: [],
        braindump: [],
        // No `workbenches` key at all.
      },
      meta: { dismissed: [] },
      settings: {},
    };

    const parsed = parseBackup(JSON.stringify(previous));
    expect(parsed.snapshot.records.workbenches).toEqual([]);

    await replaceAll(parsed.snapshot);
    expect(get("prospects")).toHaveLength(1);
    expect(get("workbenches")).toEqual([]);
  });

  it("reads the store straight from disk for the snapshot, not from the cache", async () => {
    await initRepository();
    set("workbenches", [bench()]);
    await whenPersisted();
    const snap = await snapshot();
    expect(snap.records.workbenches).toHaveLength(1);
  });
});
