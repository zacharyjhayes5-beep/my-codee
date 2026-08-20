/**
 * The Obsidian vault, and everything derived from it.
 *
 * Same split the walkthrough uses: this file is the whole contract and knows
 * nothing about canvases, orbits or pixels. It holds the shape of the data,
 * the search, and the flattening the renderer and the panel both read.
 *
 * The data itself is built outside the app. `build_orrery.py` walks the vault,
 * converts each note to HTML, resolves the `[[wikilinks]]`, and writes
 * `public/vault.json`. The tab fetches that file at runtime rather than
 * importing it, so 350kB of notes never enters the bundle and refreshing the
 * map is re-running the script — not rebuilding the application.
 */

/** One note, as the builder emits it. */
export interface VaultNote {
  id: string;
  /** Title — the note's first heading, or its filename. */
  t: string;
  /** Date last modified, ISO yyyy-mm-dd. */
  d: string;
  /** Link depth, 0 = most-linked hub, 1 = orphan. The fourth axis. */
  w: number;
  words: number;
  /** How many resolved links touch this note, in or out. */
  deg: number;
  /** Path inside the vault. */
  path: string;
  /** Rendered markdown. */
  h: string;
  /** Plain text of the body, for search and snippets. */
  q: string;
  /** The note's own headings, which rank above body text. */
  head?: string[];
  /** Orbital geometry, precomputed by the builder. */
  r: number;
  p: number;
  in: number;
  size: number;
}

/** A cluster of related notes — one planet. */
export interface VaultSystem {
  id: string;
  name: string;
  color: string;
  orbit: number;
  period: number;
  incline: number;
  w: number;
  size: number;
  date: string;
  words: number;
  notes: VaultNote[];
}

export interface VaultCore {
  title: string;
  date: string;
  systems: number;
  notes: number;
  words: number;
  links: number;
  attachments: { n: string; kb: number; x: string }[];
  path: string;
  built: string;
}

export interface VaultData {
  core: VaultCore;
  systems: VaultSystem[];
  /** Resolved wikilinks, as pairs of note ids. */
  filaments: [string, string][];
  dates: string[];
}

/** What kind of body a node is. Drives both drawing and the panel's eyebrow. */
export type NodeKind = "vault" | "cluster" | "note";

/**
 * One body in the map.
 *
 * The three kinds are flattened into a single list because everything that
 * follows — drawing, depth sorting, hit testing, search — wants one array, not
 * a tree it has to walk each frame.
 */
export interface VaultNode {
  id: string;
  kind: NodeKind;
  title: string;
  /** The cluster this belongs to, by name. "The vault" for the root. */
  cluster: string;
  color: string;
  date: string;
  /** Index into `dates`; how the as-of control hides later notes. */
  epoch: number;
  words: number;
  deg: number;
  path: string;
  html: string;
  /** Lower-cased title + cluster + headings + body, searched as one string. */
  text: string;
  headings: string[];
  /** Orbit: parent, radius, period, inclination, fourth-axis depth, size. */
  parent: string | null;
  r: number;
  period: number;
  incline: number;
  w: number;
  size: number;
  /** Ids this node links to, both directions. */
  related: string[];
}

export interface VaultGraph {
  nodes: VaultNode[];
  byId: Map<string, VaultNode>;
  dates: string[];
  core: VaultCore;
  filaments: [string, string][];
  /** The outermost orbit, which is what the camera has to frame. */
  maxOrbit: number;
}

