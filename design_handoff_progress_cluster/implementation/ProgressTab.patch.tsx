import { useMemo, useState } from "react";
import { format, startOfWeek } from "date-fns";
import type { Period, PolicyEntry, PolicyLine } from "../types";
import { countsByCategory, currency, totalsFor } from "../lib/policies";
import { readPace } from "../lib/pace";
import { ClusterGauge } from "./ClusterGauge";
import { TankCluster } from "./TankCluster";

/**
 * The parts of ProgressTab that change. Everything below the gauge — the
 * period bar, the stat row, BookOfBusiness, Goals, TierSection,
 * AllAmericanSection — stays exactly as it is; the cluster goes in above the
 * stat row, and the old hero/meters keep doing their job further down.
 */

type GaugeView = "cluster" | "fuel";

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

  const households = useMemo(
    () => new Set(inPeriod.map((e) => e.householdId ?? e.id)).size,
    [inPeriod],
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
          quotesOut={inPeriod.length}
        />
      ) : (
        <TankCluster pace={pace} lines={lines} counts={derived.counts} weekly={weekly} />
      )}
    </section>
  );
}

/*
  In ProgressTab.tsx, inside the first <div className="p3d-deck">, directly
  after the period bar and before <div className="stat-row earnings-row dolly">:

    <ProgressGauges lines={lines} period={period} entries={entries} />

  currency() is still used by the stat row below, so no import changes are
  needed beyond adding ProgressGauges.
*/
