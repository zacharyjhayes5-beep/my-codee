import { useEffect, useMemo, useState } from "react";
import type { Opportunity, OpportunityLine, OpportunityStage, Prospect } from "../types";
import {
  OPPORTUNITY_LINES,
  OPPORTUNITY_STAGES,
  premiumTotal,
  validateOpportunity,
  validationMessage,
} from "../lib/opportunities";

interface OpportunityRecordProps {
  opportunity: Opportunity;
  prospect: Prospect | undefined;
  onSave: (next: Opportunity) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Absent when the record is already open inside the household. */
  onOpenHousehold?: () => void;
  /** A brand-new account: saving creates it rather than patching one. */
  isNew?: boolean;
}

function money(n: number): string {
  return n > 0 ? `$${n.toLocaleString("en-US")}` : "—";
}

/**
 * One account, open for editing.
 *
 * The Pipeline used to be a read-only view: clicking a name left the screen
 * entirely and reopened the household on Leads. That is the right home for
 * *who* somebody is, and the wrong one for what is being quoted — so the
 * account's own detail is edited here, where it is being worked.
 *
 * Nothing is written until Save. Editing in place and persisting on every
 * keystroke would make an accidental keypress a silent change to a live
 * quote.
 */
export function OpportunityRecord({
  opportunity,
  prospect,
  onSave,
  onRemove,
  onClose,
  onOpenHousehold,
  isNew = false,
}: OpportunityRecordProps) {
  const [form, setForm] = useState<Opportunity>(opportunity);
  const [saved, setSaved] = useState(false);
  /** Removing takes two presses. One is how a live quote vanishes by accident. */
  const [confirmRemove, setConfirmRemove] = useState(false);

  // A different row opened, or the record changed underneath — take the new one.
  useEffect(() => {
    setForm(opportunity);
    setSaved(false);
    setConfirmRemove(false);
  }, [opportunity]);

  function patch(changes: Partial<Opportunity>) {
    setForm((f) => ({ ...f, ...changes }));
    setSaved(false);
  }

  function toggleLine(line: OpportunityLine) {
    const on = form.lines.includes(line);
    const nextLines = on ? form.lines.filter((l) => l !== line) : [...form.lines, line];
    const nextPremiums = { ...form.premiums };
    // Dropping a line drops its figure with it, so a premium can never be
    // carried by a line the account no longer covers.
    if (on) delete nextPremiums[line];
    patch({ lines: nextLines, premiums: nextPremiums });
  }

  function setPremium(line: OpportunityLine, raw: string) {
    const next = { ...form.premiums };
    if (raw.trim() === "") delete next[line];
    else next[line] = Number(raw);
    patch({ premiums: next });
  }

  const validation = useMemo(() => validateOpportunity(form), [form]);
  const total = premiumTotal(form);
  const dirty = isNew || JSON.stringify(form) !== JSON.stringify(opportunity);

  return (
    <div className="opp-record">
      <div className="opp-record-head">
        <div>
          <span className="kicker">Account</span>
          <h3>{prospect?.name || "Unknown household"}</h3>
          {prospect?.area && <span className="opp-record-sub">{prospect.area}</span>}
        </div>
        <div className="opp-record-actions">
          {onOpenHousehold && (
            <button type="button" className="op-link" onClick={onOpenHousehold}>
              Open household
            </button>
          )}
          <button type="button" className="op-link" onClick={onClose}>
            {isNew ? "Cancel" : "Close"}
          </button>
        </div>
      </div>

      <div className="opp-grid">
        <label className="opp-field">
          <span className="camp-label">Stage</span>
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

        <label className="opp-field">
          <span className="camp-label">Next action</span>
          <input
            type="text"
            value={form.nextAction}
            placeholder="e.g. Present the home and auto quote"
            onChange={(e) => patch({ nextAction: e.target.value })}
          />
        </label>

        <label className="opp-field">
          <span className="camp-label">Next action date</span>
          <input
            type="date"
            value={form.nextActionDate}
            onChange={(e) => patch({ nextActionDate: e.target.value })}
          />
        </label>

        <label className="opp-field">
          <span className="camp-label">Conversion score (1–10)</span>
          <input
            type="number"
            min={1}
            max={10}
            value={form.conversionScore ?? ""}
            placeholder="Only if you have a real read"
            onChange={(e) =>
              patch({ conversionScore: e.target.value ? Number(e.target.value) : null })
            }
          />
        </label>
      </div>

      {/* ---------- Premium per line ---------- */}
      <div className="opp-premiums">
        <div className="op-section-head">
          <span className="kicker">Premium by line</span>
          <span className="op-rule" aria-hidden="true" />
          <span className="op-count">{money(total)} total</span>
        </div>

        <p className="opp-hint">
          Tick the lines this account covers, then price each one. Annual premium.
        </p>

        <div className="opp-lines-grid">
          {OPPORTUNITY_LINES.map((line) => {
            const on = form.lines.includes(line);
            return (
              <div className={`opp-line${on ? " is-on" : ""}`} key={line}>
                <label className="opp-line-toggle">
                  <input type="checkbox" className="op-check" checked={on} onChange={() => toggleLine(line)} />
                  <span>{line}</span>
                </label>
                <div className="opp-line-amount">
                  <span aria-hidden="true">$</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.premiums?.[line] ?? ""}
                    placeholder={on ? "0" : "—"}
                    disabled={!on}
                    aria-label={`${line} annual premium`}
                    onChange={(e) => setPremium(line, e.target.value)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Notes ---------- */}
      <div className="opp-notes">
        <div className="op-section-head">
          <span className="kicker">Account notes</span>
          <span className="op-rule" aria-hidden="true" />
        </div>
        <textarea
          rows={12}
          value={form.notes}
          placeholder="Everything worth remembering about this account — what they have now, what they said, what to bring up next time."
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </div>

      <div className="opp-record-foot">
        <button
          type="button"
          className="camp-save"
          disabled={!validation.ok || !dirty}
          onClick={() => {
            onSave(form);
            setSaved(true);
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="camp-clear"
          disabled={!dirty}
          onClick={() => {
            setForm(opportunity);
            setSaved(false);
          }}
        >
          Discard changes
        </button>
        {!validation.ok && <span className="opp-warn">{validationMessage(validation)}</span>}
        {validation.ok && saved && !dirty && <span className="opp-ok">Saved.</span>}

        <span className="opp-foot-spacer" />

        {/* Takes the account off the pipeline. The household stays on Leads —
            this drops a piece of work, not a person. */}
        {isNew ? null : confirmRemove ? (
          <>
            <span className="opp-warn">
              Remove this account? {prospect?.name || "The household"} stays on Leads.
            </span>
            <button type="button" className="opp-remove-confirm" onClick={onRemove}>
              Remove
            </button>
            <button type="button" className="camp-clear" onClick={() => setConfirmRemove(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="opp-remove" onClick={() => setConfirmRemove(true)}>
            Remove from pipeline
          </button>
        )}
      </div>
    </div>
  );
}
