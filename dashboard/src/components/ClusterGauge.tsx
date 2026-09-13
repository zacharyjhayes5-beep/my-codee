import { useMemo } from "react";
import type { PaceReading } from "../lib/pace";

/**
 * The cluster gauge — Progress read as an instrument binnacle.
 *
 * Three instruments, one glance: the policy comb on the left (a racetrack
 * scale that fills as the book is written), the trip readout in the middle,
 * and the weekly-rate dial on the right. The comb carries two marks the bars
 * never could — where you *are* and where the period says you *should be* —
 * which is the whole reason this replaced a progress bar.
 *
 * Geometry lives in the viewBox, not in CSS: the comb path is
 *   M170 300 A130 130 0 1 1 170 40 L560 40
 * a half-circle up the left side and then a straight rail across the top.
 * Every tick and label is placed along that same parameterisation, so the
 * scale stays honest when the goal changes.
 */

const ARC_R = 130;
const CX = 170;
const CY = 170;
const STRAIGHT = 390;
const ARC_LEN = Math.PI * ARC_R;
const TOTAL = ARC_LEN + STRAIGHT;
const SPLIT = ARC_LEN / TOTAL;
const COMB_PATH = `M170 300 A130 130 0 1 1 170 40 L560 40`;

/** A point on the comb at fraction u (0 = empty, 1 = goal), radius r inward. */
function combPoint(u: number, r: number) {
  if (u <= SPLIT) {
    const a = ((90 + 180 * (u / SPLIT)) * Math.PI) / 180;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }
  const t = (u - SPLIT) / (1 - SPLIT);
  return { x: CX + STRAIGHT * t, y: 40 + (ARC_R - r) };
}

const DIAL_START = 150;
const DIAL_SWEEP = 240;
function dialPoint(fraction: number, r: number) {
  const a = ((DIAL_START + DIAL_SWEEP * fraction) * Math.PI) / 180;
  return { x: 150 + r * Math.cos(a), y: 150 + r * Math.sin(a) };
}

const RATE_MAX = 20;
/** The final stretch, marked like a redline: the last eighth of the goal. */
const RED_ZONE = 0.875;

interface ClusterGaugeProps {
  pace: PaceReading;
  /** Premium written in the period, in dollars. */
  premium: number;
  /** Net commission in the period, in dollars. */
  commission: number;
  households: number;
  /** Policies per week actually being written. */
  ratePerWeek: number;
  /** 0–100. Quotes out, shown as the temperature strip. */
  pipelineTemp?: number;
  quotesOut?: number;
}

