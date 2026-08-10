import { useMemo } from "react";
import type { PolicyLine } from "../types";
import { monthSixTiers } from "../lib/defaultData";
import { GasTank } from "./GasTank";

interface TierSectionProps {
  lines: PolicyLine[];
}

export function TierSection({ lines }: TierSectionProps) {
  const counts = useMemo(() => {
    const get = (id: string) => lines.find((l) => l.id === id)?.policyCount ?? 0;
    return { pc: get("property") + get("casualty"), life: get("life") };
  }, [lines]);

  // The tier you're actually sitting in — the highest one where both counts land.
  const currentIndex = monthSixTiers.reduce(
    (acc, tier, i) => (counts.pc >= tier.pc && counts.life >= tier.life ? i : acc),
    -1
  );

  return (
    <section className="tier-section">
      <div className="tier-head">
        <h2>NADP tiers — 6-month checkpoint</h2>
        <p>
          Policy counts needed at NADP month 6, from the commission multiplier table.
          Property and Casualty count together.
        </p>
      </div>

      <div className="tier-grid">
        {monthSixTiers.map((tier, i) => {
          const reached = counts.pc >= tier.pc && counts.life >= tier.life;
          const pcLeft = Math.max(0, tier.pc - counts.pc);
          const lifeLeft = Math.max(0, tier.life - counts.life);

          return (
            <article className={`tier-card${i === currentIndex ? " current" : ""}`} key={tier.id}>
              <header className="tier-card-head">
                <h3>{tier.name}</h3>
                <span className="tier-multiplier">{tier.multiplier}× multiplier</span>
                {i === currentIndex ? (
                  <span className="tier-badge current">You are here</span>
                ) : (
                  reached && <span className="tier-badge">Reached</span>
                )}
              </header>

              <div className="tank-row">
                <GasTank label="Property & Casualty" value={counts.pc} goal={tier.pc} />
                <GasTank label="Life" value={counts.life} goal={tier.life} />
              </div>

              <footer className="tier-foot">
                {reached ? (
                  <span className="tier-done">Both targets met.</span>
                ) : (
                  <span>
                    {pcLeft > 0 && `${pcLeft} more P/C`}
                    {pcLeft > 0 && lifeLeft > 0 && " · "}
                    {lifeLeft > 0 && `${lifeLeft} more life`}
                    {" to go"}
                  </span>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
