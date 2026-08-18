import { describe, expect, it, vi } from "vitest";
import { drainOutbox, retryCutoff, type OutboxRow, type OutboxStore } from "./outbox";
import type { SheetConfig } from "./sheets";
import type { LeadRow } from "./store";

const config: SheetConfig = { url: "https://sheet.example/exec", secret: "s" };

function lead(pnum: string): LeadRow {
  return {
    id: `${pnum}|x`,
    pnum,
    govt_unit: "11",
    owner_raw: "OWNER NAME",
    property_address: "1 SAMPLE ST",
    property_city: "ADA",
    property_state: "MI",
    property_zip: "49301",
    owner_address: "1 SAMPLE ST",
    owner_city: "ADA",
    owner_zip: "49301",
    acreage: 1,
    reason: "new-parcel",
    created_at: "2026-08-18T11:00:00.000Z",
  };
}

function row(pnum: string, over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    pnum,
    lead_id: `${pnum}|x`,
    status: "pending",
    attempts: 0,
    queued_at: "2026-08-18T11:00:00.000Z",
    last_attempt_at: null,
    exported_at: null,
    last_error: null,
    ...over,
  };
}

/** An in-memory store that records what draining did to it. */
function fakeStore(pending: OutboxRow[], missingLeads: string[] = []) {
  const exported: string[] = [];
  const failed: { pnum: string; error: string }[] = [];
  const store: OutboxStore = {
    claimPending: async () => pending,
    leadFor: async (pnum) => (missingLeads.includes(pnum) ? null : lead(pnum)),
    markExported: async (pnum) => {
      exported.push(pnum);
    },
    markFailed: async (pnum, _at, error) => {
      failed.push({ pnum, error });
    },
  };
  return { store, exported, failed };
}

const ok = () =>
  new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
const rejected = () =>
  new Response(JSON.stringify({ ok: false, error: "nope" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("drainOutbox without configuration", () => {
  /**
   * The whole reliability rule in one test: an unconfigured mirror is a quiet
   * no-op. It must never throw, because the caller is the scheduled handler
   * that has just finished a GIS run.
   */
  it("is a no-op that reports why, and never calls out", async () => {
    const { store, exported, failed } = fakeStore([row("a")]);
    const fetcher = vi.fn();

    const result = await drainOutbox(store, null, new Date(), fetcher as never);

    expect(result.skipped).toBe("sheet mirror not configured");
    expect(result.attempted).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(exported).toEqual([]);
    expect(failed).toEqual([]);
  });
});

describe("drainOutbox delivery", () => {
  it("marks a delivered parcel exported", async () => {
    const { store, exported, failed } = fakeStore([row("41-15-01-100-005")]);
    const result = await drainOutbox(store, config, new Date(), async () => ok());

    expect(result).toMatchObject({ attempted: 1, exported: 1, failed: 0 });
    expect(exported).toEqual(["41-15-01-100-005"]);
    expect(failed).toEqual([]);
  });

  /** A rejected row stays pending — markExported is never called for it. */
  it("leaves a rejected parcel pending with the reason recorded", async () => {
    const { store, exported, failed } = fakeStore([row("a")]);
    const result = await drainOutbox(store, config, new Date(), async () => rejected());

    expect(result).toMatchObject({ attempted: 1, exported: 0, failed: 1 });
    expect(exported).toEqual([]);
    expect(failed[0]).toMatchObject({ pnum: "a", error: "nope" });
  });

  it("leaves a parcel pending when the network is down", async () => {
    const { store, exported, failed } = fakeStore([row("a")]);
    await drainOutbox(store, config, new Date(), async () => {
      throw new Error("offline");
    });
    expect(exported).toEqual([]);
    expect(failed).toHaveLength(1);
  });

  /**
   * The requirement that matters most for a batch of 25: one bad record must
   * cost exactly one record.
   */
  it("keeps going when one parcel in the middle fails", async () => {
    const rows = ["a", "b", "c", "d", "e"].map((p) => row(p));
    const { store, exported, failed } = fakeStore(rows);

    const result = await drainOutbox(store, config, new Date(), async (_url, init) => {
      const sent = JSON.parse(String((init as RequestInit).body));
      return sent.row.parcelNumber === "c" ? rejected() : ok();
    });

    expect(result).toMatchObject({ attempted: 5, exported: 4, failed: 1 });
    expect(exported).toEqual(["a", "b", "d", "e"]);
    expect(failed.map((f) => f.pnum)).toEqual(["c"]);
  });

  it("survives one parcel throwing outright", async () => {
    const rows = ["a", "b", "c"].map((p) => row(p));
    const { store, exported, failed } = fakeStore(rows);

    const result = await drainOutbox(store, config, new Date(), async (_url, init) => {
      const sent = JSON.parse(String((init as RequestInit).body));
      if (sent.row.parcelNumber === "b") throw new Error("boom");
      return ok();
    });

    expect(result.exported).toBe(2);
    expect(exported).toEqual(["a", "c"]);
    expect(failed.map((f) => f.pnum)).toEqual(["b"]);
  });

  it("fails a parcel whose lead has vanished rather than looping on it", async () => {
    const { store, exported, failed } = fakeStore([row("gone")], ["gone"]);
    await drainOutbox(store, config, new Date(), async () => ok());
    expect(exported).toEqual([]);
    expect(failed[0].error).toContain("No lead found");
  });

  it("does nothing gracefully when the outbox itself cannot be read", async () => {
    const store: OutboxStore = {
      claimPending: async () => {
        throw new Error("D1 unavailable");
      },
      leadFor: async () => null,
      markExported: async () => {},
      markFailed: async () => {},
    };
    const result = await drainOutbox(store, config, new Date(), async () => ok());
    expect(result.skipped).toBe("outbox unavailable");
  });

  it("reports an empty queue without calling out", async () => {
    const { store } = fakeStore([]);
    const fetcher = vi.fn();
    const result = await drainOutbox(store, config, new Date(), fetcher as never);
    expect(result).toMatchObject({ attempted: 0, exported: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  /**
   * Re-delivering an already-sent parcel is safe because the sheet upserts on
   * parcel number, so a retry cannot create a second row.
   */
  it("sends the same payload for the same parcel every time", async () => {
    const bodies: string[] = [];
    const capture = async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return ok();
    };
    const fixed = new Date("2026-08-19T09:00:00.000Z");

    await drainOutbox(fakeStore([row("a")]).store, config, fixed, capture);
    await drainOutbox(fakeStore([row("a")]).store, config, fixed, capture);

    expect(bodies[0]).toBe(bodies[1]);
  });
});

describe("retry timing", () => {
  it("only reconsiders attempts older than the backoff", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const cutoff = new Date(retryCutoff(now));
    expect(now.getTime() - cutoff.getTime()).toBe(10 * 60_000);
  });

  /**
   * A parcel that failed earlier is handed back by claimPending on a later
   * run, which is what makes retries automatic rather than manual.
   */
  it("retries a parcel that failed on an earlier run", async () => {
    const stale = row("a", {
      attempts: 3,
      last_attempt_at: "2026-08-18T11:00:00.000Z",
      last_error: "Sheet endpoint returned HTTP 500",
    });
    const { store, exported } = fakeStore([stale]);

    const result = await drainOutbox(store, config, new Date("2026-08-19T11:00:00.000Z"), async () => ok());

    expect(result.exported).toBe(1);
    expect(exported).toEqual(["a"]);
  });
});
