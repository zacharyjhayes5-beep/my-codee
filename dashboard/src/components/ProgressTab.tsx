import { useMemo } from "react";
import type { PolicyLine } from "../types";
import { Meter } from "./Meter";
import { StatTile } from "./StatTile";

const seriesColors: Record<string, string> = {
  property: "var(--series-1)",
  casualty: "var(--series-2)",
  life: "var(--series-3)",
  commercial: "var(--series-4)",
  surplus: "var(--series-5)",
};

function formatCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

interface ProgressTabProps {
  lines: PolicyLine[];
  onChange: (lines: PolicyLine[]) => void;
}

export function ProgressTab({ lines, onChange }: ProgressTabProps) {
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

  function updateLine(id: string, patch: Partial<PolicyLine>) {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  return (
    <div className="tab-panel">
      <div className="stat-row">
        <StatTile label="Total policies" value={formatCount(totals.policyCount)} sub={`Goal ${formatCount(totals.policyGoal)}`} />
        <StatTile label="Total premium" value={formatCurrency(totals.premium)} sub={`Goal ${formatCurrency(totals.premiumGoal)}`} />
        <StatTile
          label="Overall progress"
          value={totals.policyGoal > 0 ? `${Math.round((totals.policyCount / totals.policyGoal) * 100)}%` : "—"}
          sub="of policy count goal"
        />
      </div>

      <div className="line-grid">
        {lines.map((line) => (
          <div className="line-card" key={line.id}>
            <h3>
              <span className="meter-dot" style={{ background: seriesColors[line.id] }} />
              {line.name}
            </h3>

            <Meter label="Policy count" value={line.policyCount} goal={line.policyGoal} format={formatCount} />
            <Meter label="Premium" value={line.premium} goal={line.premiumGoal} format={formatCurrency} />

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
        ))}
      </div>
    </div>
  );
}
