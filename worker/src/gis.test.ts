import { describe, expect, it, vi } from "vitest";
import { fetchAllParcels, GisError, pageUrl, whereClause } from "./gis";

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const feature = (pnum: string) => ({ attributes: { PNUM: pnum, OWNERNAME1: "HALL BETH A" } });

describe("whereClause", () => {
  /**
   * Both GIS columns are string typed. An unquoted 401 is rejected by the
   * service, which was worth finding before it was wired to a cron job.
   */
  it("quotes the values, because both fields are strings", () => {
    expect(whereClause()).toBe(
      "PROPERTYCLASS='401' AND GOVERNMENTALUNIT IN ('11','18','44')",
    );
  });

  it("targets only the three approved municipalities", () => {
    const clause = whereClause();
    for (const unit of ["11", "18", "44"]) expect(clause).toContain(`'${unit}'`);
  });
});

describe("pageUrl", () => {
  it("asks for a stable order, so page boundaries do not drop or repeat rows", () => {
    expect(pageUrl(0)).toContain("orderByFields=PNUM");
  });

  it("requests no geometry", () => {
    expect(pageUrl(0)).toContain("returnGeometry=false");
  });

  it("advances the offset", () => {
    expect(pageUrl(2000)).toContain("resultOffset=2000");
  });
});

describe("fetchAllParcels", () => {
  it("follows pagination until the service stops asking for more", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok({ features: [feature("a")], exceededTransferLimit: true }))
      .mockResolvedValueOnce(ok({ features: [feature("b")], exceededTransferLimit: true }))
      .mockResolvedValueOnce(ok({ features: [feature("c")], exceededTransferLimit: false }));

    const rows = await fetchAllParcels(fetcher);
    expect(rows).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops on a single short page", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ features: [feature("a")] }));
    expect(await fetchAllParcels(fetcher)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty first page instead of recording a false successful scan", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ features: [] }));
    await expect(fetchAllParcels(fetcher)).rejects.toThrow(/empty first page/);
  });

  it("throws on an HTTP error rather than returning a partial scan", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchAllParcels(fetcher)).rejects.toThrow(GisError);
  });

  /** ArcGIS reports query errors inside a 200 response, so status is not enough. */
  it("throws when ArcGIS reports an error in a 200 body", async () => {
    const fetcher = vi.fn().mockResolvedValue(ok({ error: { message: "Invalid where clause" } }));
    await expect(fetchAllParcels(fetcher)).rejects.toThrow(/Invalid where clause/);
  });

  it("throws when the transport fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(fetchAllParcels(fetcher)).rejects.toThrow(GisError);
  });

  it("refuses to loop forever if the service always asks for more", async () => {
    // A fresh Response per call: a body can only be read once, so a single
    // shared mock value would fail on the second page for the wrong reason.
    const fetcher = vi
      .fn()
      .mockImplementation(async () => ok({ features: [feature("a")], exceededTransferLimit: true }));
    await expect(fetchAllParcels(fetcher)).rejects.toThrow(/exceeded/);
  });

  it("does not lose the partial pages it already read when a later page fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(ok({ features: [feature("a")], exceededTransferLimit: true }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    // It throws rather than returning page one — a truncated scan would look
    // like parcels had disappeared from the county.
    await expect(fetchAllParcels(fetcher)).rejects.toThrow(GisError);
  });
});
