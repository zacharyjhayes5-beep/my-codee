import { describe, expect, it } from "vitest";
import {
  buildGraph,
  highlight,
  relatedTo,
  scoreNode,
  searchVault,
  snippetFor,
  type VaultData,
  type VaultNode,
} from "./vault";

function note(id: string, title: string, body: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    t: title,
    d: "2026-08-12",
    w: 0.5,
    words: body.split(/\s+/).length,
    deg: 0,
    path: `${title}.md`,
    h: `<p>${body}</p>`,
    q: body,
    head: [],
    r: 30,
    p: 8,
    in: 0.4,
    size: 3,
    ...extra,
  } as VaultData["systems"][number]["notes"][number];
}

function vault(overrides: Partial<VaultData> = {}): VaultData {
  return {
    core: {
      title: "Agency",
      date: "2026-08-10",
      systems: 2,
      notes: 3,
      words: 40,
      links: 1,
      attachments: [{ n: "leads.csv", kb: 36, x: "csv" }],
      path: "C:/vault",
      built: "2026-08-19 09:00",
    },
    systems: [
      {
        id: "home",
        name: "Homeowners",
        color: "#8AE6B8",
        orbit: 200,
        period: 60,
        incline: 0.2,
        w: 0.3,
        size: 12,
        date: "2026-08-11",
        words: 30,
        notes: [
          note("home0", "Coverages and Endorsements", "Replacement cost applies to Section I deductible", {
            deg: 4,
            head: ["Deductibles"],
          }),
          note("home1", "Discount Scripting", "Ask about the alarm discount"),
        ],
      },
      {
        id: "sales",
        name: "Prospecting",
        color: "#F2A0B8",
        orbit: 320,
        period: 90,
        incline: -0.2,
        w: 0.6,
        size: 10,
        date: "2026-08-10",
        words: 10,
        notes: [note("sales0", "Sales Playbook", "Chamber of Commerce is the biggest single channel")],
      },
    ],
    filaments: [["home0", "sales0"]],
    dates: ["2026-08-10", "2026-08-11", "2026-08-12"],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Flattening                                                          */
/* ------------------------------------------------------------------ */

describe("building the graph", () => {
  it("flattens the vault into root, clusters and notes", () => {
    const g = buildGraph(vault());
    expect(g.nodes).toHaveLength(1 + 2 + 3);
    expect(g.byId.get("core")?.kind).toBe("vault");
    expect(g.byId.get("home")?.kind).toBe("cluster");
    expect(g.byId.get("home0")?.kind).toBe("note");
  });

  it("hangs each note off its cluster and each cluster off the root", () => {
    const g = buildGraph(vault());
    expect(g.byId.get("home0")?.parent).toBe("home");
    expect(g.byId.get("home")?.parent).toBe("core");
    expect(g.byId.get("core")?.parent).toBeNull();
  });

  it("makes filaments symmetric, so either end lights the other", () => {
    const g = buildGraph(vault());
    expect(g.byId.get("home0")?.related).toContain("sales0");
    expect(g.byId.get("sales0")?.related).toContain("home0");
  });

  it("drops a filament pointing at a note that is not there", () => {
    const g = buildGraph(vault({ filaments: [["home0", "ghost"]] }));
    expect(g.byId.get("home0")?.related).toEqual([]);
    expect(g.filaments).toEqual([]);
  });

  it("indexes each body by the date it was modified", () => {
    const g = buildGraph(vault());
    expect(g.byId.get("sales")?.epoch).toBe(0);
    expect(g.byId.get("home0")?.epoch).toBe(2);
  });

  it("reports the outermost orbit, which is what the camera has to frame", () => {
    expect(buildGraph(vault()).maxOrbit).toBe(320);
  });
});

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

describe("searching the vault", () => {
  it("finds a note by a word in its body", () => {
    const g = buildGraph(vault());
    const hits = searchVault(g.nodes, "chamber");
    expect(hits[0].node.title).toBe("Sales Playbook");
  });

  it("requires every term to land somewhere", () => {
    const g = buildGraph(vault());
    expect(searchVault(g.nodes, "chamber deductible")).toHaveLength(0);
    expect(searchVault(g.nodes, "chamber commerce")).toHaveLength(1);
  });

  it("ranks a title match above a body mention", () => {
    const g = buildGraph(vault());
    const hits = searchVault(g.nodes, "discount");
    expect(hits[0].node.title).toBe("Discount Scripting");
  });

  it("never returns the vault root — it is the map, not an answer", () => {
    const g = buildGraph(vault());
    expect(searchVault(g.nodes, "vault").some((h) => h.node.kind === "vault")).toBe(false);
  });

  it("ranks a cluster below a note that matched exactly as well", () => {
    const g = buildGraph(vault());
    const cluster = g.byId.get("home") as VaultNode;
    // Same title, same cluster, same text, same link count — the only
    // difference is that one is a container.
    const twin: VaultNode = { ...cluster, kind: "note" };
    expect(scoreNode(cluster, ["homeowners"])).toBeLessThan(scoreNode(twin, ["homeowners"]));
  });

  it("breaks a score tie toward the better-linked note", () => {
    const g = buildGraph(vault());
    const linked = g.byId.get("home0") as VaultNode;
    const isolated = g.byId.get("home1") as VaultNode;
    expect(scoreNode(linked, ["section"])).toBeGreaterThan(scoreNode(isolated, ["alarm"]));
  });

  it("returns nothing for an empty query rather than everything", () => {
    const g = buildGraph(vault());
    expect(searchVault(g.nodes, "   ")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Snippets                                                            */
/* ------------------------------------------------------------------ */

describe("the matching sentence", () => {
  it("centres on the term and marks it", () => {
    const snip = snippetFor("the alarm discount applies", ["discount"]);
    expect(snip).toContain("<mark>discount</mark>");
  });

  it("prefers the occurrence where the other terms sit closest", () => {
    const text = "of one thing. of another. the chamber of commerce meets monthly";
    const snip = snippetFor(text, ["chamber", "of", "commerce"]);
    expect(snip).toContain("<mark>chamber</mark>");
    expect(snip).toContain("commerce");
  });

  it("escapes the note's own angle brackets before marking", () => {
    const snip = snippetFor("a <script> tag and a deductible", ["deductible"]);
    expect(snip).toContain("&lt;script&gt;");
    expect(snip).not.toContain("<script>");
  });

  it("falls back to the opening words when no term is present", () => {
    expect(snippetFor("nothing matches here", ["absent"])).toBe("nothing matches here");
  });
});

describe("highlighting inside rendered markdown", () => {
  it("marks body text", () => {
    expect(highlight("<p>a deductible</p>", ["deductible"])).toBe(
      "<p>a <mark>deductible</mark></p>",
    );
  });

  it("leaves tags and attributes alone", () => {
    const out = highlight('<a class="wl" data-go="home0">link</a>', ["wl", "link"]);
    expect(out).toContain('class="wl"');
    expect(out).toContain("<mark>link</mark>");
  });
});

/* ------------------------------------------------------------------ */
/* Related                                                             */
/* ------------------------------------------------------------------ */

describe("what the panel offers to jump to", () => {
  it("puts a note's cluster first, then what it links to", () => {
    const g = buildGraph(vault());
    const rel = relatedTo(g, g.byId.get("home0") as VaultNode);
    expect(rel.map((n) => n.id)).toEqual(["home", "sales0"]);
  });

  it("lists a cluster's own notes", () => {
    const g = buildGraph(vault());
    const rel = relatedTo(g, g.byId.get("home") as VaultNode);
    expect(rel.map((n) => n.id)).toEqual(["home0", "home1"]);
  });

  it("offers every cluster from the root", () => {
    const g = buildGraph(vault());
    const rel = relatedTo(g, g.byId.get("core") as VaultNode);
    expect(rel.map((n) => n.id)).toEqual(["home", "sales"]);
  });

  it("never lists the same body twice", () => {
    const g = buildGraph(vault({ filaments: [["home0", "home"]] }));
    const rel = relatedTo(g, g.byId.get("home0") as VaultNode);
    expect(rel.filter((n) => n.id === "home")).toHaveLength(1);
  });
});
