import { describe, expect, it } from "vitest";
import type { Opportunity, Prospect, QuoteVersion, Workbench } from "../types";
import { blankOpportunity } from "./opportunities";
import { blankProspect } from "./prospectSchema";
import {
  LINE_LABELS,
  STARTER_ITEMS,
  addCustomItem,
  annualizedPremium,
  bindingQuotes,
  blankQuote,
  blankWorkbench,
  comparePremiums,
  countStatuses,
  docLinkKind,
  handoffSummary,
  itemIsEmpty,
  linesFromOpportunity,
  markRequested,
  normalizeWorkbench,
  opportunityLinesFrom,
  outstandingItems,
  parsePremium,
  patchItem,
  proposalSummary,
  readPrebind,
  requestDraft,
  setPlanningToBind,
  summaryLine,
  syncLines,
  upsertWorkbench,
  visibleItems,
  workbenchFor,
} from "./workbench";

const DAY = "2026-09-10";

function bench(lines: Parameters<typeof blankWorkbench>[2] = ["auto", "home"]): Workbench {
  return blankWorkbench("opp-1", "pro-1", lines, DAY);
}

function household(over: Partial<Prospect> = {}): Prospect {
  return blankProspect({
    id: "pro-1",
    name: "Marcy & Ted Hall",
    firstName: "Marcy",
    phone: "(517) 555-0101",
    email: "marcy@example.com",
    ...over,
  });
}

function quote(over: Partial<QuoteVersion> = {}): QuoteVersion {
  return { ...blankQuote("auto", "proposed", DAY), ...over };
}

/* ------------------------------------------------------------------ */

describe("starting a workbench", () => {
  it("seeds the starter prompts for the chosen lines and nothing else", () => {
    const wb = bench(["auto"]);
    expect(wb.items).toHaveLength(STARTER_ITEMS.auto.length);
    expect(wb.items.every((i) => i.line === "auto")).toBe(true);
    expect(wb.items.every((i) => i.status === "needed")).toBe(true);
    expect(wb.items.every((i) => i.custom === false)).toBe(true);
  });

  it("gives every new workbench the editable pre-bind prompts", () => {
    expect(bench().prebind.length).toBeGreaterThan(0);
    expect(bench().prebind.every((p) => p.status === "needed")).toBe(true);
  });

  it("reads its lines off the account, including board rows", () => {
    const opportunity: Opportunity = {
      ...blankOpportunity("pro-1"),
      lines: ["Auto", "Life"],
      quoteRows: [{ line: "Renters", premium: "240" }],
    };
    expect(linesFromOpportunity(opportunity)).toEqual(["auto", "renters", "life"]);
  });

  it("folds condo and renters back onto Home for the board, keeping Commercial", () => {
    expect(opportunityLinesFrom(["condo", "auto"], ["Commercial"])).toEqual([
      "Home",
      "Auto",
      "Commercial",
    ]);
  });
});

/* ------------------------------------------------------------------ */

