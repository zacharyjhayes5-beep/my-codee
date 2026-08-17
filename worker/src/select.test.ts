import { describe, expect, it } from "vitest";
import { selectBatch, type Eligible } from "./select";

const make = (unit: string, n: number, reason: Eligible["reason"] = "new-parcel"): Eligible[] =>
  Array.from({ length: n }, (_, i) => ({
    pnum: `${unit}-${String(i).padStart(4, "0")}`,
    govtUnit: unit,
    reason,
  }));

const countBy = (rows: Eligible[], unit: string) => rows.filter((r) => r.govtUnit === unit).length;

describe("selectBatch", () => {
  it("takes 9/8/8 when every municipality has plenty", () => {
    const picked = selectBatch([...make("11", 50), ...make("18", 50), ...make("44", 50)], "full");
    expect(picked).toHaveLength(25);
    expect(countBy(picked, "11")).toBe(9);
    expect(countBy(picked, "18")).toBe(8);
    expect(countBy(picked, "44")).toBe(8);
  });

  it("takes 1/1/1 in development mode", () => {
    const picked = selectBatch([...make("11", 5), ...make("18", 5), ...make("44", 5)], "dev");
    expect(picked).toHaveLength(3);
    expect(countBy(picked, "11")).toBe(1);
    expect(countBy(picked, "18")).toBe(1);
    expect(countBy(picked, "44")).toBe(1);
  });

  it("fills a municipality's shortfall from the others", () => {
    // Ada can only supply 2 of its 9. The batch should still reach 25.
    const picked = selectBatch([...make("11", 2), ...make("18", 50), ...make("44", 50)], "full");
    expect(picked).toHaveLength(25);
    expect(countBy(picked, "11")).toBe(2);
    expect(countBy(picked, "18") + countBy(picked, "44")).toBe(23);
  });

  it("returns everything available when the total is short of a full batch", () => {
    const picked = selectBatch([...make("11", 3), ...make("18", 2)], "full");
    expect(picked).toHaveLength(5);
  });

  it("returns nothing when there is nothing eligible", () => {
    expect(selectBatch([], "full")).toHaveLength(0);
  });

  it("never exceeds the batch size", () => {
    const picked = selectBatch([...make("11", 999), ...make("18", 999), ...make("44", 999)], "full");
    expect(picked).toHaveLength(25);
  });

  it("prefers owner changes over brand-new parcels", () => {
    const eligible = [...make("11", 20), ...make("11", 3, "owner-change")];
    const picked = selectBatch(eligible, "full");
    const ada = picked.filter((p) => p.govtUnit === "11");
    expect(ada.slice(0, 3).every((p) => p.reason === "owner-change")).toBe(true);
  });

  it("ignores rows from municipalities outside the target set", () => {
    const picked = selectBatch([...make("99", 40), ...make("11", 2)], "full");
    expect(picked).toHaveLength(2);
    expect(picked.every((p) => p.govtUnit === "11")).toBe(true);
  });

  it("selects the same rows for the same input, so a retry is stable", () => {
    const eligible = [...make("11", 30), ...make("18", 30), ...make("44", 30)];
    const a = selectBatch(eligible, "full").map((r) => r.pnum);
    const b = selectBatch(eligible, "full").map((r) => r.pnum);
    expect(a).toEqual(b);
  });
});
