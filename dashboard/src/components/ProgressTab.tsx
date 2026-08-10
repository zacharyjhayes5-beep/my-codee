import { useMemo } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import type { Period, PolicyLine } from "../types";
import { seriesColors } from "../lib/defaultData";
import { Meter } from "./Meter";
import { StatTile } from "./StatTile";

function formatCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

function parseDay(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

interface ProgressTabProps {
  lines: PolicyLine[];
  onChange: (lines: PolicyLine[]) => void;
  period: Period;
  onPeriodChange: (period: Period) => void;
}

export function ProgressTab({ lines, onChange, period, onPeriodChange }: ProgressTabProps) {
  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => {
          acc.policyCount += l.policyCount;
          acc.policyGoal += l.policyGoal;
          acc.premium += l.premium;
          acc.premiumGoal += l.premiumGoal;
          return acc;
        },
        { policyCount: 0, policyGoal: 0, premium: 0, premiumGoal: 0 }
      ),
    [lines]
  );

  const pace = useMemo(() => {
    const start = parseDay(period.start);
    const end = parseDay(period.end);
    const now = new Date();
    const totalDays = Math.max(1, differenceInCalendarDays(end, start));
    const elapsedDays = Math.min(totalDays, Math.max(0, differenceInCalendarDays(now, start)));
    const daysLeft = Math.max(0, differenceInCalendarDays(end, now));
    const elapsedPct = (elapsedDays / totalDays) * 100;
    const weeksLeft = daysLeft / 7;
    const remaining = Math.max(0, totals.policyGoal - totals.policyCount);
    return {
      totalDays,
      daysLeft,
      elapsedPct,
      expectedTotal: (totals.policyGoal * elapsedPct) / 100,
      perWeek: weeksLeft >= 1 ? remaining / weeksLeft : remaining,
      valid: end > start,
    };
  }, [period, totals.policyGoal, totals.policyCount]);

  const paceDelta = totals.policyCount - pace.expectedTotal;
  const paceLabel =
    Math.abs(paceDelta) < 0.5
      ? "On pace"
      : `${formatCount(Math.abs(Math.round(paceDelta)))} ${paceDelta > 0 ? "ahead" : "behind"}`;

  function updateLine(id: string, patch: Partial<PolicyLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  return (
    <div className="tab-panel">
      <div className="period-bar">
        <div className="period-dates">
          <label>
            Period start
            <input
              type="date"
              value={period.start}
              onChange={(e) => onPeriodChange({ ...period, start: e.target.value })}
            />
          </label>
          <label>
            Period end
            <input
              type="date"
              value={period.end}
              onChange={(e) => onPeriodChange({ ...period, end: e.target.value })}
            />
          </label>
        </div>
        {pace.valid ? (
          <p className="period-summary">
            {formatCount(pace.daysLeft)} days left · {pace.elapsedPct.toFixed(0)}% of the period
            elapsed · ends {format(parseDay(period.end), "MMM d, yyyy")}
          </p>
        ) : (
          <p className="period-summary warn">Period end must come after the start date.</p>
        )}
      </div>

      <div className="stat-row">
        <StatTile
          label="Total policies"
          value={formatCount(totals.policyCount)}
          sub={`of ${formatCount(totals.policyGoal)} goal`}
        />
        <StatTile
          label="Pace"
          value={paceLabel}
          sub={`On pace today: ${formatCount(Math.round(pace.expectedTotal))}`}
        />
        <StatTile
          label="Needed per week"
          value={pace.daysLeft > 0 ? pace.perWeek.toFixed(1) : "—"}
          sub={`to close the remaining ${formatCount(
            Math.max(0, totals.policyGoal - totals.policyCount)
          )}`}
        />
        <StatTile
          label="Total premium"
          value={formatCurrency(totals.premium)}
          sub={totals.premiumGoal > 0 ? `of ${formatCurrency(totals.premiumGoal)} goal` : "No premium goal set"}
        />
      </div>

      <div className="line-grid">
        {lines.map((line) => {
          const expected = (line.policyGoal * pace.elapsedPct) / 100;
          const delta = line.policyCount - expected;
          return (
            <div className="line-card" key={line.id}>
              <h3>
                <span className="meter-dot" style={{ background: seriesColors[line.id] }} />
                {line.name}
                <span className={`pace-pill ${delta >= -0.5 ? "good" : "behind"}`}>
                  {Math.abs(delta) < 0.5
                    ? "on pace"
                    : `${Math.abs(Math.round(delta))} ${delta > 0 ? "ahead" : "behind"}`}
                </span>
              </h3>

              <Meter
                label="Policy count"
                value={line.policyCount}
                goal={line.policyGoal}
                format={formatCount}
                pacePct={pace.elapsedPct}
              />
              <Meter
                label="Premium"
                value={line.premium}
                goal={line.premiumGoal}
                format={formatCurrency}
                pacePct={pace.elapsedPct}
              />

              <div className="line-inputs">
                <label>
                  Policies
                  <input
                    type="number"
                    min={0}
                    value={line.policyCount}
                    onChange={(e) => updateLine(line.id, { policyCount: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Policy goal
                  <input
                    type="number"
                    min={0}
                    value={line.policyGoal}
                    onChange={(e) => updateLine(line.id, { policyGoal: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Premium ($)
                  <input
                    type="number"
                    min={0}
                    value={line.premium}
                    onChange={(e) => updateLine(line.id, { premium: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Premium goal ($)
                  <input
                    type="number"
                    min={0}
                    value={line.premiumGoal}
                    onChange={(e) => updateLine(line.id, { premiumGoal: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
