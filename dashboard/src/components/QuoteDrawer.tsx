import { useEffect, useState } from "react";
import {
  DEAL_SOURCES,
  DEAL_STAGES,
  LINE_TYPES,
  dealTotal,
  money,
  type Deal,
  type DealSource,
  type DealStage,
  type LineType,
} from "../lib/deals";

interface QuoteDrawerProps {
  deal: Deal;
  /** True when this card does not exist yet, so Delete just closes. */
  isNew: boolean;
  onSave: (deal: Deal) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/**
 * One household's quote, opened from a card.
 *
 * Everything is edited on a copy and nothing is written until Save, so a
 * stray keystroke in a drawer that gets dismissed cannot quietly change a
 * live quote. Escape and the scrim both close without saving.
 */
export function QuoteDrawer({ deal, isNew, onSave, onDelete, onClose }: QuoteDrawerProps) {
  const [form, setForm] = useState<Deal>(deal);

  useEffect(() => setForm(deal), [deal]);

  // Escape closes, the way every other dismissible surface in the app does.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function patch(changes: Partial<Deal>) {
    setForm((f) => ({ ...f, ...changes }));
  }

  function patchRow(index: number, changes: Partial<Deal["rows"][number]>) {
    patch({ rows: form.rows.map((r, i) => (i === index ? { ...r, ...changes } : r)) });
  }

  const total = dealTotal(form);

  return (
    <>
      <div className="quote-scrim" onClick={onClose} aria-hidden="true" />

      <aside
        className="quote-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={form.name || "New household"}
      >
        <header className="quote-head">
          <span className="quote-head-top">
            <span className="kicker">{isNew ? "New household" : "Edit household"}</span>
            <button type="button" className="quote-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </span>
          <span className="quote-heading">{form.name.trim() || "New household"}</span>
        </header>

        <div className="quote-body">
          {/* ---------- 1. Household ---------- */}
          <section className="quote-section">
            <span className="quote-legend">Household</span>
            <div className="quote-grid">
              <label className="quote-field">
                <span className="quote-label">Name</span>
                <input
                  type="text"
                  value={form.name}
                  placeholder="First &amp; last"
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
              <label className="quote-field">
                <span className="quote-label">Town</span>
                <input
                  type="text"
                  value={form.place}
                  placeholder="Lansing"
                  onChange={(e) => patch({ place: e.target.value })}
                />
              </label>
              <label className="quote-field">
                <span className="quote-label">Phone</span>
                <input
                  type="text"
                  value={form.phone}
                  placeholder="(517) 000-0000"
                  onChange={(e) => patch({ phone: e.target.value })}
                />
              </label>
              <label className="quote-field">
                <span className="quote-label">Source</span>
                <select
                  value={form.source}
                  onChange={(e) => patch({ source: e.target.value as DealSource })}
                >
                  {DEAL_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* ---------- 2. Stage ---------- */}
          <section className="quote-section">
            <span className="quote-legend-row">
              <span className="quote-legend">Stage</span>
              <span className="quote-rule" aria-hidden="true" />
            </span>
            <div className="quote-stages">
              {DEAL_STAGES.map((s) => {
                const on = form.stage === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`quote-stage${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    style={on ? { borderColor: s.hue, color: s.hue } : undefined}
                    onClick={() =>
                      patch(
                        // Picking a stage here moves the card, so the clock
                        // restarts exactly as it does on a drag.
                        s.id === form.stage
                          ? {}
                          : { stage: s.id as DealStage, stageEnteredAt: new Date().toISOString() },
                      )
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---------- 3. Quote ---------- */}
          <section className="quote-section">
            <span className="quote-legend-row">
              <span className="quote-legend">Quote</span>
              <span className="quote-rule" aria-hidden="true" />
              <span className="quote-label">Annual premium</span>
            </span>

            <div className="quote-rows">
              {form.rows.map((row, i) => (
                <div className="quote-row" key={i}>
                  <select
                    value={row.line}
                    aria-label={`Line ${i + 1}`}
                    onChange={(e) => patchRow(i, { line: e.target.value as LineType })}
                  >
                    {LINE_TYPES.map((lt) => (
                      <option key={lt} value={lt}>
                        {lt}
                      </option>
                    ))}
                  </select>

                  <span className="quote-amount">
                    <span aria-hidden="true">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.premium}
                      placeholder="0"
                      aria-label={`${row.line} premium`}
                      onChange={(e) => patchRow(i, { premium: e.target.value })}
                    />
                  </span>

                  <button
                    type="button"
                    className="quote-row-remove"
                    aria-label={`Remove ${row.line}`}
                    onClick={() => patch({ rows: form.rows.filter((_, x) => x !== i) })}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="quote-rows-foot">
              <button
                type="button"
                className="quote-add-line"
                onClick={() => patch({ rows: [...form.rows, { line: "Auto", premium: "" }] })}
              >
                + Add line
              </button>
              <span className="quote-total">
                <span className="quote-label">Total</span>
                <span className="quote-total-figure">{money(total)}</span>
              </span>
            </div>
          </section>

          {/* ---------- 4. Dates and carrier ---------- */}
          <div className="quote-grid">
            <label className="quote-field">
              <span className="quote-label">Effective date</span>
              <input
                type="date"
                value={form.effective}
                onChange={(e) => patch({ effective: e.target.value })}
              />
            </label>
            <label className="quote-field">
              <span className="quote-label">Current carrier</span>
              <input
                type="text"
                value={form.carrier}
                placeholder="Prior carrier"
                onChange={(e) => patch({ carrier: e.target.value })}
              />
            </label>
          </div>

          {/* ---------- 5. Notes ---------- */}
          <label className="quote-field">
            <span className="quote-label">Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              placeholder="What was said, what is owed next"
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>

          {/* ---------- 6. Save and delete ---------- */}
          <div className="quote-actions">
            <button type="button" className="quote-save" onClick={() => onSave(form)}>
              Save quote
            </button>
            <button
              type="button"
              className="quote-delete"
              onClick={() => (isNew ? onClose() : onDelete(form.id))}
            >
              Delete
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
