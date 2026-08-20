import { Suspense, lazy, useMemo, useState } from "react";
import { lineById, linesOfBusiness } from "../lib/policies";
import type { CoverageItem, Prospect, PropertyProfile } from "../types";
import {
  AREAS,
  HOME,
  areaById,
  kindOf,
  placeCoverage,
  profileOf,
  readingsFor,
  recordedCount,
  type AreaId,
} from "../lib/walkthrough";

/**
 * The property walkthrough.
 *
 * Three.js and the renderer are the heaviest thing in the application by some
 * margin. Loading them lazily means the tabs that have nothing to do with 3D
 * never pay for it, and this one shows a plain placeholder for the moment it
 * takes.
 */
const Scene = lazy(() => import("./walkthrough/Scene"));

/**
 * The house every household gets for now.
 *
 * Per-household selection is the intent — a ranch, a lakefront cottage, a
 * split-level — and everything downstream is already built for it: the loader
 * normalises whatever model it is given, and the hotspots are expressed as
 * fractions of the house rather than fixed coordinates. What is missing is the
 * field on the record and the picker, so until then everyone shares one.
 */
const HOUSE_MODEL = "colonial";

interface WalkthroughTabProps {
  prospects: Prospect[];
  /** Which household to open on, when arriving from somewhere that knows. */
  focusId?: string | null;
  onPatch: (id: string, property: PropertyProfile) => void;
  onCoverageChange: (id: string, coverage: CoverageItem[]) => void;
}

