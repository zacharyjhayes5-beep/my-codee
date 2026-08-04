interface MeterProps {
  label: string;
  value: number;
  goal: number;
  format: (n: number) => string;
  dotColor?: string;
}

export function Meter({ label, value, goal, format, dotColor }: MeterProps) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const met = goal > 0 && value >= goal;

  return (
    <div className="meter">
      <div className="meter-header">
        <span className="meter-label">
          {dotColor && <span className="meter-dot" style={{ background: dotColor }} />}
          {label}
        </span>
        <span className="meter-value">
          {format(value)} <span className="meter-goal">/ {format(goal)} goal</span>
        </span>
      </div>
      <div className="meter-track">
        <div
          className="meter-fill"
          style={{
            width: `${clamped}%`,
            background: met ? "var(--status-good)" : "var(--accent)",
          }}
        />
      </div>
      <span className="meter-pct">{pct.toFixed(0)}% of goal</span>
    </div>
  );
}
