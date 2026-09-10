import { useEffect, useMemo, useState } from "react";
import type { Opportunity, Prospect, Workbench, WorkbenchLine } from "../types";
import { OPPORTUNITY_STAGES } from "../lib/opportunities";
import {
  LINE_LABELS,
  WORKBENCH_LINES,
  countStatuses,
  markRequested,
  opportunityLinesFrom,
  outstandingItems,
  readPrebind,
  summaryLine,
  syncLines,
} from "../lib/workbench";
import { WorkbenchChecklist } from "./WorkbenchChecklist";
import { WorkbenchQuotes } from "./WorkbenchQuotes";
import { WorkbenchDocs } from "./WorkbenchDocs";
import { WorkbenchPrebind } from "./WorkbenchPrebind";
import { RequestComposer } from "./RequestComposer";

type Pane = "checklist" | "quotes" | "documents" | "prebind";

const PANES: { id: Pane; label: string }[] = [
  { id: "checklist", label: "Missing information" },
  { id: "quotes", label: "Quotes" },
  { id: "documents", label: "Documents" },
  { id: "prebind", label: "Pre-bind" },
];

interface QuoteWorkbenchProps {
  bench: Workbench;
  prospect: Prospect | undefined;
  opportunity: Opportunity;
  ownerName: string;
  onChange: (bench: Workbench) => void;
  /**
   * Writes to the account itself — stage, next action, notes and lines. The
   * workbench never keeps its own copy of these, which is what stops Operator
   * showing one answer and this screen another.
   */
  onOpportunityChange: (patch: Partial<Opportunity>) => void;
  onClose: () => void;
}

/**
 * One household's quote workspace.
 *
 * Opened from a household record and from the pipeline board, over whichever
 * screen it was opened from. The existing Quote Drawer stays as it is: it is a
 * deliberately coarse four-field editor for moving a card along, and widening
 * it into this would have made the quick path slow. This is the comfortable
 * workspace that sits behind it, and both write to the same opportunity.
 *
 * Edits persist as they are made, the way the household record does — a
 * workspace this large with a single Save button is a workspace that loses an
 * afternoon to a closed tab. The header says when the last change was saved.
 */
