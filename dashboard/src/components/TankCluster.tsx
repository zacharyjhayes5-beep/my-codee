import type { PaceReading } from "../lib/pace";
import type { LineId, PolicyLine } from "../types";
import { seriesColors } from "../lib/defaultData";

/**
 * The fuel view — the same period, read as a tank being filled.
 *
 * The cluster answers "how fast am I going"; this answers "how much is left in
 * the can". One hero tank for the whole goal, a small can per line, and the
 * weekly flow underneath so a good week is visible next to the rate needed.
 *
 * The tank cavity runs y 70 → 270 in the viewBox; the liquid's surface is the
 * only thing that moves.
 */

const TOP = 70;
const BOTTOM = 270;

interface TankClusterProps {
  pace: PaceReading;
  lines: PolicyLine[];
  counts: Record<LineId, number>;
  /** Oldest → newest. One entry per week of the period. */
  weekly: { label: string; count: number }[];
}

export function TankCluster({ pace, lines, counts, weekly }: TankClusterProps) {
  const pct = Math.min(100, Math.max(0, pace.writtenPct));
  const surface = BOTTOM - ((BOTTOM - TOP) * pct) / 100;
  const peak = Math.max(1, ...weekly.map((w) => w.count));
  const best = weekly.reduce((a, w) => (w.count > a.count ? w : a), { label: "—", count: 0 });

  return (
    <div className="tank-view">
      <div className="tank-hero">
        <span className="tank-heading">TANK LEVEL</span>
        <div className="tank-hero-body">
          <svg viewBox="0 0 200 300" className="tank-hero-svg" role="img"
            aria-label={`${pace.written} of ${pace.goal} policies, ${Math.round(pct)} percent`}>
            <defs>
              <clipPath id="tank-hero-clip">
                <rect x="40" y={TOP} width="120" height={BOTTOM - TOP} rx="16" />
              </clipPath>
              <linearGradient id="tank-hero-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--navy-3)" />
                <stop offset="1" stopColor="var(--navy-2)" />
              </linearGradient>
            </defs>

            <rect x="46" y="40" width="58" height="30" rx="12" className="tank-handle" />
            <rect x="118" y="44" width="36" height="28" rx="7" className="tank-cap" />
            <rect x="40" y={TOP} width="120" height={BOTTOM - TOP} rx="16" className="tank-shell" />

            <g clipPath="url(#tank-hero-clip)">
              <rect x="40" y={surface} width="120" height={BOTTOM - surface + 20}
                fill="url(#tank-hero-fill)" className="tank-liquid" />
              <rect x="40" y={surface} width="120" height="3" className="tank-surface" />
              {[96, 140, 184, 228].map((y) => (
                <rect key={y} x="40" y={y} width="120" height="1.5" className="tank-graduation" />
              ))}
            </g>

            <rect x="62" y="118" width="76" height="76" rx="10" className="tank-emboss" />
            <text x="100" y="252" className="tank-hero-pct" textAnchor="middle">{Math.round(pct)}%</text>
          </svg>

          <div className="tank-scale-col">
            <span className="strong">F · {pace.goal}</span>
            <span>{Math.round(pace.goal * 0.75)}</span>
            <span>{Math.round(pace.goal * 0.5)}</span>
            <span className="warn">{Math.round(pace.goal * 0.25)}</span>
            <span className="strong">E · 0</span>
          </div>
        </div>

        <div className="tank-hero-readout">
          <strong>{pace.written}</strong>
          <span>in the tank · {pace.remaining} to fill</span>
        </div>
        <span className={`tank-verdict${pace.onPace ? " good" : ""}`}>
          <i />
          {pace.onPace ? "ON PACE" : `${pace.behindBy} BEHIND PACE`}
        </span>
      </div>

      <div className="tank-side">
        <div className="tank-line-row">
          {lines.map((line) => {
            const count = counts[line.id] ?? 0;
            const linePct = line.policyGoal > 0 ? Math.min(100, (count / line.policyGoal) * 100) : 0;
            return (
              <div className="tank-line" key={line.id}>
                <MiniCan pct={linePct} color={seriesColors[line.id]} id={line.id} />
                <div className="tank-line-text">
                  <span className="tank-line-name" style={{ color: seriesColors[line.id] }}>
                    {line.name.toUpperCase()}
                  </span>
                  <span className="tank-line-count">
                    {count} <i>/ {line.policyGoal}</i>
                  </span>
                  <span className="tank-line-pct">{Math.round(linePct)}% FULL</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="tank-flow">
          <div className="tank-flow-head">
            <span>FUEL FLOW · POLICIES PER WEEK</span>
            <span>NEED {pace.perWeek.toFixed(1)} / WK</span>
          </div>
          <div className="tank-flow-bars">
            {weekly.map((w) => (
              <i key={w.label}
                className={w.count === best.count && best.count > 0 ? "best" : undefined}
                style={{ height: `${Math.max(4, (w.count / peak) * 100)}%` }}
                title={`${w.label}: ${w.count}`} />
            ))}
          </div>
          <div className="tank-flow-foot">
            <span>{weekly[0]?.label ?? "—"}</span>
            <span>{best.count > 0 ? `${best.label} · BEST WEEK, ${best.count}` : "NO POLICIES YET"}</span>
            <span>{weekly[weekly.length - 1]?.label ?? "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCan({ pct, color, id }: { pct: number; color: string; id: string }) {
  const top = 24;
  const bottom = 90;
  const surface = bottom - ((bottom - top) * Math.min(100, Math.max(0, pct))) / 100;
  return (
    <svg viewBox="0 0 60 96" className="mini-can" aria-hidden="true">
      <clipPath id={`mini-${id}`}>
        <rect x="10" y={top} width="40" height={bottom - top} rx="6" />
      </clipPath>
      <rect x="13" y="10" width="20" height="14" rx="6" className="tank-handle" />
      <rect x="38" y="12" width="13" height="12" rx="3" className="tank-cap" />
      <rect x="10" y={top} width="40" height={bottom - top} rx="6" className="tank-shell" />
      <g clipPath={`url(#mini-${id})`}>
        <rect x="10" y={surface} width="40" height={bottom - surface} fill={color} />
      </g>
    </svg>
  );
}
