interface MeterProps {
  label: string;
  value: number;
  goal: number;
  format: (n: number) => string;
  dotColor?: string;
  /** Where the "on pace for today" marker sits, 0–100. */
  pacePct?: number;
}

export function Meter({ label, value, goal, format, dotColor, pacePct }: MeterProps) {
  const hasGoal = goal > 0;
  const pct = hasGoal ? (value / goal) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const met = hasGoal && value >= goal;
  const paceClamped = pacePct === undefined ? null : Math.min(100, Math.max(0, pacePct));

  return (
    <div className="meter">
      <div className="meter-header">
        <span className="meter-label">
          {dotColor && <span className="meter-dot" style={{ background: dotColor }} />}
          {label}
        </span>
        <span className="meter-value">
          {format(value)}{" "}
          {hasGoal && <span className="meter-goal">/ {format(goal)} goal</span>}
        </span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{
            width: `${clamped}%`,
            background: met ? "var(--status-good)" : "var(--accent)",
            boxShadow: `0 0 12px ${met ? "var(--status-good)" : "var(--accent)"}`,
          }}
        />
        {hasGoal && paceClamped !== null && (
          <span
            className="meter-pace"
            style={{ left: `${paceClamped}%` }}
            title={`On pace for today: ${format(Math.round((paceClamped / 100) * goal))}`}
          />
        )}
      </div>
      <span className="meter-pct">{hasGoal ? `${pct.toFixed(0)}% of goal` : "No goal set"}</span>
    </div>
  );
}
