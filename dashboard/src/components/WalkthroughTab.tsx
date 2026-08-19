import { Suspense, lazy, useMemo, useState } from "react";
import type { Prospect, PropertyProfile } from "../types";
import { AREAS, HOME, areaById, profileOf, readingsFor, recordedCount, type AreaId } from "../lib/walkthrough";

/**
 * The property walkthrough.
 *
 * Three.js and the renderer are roughly 200kB gzipped — more than the rest of
 * the application put together. Loading them lazily means the five tabs that
 * have nothing to do with 3D never pay for it, and this one shows a plain
 * placeholder for the moment it takes.
 */
const Scene = lazy(() => import("./walkthrough/Scene"));

interface WalkthroughTabProps {
  prospects: Prospect[];
  /** Which household to open on, when arriving from somewhere that knows. */
  focusId?: string | null;
  onPatch: (id: string, property: PropertyProfile) => void;
}

export function WalkthroughTab({ prospects, focusId, onPatch }: WalkthroughTabProps) {
  const [selectedId, setSelectedId] = useState<string>(() => focusId ?? prospects[0]?.id ?? "");
  const [area, setArea] = useState<AreaId>(HOME);
  const [editing, setEditing] = useState(false);

  const prospect = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? prospects[0],
    [prospects, selectedId],
  );

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
            <Scene area={area} onSelect={setArea} showHotspots={area !== "grounds"} />
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
                  onClick={() => setArea(a.id)}
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

        <aside className="wt-panel" aria-live="polite">
          <header className="wt-panel-head">
            <h2>{current.label}</h2>
            <p>{current.blurb}</p>
            <p className="wt-recorded">
              {filled} of {readings.length} recorded
            </p>
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
            <p className="wt-caveat">
              Researched indicators, not confirmed coverage.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