/** The root's own page: what the vault is, and how to refresh it. */
function coreHtml(core: VaultCore): string {
  const attachments = core.attachments
    .map((a) => `<li>${a.n} <span class="dim">— ${a.kb} KB</span></li>`)
    .join("");
  return [
    `<p>${core.notes} notes, ${core.words.toLocaleString()} words and ${core.links} links between them,`,
    ` gathered into ${core.systems} clusters. Every planet is a cluster; every moon is one note,`,
    ` sized by word count. The filaments are real <code>[[wikilinks]]</code> from the markdown.</p>`,
    `<p>The fourth axis is <em>link depth</em>. A note many others point to sits near its centre;`,
    ` an orphan rides all the way out. Turning the W dial swings the orphans furthest.</p>`,
    `<h3>Attachments</h3>`,
    `<p>Non-markdown files are listed by name only — never their contents, so lead lists stay out of the page.</p>`,
    `<ul>${attachments}</ul>`,
    `<h3>Refreshing</h3>`,
    `<p>This is a snapshot, taken ${core.built}. To pick up new notes, re-run the builder:</p>`,
    `<pre><code>python build_orrery.py "${core.path}" dashboard/public/vault.json</code></pre>`,
  ].join("");
}

/**
 * Flatten the vault into the node list everything else reads.
 *
 * Cluster and note geometry is copied from the builder rather than recomputed,
 * so the standalone page and this tab lay the same vault out identically.
 */
