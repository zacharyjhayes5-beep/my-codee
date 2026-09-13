import { useMemo, useState } from "react";
import { format, startOfWeek } from "date-fns";
import type { Period, PolicyEntry, PolicyLine } from "../types";
// currency() belongs to the stat row in ProgressTab, not to the gauges.
import { countsByCategory, totalsFor } from "../lib/policies";
import { readPace } from "../lib/pace";
import { useStored } from "../lib/repository";
import { ClusterGauge } from "./ClusterGauge";
import { TankCluster } from "./TankCluster";

/**
 * The parts of ProgressTab that change. Everything below the gauge — the
 * period bar, the stat row, BookOfBusiness, Goals, TierSection,
 * AllAmericanSection — stays exactly as it is; the cluster goes in above the
 * stat row, and the old hero/meters keep doing their job further down.
 */

type GaugeView = "cluster" | "fuel";

/** The stages where a quote exists and has not yet closed. */
const QUOTE_IS_OUT = new Set<string>([
  "Quoting",
  "Quote Presented",
  "Decision Pending",
]);

export function ProgressGauges({
  lines,
  period,
  entries,
}: {
  lines: PolicyLine[];
  period: Period;
  entries: PolicyEntry[];
}) {
  const [view, setView] = useState<GaugeView>("cluster");

  const inPeriod = useMemo(
    () => entries.filter((e) => e.effectiveDate >= period.start && e.effectiveDate < period.end),
    [entries, period.start, period.end],
  );
  const earnings = useMemo(() => totalsFor(inPeriod), [inPeriod]);
  const derived = useMemo(() => countsByCategory(inPeriod), [inPeriod]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => {
          acc.policyCount += derived.counts[l.id];
          acc.policyGoal += l.policyGoal;
          return acc;
        },
        { policyCount: 0, policyGoal: 0 },
      ),
    [lines, derived],
  );

  const pace = useMemo(
    () => readPace(period, totals.policyCount, totals.policyGoal),
    [period, totals.policyCount, totals.policyGoal],
  );

  /** Weekly counts drive the fuel-flow chart and the live rate on the dial. */
  const weekly = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const e of inPeriod) {
      const wk = format(startOfWeek(new Date(`${e.effectiveDate}T00:00:00`)), "MMM dd");
      buckets.set(wk, (buckets.get(wk) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([label, count]) => ({ label, count }));
  }, [inPeriod]);

  const ratePerWeek = weekly.length
    ? weekly.reduce((s, w) => s + w.count, 0) / weekly.length
    : 0;

  /**
   * Households behind the period's business.
   *
   * `PolicyEntry` names the link `prospectId`, not `householdId` — the
   * handoff's first open question. Entries the Won seam wrote carry it;
   * anything typed straight onto the book may not, so those fall back to the
   * name on the policy. Keying an unlinked policy on its own id, as the
   * stand-in did, would have counted a household once per policy it holds and
   * quietly inflated the figure.
   */
  const households = useMemo(
    () =>
      new Set(
        inPeriod.map(
          (e) =>
            e.prospectId ||
            `${e.companyName || `${e.firstName} ${e.lastName}`}`.trim().toLowerCase(),
        ),
      ).size,
    [inPeriod],
  );

  /**
   * Quotes out — the handoff's second open question.
   *
   * They live in the pipeline store, so this reads it rather than standing in
   * with the policy count. A quote is "out" once it exists and before it
   * closes: the three stages between a fact-find and a decision. New and
   * Fact-Find have nothing out yet; Won, Lost and Nurture are done with.
   */
  const [opportunities] = useStored("opportunities");
  const quotesOut = useMemo(
    () => opportunities.filter((o) => QUOTE_IS_OUT.has(o.stage)).length,
    [opportunities],
  );

  return (
    <section className="progress-gauges dolly">
      <div className="gauge-switch" role="group" aria-label="Gauge view">
        <button aria-pressed={view === "cluster"} onClick={() => setView("cluster")}>CLUSTER</button>
        <button aria-pressed={view === "fuel"} onClick={() => setView("fuel")}>FUEL</button>
      </div>

      {view === "cluster" ? (
        <ClusterGauge
          pace={pace}
          premium={earnings.premium}
          commission={earnings.net}
          households={households}
          ratePerWeek={ratePerWeek}
          pipelineTemp={Math.min(100, weekly.length ? (ratePerWeek / Math.max(1, pace.perWeek)) * 100 : 0)}
          quotesOut={quotesOut}
        />
      ) : (
        <TankCluster pace={pace} lines={lines} counts={derived.counts} weekly={weekly} />
      )}
    </section>
  );
}
