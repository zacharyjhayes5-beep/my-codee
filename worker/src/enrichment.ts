import type { LeadRow } from "./store";

export type EnrichmentStatus = "pending" | "processing" | "enriched" | "needs_review" | "not_found" | "failed";
export type EnrichmentConfidence = "low" | "medium" | "high";

export interface EnrichedContact {
  kind: "phone" | "email";
  value: string;
  confidence: EnrichmentConfidence;
}

export interface EnrichmentResult {
  contacts: EnrichedContact[];
}

export interface EnrichmentProvider {
  readonly name: string;
  enrich(lead: LeadRow): Promise<EnrichmentResult>;
}

export interface ClassifiedEnrichment extends EnrichmentResult {
  status: Exclude<EnrichmentStatus, "pending" | "processing">;
  confidence: EnrichmentConfidence | null;
  provider: string;
}

const confidenceRank: Record<EnrichmentConfidence, number> = { low: 1, medium: 2, high: 3 };

/** Pure provider boundary: it never inserts, deduplicates or acknowledges a lead. */
export async function enrichLead(lead: LeadRow, provider: EnrichmentProvider): Promise<ClassifiedEnrichment> {
  try {
    const result = await provider.enrich(lead);
    const confidence = result.contacts.reduce<EnrichmentConfidence | null>((best, contact) =>
      !best || confidenceRank[contact.confidence] > confidenceRank[best] ? contact.confidence : best, null);
    return {
      ...result,
      provider: provider.name,
      confidence,
      status: result.contacts.length === 0 ? "not_found" : confidence === "high" ? "enriched" : "needs_review",
    };
  } catch {
    return { contacts: [], provider: provider.name, confidence: null, status: "failed" };
  }
}

/** Deterministic test provider. Production must supply an approved provider and secret. */
export class MockEnrichmentProvider implements EnrichmentProvider {
  readonly name = "mock";
  constructor(private result: EnrichmentResult = { contacts: [] }) {}
  async enrich(): Promise<EnrichmentResult> { return this.result; }
}
