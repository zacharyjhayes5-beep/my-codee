import { useState } from "react";
import type { Opportunity, Prospect } from "../types";
import {
  blankOpportunity,
  isStalled,
  premiumTotal,
  stageClassFor,
} from "../lib/opportunities";
import { OpportunityRecord } from "./OpportunityRecord";

interface OpportunityPanelProps {
  prospectId: string;
  prospect?: Prospect;
  opportunities: Opportunity[];
  onSave: (opportunity: Opportunity, isNew: boolean) => void;
  onRemove: (id: string) => void;
}

function money(n: number): string {
  return n > 0 ? `$${n.toLocaleString("en-US")}` : "—";
}

/**
 * The accounts on a household.
 *
 * This used to carry its own cut-down editor, so an account opened from Leads
 * had no premiums and no notes while the same account opened from Pipeline
 * did — one account, two editors, two answers. It renders `OpportunityRecord`
 * now, the same component the Pipeline row opens, so there is one place an
 * account is edited and it stops mattering which screen you came in through.
 */
export function OpportunityPanel({
  prospectId,
  prospect,
  opportunities,
  onSave,
  onRemove,
}: OpportunityPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Opportunity | null>(null);

  return (
    <div className="opportunity-panel">
      {opportunities.length === 0 && !draft && <p className="empty">No account yet.</p>}

      {opportunities.map((o) => {
        const open = openId === o.id;
        return (
          <article className={`opportunity-row${open ? " is-open" : ""}`} key={o.id}>
            <button
              type="button"
              className="opportunity-top"
              aria-expanded={open}
              onClick={() => {
                setDraft(null);
                setOpenId(open ? null : o.id);
              }}
            >
              <span className={`stage-chip ${stageClassFor[o.stage]}`}>{o.stage}</span>
              {o.lines.length > 0 && <span className="opp-lines">{o.lines.join(" · ")}</span>}
              <span className="opp-value">{money(premiumTotal(o))}</span>
              {isStalled(o) && <span className="opp-stalled">quiet</span>}
            </button>

            {!open && o.nextAction && (
              <div className="opportunity-next">
                <strong>Next:</strong> {o.nextAction}
                {o.nextActionDate && <span className="opp-due"> · due {o.nextActionDate}</span>}
              </div>
            )}

            {open && (
              <OpportunityRecord
                opportunity={o}
                prospect={prospect}
                onSave={(next) => onSave(next, false)}
                onRemove={() => {
                  onRemove(o.id);
                  setOpenId(null);
                }}
                onClose={() => setOpenId(null)}
              />
            )}
          </article>
        );
      })}

      {draft ? (
        <article className="opportunity-row is-open">
          <OpportunityRecord
            opportunity={draft}
            prospect={prospect}
            isNew
            onSave={(next) => {
              onSave(next, true);
              setDraft(null);
            }}
            onRemove={() => setDraft(null)}
            onClose={() => setDraft(null)}
          />
        </article>
      ) : (
        <button
          className="ghost-btn add-call-btn"
          onClick={() => {
            setOpenId(null);
            setDraft(blankOpportunity(prospectId));
          }}
        >
          Add an account
        </button>
      )}
    </div>
  );
}