export function buildGraph(data: VaultData): VaultGraph {
  const nodes: VaultNode[] = [];
  const dateIndex = (d: string) => Math.max(0, data.dates.indexOf(d));

  nodes.push({
    id: "core",
    kind: "vault",
    title: data.core.title,
    cluster: "The vault",
    color: "#a9663a",
    date: data.core.date,
    epoch: 0,
    words: data.core.words,
    deg: 0,
    path: data.core.path,
    html: coreHtml(data.core),
    text: "vault index home",
    headings: [],
    parent: null,
    r: 0,
    period: 1,
    incline: 0,
    w: 0,
    size: 30,
    related: [],
  });

  for (const s of data.systems) {
    nodes.push({
      id: s.id,
      kind: "cluster",
      title: s.name,
      cluster: s.name,
      color: s.color,
      date: s.date,
      epoch: dateIndex(s.date),
      words: s.words,
      deg: s.notes.length,
      path: "",
      html: `<p>${s.notes.length} notes, ${s.words.toLocaleString()} words, orbiting together.</p>`,
      text: `${s.name} ${s.notes.map((n) => n.t).join(" ")}`.toLowerCase(),
      headings: [],
      parent: "core",
      r: s.orbit,
      period: s.period,
      incline: s.incline,
      w: s.w,
      size: s.size,
      related: [],
    });

    for (const n of s.notes) {
      nodes.push({
        id: n.id,
        kind: "note",
        title: n.t,
        cluster: s.name,
        color: s.color,
        date: n.d,
        epoch: dateIndex(n.d),
        words: n.words,
        deg: n.deg,
        path: n.path,
        html: n.h,
        text: `${n.t} ${s.name} ${(n.head ?? []).join(" ")} ${n.q}`.toLowerCase(),
        headings: n.head ?? [],
        parent: s.id,
        r: s.size + n.r,
        period: n.p,
        incline: n.in,
        w: n.w,
        size: n.size,
        related: [],
      });
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const [a, b] of data.filaments) {
    const na = byId.get(a);
    const nb = byId.get(b);
    // A filament to a note that no longer exists is dropped rather than
    // rendered against a missing endpoint — the same tolerance the walkthrough
    // readings show a record that never went through normalisation.
    if (!na || !nb) continue;
    na.related.push(b);
    nb.related.push(a);
  }

  return {
    nodes,
    byId,
    dates: data.dates,
    core: data.core,
    filaments: data.filaments.filter(([a, b]) => byId.has(a) && byId.has(b)),
    maxOrbit: data.systems.reduce((m, s) => Math.max(m, s.orbit), 300),
  };
}

export interface VaultHit {
  node: VaultNode;
  score: number;
  /** The matching sentence, HTML-escaped, with the terms wrapped in <mark>. */
  snippet: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap every occurrence of each term. Used in results and in the note itself. */
export function highlight(html: string, terms: string[]): string {
  let out = html;
  for (const t of terms) {
    if (!t) continue;
    // The negative lookahead keeps the match out of tags and attributes — a
    // term that also appears in a class name must not break the markup.
    out = out.replace(new RegExp(`(?![^<]*>)(${escapeRegExp(t)})`, "ig"), "<mark>$1</mark>");
  }
  return out;
}

/**
 * A window of body text centred on the match.
 *
 * Of every place a term appears, the chosen one is where the *other* terms sit
 * closest — searching "chamber of commerce" should land on the sentence that
 * has all three, not on the first stray "of".
 */
export function snippetFor(text: string, terms: string[], lead = 45, tail = 150): string {
  if (!text) return "";
  const low = text.toLowerCase();
  const bySpecificity = [...terms].sort((a, b) => b.length - a.length);

  let at = -1;
  for (const term of bySpecificity) {
    let k = low.indexOf(term);
    let best = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    while (k >= 0) {
      let gap = 0;
      for (const other of terms) {
        const o = low.indexOf(other);
        gap += o < 0 ? 600 : Math.abs(o - k);
      }
      if (gap < bestGap) {
        bestGap = gap;
        best = k;
      }
      k = low.indexOf(term, k + term.length);
    }
    if (best >= 0) {
      at = best;
      break;
    }
  }
  if (at < 0) return escapeHtml(text.slice(0, 150));

  const start = Math.max(0, at - lead);
  const end = Math.min(text.length, at + tail);
  const cut = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
  return highlight(escapeHtml(cut), terms);
}

/**
 * Score one node against the search terms.
 *
 * Every term has to land somewhere or the note is not a match at all — the
 * alternative returns half the vault for a two-word query. Title beats heading
 * beats body, and a well-linked note edges ahead of an isolated one on a tie,
 * because the note fifteen others reference is usually the one being recalled.
 */
export function scoreNode(node: VaultNode, terms: string[]): number {
  const title = node.title.toLowerCase();
  const cluster = node.cluster.toLowerCase();
  const headings = node.headings.join(" ").toLowerCase();

  let total = 0;
  for (const term of terms) {
    let s = 0;
    if (title === term) s += 140;
    if (title.includes(term)) s += 60 + (title.startsWith(term) ? 18 : 0);
    if (cluster.includes(term)) s += 22;
    if (headings.includes(term)) s += 26;

    let count = 0;
    let at = node.text.indexOf(term);
    while (at >= 0 && count < 40) {
      count += 1;
      at = node.text.indexOf(term, at + term.length);
    }
    s += Math.min(34, count * 4);

    if (s === 0) return 0;
    total += s;
  }

  total += Math.min(14, node.deg * 2.5);
  // A cluster is a container, not an answer. It stays findable and ranks below
  // any note that matched as well.
  if (node.kind === "cluster") total *= 0.85;
  return total;
}

export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** Ranked matches, best first. The root is never a result — it is the map itself. */
export function searchVault(nodes: VaultNode[], query: string, limit = 40): VaultHit[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const hits: VaultHit[] = [];
  for (const node of nodes) {
    if (node.kind === "vault") continue;
    const score = scoreNode(node, terms);
    if (score <= 0) continue;
    hits.push({
      node,
      score,
      snippet:
        node.kind === "cluster"
          ? `${node.deg} notes in this cluster`
          : snippetFor(node.text, terms),
    });
  }

  hits.sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title));
  return hits.slice(0, limit);
}

/** Everything the panel offers to jump to: the parent, then the linked notes. */
export function relatedTo(graph: VaultGraph, node: VaultNode): VaultNode[] {
  const ids: string[] = [];
  if (node.kind === "note" && node.parent) ids.push(node.parent);
  if (node.kind === "cluster") {
    for (const n of graph.nodes) if (n.parent === node.id) ids.push(n.id);
  }
  if (node.kind === "vault") {
    for (const n of graph.nodes) if (n.kind === "cluster") ids.push(n.id);
  }
  ids.push(...node.related);

  const seen = new Set<string>();
  const out: VaultNode[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const n = graph.byId.get(id);
    if (n) out.push(n);
  }
  return out;
}
