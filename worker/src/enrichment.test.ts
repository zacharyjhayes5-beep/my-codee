import { describe, expect, it } from "vitest";
import { enrichLead, MockEnrichmentProvider } from "./enrichment";
import type { LeadRow } from "./store";

const lead: LeadRow = {
  id: "lead-1", pnum: "41-00-00-000-001", govt_unit: "44", owner_raw: "TEST OWNER",
  property_address: "1 TEST ST", property_city: "LOWELL", property_state: "MI", property_zip: "49331",
  owner_address: null, owner_city: null, owner_zip: null, acreage: null, reason: "new-parcel", created_at: "2026-08-22",
  enrichment_status: "pending", enrichment_provider: null, enrichment_confidence: null, enrichment_attempted_at: null,
};

describe("lead enrichment provider boundary", () => {
  it("marks a high-confidence contact ready", async () => {
    const result = await enrichLead(lead, new MockEnrichmentProvider({ contacts: [{ kind: "phone", value: "6165550100", confidence: "high" }] }));
    expect(result.status).toBe("enriched");
  });

  it("routes uncertain and empty results to reviewable states", async () => {
    const uncertain = await enrichLead(lead, new MockEnrichmentProvider({ contacts: [{ kind: "email", value: "test@example.com", confidence: "medium" }] }));
    const empty = await enrichLead(lead, new MockEnrichmentProvider());
    expect(uncertain.status).toBe("needs_review");
    expect(empty.status).toBe("not_found");
  });

  it("contains provider failure instead of throwing into ingestion", async () => {
    const result = await enrichLead(lead, { name: "failing", async enrich() { throw new Error("offline"); } });
    expect(result.status).toBe("failed");
  });
});