export function ClusterGauge({
  pace,
  premium,
  commission,
  households,
  ratePerWeek,
  pipelineTemp = 0,
  quotesOut = 0,
}: ClusterGaugeProps) {
  const { comb, labels } = useMemo(() => {
    const steps = 42;
    const comb: { x1: number; y1: number; x2: number; y2: number; major: boolean; red: boolean }[] = [];
    const labels: { x: number; y: number; text: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const major = i % 6 === 0;
      const outer = combPoint(u, ARC_R);
      const inner = combPoint(u, major ? 100 : 114);
      comb.push({ x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y, major, red: u > RED_ZONE });
      if (major) {
        const l = combPoint(u, 88);
        labels.push({ x: l.x, y: l.y + 9, text: String(Math.round(pace.goal * u)) });
      }
    }
    return { comb, labels };
  }, [pace.goal]);

  const dial = useMemo(() => {
    const ticks: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const marks: { x: number; y: number; text: string }[] = [];
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      const major = i % 8 === 0;
      const o = dialPoint(f, major ? 118 : 116);
      const n = dialPoint(f, major ? 92 : 102);
      ticks.push({ x1: o.x, y1: o.y, x2: n.x, y2: n.y, major });
      if (major) {
        const m = dialPoint(f, 84);
        marks.push({ x: m.x, y: m.y + 8, text: String(Math.round(RATE_MAX * f)) });
      }
    }
    return { ticks, marks };
  }, []);

  const writtenPct = Math.min(100, pace.writtenPct);
  const expectedPct = pace.goal > 0 ? Math.min(100, (pace.expectedTotal / pace.goal) * 100) : 0;
  const rateRot = DIAL_START + DIAL_SWEEP * Math.min(1, ratePerWeek / RATE_MAX) + 90;
  const needRot = DIAL_START + DIAL_SWEEP * Math.min(1, pace.perWeek / RATE_MAX) + 90;
  const tankPct = Math.round(writtenPct);

  return (
    <div className="cluster">
      {/* Left pod — the policy comb */}
      <div className="cluster-pod cluster-pod-left">
        <svg viewBox="0 0 620 330" className="comb-svg" role="img"
          aria-label={`${pace.written} of ${pace.goal} policies written`}>
          <defs>
            <linearGradient id="comb-fill" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--navy-2)" />
              <stop offset="1" stopColor="var(--text-primary)" />
            </linearGradient>
          </defs>

          <path d={COMB_PATH} className="comb-track" />
          <path d={COMB_PATH} className="comb-fill" pathLength={100}
            strokeDasharray={`${writtenPct} 100`} stroke="url(#comb-fill)" />
          <path d={COMB_PATH} className="comb-pacemark" pathLength={100}
            strokeDasharray="0.5 99.5" strokeDashoffset={-expectedPct} />

          <g className="comb-ticks">
            {comb.map((t, i) => (
              <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                className={`comb-tick${t.major ? " major" : ""}${t.red ? " red" : ""}`} />
            ))}
          </g>
          {labels.map((l) => (
            <text key={l.text} x={l.x} y={l.y} className="comb-label" textAnchor="middle">{l.text}</text>
          ))}

          <text x="370" y="200" className="comb-readout" textAnchor="middle">{pace.written}</text>
          <text x="370" y="232" className="comb-caption" textAnchor="middle">
            POLICIES · GOAL {pace.goal}
          </text>
          <text x="370" y="266" textAnchor="middle"
            className={`comb-verdict${pace.onPace ? " good" : ""}`}>
            {pace.onPace
              ? `ON PACE · MARK AT ${Math.round(pace.expectedTotal)}`
              : `${pace.behindBy} BEHIND · MARK AT ${Math.round(pace.expectedTotal)}`}
          </text>
          <text x="370" y="294" className="comb-note" textAnchor="middle">
            RED ZONE = FINAL {Math.max(1, Math.round(pace.goal * (1 - RED_ZONE)))}
          </text>
        </svg>

        <div className="cluster-strip">
          <span className="strip-end">COLD</span>
          <Segments pct={pipelineTemp} hotTail />
          <span className="strip-end">HOT</span>
          <span className="strip-note">PIPELINE TEMP · {quotesOut} QUOTES OUT</span>
        </div>
      </div>

      {/* Centre — the trip readout */}
      <div className="cluster-trip">
        <div className="trip-rule" />
        <div className="trip-title">{"Period"}</div>
        <div className="trip-rule" />
        <div className="trip-rows">
          <TripRow swatch="var(--series-1)" value={fmtK(premium)} unit="PREMIUM $K" />
          <TripRow swatch="var(--series-3)" value={fmtK(commission)} unit="COMMISSION $K" />
          <TripRow swatch="var(--series-2)" value={households.toLocaleString("en-US")} unit="HOUSEHOLDS" />
        </div>
        <div className="trip-rule" />
        <div className="trip-hint">
          HOLD <kbd>⌘K</kbd> TO OPEN THE BOOK
        </div>
        <div className="trip-rule" />
        <div className="trip-foot">
          <span>{pace.daysLeft} days</span>
          <strong className={pace.onPace ? "good" : ""}>{pace.onPace ? "ON PACE" : "OFF PACE"}</strong>
          <span>{pace.remaining} to go</span>
        </div>
      </div>

      {/* Right pod — weekly rate */}
      <div className="cluster-pod cluster-pod-right">
        <svg viewBox="0 0 300 300" className="dial-svg" role="img"
          aria-label={`${ratePerWeek.toFixed(1)} policies per week, ${pace.perWeek.toFixed(1)} needed`}>
          {dial.ticks.map((t, i) => (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
              className={`dial-tick${t.major ? " major" : ""}`} />
          ))}
          {dial.marks.map((m) => (
            <text key={m.text} x={m.x} y={m.y} className="dial-label" textAnchor="middle">{m.text}</text>
          ))}

          <circle cx="150" cy="150" r="58" className="dial-disc" />
          <text x="150" y="126" className="dial-unit" textAnchor="middle">PER WK</text>
          <text x="150" y="184" className="dial-readout" textAnchor="middle">{ratePerWeek.toFixed(1)}</text>
          <text x="150" y="248" className="dial-need" textAnchor="middle">
            NEED {pace.perWeek.toFixed(1)} / WK
          </text>

          {/* Fixed index at the required rate, then the live pointer. */}
          <g transform={`rotate(${needRot} 150 150)`}>
            <line x1="150" y1="34" x2="150" y2="64" className="dial-index" />
          </g>
          <g className="dial-pointer" transform={`rotate(${rateRot} 150 150)`}>
            <line x1="150" y1="34" x2="150" y2="78" />
            <circle cx="150" cy="84" r="4" />
          </g>
        </svg>

        <div className="cluster-strip">
          <span className="strip-end">E</span>
          <Segments pct={tankPct} coldTail />
          <span className="strip-end">F</span>
          <span className="strip-note">TANK {tankPct}%</span>
        </div>
      </div>
    </div>
  );
}

function TripRow({ swatch, value, unit }: { swatch: string; value: string; unit: string }) {
  return (
    <div className="trip-row">
      <span className="trip-swatch" style={{ background: swatch }} />
      <span className="trip-value">{value}</span>
      <span className="trip-unit">{unit}</span>
    </div>
  );
}

/** Twelve raked bars, the way a cluster shows temperature and fuel. */
function Segments({ pct, hotTail, coldTail }: { pct: number; hotTail?: boolean; coldTail?: boolean }) {
  const lit = Math.round((Math.min(100, Math.max(0, pct)) / 100) * 12);
  return (
    <span className="strip-bars">
      {Array.from({ length: 12 }, (_, i) => {
        const on = i < lit;
        const tail = (hotTail && i === 11) || (coldTail && i === 0);
        return <i key={i} className={`strip-bar${on ? " on" : ""}${tail ? " tail" : ""}`} />;
      })}
    </span>
  );
}

function fmtK(n: number) {
  return (n / 1000).toFixed(1);
}