export function QuoteWorkbench({
  bench,
  prospect,
  opportunity,
  ownerName,
  onChange,
  onOpportunityChange,
  onClose,
}: QuoteWorkbenchProps) {
  const [pane, setPane] = useState<Pane>("checklist");
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Escape inside a field should leave the field, not throw the screen away.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (composing) setComposing(false);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, composing]);

  const counts = useMemo(() => countStatuses(bench.items), [bench.items]);
  const outstanding = useMemo(() => outstandingItems(bench.items), [bench.items]);
  const prebind = useMemo(() => readPrebind(bench), [bench]);

  /**
   * Toggling a line re-seeds its prompts and keeps the account's coarse
   * `lines` field in step, so the board and the book do not disagree with
   * what is selected here. Nothing already entered is deleted — see
   * `syncLines`.
   */
  function toggleLine(line: WorkbenchLine) {
    const next = bench.lines.includes(line)
      ? bench.lines.filter((l) => l !== line)
      : [...bench.lines, line];
    onChange(syncLines(bench, next));
    onOpportunityChange({ lines: opportunityLinesFrom(next, opportunity.lines) });
  }

  const blockers: string[] = [];
  if (outstanding.length > 0) {
    blockers.push(
      `${outstanding.length} information item${outstanding.length === 1 ? "" : "s"} outstanding`,
    );
  }
  if (prebind.selected.length === 0) blockers.push("no quote marked Planning to bind");
  if (prebind.outstanding.length > 0) {
    blockers.push(
      `${prebind.outstanding.length} preparation item${prebind.outstanding.length === 1 ? "" : "s"} outstanding`,
    );
  }

  return (
    <>
      <div className="quote-scrim" onClick={onClose} aria-hidden="true" />

      <aside
        className="wb-shell"
        role="dialog"
        aria-modal="true"
        aria-label={`Quote workbench — ${prospect?.name || "household"}`}
      >
        <header className="wb-head">
          <div className="wb-head-top">
            <span className="kicker">Quote workbench</span>
            <button type="button" className="quote-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          <h2 className="wb-heading">{prospect?.name || "Household"}</h2>

          <p className="wb-contact">
            {[prospect?.phone, prospect?.email, prospect?.area].filter(Boolean).join(" · ") ||
              "No contact details on the household record yet."}
          </p>

          {/* ---- lines ---- */}
          <div className="wb-lines" role="group" aria-label="Lines being quoted">
            {WORKBENCH_LINES.map((line) => {
              const on = bench.lines.includes(line);
              return (
                <button
                  key={line}
                  type="button"
                  className={`wb-line-chip${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleLine(line)}
                >
                  {LINE_LABELS[line]}
                </button>
              );
            })}
          </div>

          {/* ---- stage and next action, on the opportunity itself ---- */}
          <div className="wb-next">
            <label className="wb-field">
              <span className="wb-label">Stage</span>
              <select
                value={opportunity.stage}
                onChange={(e) =>
                  onOpportunityChange({ stage: e.target.value as Opportunity["stage"] })
                }
              >
                {OPPORTUNITY_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="wb-hint">
                Yours to set. Nothing here advances a stage because boxes got ticked.
              </span>
            </label>

            <label className="wb-field">
              <span className="wb-label">Next action</span>
              <input
                value={opportunity.nextAction}
                placeholder="Request roof information"
                onChange={(e) => onOpportunityChange({ nextAction: e.target.value })}
              />
            </label>

            <label className="wb-field">
              <span className="wb-label">Due</span>
              <input
                type="date"
                value={opportunity.nextActionDate}
                onChange={(e) => onOpportunityChange({ nextActionDate: e.target.value })}
              />
            </label>
          </div>

          {(!opportunity.nextAction.trim() || !opportunity.nextActionDate) && (
            <p className="wb-warn">
              This account has no next action and date. Operator&rsquo;s queue is built from
              those two fields, so without them it will not appear in the day&rsquo;s work.
            </p>
          )}
          {opportunity.nextAction.trim() && opportunity.nextActionDate && (
            <p className="wb-hint">
              Shows in Operator as &ldquo;{prospect?.name || "Household"} — {opportunity.nextAction}
              &rdquo;, due {opportunity.nextActionDate}. No separate task is created.
            </p>
          )}

          {/* ---- what is stopping this ---- */}
          <div className="wb-blockers">
            <span className="wb-label">Before a pre-bind review</span>
            {blockers.length === 0 ? (
              <p className="wb-blockers-clear">
                Nothing outstanding on either list, and a quote is selected. Still your call
                whether it is ready — this is a count, not an approval.
              </p>
            ) : (
              <ul>
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
          </div>

          <nav className="wb-panes" aria-label="Workbench sections">
            {PANES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wb-pane-tab${pane === p.id ? " is-on" : ""}`}
                aria-current={pane === p.id ? "true" : undefined}
                onClick={() => setPane(p.id)}
              >
                {p.label}
                {p.id === "checklist" && outstanding.length > 0 && (
                  <span className="wb-pane-count">{outstanding.length}</span>
                )}
                {p.id === "quotes" && bench.quotes.length > 0 && (
                  <span className="wb-pane-count">{bench.quotes.length}</span>
                )}
                {p.id === "documents" && bench.docs.length > 0 && (
                  <span className="wb-pane-count">{bench.docs.length}</span>
                )}
                {p.id === "prebind" && prebind.outstanding.length > 0 && (
                  <span className="wb-pane-count">{prebind.outstanding.length}</span>
                )}
              </button>
            ))}
          </nav>
        </header>

        <div className="wb-body">
          {pane === "checklist" && (
            <WorkbenchChecklist
              bench={bench}
              onChange={onChange}
              onOpenRequest={() => setComposing(true)}
            />
          )}
          {pane === "quotes" && (
            <WorkbenchQuotes bench={bench} prospect={prospect} onChange={onChange} />
          )}
          {pane === "documents" && <WorkbenchDocs bench={bench} onChange={onChange} />}
          {pane === "prebind" && (
            <WorkbenchPrebind
              bench={bench}
              prospect={prospect}
              opportunity={opportunity}
              onChange={onChange}
            />
          )}

          <section className="wb-section">
            <header className="wb-section-head">
              <h3>Account notes</h3>
            </header>
            <label className="wb-field">
              <span className="wb-label">Notes — kept on the account, shared with the pipeline</span>
              <textarea
                rows={4}
                value={opportunity.notes}
                placeholder="What was said, what is owed next"
                onChange={(e) => onOpportunityChange({ notes: e.target.value })}
              />
            </label>
          </section>
        </div>

        <footer className="wb-foot">
          <span className="wb-saved">Changes save as you make them · last saved {bench.updatedAt}</span>
          <span className="wb-foot-summary">{summaryLine(counts)}</span>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </aside>

      {composing && (
        <RequestComposer
          bench={bench}
          prospect={prospect}
          ownerName={ownerName}
          onMarkRequested={(ids) => onChange({ ...bench, items: markRequested(bench.items, ids) })}
          onClose={() => setComposing(false)}
        />
      )}
    </>
  );
}
