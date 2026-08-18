import { describe, expect, it, vi } from "vitest";
import { buildSheetRow, postSheetRows, readSheetConfig, type SheetConfig } from "./sheets";
import type { LeadRow } from "./store";

const config: SheetConfig = { url: "https://script.google.com/macros/s/SECRETPATH/exec", secret: "s3cret" };

function lead(over: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "41-15-01-100-005|abc",
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

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("readSheetConfig", () => {
  /** An unconfigured mirror must be a quiet no-op, never a failure. */
  it("returns null until both values are present", () => {
    expect(readSheetConfig({})).toBeNull();
    expect(readSheetConfig({ SHEETS_WEBHOOK_URL: "https://x" })).toBeNull();
    expect(readSheetConfig({ SHEETS_WEBHOOK_SECRET: "s" })).toBeNull();
    expect(readSheetConfig({ SHEETS_WEBHOOK_URL: "  ", SHEETS_WEBHOOK_SECRET: "  " })).toBeNull();
  });

  it("returns the config once both are set", () => {
    expect(readSheetConfig({ SHEETS_WEBHOOK_URL: "https://x", SHEETS_WEBHOOK_SECRET: "s" })).toEqual({
      url: "https://x",
      secret: "s",
    });
  });
});

describe("buildSheetRow", () => {
  it("mirrors the useful fields", () => {
    const row = buildSheetRow(lead(), "2026-08-19T09:00:00.000Z");
    expect(row.parcelNumber).toBe("41-15-01-100-005");
    expect(row.ownerName).toBe("HEFFERAN DAVID J & MEGGAN S");
    expect(row.propertyAddress).toBe("3535 MCCABE AVE NE");
    expect(row.propertyCity).toBe("ADA MI 49301");
    expect(row.mailingCity).toBe("ADA 49301");
    expect(row.municipality).toBe("Ada Township");
    expect(row.source).toBe("Kent County GIS");
    expect(row.dateAdded).toBe("2026-08-18");
    expect(row.lastUpdated).toBe("2026-08-19");
  });

  it("resolves each municipality code to a name", () => {
    expect(buildSheetRow(lead({ govt_unit: "18" }), "x").municipality).toBe("Cascade Township");
    expect(buildSheetRow(lead({ govt_unit: "44" }), "x").municipality).toBe("East Grand Rapids");
  });

  /** The county publishes neither, and the researched number lives in the browser. */
  it("sends blank phone and email rather than inventing them", () => {
    const row = buildSheetRow(lead(), "x");
    expect(row.phone).toBe("");
    expect(row.email).toBe("");
  });

  it("carries no internal identifiers into the sheet", () => {
    const row = buildSheetRow(lead(), "x") as unknown as Record<string, unknown>;
    expect(row.id).toBeUndefined();
    expect(row.run_id).toBeUndefined();
    expect(row.synced_at).toBeUndefined();
    expect(row.reason).toBeUndefined();
  });

  it("copes with the null columns D1 can return", () => {
    const row = buildSheetRow(
      lead({ property_address: null, property_city: null, owner_address: null, owner_zip: null }),
      "x",
    );
    expect(row.propertyAddress).toBe("");
    expect(row.mailingAddress).toBe("");
  });
});


describe("postSheetRows", () => {
  const rowsOf = (n: number) => Array.from({ length: n }, () => buildSheetRow(lead(), "x"));

  it("sends the secret and the rows", async () => {
    const fetcher = vi.fn(async () => ok({ ok: true, results: [{ ok: true }] }));
    const outcome = await postSheetRows(config, rowsOf(1), fetcher);

    expect(outcome.results[0].ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.url);
    const sent = JSON.parse(String(init.body));
    expect(sent.secret).toBe("s3cret");
    expect(sent.rows[0].parcelNumber).toBe("41-15-01-100-005");
  });

  /** A full weekday batch has to cost two outbound calls, not fifty. */
  it("carries a whole batch in one request", async () => {
    const rows = rowsOf(25);
    const fetcher = vi.fn(async () => ok({ ok: true, results: rows.map(() => ({ ok: true })) }));

    const outcome = await postSheetRows(config, rows, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(outcome.results.filter((r) => r.ok)).toHaveLength(25);
  });

  it("reports one rejected row without failing the others", async () => {
    const fetcher = vi.fn(async () =>
      ok({ ok: true, results: [{ ok: true }, { ok: false, error: "nope" }] }),
    );
    const outcome = await postSheetRows(config, rowsOf(2), fetcher);

    expect(outcome.results[0].ok).toBe(true);
    expect(outcome.results[1]).toMatchObject({ ok: false, error: "nope" });
  });

  it("fails every row when the request itself fails", async () => {
    const cases = [
      async () => new Response("", { status: 500 }),
      async () => new Response("<html>Sign in</html>", { status: 200 }),
      async () => {
        throw new Error("offline");
      },
    ];
    for (const fetcher of cases) {
      const outcome = await postSheetRows(config, rowsOf(1), fetcher as never);
      expect(outcome.results[0].ok).toBe(false);
      expect(outcome.error).toBeTruthy();
    }
  });

  it("fails a row the sheet returned no answer for", async () => {
    const fetcher = vi.fn(async () => ok({ ok: true, results: [{ ok: true }] }));
    const outcome = await postSheetRows(config, rowsOf(2), fetcher);
    expect(outcome.results[1].ok).toBe(false);
  });

  /** The outbox is readable through the API, so nothing secret may reach it. */
  it("never leaks the url or the secret into a recorded error", async () => {
    const cases = [
      async () => {
        throw new Error("connect failed to " + config.url);
      },
      async () => new Response("", { status: 403 }),
      async () => ok({ ok: false, error: "bad secret " + config.secret }),
    ];
    for (const fetcher of cases) {
      const outcome = await postSheetRows(config, rowsOf(1), fetcher as never);
      const text = (outcome.error ?? "") + (outcome.results[0].error ?? "");
      expect(text).not.toContain(config.url);
      expect(text).not.toContain("SECRETPATH");
      expect(text).not.toContain(config.secret);
    }
  });
});
