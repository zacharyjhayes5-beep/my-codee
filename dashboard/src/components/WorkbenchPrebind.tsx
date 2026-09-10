import { useState } from "react";
import type {
  ChecklistStatus,
  Opportunity,
  PrebindItem,
  Prospect,
  Workbench,
} from "../types";
import {
  LINE_LABELS,
  STATUS_LABELS,
  attachNewDoc,
  blankPrebindItem,
  handoffSummary,
  patchPrebind,
  premiumPhrase,
  quoteTitle,
  readPrebind,
  summaryLine,
} from "../lib/workbench";
import { CopyButton } from "./CopyButton";

const STATUSES: ChecklistStatus[] = ["needed", "requested", "received", "verified", "na"];

interface PrebindProps {
  bench: Workbench;
  prospect: Prospect | undefined;
  opportunity: Opportunity | undefined;
  onChange: (bench: Workbench) => void;
}

/**
 * Getting the file ready for a pre-bind review.
 *
 * The list is connected to the quotes marked "Planning to bind" — those are
 * what the review is about, and they are named at the top so it is obvious
 * when none have been chosen.
 *
 * What this panel will not say is the important part. Completing every item
 * means the agent has gathered what he meant to gather. It does not mean
 * coverage is bound, that underwriting has approved anything, or that any
 * carrier requirement has been met, and no amount of ticking changes that —
 * which is why there is no "ready" state anywhere on it.
 */
export function WorkbenchPrebind({ bench, prospect, opportunity, onChange }: PrebindProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const reading = readPrebind(bench);

  function setItems(prebind: PrebindItem[]) {
    onChange({ ...bench, prebind });
  }

  /** Evidence without leaving the list you are working down. */
  function linkNewDoc(itemId: string, name: string) {
    const made = attachNewDoc(bench, { name, category: "Other" });
    onChange({
      ...made.bench,
      prebind: patchPrebind(made.bench.prebind, itemId, { docId: made.docId }),
    });
  }

  function add() {
    if (!draft.trim()) return;
    setItems([...bench.prebind, blankPrebindItem(draft.trim(), "Added by hand", undefined, true)]);
    setDraft("");
  }

  return (
    <section className="wb-section">
      <header className="wb-section-head">
        <div>
          <h3>Pre-bind preparation</h3>
          <p className="wb-summary-line">{reading.summary}</p>
          <p className="wb-summary-line">{summaryLine(reading.counts)}</p>
        </div>
        <CopyButton label="Copy handoff summary" text={() => handoffSummary(bench, prospect, opportunity)} />
      </header>

      <p className="wb-caveat">
        Editable planning prompts, written here rather than taken from a carrier document —
        there is no authoritative Farm Bureau checklist in this app to cite. Completing them
        does not mean coverage is bound, underwriting has approved anything, or a carrier&rsquo;s
        requirements have been met.
      </p>

      <div className="wb-group">
        <span className="wb-group-head">Quotes selected for this review</span>
        {reading.selected.length === 0 ? (
          <p className="empty">
            No quote is marked &ldquo;Planning to bind&rdquo;. Mark one in the quotes section and
            it will appear here and in the handoff.
          </p>
        ) : (
          <ul className="wb-bind-list">
            {reading.selected.map((quote) => (
              <li key={quote.id}>
                <span className="wb-quote-kind">{LINE_LABELS[quote.line]}</span>
                <span className="wb-quote-title">{quoteTitle(quote)}</span>
                <span className="wb-quote-premium">{premiumPhrase(quote)}</span>
                <span className="wb-hint">
                  {quote.effectiveDate ? `effective ${quote.effectiveDate}` : "no effective date set"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="wb-group">
        <span className="wb-group-head">Preparation list</span>
        <ul className="wb-items">
          {bench.prebind.map((item) => {
            const open = expanded === item.id;
            return (
              <li className={`wb-item status-${item.status}`} key={item.id}>
                <div className="wb-item-top">
                  <button
                    type="button"
                    className="wb-item-label"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : item.id)}
                  >
                    <span className="wb-item-text">{item.label}</span>
                    {item.category && <span className="wb-item-flag">{item.category}</span>}
                    {item.notes.trim() && <span className="wb-item-flag">note</span>}
                  </button>
                  <select
                    className={`wb-status wb-status-${item.status}`}
                    value={item.status}
                    aria-label={`Status of ${item.label}`}
                    onChange={(e) =>
                      setItems(
                        patchPrebind(bench.prebind, item.id, {
                          status: e.target.value as ChecklistStatus,
                        }),
                      )
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>

                {open && (
                  <div className="wb-item-body">
                    <label className="wb-field">
                      <span className="wb-label">Item</span>
                      <input
                        value={item.label}
                        onChange={(e) =>
                          setItems(patchPrebind(bench.prebind, item.id, { label: e.target.value }))
                        }
                      />
                    </label>
                    <label className="wb-field">
                      <span className="wb-label">Notes</span>
                      <textarea
                        rows={2}
                        value={item.notes}
                        onChange={(e) =>
                          setItems(patchPrebind(bench.prebind, item.id, { notes: e.target.value }))
                        }
                      />
                    </label>
                    <label className="wb-field">
                      <span className="wb-label">Evidence</span>
                      <select
                        value={item.docId ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "__new") {
                            linkNewDoc(item.id, item.label);
                            return;
                          }
                          setItems(
                            patchPrebind(bench.prebind, item.id, {
                              docId: e.target.value || undefined,
                            }),
                          );
                        }}
                      >
                        <option value="">— none —</option>
                        {bench.docs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name || "Untitled document"}
                          </option>
                        ))}
                        <option value="__new">+ New document…</option>
                      </select>
                      <span className="wb-hint">
                        Linking evidence does not verify the item — set the status yourself.
                      </span>
                    </label>
                    <div className="wb-item-actions">
                      <span className="wb-hint">Last changed {item.updatedAt}</span>
                      <button
                        type="button"
                        className="wb-remove"
                        onClick={() => {
                          setItems(bench.prebind.filter((p) => p.id !== item.id));
                          setExpanded(null);
                        }}
                      >
                        Remove item
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="wb-add-row">
          <input
            value={draft}
            placeholder="Add a preparation item"
            aria-label="New preparation item"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="ghost-btn" onClick={add} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      </div>
    </section>
  );
}
