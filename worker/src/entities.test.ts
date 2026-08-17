import { describe, expect, it } from "vitest";
import { classifyOwner, isEntity, tokenize } from "./entities";

describe("tokenize", () => {
  it("drops punctuation inside abbreviations so L.L.C. reads as LLC", () => {
    expect(tokenize("SMITH L.L.C.")).toEqual(["SMITH", "LLC"]);
  });

  it("splits on commas and ampersands", () => {
    expect(tokenize("BRENNAN ALICE M & PETER J")).toEqual([
      "BRENNAN",
      "ALICE",
      "M",
      "PETER",
      "J",
    ]);
  });
});

describe("entity exclusion", () => {
  it("excludes the obvious organizational forms", () => {
    const organizations = [
      "ADA COMMERCE LLC",
      "MEIJER INC",
      "AMWAY CORP",
      "SOME PARTNERS LLP",
      "RIVERBEND LP",
      "FIFTH THIRD BANK",
      "ADA BIBLE CHURCH",
      "FOREST HILLS SCHOOL",
      "ADA TOWNSHIP",
      "CITY OF EAST GRAND RAPIDS",
      "KENT COUNTY",
      "STATE OF MICHIGAN",
      "CASCADE ASSOCIATION",
      "THORNAPPLE HOA",
      "KENT AUTHORITY",
      "US GOVERNMENT",
      "SMITH FOUNDATION",
      "VARGAS COMPANY",
    ];
    for (const name of organizations) {
      expect(isEntity(name), `${name} should be excluded`).toBe(true);
    }
  });

  it("reports which token caused the exclusion", () => {
    expect(classifyOwner("ADA COMMERCE LLC").matched).toBe("LLC");
  });

  /**
   * The reason matching is on tokens rather than substrings. Every name here
   * contains an exclusion term inside a word, and every one is a household.
   */
  it("does not exclude personal names that merely contain an entity term", () => {
    const people = [
      "PRINCE MICHAEL A", // contains INC
      "COOK JANET", // contains CO
      "SCORPIO ANNA", // contains CORP
      "STATON GREGORY", // contains STATE... nearly
      "CITYSLICKER NONSENSE", // contains CITY
      "BANKSTON HAROLD", // contains BANK
      "SCHOOLEY MARIA", // contains SCHOOL
      "ASSOCIATED PRESSLEY", // contains ASSOC
    ];
    for (const name of people) {
      expect(isEntity(name), `${name} should NOT be excluded`).toBe(false);
    }
  });

  it("keeps trusts and estates, which are ordinarily households", () => {
    expect(isEntity("HARTWELL DOUGLAS R TRUST &")).toBe(false);
    expect(isEntity("WHITFIELD KYLE A COLMERY TRUST")).toBe(false);
    expect(isEntity("ESTATE OF MARY BRENNAN")).toBe(false);
  });

  it("handles the name shapes the GIS service returns", () => {
    // Invented names in the exact shapes the live layer returns — padded,
    // ampersand-joined, trust-suffixed. No real owner data lives in this repo.
    const real = [
      "HARTWELL DOUGLAS R TRUST &",
      "OKORO MARIA & NELSON TROY",
      "BRENNAN ALICE M & PETER J",
      "LINDQVIST GONGPU & HE LAN",
      "RAMSEY ALIA & CHRISTOPHER",
    ];
    for (const name of real) expect(isEntity(name)).toBe(false);
  });
});
