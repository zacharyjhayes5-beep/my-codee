import { useState } from "react";
import type { Opportunity, OpportunityLine, OpportunityStage } from "../types";
import {
  OPPORTUNITY_LINES,
  OPPORTUNITY_STAGES,
  blankOpportunity,
  isStalled,
  stageClassFor,
  validateOpportunity,
  validationMessage,
} from "../lib/opportunities";

interface OpportunityPanelProps {
  prospectId: string;
  opportunities: Opportunity[];
  onSave: (opportunity: Opportunity, isNew: boolean) => void;
  onRemove: (id: string) => void;
}

/**
 * Opportunities on a household. The save button stays disabled until there is
 * a next action and a date — that rule is enforced here and in the model, not
 * left to memory.
 */
export function OpportunityPanel({
  prospectId,
  opportunities,
  onSave,
  onRemove,
}: OpportunityPanelProps) {
  const [draft, setDraft] = useState<{ value: Opportunity; isNew: boolean } | null>(null);

  function startNew() {
    setDraft({ value: blankOpportunity(prospectId), isNew: true });
  }

  return (
    <div className="opportunity-panel">
      {opportunities.length === 0 && !draft && (
        <p className="empty">No opportunity yet.</p>
      )}

      {opportunities.map((o) => (
        <article className="opportunity-row" key={o.id}>
          <div className="opportunity-top">
            <span className={`stage-chip ${stageClassFor[o.stage]}`}>{o.stage}</span>
            {o.lines.length > 0 && <span className="opp-lines">{o.lines.join(" · ")}</span>}
            {o.estimatedValue !== null && (
              <span className="opp-value">${o.estimatedValue.toLocaleString("en-US")}</span>
            )}
            {isStalled(o) && <span className="opp-stalled">stalled</span>}
          </div>
          <div className="opportunity-next">
            <strong>Next:</strong> {o.nextAction}
            <span className="opp-due"> · due {o.nextActionDate}</span>
          </div>
          {o.appointments.length > 0 && (
            <div className="opp-appointments">
              {o.appointments.map((a) => (
                <span key={a.id} className="opp-appointment">
                  {a.kind === "insurance-review" ? "Insurance review" : "Appointment"} —{" "}
                  {new Date(a.at).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ))}
            </div>
          )}
          <div className="opportunity-actions">
            <button className="link-btn" onClick={() => setDraft({ value: o, isNew: false })}>
              Edit
            </button>
            <button className="link-btn danger" onClick={() => onRemove(o.id)}>
              Remove
            </button>
          </div>
        </article>
      ))}

      {draft ? (
        <OpportunityForm
          value={draft.value}
          isNew={draft.isNew}
          onSave={(next) => {
            onSave(next, draft.isNew);
            setDraft(null);
          }}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <button className="ghost-btn add-call-btn" onClick={startNew}>
          Add an opportunity
        </button>
      )}
    </div>
  );
}

function OpportunityForm({
  value,
  isNew,
  onSave,
  onCancel,
}: {
  value: Opportunity;
  isNew: boolean;
  onSave: (opportunity: Opportunity) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Opportunity>(value);
  const validation = validateOpportunity(form);

  function patch(next: Partial<Opportunity>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function toggleLine(line: OpportunityLine) {
    patch({
      lines: form.lines.includes(line)
        ? form.lines.filter((l) => l !== line)
        : [...form.lines, line],
    });
  }

  return (
    <div className="call-logger">
      <div className="call-logger-head">
        <h4>{isNew ? "New opportunity" : "Edit opportunity"}</h4>
      </div>

      <div className="call-form-grid">
        <label className="mini-field wide">
          Stage
          <select
            value={form.stage}
            onChange={(e) => patch({ stage: e.target.value as OpportunityStage })}
          >
            {OPPORTUNITY_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="mini-field wide">
          <span>Lines</span>
          <div className="chip-row">
            {OPPORTUNITY_LINES.map((line) => (
              <button
                key={line}
                className={`chip${form.lines.includes(line) ? " on" : ""}`}
                onClick={() => toggleLine(line)}
                aria-pressed={form.lines.includes(line)}
              >
                {line}
              </button>
            ))}
          </div>
        </div>

        <label className="mini-field">
          Estimated value
          <input
            type="number"
            min={0}
            value={form.estimatedValue ?? ""}
            onChange={(e) =>
              patch({ estimatedValue: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="—"
          />
        </label>

        <label className="mini-field wide">
          Next action <span className="required-mark">required</span>
          <input
            className={form.nextAction.trim() ? "" : "needs-input"}
            value={form.nextAction}
            onChange={(e) => patch({ nextAction: e.target.value })}
            placeholder="e.g. present the bundle quote"
          />
        </label>

        <label className="mini-field">
          Next action date <span className="required-mark">required</span>
          <input
            type="date"
            className={form.nextActionDate ? "" : "needs-input"}
            value={form.nextActionDate}
            onChange={(e) => patch({ nextActionDate: e.target.value })}
          />
        </label>
      </div>

      <div className="call-logger-foot">
        <button className="primary-btn" onClick={() => onSave(form)} disabled={!validation.ok}>
          {isNew ? "Create opportunity" : "Save"}
        </button>
        <button className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
        {!validation.ok && <span className="blocked-why">{validationMessage(validation)}</span>}
      </div>
    </div>
  );
}
