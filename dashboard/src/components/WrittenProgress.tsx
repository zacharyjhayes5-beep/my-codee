import { useMemo } from "react";
import type { PolicyEntry, Period, PolicyLine, Prospect } from "../types";
import { countsByCategory, currency, lineById, totalsFor } from "../lib/policies";
import { readPace, lineTotals } from "../lib/pace";

interface WrittenProgressProps {
  entries: PolicyEntry[];
  lines: PolicyLine[];
  period: Period;
  prospects: Prospect[];
  onEntriesChange: (updater: (prev: PolicyEntry[]) => PolicyEntry[]) => void;
  onOpenBook: () => void;
}

const HUE = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

/**
 * What has been written, and how far that is from the goal.
 *
 * Deliberately not the old Progress screen, which carried the tier tables,
 * the All-American paths, a three-hundred-row editable book and a camera
 * that tilted under the cursor. This answers one question — how am I doing
 * against the number — and gets out of the way. The full book is one link
 * away for the entry that needs it.
 */
export function WrittenProgress({
  entries,
  lines,
  period,
  prospects,
  onEntriesChange,
  onOpenBook,
}: WrittenProgressProps) {
  const nameOf = useMemo(
    () => new Map(prospects.map((p) => [p.id, p.name])),
    [prospects],
  );

  const inPeriod = useMemo(
    () => entries.filter((e) => e.effectiveDate >= period.start && e.effectiveDate < period.end),
    [entries, period.start, period.end],
  );

  const derived = useMemo(() => countsByCategory(inPeriod), [inPeriod]);
  const totals = useMemo(() => lineTotals(lines, derived.counts), [lines, derived]);
  const earnings = useMemo(() => totalsFor(inPeriod), [inPeriod]);
  const pace = useMemo(
    () => readPace(period, totals.policyCount, totals.policyGoal),
    [period, totals.policyCount, totals.policyGoal],
  );

  /** Newest first — the most recent sale is the one being looked for. */
  const written = useMemo(
    () => [...inPeriod].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)),
    [inPeriod],
  );

  /** A rate has to come from him. Applied to every policy that has none. */
  function applyRate(percent: number, multiplier: number) {
    onEntriesChange((prev) =>
      prev.map((e) =>
        e.percentEarned === 0 && e.multiplier === 0
          ? { ...e, percentEarned: percent, multiplier }
          : e,
      ),
    );
  }

  const unrated = inPeriod.filter((e) => e.percentEarned === 0).length;

  return (
    <div className="operator">
      {/* ---------- The number ---------- */}
      <section className="op-panel op-goal">
        <div className="op-section-head">
          <h2 className="op-panel-title">Toward {totals.policyGoal} policies</h2>
          <span className="op-rule" aria-hidden="true" />
          <span
            className="op-pace-flag"
            style={{ color: pace.onPace ? "var(--hue-verdigris)" : "var(--hue-terracotta)" }}
          >
            {pace.onPace ? "On pace" : `${pace.behindBy} behind`}
          </span>
          <button type="button" className="op-link" onClick={onOpenBook}>
            Open the full book
          </button>
        </div>

        <div
          className="op-track"
          role="progressbar"
          aria-valuenow={Math.round(pace.writtenPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${totals.policyCount} of ${totals.policyGoal} policies written`}
        >
          <span className="op-track-fill" style={{ width: `${pace.writtenPct}%` }} />
          {pace.valid && (
            <span className="op-pace-marker" style={{ left: `${pace.elapsedPct}%` }} />
          )}
        </div>

        <div className="op-goal-caption">
          <span>
            {totals.policyCount} written · {pace.remaining} to go
          </span>
          <span>
            {pace.valid && pace.daysLeft > 0
              ? `${pace.perWeek.toFixed(1)} per week to finish`
              : "Period closed"}
          </span>
        </div>

        <div className="op-lines">
          {lines.map((line, i) => {
            const count = derived.counts[line.id] ?? 0;
            const pct = line.policyGoal > 0 ? Math.min(100, (count / line.policyGoal) * 100) : 0;
            return (
              <div className="op-line" key={line.id}>
                <span className="op-line-head">
                  <span className="op-line-dot" style={{ background: HUE[i] }} aria-hidden="true" />
                  <span className="micro-label">{line.name}</span>
                </span>
                <span className="op-line-count">
                  {count}
                  <span className="op-line-goal"> / {line.policyGoal}</span>
                </span>
                <span className="op-line-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%`, background: HUE[i] }} />
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- Money ---------- */}
      <section className="op-vitals" aria-label="Written this period">
        <div className="op-vital">
          <span className="micro-label">Premium written</span>
          <span className="op-figure">{currency(earnings.premium, 0)}</span>
          <span className="op-vital-sub">across {inPeriod.length} policies</span>
        </div>
        <div className="op-vital">
          <span className="micro-label">Net commission</span>
          <span className="op-figure">{currency(earnings.net, 0)}</span>
          <span
            className="op-vital-sub"
            style={{ color: unrated > 0 ? "var(--hue-brass)" : "var(--hue-grey)" }}
          >
            {unrated > 0 ? `${unrated} without a rate` : "every policy rated"}
          </span>
        </div>
        <div className="op-vital">
          <span className="micro-label">Policies written</span>
          <span className="op-figure">{totals.policyCount}</span>
          <span className="op-vital-sub">of {totals.policyGoal} this period</span>
        </div>
        <div className="op-vital">
          <span className="micro-label">Days remaining</span>
          <span className="op-figure">{pace.valid ? pace.daysLeft : "—"}</span>
          <span className="op-vital-sub">
            {pace.valid ? `${Math.round(pace.elapsedPct)}% of the period gone` : "Period not set"}
          </span>
        </div>
      </section>

      {/* ---------- The rate, which only he knows ---------- */}
      {unrated > 0 && (
        <section className="op-panel op-panel-quiet rate-prompt">
          <span className="kicker">Commission rate</span>
          <p>
            {unrated} {unrated === 1 ? "policy has" : "policies have"} a premium but no rate, so
            they earn nothing on this screen. Nothing here guesses one — put your percentage and
            multiplier in and it applies to every unrated policy.
          </p>
          <form
            className="rate-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const pct = Number((form.elements.namedItem("pct") as HTMLInputElement).value);
              const mult = Number((form.elements.namedItem("mult") as HTMLInputElement).value);
              if (!Number.isFinite(pct) || pct <= 0) return;
              applyRate(pct / 100, Number.isFinite(mult) ? mult : 0);
            }}
          >
            <label className="opp-field">
              <span className="camp-label">Percentage earned</span>
              <input name="pct" type="number" step="0.1" min="0" placeholder="e.g. 9" />
            </label>
            <label className="opp-field">
              <span className="camp-label">Multiplier</span>
              <input name="mult" type="number" step="0.05" min="0" placeholder="e.g. 0.5" />
            </label>
            <button type="submit" className="camp-save">
              Apply
            </button>
          </form>
        </section>
      )}

      {/* ---------- What was written ---------- */}
      <section className="op-panel">
        <div className="op-section-head">
          <span className="kicker">Written this period</span>
          <span className="op-rule" aria-hidden="true" />
          <span className="op-count">
            {written.length} {written.length === 1 ? "policy" : "policies"}
          </span>
        </div>

        {written.length === 0 ? (
          <p className="op-empty">
            Nothing yet. Mark an account Written on Pipeline and its policies land here.
          </p>
        ) : (
          <ul className="written-list">
            {written.map((e) => (
              <li key={e.id}>
                <span className="written-when">{e.effectiveDate}</span>
                <span className="written-who">
                  <span className="written-name">
                    {(e.prospectId && nameOf.get(e.prospectId)) ||
                      [e.firstName, e.lastName].filter(Boolean).join(" ") ||
                      "Unnamed"}
                  </span>
                  <span className="written-line">
                    {lineById.get(e.lineOfBusiness)?.name ?? e.lineOfBusiness}
                  </span>
                </span>
                <span className="written-premium">{currency(e.premium, 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
