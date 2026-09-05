import { describe, expect, it } from "vitest";
import type { Opportunity, Prospect } from "../types";
import { blankProspect } from "./prospectSchema";
import { blankOpportunity } from "./opportunities";
import { accountForPromotion, hasOpenAccount, patchPromotes } from "./promote";

const lead = (over: Partial<Prospect> = {}): Prospect =>
  blankProspect({ id: "hh-1", name: "Renata Silva", stage: "New", ...over });

describe("a lead earning its place on the pipeline", () => {
  it("promotes on a next step", () => {
    const account = accountForPromotion(lead({ nextAction: "Book the fact-find" }), [], "2026-09-05");
    expect(account).not.toBeNull();
    expect(account!.prospectId).toBe("hh-1");
    expect(account!.nextAction).toBe("Book the fact-find");
    expect(account!.stage).toBe("Qualified / Open");
  });

  it("promotes on a date alone, and says what it is for", () => {
    const account = accountForPromotion(lead({ nextActionDate: "2026-09-10" }), [], "2026-09-05");
    expect(account!.nextActionDate).toBe("2026-09-10");
    // The model refuses an account with no next action, so it gets one.
    expect(account!.nextAction).toBe("Follow up");
  });

  it("dates a next step that came without one, so it cannot sit forever", () => {
    const account = accountForPromotion(lead({ nextAction: "Call them" }), [], "2026-09-05");
    expect(account!.nextActionDate).toBe("2026-09-05");
  });

  it("does nothing for a household with neither", () => {
    expect(accountForPromotion(lead(), [], "2026-09-05")).toBeNull();
  });

  it("does not make a second account for a household that already has one", () => {
    const existing: Opportunity = { ...blankOpportunity("hh-1"), stage: "Quoting" };
    expect(
      accountForPromotion(lead({ nextAction: "Call them" }), [existing], "2026-09-05"),
    ).toBeNull();
  });

  it("promotes again once the earlier account is closed", () => {
    // A household that was won last year and is being worked again.
    const done: Opportunity = { ...blankOpportunity("hh-1"), stage: "Won" };
    expect(
      accountForPromotion(lead({ nextAction: "Renewal review" }), [done], "2026-09-05"),
    ).not.toBeNull();
  });

  it("leaves finished households alone", () => {
    const none: Opportunity[] = [];
    expect(accountForPromotion(lead({ nextAction: "x", stage: "Won" }), none, "2026-09-05")).toBeNull();
    expect(accountForPromotion(lead({ nextAction: "x", stage: "Closed" }), none, "2026-09-05")).toBeNull();
    expect(accountForPromotion(lead({ nextAction: "x", doNotContact: true }), none, "2026-09-05")).toBeNull();
  });

  it("carries the conversion score across rather than restating it", () => {
    const account = accountForPromotion(
      lead({ nextAction: "Call them", conversionScore: 7 }),
      [],
      "2026-09-05",
    );
    expect(account!.conversionScore).toBe(7);
  });

  describe("which edits count as a commitment", () => {
    it("counts a next step and a date", () => {
      expect(patchPromotes({ nextAction: "Call them" })).toBe(true);
      expect(patchPromotes({ nextActionDate: "2026-09-10" })).toBe(true);
    });

    it("ignores everything else, and ignores clearing the field", () => {
      expect(patchPromotes({ phone: "616-555-0102" })).toBe(false);
      expect(patchPromotes({ stage: "Contacted" })).toBe(false);
      expect(patchPromotes({ nextAction: "" })).toBe(false);
      expect(patchPromotes({ nextAction: "   " })).toBe(false);
    });
  });

  it("knows an open account from a closed one", () => {
    const open: Opportunity = { ...blankOpportunity("hh-1"), stage: "Quoting" };
    const won: Opportunity = { ...blankOpportunity("hh-1"), stage: "Won" };
    const lost: Opportunity = { ...blankOpportunity("hh-1"), stage: "Lost" };
    expect(hasOpenAccount([open], "hh-1")).toBe(true);
    expect(hasOpenAccount([won, lost], "hh-1")).toBe(false);
    expect(hasOpenAccount([open], "hh-2")).toBe(false);
  });
});
