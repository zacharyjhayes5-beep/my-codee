import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GisSyncError,
  mergeLeads,
  prospectFromLead,
  runSync,
  type GisLead,
  type SyncSettings,
} from "./gisSync";
import { needsResearch } from "./research";
import { blankProspect } from "./prospectSchema";
import type { Prospect } from "../types";

/**
 * These cover the path the audit found untested: what the dashboard does with
 * what the Worker hands it. The ordering is the part that matters — leads are
 * acknowledged only once they are stored, so a failure cannot lose them.
 */

const settings: SyncSettings = { endpoint: "https://example.workers.dev", token: "t" };

function lead(over: Partial<GisLead> = {}): GisLead {
  return {
    id: "41-15-01-100-005|abc123",
    pnum: "41-15-01-100-005",
    govt_unit: "11",
    owner_raw: "HEFFERAN DAVID J & MEGGAN S",
    property_address: "3535 MCCABE AVE NE",
    property_city: "ADA",
    property_state: "MI",
    property_zip: "49301",
    owner_address: "3535 MCCABE AVE",
    owner_city: "ADA",
    owner_zip: "49301",
    acreage: 1.2,
    reason: "new-parcel",
    created_at: "2026-08-18T11:00:00.000Z",
    ...over,
  };
}

/** A fetch stub that records what was asked of it. */
function stubFetch(handlers: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    calls.push(path);
    const handler = handlers[path];
    if (!handler) throw new Error(`unexpected request to ${path}`);
    return handler();
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prospectFromLead", () => {
  it("produces a household that lands in the research queue", () => {
    const p = prospectFromLead(lead());
    expect(p.source).toBe("gis");
    expect(p.parcelId).toBe("41-15-01-100-005");
    expect(p.needsPhoneNumber).toBe(true);
    expect(p.phone).toBe("");
    expect(needsResearch(p)).toBe(true);
  });

  it("uses the property postcode, not the owner's mailing one", () => {
    // An East Grand Rapids house owned from Florida: the property is 49506.
    const p = prospectFromLead(
      lead({ property_zip: "49506", property_city: "EAST GRAND RAPIDS", owner_zip: "33019", owner_city: "HOLLYWOOD" }),
    );
    expect(p.address.zip).toBe("49506");
    expect(p.address.city).toBe("East Grand Rapids");
  });

  it("starts with no tags and an untouched stage", () => {
    const p = prospectFromLead(lead());
    expect(p.tags).toEqual([]);
    expect(p.stage).toBe("New");
  });
});

describe("mergeLeads", () => {
  it("adds a household that is not already held", () => {
    const { added, duplicates } = mergeLeads([], [lead()]);
    expect(added).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  /** Parcel number is the identity; a restored backup must not re-add one. */
  it("drops a lead whose parcel is already on file", () => {
    const existing: Prospect[] = [blankProspect({ parcelId: "41-15-01-100-005", source: "gis" })];
    const { added, duplicates } = mergeLeads(existing, [lead()]);
    expect(added).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });

  it("does not add the same parcel twice within one batch", () => {
    const { added } = mergeLeads([], [lead(), lead({ id: "other-id" })]);
    expect(added).toHaveLength(1);
  });

  it("ignores blank parcel numbers on existing records when matching", () => {
    const existing: Prospect[] = [blankProspect({ parcelId: "", source: "manual" })];
    const { added } = mergeLeads(existing, [lead()]);
    expect(added).toHaveLength(1);
  });
});

describe("runSync", () => {
  it("is a safe no-op when nothing is waiting", async () => {
    const { calls } = stubFetch({ "/leads": () => ok({ leads: [], count: 0 }) });
    const commit = vi.fn();

    const result = await runSync(settings, [], commit);

    expect(result).toEqual({ fetched: 0, added: 0, duplicates: 0, acknowledged: 0 });
    expect(commit).not.toHaveBeenCalled();
    // Nothing to confirm, so nothing is confirmed.
    expect(calls).toEqual(["/leads"]);
  });

  it("stores leads through the supplied commit, then acknowledges them", async () => {
    const order: string[] = [];
    stubFetch({
      "/leads": () => ok({ leads: [lead()], count: 1 }),
      "/leads/ack": () => {
        order.push("ack");
        return ok({ acknowledged: 1 });
      },
    });
    const commit = vi.fn(async () => {
      order.push("commit");
    });

    const result = await runSync(settings, [], commit);

    expect(result.added).toBe(1);
    expect(result.acknowledged).toBe(1);
    // The whole safety property: stored first, confirmed second.
    expect(order).toEqual(["commit", "ack"]);
  });

  it("hands the commit a prospect ready for the research queue", async () => {
    stubFetch({
      "/leads": () => ok({ leads: [lead()], count: 1 }),
      "/leads/ack": () => ok({ acknowledged: 1 }),
    });
    let stored: Prospect[] = [];
    await runSync(settings, [], async (added) => {
      stored = added;
    });

    expect(stored).toHaveLength(1);
    expect(needsResearch(stored[0])).toBe(true);
  });

  /**
   * The regression that matters: if storing fails, the lead must stay unsynced
   * upstream so tomorrow delivers it again.
   */
  it("does not acknowledge when storing throws", async () => {
    const { calls } = stubFetch({
      "/leads": () => ok({ leads: [lead()], count: 1 }),
      "/leads/ack": () => ok({ acknowledged: 1 }),
    });
    const commit = vi.fn(async () => {
      throw new Error("IndexedDB write failed");
    });

    await expect(runSync(settings, [], commit)).rejects.toThrow("IndexedDB write failed");
    expect(calls).not.toContain("/leads/ack");
  });

  it("acknowledges duplicates too, so they stop being re-delivered", async () => {
    stubFetch({
      "/leads": () => ok({ leads: [lead()], count: 1 }),
      "/leads/ack": () => ok({ acknowledged: 1 }),
    });
    const existing: Prospect[] = [blankProspect({ parcelId: "41-15-01-100-005", source: "gis" })];
    const commit = vi.fn();

    const result = await runSync(settings, existing, commit);

    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.acknowledged).toBe(1);
    // Nothing new to write, so the commit is never called.
    expect(commit).not.toHaveBeenCalled();
  });

  it("reports a rejected token clearly rather than failing silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(runSync(settings, [], vi.fn())).rejects.toThrow(GisSyncError);
  });

  it("reports an unreachable service rather than pretending it synced", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(runSync(settings, [], vi.fn())).rejects.toThrow(/Could not reach/);
  });
});