export function WalkthroughTab({
  prospects,
  focusId,
  onPatch,
  onCoverageChange,
}: WalkthroughTabProps) {
  const [selectedId, setSelectedId] = useState<string>(() => focusId ?? prospects[0]?.id ?? "");
  const [area, setArea] = useState<AreaId>(HOME);
  const [editing, setEditing] = useState(false);
  const [pane, setPane] = useState<"area" | "coverage">("coverage");
  const [openItem, setOpenItem] = useState<string | null>(null);

  const prospect = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? prospects[0],
    [prospects, selectedId],
  );

  // Every hook runs before the empty-state return. Putting the memo below it
  // would change the hook order between renders, which React does not allow.
  const coverage = useMemo(() => prospect?.assets?.coverage ?? [], [prospect]);
  const placed = useMemo(() => placeCoverage(coverage), [coverage]);

  if (!prospect) {
    return (
      <div className="tab-panel">
        <p className="empty-note">
          No households yet. Add one on the Leads tab and it will appear here.
        </p>
      </div>
    );
  }

  const current = areaById(area);
  // Read through the same guard the readings use, so a record that never went
  // through normalisation renders as blank rather than taking the tab down.
  const profile = profileOf(prospect);
  const readings = readingsFor(area, prospect);
  const filled = readings.filter((r) => r.value !== null).length;
  const held = coverage.filter((c) => c.status === "held").length;
  const gaps = coverage.length - held;

  function setCoverage(next: CoverageItem[]) {
    onCoverageChange(prospect.id, next);
  }

  function addLine(line: string) {
    if (!line) return;
    const id = `${line}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setCoverage([...coverage, { id, line, status: "held", label: "", detail: "" }]);
    setPane("coverage");
    setOpenItem(id);
  }

  function patchItem(id: string, patch: Partial<CoverageItem>) {
    setCoverage(coverage.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeItem(id: string) {
    setCoverage(coverage.filter((c) => c.id !== id));
    if (openItem === id) setOpenItem(null);
  }

  function update(field: keyof PropertyProfile, raw: string, kind: "text" | "number") {
    const next: PropertyProfile = { ...profileOf(prospect) };
    if (kind === "number") {
      const n = Number.parseFloat(raw);
      // An empty box means "not recorded", which is null — never zero. Zero is
      // a real answer to "how many stalls" and must not be how blank looks.
      (next[field] as number | null) = raw.trim() === "" || !Number.isFinite(n) ? null : n;
    } else {
      (next[field] as string) = raw;
    }
    onPatch(prospect.id, next);
  }

  return (
    <div className="tab-panel walkthrough">
      <div className="wt-bar">
        <label className="wt-picker">
          <span>Household</span>
          <select value={prospect.id} onChange={(e) => setSelectedId(e.target.value)}>
            {prospects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "Untitled household"}
              </option>
            ))}
          </select>
        </label>
        <p className="wt-address">
          {prospect.address.line1 ? `${prospect.address.line1} · ` : ""}
          {prospect.area || "No area recorded"}
        </p>
      </div>

      <div className="wt-stage">
        <div className="wt-canvas">
          <Suspense
            fallback={
              <div className="wt-loading" role="status">
                Preparing the property…
              </div>
            }
          >
            <Scene
              area={area}
              onSelect={setArea}
              showHotspots={area !== "grounds"}
              houseUrl={`${import.meta.env.BASE_URL}models/${HOUSE_MODEL}.glb`}
              placed={placed}
              selectedId={openItem}
              onSelectObject={(id) => {
                setOpenItem(id);
                setPane("coverage");
              }}
            />
          </Suspense>

          <nav className="wt-rail" aria-label="Areas of the property">
            {AREAS.map((a) => {
              const count = recordedCount(a.id, prospect);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`wt-rail-item${a.id === area ? " is-active" : ""}`}
                  aria-current={a.id === area ? "true" : undefined}
                  onClick={() => {
                    setArea(a.id);
                    setPane("area");
                  }}
                >
                  <span className="wt-rail-label">{a.label}</span>
                  <span className="wt-rail-count" aria-hidden="true">
                    {count.filled}/{count.total}
                  </span>
                </button>
              );
            })}
          </nav>

          {area !== HOME && (
            <button type="button" className="wt-return" onClick={() => setArea(HOME)}>
              Return to exterior
            </button>
          )}
        </div>

        <aside className="wt-panel">
          <div className="wt-tabs" role="tablist" aria-label="Panel">
            <button
              type="button"
              role="tab"
              aria-selected={pane === "coverage"}
              className={`wt-tab${pane === "coverage" ? " is-active" : ""}`}
              onClick={() => setPane("coverage")}
            >
              Coverage
              <span className="wt-tab-count">{coverage.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pane === "area"}
              className={`wt-tab${pane === "area" ? " is-active" : ""}`}
              onClick={() => setPane("area")}
            >
              {current.label}
              <span className="wt-tab-count">
                {filled}/{readings.length}
              </span>
            </button>
          </div>

          {pane === "area" ? (
            <div className="wt-pane" aria-live="polite">
              <header className="wt-panel-head">
                <h2>{current.label}</h2>
                <p>{current.blurb}</p>
              </header>

              <dl className="wt-readings">
                {readings.map((r) => (
                  <div key={r.label} className={`wt-reading${r.value === null ? " is-blank" : ""}`}>
                    <dt>
                      {r.label}
                      {r.hint && <span className="wt-hint">{r.hint}</span>}
                    </dt>
                    <dd>
                      {editing && r.field ? (
                        r.prose ? (
                          <textarea
                            rows={3}
                            value={String(profile[r.field] ?? "")}
                            onChange={(e) => update(r.field!, e.target.value, r.kind ?? "text")}
                          />
                        ) : (
                          <input
                            type={r.kind === "number" ? "number" : "text"}
                            value={profile[r.field] === null ? "" : String(profile[r.field] ?? "")}
                            onChange={(e) => update(r.field!, e.target.value, r.kind ?? "text")}
                          />
                        )
                      ) : r.value === null ? (
                        <span className="wt-blank">Not recorded</span>
                      ) : (
                        r.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="wt-panel-foot">
                <button type="button" className="wt-edit" onClick={() => setEditing((v) => !v)}>
                  {editing ? "Done" : "Record details"}
                </button>
                <p className="wt-caveat">Researched indicators, not confirmed coverage.</p>
              </div>
            </div>
          ) : (
            <div className="wt-pane">
              <header className="wt-panel-head">
                <h2>Coverage</h2>
                <p>What they hold and what they are missing. Add a line and it appears on the property.</p>
                <p className="wt-recorded">
                  {held} held · {gaps} {gaps === 1 ? "gap" : "gaps"}
                </p>
              </header>

              <label className="wt-add">
                <span className="sr-only">Add a line of coverage</span>
                <select
                  value=""
                  onChange={(e) => {
                    addLine(e.target.value);
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Add a line…</option>
                  {(["property", "casualty", "life"] as const).map((cat) => (
                    <optgroup key={cat} label={cat[0].toUpperCase() + cat.slice(1)}>
                      {linesOfBusiness
                        .filter((l) => l.category === cat)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              {coverage.length === 0 ? (
                <p className="wt-empty-cov">
                  Nothing recorded yet. Add their auto policy and a car appears in the driveway.
                </p>
              ) : (
                <ul className="wt-cov-list">
                  {coverage.map((c) => {
                    const line = lineById.get(c.line);
                    const kind = kindOf(c.line);
                    const open = openItem === c.id;
                    return (
                      <li key={c.id} className={`wt-cov${open ? " is-open" : ""}`}>
                        <div className="wt-cov-head">
                          <button
                            type="button"
                            className="wt-cov-name"
                            onClick={() => setOpenItem(open ? null : c.id)}
                            aria-expanded={open}
                          >
                            <span className="wt-cov-line">{line?.name ?? c.line}</span>
                            {c.label.trim() && <span className="wt-cov-label">{c.label}</span>}
                          </button>
                          <button
                            type="button"
                            className={`wt-status is-${c.status}`}
                            onClick={() =>
                              patchItem(c.id, { status: c.status === "held" ? "needed" : "held" })
                            }
                            title="Switch between held and needed"
                          >
                            {c.status === "held" ? "Has it" : "Needs it"}
                          </button>
                        </div>

                        {open && (
                          <div className="wt-cov-body">
                            <label>
                              Name
                              <input
                                type="text"
                                value={c.label}
                                placeholder={kind === "figure" ? "Doug" : "2021 Explorer"}
                                onChange={(e) => patchItem(c.id, { label: e.target.value })}
                              />
                            </label>
                            <label>
                              Detail
                              <input
                                type="text"
                                value={c.detail}
                                placeholder="Carrier, limits, renewal…"
                                onChange={(e) => patchItem(c.id, { detail: e.target.value })}
                              />
                            </label>
                            <p className="wt-cov-where">
                              {kind === "listed"
                                ? "Listed here only — this line has no object on the property."
                                : `Shows as a ${kind} on the property.`}
                            </p>
                            <button
                              type="button"
                              className="wt-cov-remove"
                              onClick={() => removeItem(c.id)}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="wt-panel-foot">
                <p className="wt-caveat">Entered by hand. Not confirmed coverage.</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
