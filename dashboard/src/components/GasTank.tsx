interface GasTankProps {
  label: string;
  value: number;
  goal: number;
}

/** Fuel colour walks from empty-red up to full-green as the tank fills. */
function fuelColor(pct: number) {
  if (pct >= 100) return "var(--status-good)";
  if (pct >= 50) return "var(--accent)";
  if (pct >= 25) return "var(--status-warning)";
  return "var(--status-critical)";
}

export function GasTank({ label, value, goal }: GasTankProps) {
  const raw = goal > 0 ? (value / goal) * 100 : 0;
  const pct = Math.min(100, Math.max(0, raw));

  // Liquid geometry inside the tank cavity (y 22 → 108).
  const top = 22;
  const bottom = 108;
  const span = bottom - top;
  const surface = bottom - (span * pct) / 100;
  const color = fuelColor(pct);
  const clipId = `tank-${label.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="gas-tank">
      <svg
        viewBox="0 0 116 124"
        className="tank-svg"
        role="img"
        aria-label={`${label}: ${value} of ${goal}, ${Math.round(raw)} percent`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="14" y={top} width="72" height={span} rx="9" />
          </clipPath>
        </defs>

        {/* Filler neck and cap */}
        <rect x="42" y="4" width="16" height="9" rx="3" className="tank-metal" />
        <rect x="36" y="0" width="28" height="6" rx="3" className="tank-metal" />

        {/* Tank body */}
        <rect x="10" y="14" width="80" height="100" rx="14" className="tank-body" />

        {/* Fuel */}
        <g clipPath={`url(#${clipId})`}>
          <rect className="tank-fuel" x="14" y={surface} width="72" height={bottom - surface} fill={color} />
          {pct > 0 && pct < 100 && (
            <path
              className="tank-fuel"
              d={`M14 ${surface} q 9 -4 18 0 t 18 0 t 18 0 t 18 0 V ${surface + 6} H14 Z`}
              fill={color}
            />
          )}
        </g>

        {/* E / F scale, outside the tank so the fuel never covers it */}
        <g className="tank-scale">
          <line x1="93" y1="26" x2="100" y2="26" />
          <line x1="93" y1="64" x2="97" y2="64" />
          <line x1="93" y1="102" x2="100" y2="102" />
        </g>
        <text x="115" y="30" className="tank-mark" textAnchor="end">
          F
        </text>
        <text x="115" y="106" className="tank-mark" textAnchor="end">
          E
        </text>

        <rect x="10" y="14" width="80" height="100" rx="14" className="tank-outline" />
      </svg>

      <div className="tank-readout">
        <span className="tank-label">{label}</span>
        <span className="tank-value">
          {value} <span className="tank-goal">/ {goal}</span>
        </span>
        <span className="tank-pct" style={{ color }}>
          {Math.round(raw)}%
        </span>
      </div>
    </div>
  );
}
