interface ProgressOrbProps {
  /** 0–100 */
  pct: number;
  label: string;
  caption: string;
}

/**
 * The hero readout — a quiet core wrapped in a progress ring. The ring's sweep
 * carries the number; the core only warms slightly as progress climbs, so the
 * panel reads as a gauge rather than something lit from inside.
 */
export function ProgressOrb({ pct, label, caption }: ProgressOrbProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  // Kept shallow on purpose: a hint of warmth, not a glow.
  const heat = 0.25 + (clamped / 100) * 0.35;

  return (
    <div className="orb">
      <svg viewBox="0 0 240 240" className="orb-svg" role="img" aria-label={`${label}: ${Math.round(clamped)}%`}>
        <defs>
          <radialGradient id="orb-core" cx="50%" cy="46%" r="52%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5 * heat} />
            <stop offset="45%" stopColor="var(--accent)" stopOpacity={0.22 * heat} />
            <stop offset="100%" stopColor="var(--surface-2)" stopOpacity="0.9" />
          </radialGradient>
          <radialGradient id="orb-halo" cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="82%" stopColor="var(--accent)" stopOpacity={0.07 * heat} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="orb-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <circle cx="120" cy="120" r="118" fill="url(#orb-halo)" className="orb-halo" />
        <circle cx="120" cy="120" r="74" fill="url(#orb-core)" className="orb-core" />
        <circle cx="120" cy="120" r="74" fill="none" stroke="var(--accent)" strokeOpacity="0.1" filter="url(#orb-blur)" strokeWidth="2" />

        {/* Progress ring */}
        <circle
          cx="120"
          cy="120"
          r={radius}
          fill="none"
          stroke="var(--gridline)"
          strokeWidth="3"
        />
        <circle
          cx="120"
          cy="120"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 120 120)"
          className="orb-ring"
        />

        {/* Tick marks every 10% */}
        <g className="orb-ticks">
          {Array.from({ length: 20 }, (_, i) => {
            const angle = (i / 20) * Math.PI * 2 - Math.PI / 2;
            const inner = 102;
            const outer = i % 5 === 0 ? 112 : 108;
            return (
              <line
                key={i}
                x1={120 + Math.cos(angle) * inner}
                y1={120 + Math.sin(angle) * inner}
                x2={120 + Math.cos(angle) * outer}
                y2={120 + Math.sin(angle) * outer}
              />
            );
          })}
        </g>
      </svg>

      <div className="orb-readout">
        <span className="orb-pct">{Math.round(clamped)}%</span>
        <span className="orb-label">{label}</span>
        <span className="orb-caption">{caption}</span>
      </div>
    </div>
  );
}
