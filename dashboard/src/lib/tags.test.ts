import { describe, expect, it } from "vitest";
import { TAG_COLORS, addTag, normalizeTagLabel, removeTag, tagColor } from "./tags";
import { normalizeProspect } from "./prospectSchema";
import type { ProspectTag } from "../types";

describe("tagColor", () => {
  it("resolves every palette entry", () => {
    for (const c of TAG_COLORS) expect(tagColor(c.id).id).toBe(c.id);
  });

  /** A restored backup or a renamed colour must still render something legible. */
  it("falls back rather than returning nothing for an unknown colour", () => {
    expect(tagColor("chartreuse").id).toBe(TAG_COLORS[0].id);
    expect(tagColor("").background).toBeTruthy();
  });

  it("pairs every background with a foreground", () => {
    for (const c of TAG_COLORS) {
      expect(c.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.foreground).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("offers six options", () => {
    expect(TAG_COLORS).toHaveLength(6);
  });
});

describe("normalizeTagLabel", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeTagLabel("  High   Value  ")).toBe("High Value");
  });

  it("caps the length, because a tag is not a note", () => {
    expect(normalizeTagLabel("x".repeat(80))).toHaveLength(24);
  });
});

describe("addTag", () => {
  it("adds a tag with the chosen colour", () => {
    const next = addTag([], "Referral", "cognac");
    expect(next).toHaveLength(1);
    expect(next[0].label).toBe("Referral");
    expect(next[0].color).toBe("cognac");
    expect(next[0].id).toBeTruthy();
  });

  it("refuses a blank label", () => {
    const tags: ProspectTag[] = [];
    expect(addTag(tags, "   ", "navy")).toBe(tags);
  });

  /** Clicking Add twice must not leave "Referral" beside "referral". */
  it("refuses a case-insensitive repeat", () => {
    const first = addTag([], "Referral", "navy");
    expect(addTag(first, "referral", "red")).toBe(first);
    expect(addTag(first, "  REFERRAL ", "red")).toBe(first);
  });

  it("keeps existing tags when adding another", () => {
    const two = addTag(addTag([], "High value", "navy"), "Referral", "green");
    expect(two.map((t) => t.label)).toEqual(["High value", "Referral"]);
  });

  it("stores an unknown colour as the fallback rather than as typed", () => {
    expect(addTag([], "Odd", "neon-pink")[0].color).toBe(TAG_COLORS[0].id);
  });

  it("gives each tag a distinct id", () => {
    const many = ["a", "b", "c"].reduce((acc, l) => addTag(acc, l, "navy"), [] as ProspectTag[]);
    expect(new Set(many.map((t) => t.id)).size).toBe(3);
  });
});

describe("removeTag", () => {
  it("removes only the named tag", () => {
    const two = addTag(addTag([], "Keep", "navy"), "Drop", "red");
    const dropId = two[1].id;
    const left = removeTag(two, dropId);
    expect(left.map((t) => t.label)).toEqual(["Keep"]);
  });

  it("is a no-op for an unknown id", () => {
    const one = addTag([], "Keep", "navy");
    expect(removeTag(one, "nope")).toHaveLength(1);
  });
});

describe("tags through the schema migration", () => {
  /** The whole point: every record that predates tags keeps working. */
  it("gives a record with no tags an empty list", () => {
    expect(normalizeProspect({ name: "Old Record" }).tags).toEqual([]);
  });

  it("carries valid tags through untouched", () => {
    const tags = [{ id: "t1", label: "High value", color: "cognac" }];
    expect(normalizeProspect({ name: "X", stage: "New", tags }).tags).toEqual(tags);
  });

  it("is idempotent, so a restore of a current backup changes nothing", () => {
    const once = normalizeProspect({ name: "X", stage: "New", tags: [{ id: "t1", label: "A", color: "navy" }] });
    expect(normalizeProspect(once).tags).toEqual(once.tags);
  });

  it("drops malformed entries rather than inventing labels", () => {
    const messy = normalizeProspect({
      name: "X",
      stage: "New",
      tags: [
        { id: "ok", label: "Good", color: "navy" },
        { id: "bad", label: "   ", color: "navy" },
        { id: "worse", color: "navy" },
        null,
        "not an object",
      ],
    });
    expect(messy.tags.map((t) => t.label)).toEqual(["Good"]);
  });

  it("survives tags arriving as something other than an array", () => {
    expect(normalizeProspect({ name: "X", stage: "New", tags: "nope" }).tags).toEqual([]);
    expect(normalizeProspect({ name: "X", stage: "New", tags: null }).tags).toEqual([]);
  });

  it("supplies an id when a stored tag has none", () => {
    const fixed = normalizeProspect({ name: "X", stage: "New", tags: [{ label: "No id", color: "red" }] });
    expect(fixed.tags[0].id).toBeTruthy();
    expect(fixed.tags[0].label).toBe("No id");
  });
});
