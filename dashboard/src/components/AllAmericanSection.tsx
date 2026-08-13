import { useMemo } from "react";
import type { PolicyEntry } from "../types";
import {
  allAmericanAnnuities,
  allAmericanPaths,
  allAmericanPersistency,
} from "../lib/defaultData";
import { currency, lifeBreakdown } from "../lib/policies";
import { useLocalStorage } from "../lib/storage";
import { Meter } from "./Meter";

/**
 * Persistency is the one figure the book of business cannot produce — it comes
 * off a Farm Bureau report — so it is typed in and kept here rather than
 * threaded through App. The key carries the `fb-dashboard:` prefix so the
 * backup file picks it up with everything else.
 */
const PERSISTENCY_KEY = "fb-dashboard:persistency";

interface AllAmericanSectionProps {
  /** Entries already filtered to the goal period. */
  entries: PolicyEntry[];
}

export function AllAmericanSection({ entries }: AllAmericanSectionProps) {
  const [persistency, setPersistency] = useLocalStorage<number>(PERSISTENCY_KEY, 0);
  const life = useMemo(() => lifeBreakdown(entries), [entries]);

  // 0 means "never entered" rather than an actual zero — nobody has 0%.
  const persistencyEntered = persistency > 0;
  const persistencyMet = persistency >= allAmericanPersistency;
  const annuitiesMet = life.annuities >= allAmericanAnnuities;

  return (
    <section className="aa-section">
      <div className="section-head">
        <h2>All-American — 2026 qualifications</h2>
        <p>
          For agents contracted 2022 or after. Meeting either path qualifies, and both
          also need the two requirements below. Life commission is gross, before the
          NADP multiplier. Annuities count on their own here, so they are left out of
          the life policy count.
        </p>
      </div>

      <div className="aa-shared">
        <div className={`aa-req${persistencyMet ? " met" : ""}`}>
          <span className="aa-req-label">36-month life persistency</span>
          <label className="aa-persistency">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={persistency || ""}
              placeholder="—"
              onChange={(e) => setPersistency(Number(e.target.value))}
            />
            <span className="aa-unit">%</span>
          </label>
          <span className="aa-req-note">
            {!persistencyEntered
              ? `Type it in — needs ${allAmericanPersistency}%`
              : persistencyMet
                ? `Met — ${allAmericanPersistency}% required`
                : `${(allAmericanPersistency - persistency).toFixed(1)} points short`}
          </span>
        </div>

        <div className={`aa-req${annuitiesMet ? " met" : ""}`}>
          <span className="aa-req-label">New annuities</span>
          <span className="aa-req-value">
            {life.annuities} <span className="aa-req-goal">/ {allAmericanAnnuities}</span>
          </span>
          <span className="aa-req-note">
            {annuitiesMet ? "Met" : "Write one annuity to clear this"}
          </span>
        </div>
      </div>

      <div className="aa-grid">
        {allAmericanPaths.map((path) => {
          const commissionMet = life.gross >= path.commission;
          const policiesMet = life.policies >= path.policies;
          const qualified = commissionMet && policiesMet && persistencyMet && annuitiesMet;

          const missing: string[] = [];
          if (!commissionMet) missing.push(`${currency(path.commission - life.gross, 0)} more life commission`);
          if (!policiesMet) missing.push(`${path.policies - life.policies} more life policies`);
          if (!persistencyEntered) missing.push("your persistency number");
          else if (!persistencyMet) missing.push("persistency above 85%");
          if (!annuitiesMet) missing.push("1 annuity");

          return (
            <article className={`aa-card${qualified ? " qualified" : ""}`} key={path.id}>
              <header className="aa-card-head">
                <h3>{path.name}</h3>
                <span className="aa-blurb">{path.blurb}</span>
                {qualified && <span className="tier-badge current">Qualified</span>}
              </header>

              <Meter
                label="New life commission"
                value={life.gross}
                goal={path.commission}
                format={(n) => currency(n, 0)}
              />
              <Meter
                label="Life policies"
                value={life.policies}
                goal={path.policies}
                format={(n) => n.toLocaleString("en-US")}
              />

              <footer className="aa-foot">
                {qualified ? (
                  <span className="tier-done">Every requirement met.</span>
                ) : (
                  <span>Still needs {missing.join(" · ")}</span>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
