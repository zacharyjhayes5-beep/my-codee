import type { PaceReading } from "../lib/pace";

const point = (fraction: number, radius: number) => {
  const angle = (150 + fraction * 240) * Math.PI / 180;
  return { x: 160 + Math.cos(angle) * radius, y: 145 + Math.sin(angle) * radius };
};
const start = point(0, 116);
const end = point(1, 116);
const arc = `M ${start.x} ${start.y} A 116 116 0 1 1 ${end.x} ${end.y}`;

export function OperatorDial({ pace: policyPace, commission }: { pace?: PaceReading; commission?: number }) {
  const money = commission !== undefined;
  const amount = commission ?? 0;
  // An automatic dollar scale, not a commission target or pace estimate.
  const scale = Math.max(7000, Math.ceil(Math.abs(amount) / 7000) * 7000);
  const pace = policyPace ?? { written: amount, goal: scale, writtenPct: Math.max(0, amount) / scale * 100, elapsedPct: 0, valid: false };
  const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  const fraction = Math.min(1, Math.max(0, pace.writtenPct / 100));
  const needle = point(fraction, 83);
  const markA = point(Math.min(1, Math.max(0, pace.elapsedPct / 100)), 110);
  const markB = point(Math.min(1, Math.max(0, pace.elapsedPct / 100)), 124);
  return (
    <div className={`operator-dial${money ? " operator-dial-commission" : ""}`}>
      <span className="operator-dial-title">{money ? "NET COMMISSION · CURRENT PERIOD" : "POLICIES WRITTEN · CURRENT PERIOD"}</span>
      <svg viewBox="0 0 320 265" role="img" aria-label={money ? `${dollars(amount)} net commission. Automatic scale to ${dollars(scale)}; not a goal.` : `${pace.written} of ${pace.goal} policies written`}>
        <path d={arc} className="operator-dial-track" />
        <path d={arc} className="operator-dial-fill" pathLength="100" strokeDasharray={`${fraction * 100} 100`} />
        {Array.from({ length: 57 }, (_, i) => {
          const a = point(i / 56, 99);
          const b = point(i / 56, i % 8 === 0 ? 70 : 88);
          const label = point(i / 56, 57);
          return <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={i % 8 === 0 ? "major" : "minor"} />
            {i % 8 === 0 && <text x={label.x} y={label.y + 4} className="operator-dial-label">{money ? `${Math.round(i / 56 * scale / 1000)}k` : Math.round(i / 56 * pace.goal)}</text>}
          </g>;
        })}
        {pace.valid && <line x1={markA.x} y1={markA.y} x2={markB.x} y2={markB.y} className="operator-dial-mark" />}
        <line x1="160" y1="145" x2={needle.x} y2={needle.y} className="operator-dial-needle" />
        <circle cx="160" cy="145" r="13" className="operator-dial-hub" />
        <text x="160" y="220" className="operator-dial-number">{money ? dollars(amount) : pace.written}</text>
        <text x="160" y="245" className="operator-dial-caption">{money ? "NET COMMISSION" : `OF ${pace.goal} POLICIES`}</text>
      </svg>
      {money ? <div className="operator-dial-caption">AUTO SCALE · {dollars(scale)} · NOT A GOAL</div> : <div className="operator-dial-legend"><span>WRITTEN</span><span>PACE MARK</span><span>IN-PACE RANGE</span></div>}
    </div>
  );
}

