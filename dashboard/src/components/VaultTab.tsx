import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import {
  buildGraph,
  highlight,
  relatedTo,
  searchTerms,
  searchVault,
  type VaultData,
  type VaultGraph,
  type VaultNode,
} from "../lib/vault";

/**
 * The Obsidian vault, as an orbital map you can read from.
 *
 * Two halves, the same arrangement the walkthrough uses: a dark viewport on
 * the left because space has to be dark, and a panel on the right that is back
 * in the dashboard's own language entirely. The tab exists to answer one
 * question — "what did I write about this?" — so the search is the primary
 * control and the map is what makes the answer navigable.
 *
 * The renderer bakes sphere sprites on mount, so it is lazily imported and no
 * other tab pays for it.
 */
const Orrery = lazy(() => import("./vault/Orrery"));

type Load =
  | { state: "loading" }
  | { state: "ready"; graph: VaultGraph }
  | { state: "missing" }
  | { state: "failed"; detail: string };

export function VaultTab() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [selectedId, setSelectedId] = useState<string>("core");
  const [wAngle, setWAngle] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [orbiting, setOrbiting] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [canopy, setCanopy] = useState(true);
  const readerRef = useRef<HTMLDivElement>(null);

  /**
   * The vault is fetched, not imported.
   *
   * It is 350kB of notes that changes whenever he writes one. Fetching it from
   * `public/` keeps it out of the bundle and means refreshing the map is
   * re-running the builder and reloading the page — not rebuilding the app.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}vault.json`, { cache: "no-cache" });
        if (!res.ok) {
          if (!cancelled) setLoad({ state: res.status === 404 ? "missing" : "failed", detail: `HTTP ${res.status}` });
          return;
        }
        const data = (await res.json()) as VaultData;
        if (cancelled) return;
        const graph = buildGraph(data);
        setLoad({ state: "ready", graph });
        setEpoch(Math.max(0, graph.dates.length - 1));
      } catch (err) {
        // A missing or malformed snapshot must read as "run the builder", not
        // as a broken tab. Every other page is unaffected either way.
        if (!cancelled) setLoad({ state: "failed", detail: err instanceof Error ? err.message : "unknown error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const graph = load.state === "ready" ? load.graph : null;

  const hits = useMemo(
    () => (graph ? searchVault(graph.nodes, query) : []),
    [graph, query],
  );
  const matches = useMemo(
    () => (query.trim() ? new Set(hits.map((h) => h.node.id)) : null),
    [hits, query],
  );
  const selected: VaultNode | null = graph
    ? graph.byId.get(selectedId) ?? graph.byId.get("core") ?? null
    : null;

  /** Opening a note scrolls its body back to the top; a kept scroll reads as a bug. */
  useEffect(() => {
    readerRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  if (load.state === "loading") {
    return (
      <div className="tab-panel">
        <p className="empty-note">Reading the vault…</p>
      </div>
    );
  }

  if (load.state === "missing" || load.state === "failed") {
    return (
      <div className="tab-panel vault-setup">
        <h2>No vault snapshot yet</h2>
        <p>
          This tab reads a snapshot of the Obsidian vault, built by a script that runs on your
          machine. {load.state === "failed" ? `Loading it failed — ${load.detail}.` : "There isn't one yet."}
        </p>
        <p>To build it, run this once from the folder holding the builder:</p>
        <pre>
          <code>python build_orrery.py "C:/Users/zacha/OneDrive/Documents/Agency" dashboard/public/vault.json</code>
        </pre>
        <p className="vault-setup-note">
          Re-run the same command whenever you want the map to pick up new notes, then reload this
          page. Nothing else in the dashboard depends on it.
        </p>
      </div>
    );
  }

  const terms = searchTerms(query);
  const body = selected
    ? terms.length && selected.kind === "note"
      ? highlight(selected.html, terms)
      : selected.html
    : "";
  const related = selected && graph ? relatedTo(graph, selected) : [];

  function openNode(id: string) {
    setSelectedId(id);
  }

  /** Arrow keys walk the results; Enter opens whichever is marked. */
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (hits.length ? (c + 1) % hits.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (hits.length ? (c - 1 + hits.length) % hits.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[cursor] ?? hits[0];
      if (hit) openNode(hit.node.id);
    } else if (e.key === "Escape") {
      setQuery("");
      setCursor(0);
    }
  }

  /**
   * A `[[wikilink]]` inside a note is a button to another note. The builder
   * writes them as anchors carrying the target id, so one handler on the
   * container serves every link in every note.
   */
  function onReaderClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-go]");
    if (!target) return;
    e.preventDefault();
    const id = target.getAttribute("data-go");
    if (id && graph?.byId.has(id)) openNode(id);
  }

  const dates = graph?.dates ?? [];

  return (
    <div className="vault-tab">
      <div className="vault-stage">
        <Suspense
          fallback={
            <div className="vault-viewport vault-viewport-loading">
              <p>Building the map…</p>
            </div>
          }
        >
          {graph && (
            <Orrery
              graph={graph}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setSelectedId(id ?? "core")}
              matches={matches}
              epoch={epoch}
              wAngle={wAngle}
              orbiting={orbiting}
              canopy={canopy}
            />
          )}
        </Suspense>

        <div className="vault-controls">
          <label className="vault-dial">
            <span>
              Fourth axis <b>{wAngle.toFixed(2)} rad</b>
            </span>
            <input
              type="range"
              min={0}
              max={628}
              value={Math.round(wAngle * 100)}
              onChange={(e) => setWAngle(Number(e.target.value) / 100)}
            />
            <small>Link depth. Hubs sit near the centre; orphans swing furthest.</small>
          </label>

          <label className="vault-dial">
            <span>
              As of <b>{dates[epoch] ?? "—"}</b>
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, dates.length - 1)}
              value={epoch}
              onChange={(e) => setEpoch(Number(e.target.value))}
            />
            <small>Notes fade to embers before the day they were written.</small>
          </label>

          <div className="vault-toggles">
            <button
              type="button"
              className={`vault-toggle${orbiting ? " is-on" : ""}`}
              aria-pressed={orbiting}
              onClick={() => setOrbiting((v) => !v)}
            >
              Orbits
            </button>
            <button
              type="button"
              className={`vault-toggle${canopy ? " is-on" : ""}`}
              aria-pressed={canopy}
              onClick={() => setCanopy((v) => !v)}
            >
              Canopy
            </button>
          </div>
        </div>
      </div>

      <div className="vault-side">
        <div className="vault-search">
          <input
            id="vault-seek"
            type="search"
            aria-label="Search the vault"
            autoComplete="off"
            spellCheck={false}
            placeholder="Recall anything — deductible, chamber, NADP…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onSearchKey}
          />
          {graph && (
            <p className="vault-scope">
              {query.trim()
                ? `${hits.length}${hits.length === 40 ? "+" : ""} ${hits.length === 1 ? "match" : "matches"} — ↑↓ to move, ↵ to open`
                : `${graph.core.notes} notes, ${graph.core.words.toLocaleString()} words, ${graph.core.links} links`}
            </p>
          )}
        </div>

        {query.trim() && (
          <ul className="vault-results">
            {hits.length === 0 && (
              <li className="vault-noresult">
                Nothing matches. Try one distinctive word — every term has to appear in the note.
              </li>
            )}
            {hits.map((hit, i) => (
              <li key={hit.node.id}>
                <button
                  type="button"
                  className={`vault-result${i === cursor ? " is-cursor" : ""}${hit.node.id === selected?.id ? " is-open" : ""}`}
                  onClick={() => {
                    setCursor(i);
                    openNode(hit.node.id);
                  }}
                >
                  <span className="vault-result-title">{hit.node.title}</span>
                  <span className="vault-result-meta">
                    <i style={{ background: hit.node.color }} aria-hidden="true" />
                    {hit.node.cluster} · {hit.node.date}
                    {hit.node.kind === "note" ? ` · ${hit.node.words.toLocaleString()} words` : ""}
                  </span>
                  {/* Built by snippetFor, which escapes the note before marking it. */}
                  <span
                    className="vault-result-snippet"
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <article className="vault-reader" ref={readerRef} onClick={onReaderClick}>
            <header className="vault-reader-head">
              <p className="vault-eyebrow">
                <i style={{ background: selected.color }} aria-hidden="true" />
                {selected.kind === "vault" ? "Vault" : selected.kind === "cluster" ? "Cluster" : "Note"} ·{" "}
                {selected.cluster}
              </p>
              <h2>{selected.title}</h2>
              <dl className="vault-facts">
                <div>
                  <dt>Modified</dt>
                  <dd>{selected.date}</dd>
                </div>
                <div>
                  <dt>Words</dt>
                  <dd>{selected.words.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Links</dt>
                  <dd>{selected.deg}</dd>
                </div>
                {selected.path && (
                  <div className="vault-file">
                    <dt>File</dt>
                    <dd>{selected.path}</dd>
                  </div>
                )}
              </dl>
            </header>

            {/* The markdown was converted and escaped by the builder, which is
                the only thing that ever writes this HTML. */}
            <div className="vault-note" dangerouslySetInnerHTML={{ __html: body }} />

            {related.length > 0 && (
              <section className="vault-related">
                <h3>{selected.kind === "note" ? "Linked notes" : "Contains"}</h3>
                <ul>
                  {related.map((n) => (
                    <li key={n.id}>
                      <button type="button" className="vault-jump" onClick={() => openNode(n.id)}>
                        <span>{n.title}</span>
                        <small>
                          {n.cluster} · {n.date}
                          {n.kind === "note" ? ` · ${n.words.toLocaleString()} words` : ""}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