describe("changing the selected lines", () => {
  it("adds the new line's prompts without touching the old ones", () => {
    const before = bench(["auto"]);
    const after = syncLines(before, ["auto", "umbrella"], DAY);
    expect(after.items.filter((i) => i.line === "auto")).toHaveLength(STARTER_ITEMS.auto.length);
    expect(after.items.filter((i) => i.line === "umbrella")).toHaveLength(
      STARTER_ITEMS.umbrella.length,
    );
  });

  it("does not duplicate prompts when a line is re-selected", () => {
    const wb = syncLines(syncLines(bench(["auto"]), ["auto"], DAY), ["auto"], DAY);
    expect(wb.items).toHaveLength(STARTER_ITEMS.auto.length);
  });

  it("drops only untouched prompts when a line is deselected", () => {
    let wb = bench(["auto", "home"]);
    const roof = wb.items.find((i) => i.line === "home" && i.label.startsWith("Roof"))!;
    wb = { ...wb, items: patchItem(wb.items, roof.id, { status: "received" }, DAY) };

    const after = syncLines(wb, ["auto"], DAY);
    expect(after.items.find((i) => i.id === roof.id)?.status).toBe("received");
    // The rest of Home, never touched, is gone.
    expect(after.items.filter((i) => i.line === "home")).toHaveLength(1);
  });

  it("keeps a note-only item even with the status untouched", () => {
    let wb = bench(["home"]);
    const target = wb.items[0];
    wb = { ...wb, items: patchItem(wb.items, target.id, { notes: "asked on the call" }, DAY) };
    const after = syncLines(wb, [], DAY);
    expect(after.items.map((i) => i.id)).toContain(target.id);
  });

  it("keeps a custom item through a line change — the acceptance case", () => {
    let wb = bench(["auto"]);
    wb = { ...wb, items: addCustomItem(wb.items, "Copy of the lien holder letter", "auto", DAY) };
    const custom = wb.items.find((i) => i.custom)!;

    const dropped = syncLines(wb, ["life"], DAY);
    expect(dropped.items.map((i) => i.id)).toContain(custom.id);

    const restored = syncLines(dropped, ["auto", "life"], DAY);
    expect(restored.items.filter((i) => i.id === custom.id)).toHaveLength(1);
    // And re-selecting did not duplicate the starter prompts either.
    expect(restored.items.filter((i) => i.line === "auto" && !i.custom)).toHaveLength(
      STARTER_ITEMS.auto.length,
    );
  });

  it("surfaces kept items under a deselected line rather than hiding them", () => {
    let wb = bench(["home"]);
    wb = { ...wb, items: patchItem(wb.items, wb.items[0].id, { status: "verified" }, DAY) };
    const after = syncLines(wb, [], DAY);
    const group = visibleItems(after).find((g) => g.line === "home")!;
    expect(group.selected).toBe(false);
    expect(group.label).toContain("not selected");
  });

  it("knows which items are empty", () => {
    const wb = bench(["auto"]);
    expect(itemIsEmpty(wb.items[0])).toBe(true);
    expect(itemIsEmpty({ ...wb.items[0], notes: "x" })).toBe(false);
    expect(itemIsEmpty({ ...wb.items[0], status: "na" })).toBe(false);
    expect(itemIsEmpty({ ...wb.items[0], docId: "d1" })).toBe(false);
    expect(itemIsEmpty({ ...wb.items[0], custom: true })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("the factual summary", () => {
  it("counts rather than scores", () => {
    const counts = { needed: 3, requested: 2, received: 4, verified: 0, na: 0 };
    expect(summaryLine(counts)).toBe("3 needed · 2 requested · 4 received awaiting verification");
  });

  it("says so when there is nothing on the list", () => {
    expect(summaryLine(countStatuses([]))).toBe("Nothing on the list yet.");
  });

  it("omits the categories that are empty", () => {
    expect(summaryLine({ needed: 1, requested: 0, received: 0, verified: 2, na: 0 })).toBe(
      "1 needed · 2 verified",
    );
  });
});

/* ------------------------------------------------------------------ */

describe("the missing-information request", () => {
  it("offers only what is outstanding", () => {
    let wb = bench(["auto"]);
    wb = { ...wb, items: patchItem(wb.items, wb.items[0].id, { status: "received" }, DAY) };
    wb = { ...wb, items: patchItem(wb.items, wb.items[1].id, { status: "verified" }, DAY) };
    wb = { ...wb, items: patchItem(wb.items, wb.items[2].id, { status: "na" }, DAY) };

    const out = outstandingItems(wb.items);
    expect(out.map((i) => i.id)).not.toContain(wb.items[0].id);
    expect(out.map((i) => i.id)).not.toContain(wb.items[1].id);
    expect(out.map((i) => i.id)).not.toContain(wb.items[2].id);
    expect(out.every((i) => i.status === "needed" || i.status === "requested")).toBe(true);
  });

  it("excludes received and verified items from the drafted text", () => {
    let wb = bench(["auto"]);
    const dec = wb.items.find((i) => i.label === "Current declarations page")!;
    wb = { ...wb, items: patchItem(wb.items, dec.id, { status: "received" }, DAY) };

    const text = requestDraft({
      prospect: household(),
      items: outstandingItems(wb.items),
      lines: wb.lines,
      ownerName: "Zachary Hayes",
    });

    expect(text).not.toContain("Current declarations page");
    expect(text).toContain("Drivers in the household");
    expect(text).toContain("Hi Marcy");
    expect(text).toContain("Thanks! Zachary");
  });

  it("names the lines it is about", () => {
    const text = requestDraft({
      prospect: household(),
      items: [],
      lines: ["home", "auto"],
      ownerName: "Zach",
    });
    expect(text).toContain("your home and auto quotes");
  });

  it("points at the secure method instead of asking for sensitive documents by email", () => {
    const wb = bench(["auto"]);
    const text = requestDraft({
      prospect: household(),
      items: outstandingItems(wb.items),
      lines: wb.lines,
    });
    expect(text).toMatch(/secure method/i);
    // And it never invents a portal or a URL.
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("leaves the secure-method line off when nothing sensitive is being asked for", () => {
    const text = requestDraft({
      prospect: household(),
      items: [
        {
          id: "i1",
          line: "auto",
          label: "Annual mileage",
          status: "needed",
          notes: "",
          updatedAt: DAY,
          custom: true,
        },
      ],
      lines: ["auto"],
    });
    expect(text).not.toMatch(/secure method/i);
  });

  it("falls back to a greeting that is never wrong", () => {
    expect(requestDraft({ prospect: undefined, items: [], lines: [] })).toContain("Hi there");
  });

  it("marks only the named items, and only forward", () => {
    let wb = bench(["auto"]);
    const [first, second, third] = wb.items;
    wb = { ...wb, items: patchItem(wb.items, third.id, { status: "received" }, DAY) };

    const after = markRequested(wb.items, [first.id, third.id], DAY);

    expect(after.find((i) => i.id === first.id)?.status).toBe("requested");
    expect(after.find((i) => i.id === first.id)?.requestedAt).toBe(DAY);
    // Untouched.
    expect(after.find((i) => i.id === second.id)?.status).toBe("needed");
    // Never dragged backwards out of received.
    expect(after.find((i) => i.id === third.id)?.status).toBe("received");
    expect(after.find((i) => i.id === third.id)?.requestedAt).toBeUndefined();
  });

  it("drafting the text changes no status at all", () => {
    const wb = bench(["auto", "home"]);
    const before = JSON.stringify(wb.items);
    requestDraft({ prospect: household(), items: outstandingItems(wb.items), lines: wb.lines });
    expect(JSON.stringify(wb.items)).toBe(before);
  });
});

/* ------------------------------------------------------------------ */

describe("premiums", () => {
  it("reads a blank premium as nothing, never as zero", () => {
    expect(parsePremium("")).toBeNull();
    expect(parsePremium("   ")).toBeNull();
    expect(parsePremium("not priced")).toBeNull();
    expect(parsePremium("0")).toBe(0);
    expect(parsePremium("$1,840.50")).toBe(1840.5);
  });

  it("annualizes a six-month premium and says that it did", () => {
    const reading = annualizedPremium(quote({ premium: "640", term: "six-month" }))!;
    expect(reading.value).toBe(1280);
    expect(reading.original).toBe(640);
    expect(reading.converted).toBe(true);
    expect(reading.note).toContain("$640");
    expect(reading.note).toContain("calculated");
  });

  it("leaves an annual premium alone", () => {
    const reading = annualizedPremium(quote({ premium: "1280", term: "annual" }))!;
    expect(reading.value).toBe(1280);
    expect(reading.converted).toBe(false);
  });

  it("refuses to annualize an unlabelled term", () => {
    expect(annualizedPremium(quote({ premium: "640", term: "unknown" }))).toBeNull();
  });

  it("refuses to annualize a missing premium", () => {
    expect(annualizedPremium(quote({ premium: "", term: "annual" }))).toBeNull();
  });
});

describe("comparing a proposal against the current policy", () => {
  it("compares six-month against annual on annualized figures, and labels it", () => {
    const current = quote({ kind: "current", premium: "1400", term: "annual" });
    const proposed = quote({ premium: "640", term: "six-month" });

    const result = comparePremiums(current, proposed);
    expect(result.status).toBe("comparable");
    expect(result.annualDifference).toBe(120);
    expect(result.annualizedForComparison).toBe(true);
    expect(result.message).toContain("$120 less a year");
    expect(result.message).toContain("annualized");
    // The original figures survive untouched.
    expect(result.proposed?.original).toBe(640);
    expect(result.current?.original).toBe(1400);
  });

  it("reports a more expensive proposal as more expensive", () => {
    const result = comparePremiums(
      quote({ kind: "current", premium: "1000", term: "annual" }),
      quote({ premium: "1200", term: "annual" }),
    );
    expect(result.annualDifference).toBe(-200);
    expect(result.message).toContain("$200 more a year");
  });

  it("claims no saving when a premium is missing — the acceptance case", () => {
    const result = comparePremiums(
      quote({ kind: "current", premium: "1400", term: "annual" }),
      quote({ premium: "", term: "annual" }),
    );
    expect(result.status).toBe("missing-premium");
    expect(result.annualDifference).toBeNull();
    expect(result.message).toContain("No price comparison");
    expect(result.message).not.toMatch(/less|more|saving/i);
  });

  it("claims no saving when there is no baseline to compare against", () => {
    const result = comparePremiums(undefined, quote({ premium: "900", term: "annual" }));
    expect(result.status).toBe("missing-premium");
    expect(result.annualDifference).toBeNull();
  });

  it("refuses the comparison when a term is unrecorded rather than guessing", () => {
    const result = comparePremiums(
      quote({ kind: "current", premium: "1400", term: "annual" }),
      quote({ premium: "640", term: "unknown" }),
    );
    expect(result.status).toBe("unknown-term");
    expect(result.annualDifference).toBeNull();
    expect(result.message).toContain("term is not recorded");
  });

  it("never treats an instalment as the total — the figure entered is the figure used", () => {
    // A $120 monthly instalment is $1,440 a year, not $120.
    const result = comparePremiums(
      quote({ kind: "current", premium: "1400", term: "annual" }),
      quote({ premium: "120", term: "monthly" }),
    );
    expect(result.proposed?.value).toBe(1440);
    expect(result.annualDifference).toBe(-40);
  });
});

/* ------------------------------------------------------------------ */

describe("planning to bind", () => {
  it("allows one per line and moves the flag rather than adding a second", () => {
    const a = quote({ id: "a", line: "auto" });
    const b = quote({ id: "b", line: "auto" });
    const c = quote({ id: "c", line: "home" });

    let quotes = setPlanningToBind([a, b, c], "a");
    expect(quotes.filter((q) => q.planningToBind).map((q) => q.id)).toEqual(["a"]);

    quotes = setPlanningToBind(quotes, "b");
    expect(quotes.filter((q) => q.planningToBind).map((q) => q.id)).toEqual(["b"]);

    // A different line is independent.
    quotes = setPlanningToBind(quotes, "c");
    expect(quotes.filter((q) => q.planningToBind).map((q) => q.id).sort()).toEqual(["b", "c"]);
  });

  it("clears the flag when pressed again", () => {
    const quotes = setPlanningToBind(setPlanningToBind([quote({ id: "a" })], "a"), "a");
    expect(quotes[0].planningToBind).toBe(false);
  });

  it("never marks a current policy as planning to bind", () => {
    const quotes = setPlanningToBind([quote({ id: "a", kind: "current" })], "a");
    expect(quotes[0].planningToBind).toBe(false);
  });

  it("collects only the marked proposals", () => {
    const wb: Workbench = {
      ...bench(),
      quotes: [
        quote({ id: "a", planningToBind: true }),
        quote({ id: "b" }),
        { ...quote({ id: "c", kind: "current" }), planningToBind: true },
      ],
    };
    expect(bindingQuotes(wb).map((q) => q.id)).toEqual(["a"]);
  });
});

/* ------------------------------------------------------------------ */

describe("documents", () => {
  it("only calls something a link when a browser could open it", () => {
    expect(docLinkKind("https://example.com/dec.pdf")).toBe("url");
    expect(docLinkKind("http://intranet/doc")).toBe("url");
    expect(docLinkKind("C:\\Users\\zacha\\Documents\\dec.pdf")).toBe("path");
    expect(docLinkKind("\\\\server\\share\\dec.pdf")).toBe("path");
    expect(docLinkKind("   ")).toBe("empty");
  });

  it("linking evidence does not verify an item", () => {
    const wb = bench(["auto"]);
    const target = wb.items[0];
    const after = patchItem(wb.items, target.id, { docId: "doc-1" }, DAY);
    expect(after.find((i) => i.id === target.id)?.docId).toBe("doc-1");
    expect(after.find((i) => i.id === target.id)?.status).toBe("needed");
  });
});

/* ------------------------------------------------------------------ */

describe("pre-bind preparation", () => {
  it("says what is outstanding without claiming anything is ready", () => {
    const reading = readPrebind(bench());
    expect(reading.summary).toContain("No quote is marked Planning to bind");
    expect(reading.summary).not.toMatch(/ready|approved|bound|satisfied/i);
  });

  it("reports the quotes marked for review", () => {
    const wb: Workbench = {
      ...bench(),
      quotes: [quote({ id: "a", planningToBind: true })],
      prebind: bench().prebind.map((p) => ({ ...p, status: "verified" as const })),
    };
    const reading = readPrebind(wb);
    expect(reading.selected).toHaveLength(1);
    expect(reading.outstanding).toHaveLength(0);
    expect(reading.summary).toContain("1 quote marked for review");
    expect(reading.summary).toContain("nothing outstanding");
    // Even complete, it never claims coverage is bound or approved.
    expect(reading.summary).not.toMatch(/ready to bind|approved|is bound/i);
  });
});

/* ------------------------------------------------------------------ */

describe("the handoff summary", () => {
  const wb = (): Workbench => ({
    ...bench(["auto", "home"]),
    quotes: [
      quote({
        id: "chosen",
        line: "auto",
        carrier: "Farm Bureau",
        label: "Version A",
        premium: "640",
        term: "six-month",
        effectiveDate: "2026-10-01",
        planningToBind: true,
      }),
      quote({ id: "other", line: "auto", carrier: "Farm Bureau", label: "Version B", premium: "710" }),
      quote({ id: "home", line: "home", carrier: "Farm Bureau", label: "Home quote", premium: "980" }),
    ],
    docs: [
      {
        id: "d1",
        name: "Prior auto dec",
        category: "Declarations page",
        location: "C:\\docs\\dec.pdf",
        notes: "",
        line: "auto",
        createdAt: DAY,
      },
    ],
  });

  it("names only the quotes selected for binding", () => {
    const text = handoffSummary(wb(), household(), blankOpportunity("pro-1"), DAY);
    expect(text).toContain("Version A");
    expect(text).not.toContain("Version B");
    expect(text).not.toContain("Home quote");
  });

  it("carries the household, dates, documents and what is outstanding", () => {
    const text = handoffSummary(wb(), household(), blankOpportunity("pro-1"), DAY);
    expect(text).toContain("Marcy & Ted Hall");
    expect(text).toContain("Intended effective date: 2026-10-01");
    expect(text).toContain("Prior auto dec");
    expect(text).toContain("OUTSTANDING — PREPARATION LIST");
    expect(text).toContain("OUTSTANDING — INFORMATION AND QUESTIONS");
  });

  it("never claims coverage is bound or underwriting has approved anything", () => {
    const complete: Workbench = {
      ...wb(),
      items: wb().items.map((i) => ({ ...i, status: "verified" as const })),
      prebind: wb().prebind.map((p) => ({ ...p, status: "verified" as const })),
    };
    const text = handoffSummary(complete, household(), blankOpportunity("pro-1"), DAY);
    expect(text).toContain("Nothing here states that coverage is bound");
    expect(text).not.toMatch(/is bound\b(?!,)/);
    expect(text).not.toMatch(/underwriting approved|requirements met|ready to bind/i);
  });

  it("says so plainly when nothing has been selected", () => {
    const text = handoffSummary(bench(), household(), undefined, DAY);
    expect(text).toContain("None marked Planning to bind.");
  });
});

/* ------------------------------------------------------------------ */

describe("the proposal summary", () => {
  it("separates price from coverage trade-offs", () => {
    const wb: Workbench = {
      ...bench(["auto"]),
      quotes: [
        quote({ id: "cur", kind: "current", carrier: "Acme", premium: "1400", term: "annual" }),
        quote({
          id: "new",
          carrier: "Farm Bureau",
          premium: "640",
          term: "six-month",
          differences: "Deductible up from $500 to $1,000",
          planningToBind: true,
        }),
      ],
    };
    const text = proposalSummary(wb, household());
    expect(text).toContain("$120 less a year");
    expect(text).toContain("Coverage differences / trade-offs: Deductible up from $500 to $1,000");
    expect(text).toContain("Coverage is not");
  });

  it("reports no saving when the proposal has no premium", () => {
    const wb: Workbench = {
      ...bench(["auto"]),
      quotes: [
        quote({ id: "cur", kind: "current", premium: "1400", term: "annual" }),
        quote({ id: "new", premium: "" }),
      ],
    };
    const text = proposalSummary(wb, household());
    expect(text).toContain("premium not entered");
    expect(text).toContain("No price comparison");
    expect(text).not.toMatch(/less a year|more a year/);
  });

  it("is honest about an empty workbench", () => {
    expect(proposalSummary(bench([]), household())).toContain("Nothing entered yet.");
  });
});

/* ------------------------------------------------------------------ */

describe("storing a workbench", () => {
  it("finds one by the account it belongs to", () => {
    const wb = bench();
    expect(workbenchFor([wb], "opp-1")).toBe(wb);
    expect(workbenchFor([wb], "opp-2")).toBeUndefined();
  });

  it("upserts rather than duplicating", () => {
    const wb = bench();
    const once = upsertWorkbench([], wb, DAY);
    expect(once).toHaveLength(1);
    const twice = upsertWorkbench(once, { ...wb, lines: ["life"] }, DAY);
    expect(twice).toHaveLength(1);
    expect(twice[0].lines).toEqual(["life"]);
  });

  it("reads a row from an older build without throwing", () => {
    // Every array and string absent — the shape a half-written row has.
    const rough = { id: "w1", opportunityId: "o1", prospectId: "p1" } as unknown as Workbench;
    const fixed = normalizeWorkbench(rough);
    expect(fixed.items).toEqual([]);
    expect(fixed.quotes).toEqual([]);
    expect(fixed.docs).toEqual([]);
    expect(fixed.prebind).toEqual([]);
    expect(fixed.lines).toEqual([]);
  });

  it("repairs a bad status, term and line rather than trusting them", () => {
    const rough = {
      id: "w1",
      opportunityId: "o1",
      prospectId: "p1",
      lines: ["auto", "nonsense"],
      items: [{ id: "i1", label: "x", status: "whatever", line: "nope" }],
      quotes: [{ id: "q1", kind: "proposed", line: "nope", term: "fortnightly", premium: 640 }],
      docs: [],
      prebind: [],
    } as unknown as Workbench;

    const fixed = normalizeWorkbench(rough);
    expect(fixed.lines).toEqual(["auto"]);
    expect(fixed.items[0].status).toBe("needed");
    expect(fixed.items[0].line).toBeNull();
    expect(fixed.quotes[0].line).toBe("auto");
    expect(fixed.quotes[0].term).toBe("unknown");
    // A numeric premium from an older writer becomes the string the UI edits.
    expect(fixed.quotes[0].premium).toBe("640");
  });

  it("is idempotent", () => {
    const once = normalizeWorkbench(bench());
    expect(normalizeWorkbench(once)).toEqual(once);
  });

  it("never lets a current policy carry the binding flag", () => {
    const rough = {
      id: "w1",
      opportunityId: "o1",
      prospectId: "p1",
      lines: [],
      items: [],
      docs: [],
      prebind: [],
      quotes: [{ id: "q1", kind: "current", line: "auto", planningToBind: true }],
    } as unknown as Workbench;
    expect(normalizeWorkbench(rough).quotes[0].planningToBind).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("line labels", () => {
  it("names every line it offers", () => {
    for (const line of Object.keys(STARTER_ITEMS) as (keyof typeof STARTER_ITEMS)[]) {
      expect(LINE_LABELS[line]).toBeTruthy();
      expect(STARTER_ITEMS[line].length).toBeGreaterThan(0);
    }
  });
});
