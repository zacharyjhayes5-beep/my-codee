import { describe, expect, it } from "vitest";
import {
  displayOwner,
  leadId,
  normalizeOwner,
  normalizePnum,
  splitStateZip,
  squash,
  toParcelRecord,
} from "./normalize";

describe("squash", () => {
  it("strips the trailing padding GIS puts on every string field", () => {
    expect(squash("ADA                      ")).toBe("ADA");
    expect(squash("1200 SAMPLE RIDGE RD NE         ")).toBe("1200 SAMPLE RIDGE RD NE");
  });

  it("treats null and undefined as empty", () => {
    expect(squash(null)).toBe("");
    expect(squash(undefined)).toBe("");
  });
});

describe("normalizePnum", () => {
  it("is stable across the padding variations GIS returns", () => {
    expect(normalizePnum("00-00-00-000-001   ")).toBe("00-00-00-000-001");
    expect(normalizePnum("  00-00-00-000-001")).toBe("00-00-00-000-001");
  });
});

describe("normalizeOwner", () => {
  it("drops the trailing ampersand that means 'continued in OWNERNAME2'", () => {
    expect(normalizeOwner("HARTWELL DOUGLAS R TRUST &", "")).toBe("HARTWELL DOUGLAS R TRUST");
  });

  it("folds both owner fields in, so a change to either is a change of owner", () => {
    expect(normalizeOwner("HARTWELL DOUGLAS R TRUST &", "HARTWELL PATRICIA K TRUST")).toBe(
      "HARTWELL DOUGLAS R TRUST & HARTWELL PATRICIA K TRUST",
    );
  });

  it("is unchanged by padding, case and punctuation", () => {
    const a = normalizeOwner("BRENNAN ALICE M & PETER J            ", "     ");
    const b = normalizeOwner("brennan alice m & peter j", null);
    expect(a).toBe(b);
  });

  /** The property the ledger depends on: same owner in, same string out. */
  it("gives the same result for the same owner across runs", () => {
    const first = normalizeOwner("OKORO MARIA & NELSON TROY             ", "      ");
    const second = normalizeOwner("OKORO MARIA & NELSON TROY", "");
    expect(first).toBe(second);
  });

  it("distinguishes a genuine sale", () => {
    expect(normalizeOwner("BRENNAN ALICE M", "")).not.toBe(normalizeOwner("DELACROIX TOM", ""));
  });
});

describe("displayOwner", () => {
  it("joins both names for a human", () => {
    expect(displayOwner("HARTWELL DOUGLAS R TRUST &", "HARTWELL PATRICIA K TRUST")).toBe(
      "HARTWELL DOUGLAS R TRUST & HARTWELL PATRICIA K TRUST",
    );
  });

  it("leaves a single owner alone", () => {
    expect(displayOwner("BRENNAN ALICE M & PETER J", "   ")).toBe("BRENNAN ALICE M & PETER J");
  });
});

describe("toParcelRecord", () => {
  const attrs = {
    PNUM: "00-00-00-000-001",
    OWNERNAME1: "HARTWELL DOUGLAS R TRUST &             ",
    OWNERNAME2: "HARTWELL PATRICIA K TRUST                  ",
    PROPERTYADDRESS: "1200 SAMPLE RIDGE RD NE         ",
    PROPADDRESSCITY: "ADA                      ",
    OWNERADDRESS: "1200 SAMPLE RIDGE RD               ",
    OWNERCITY: "ADA        ",
    OWNERZIPCODE: "49999   ",
    GOVERNMENTALUNIT: "11",
    PROPERTYCLASS: "401",
    ACREAGE: 19.26785724,
  };

  it("builds a clean record from a real GIS row", () => {
    const record = toParcelRecord(attrs)!;
    expect(record.pnum).toBe("00-00-00-000-001");
    expect(record.propertyAddress).toBe("1200 SAMPLE RIDGE RD NE");
    expect(record.propertyCity).toBe("ADA");
    expect(record.govtUnit).toBe("11");
    expect(record.acreage).toBeCloseTo(19.2678, 3);
  });

  it("rejects rows with no parcel number, which cannot be deduplicated", () => {
    expect(toParcelRecord({ ...attrs, PNUM: "   " })).toBeNull();
  });

  it("rejects rows with no owner, which cannot be classified", () => {
    expect(toParcelRecord({ ...attrs, OWNERNAME1: "  ", OWNERNAME2: "  " })).toBeNull();
  });
});

describe("leadId", () => {
  it("is deterministic, so a retried run cannot duplicate a lead", () => {
    expect(leadId("00-00-00-000-001", "BRENNAN ALICE M")).toBe(
      leadId("00-00-00-000-001", "BRENNAN ALICE M"),
    );
  });

  it("changes when the owner changes, so a sale is a new lead", () => {
    expect(leadId("00-00-00-000-001", "BRENNAN ALICE M")).not.toBe(
      leadId("00-00-00-000-001", "DELACROIX TOM"),
    );
  });

  it("differs between parcels with the same owner", () => {
    expect(leadId("00-00-00-000-001", "BRENNAN ALICE M")).not.toBe(
      leadId("00-00-00-000-002", "BRENNAN ALICE M"),
    );
  });
});

describe("splitStateZip", () => {
  it("splits the packed state and postcode GIS returns", () => {
    expect(splitStateZip("MI49506")).toEqual({ propertyState: "MI", propertyZip: "49506" });
  });

  it("tolerates padding", () => {
    expect(splitStateZip("  MI49301   ")).toEqual({ propertyState: "MI", propertyZip: "49301" });
  });

  it("keeps the five-digit postcode when a plus-four is present", () => {
    expect(splitStateZip("MI495061234")).toEqual({ propertyState: "MI", propertyZip: "49506" });
  });

  it("returns blanks rather than guessing when the field is unusable", () => {
    expect(splitStateZip("")).toEqual({ propertyState: "", propertyZip: "" });
    expect(splitStateZip(null)).toEqual({ propertyState: "", propertyZip: "" });
    expect(splitStateZip("garbage")).toEqual({ propertyState: "", propertyZip: "" });
  });
});
