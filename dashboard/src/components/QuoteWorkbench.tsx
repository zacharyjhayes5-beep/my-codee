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
  type WorkbenchPane,
} from "../lib/workbench";
import { WorkbenchOverview } from "./WorkbenchOverview";
import { WorkbenchChecklist } from "./WorkbenchChecklist";
import { WorkbenchQuotes } from "./WorkbenchQuotes";
import { WorkbenchDocs } from "./WorkbenchDocs";
import { WorkbenchPrebind } from "./WorkbenchPrebind";
import { RequestComposer } from "./RequestComposer";

const PANES: { id: WorkbenchPane; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "checklist", label: "Missing information" },
  { id: "quotes", label: "Quotes" },
  { id: "documents", label: "Documents" },
  { id: "prebind", label: "Pre-bind" },
];

/**
 * The next actions that actually recur on a quote, offered as one press.
 *
 * Deliberately short. A long menu of canned actions is slower to read than
 * typing the thing, and the field stays free text — these are a shortcut, not
 * a vocabulary.
 */
const NEXT_ACTION_PRESETS = [
  "Request missing information",
  "Follow up on the request",
  "Build the quote",
  "Present the proposal",
  "Follow up on the proposal",
  "Prepare for pre-bind review",
];

/** ISO yyyy-mm-dd, `days` from today, in local time. */
function dayFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DATE_SHORTCUTS: { label: string; days: number }[] = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
];

interface QuoteWorkbenchProps {
  bench: Workbench;
  prospect: Prospect | undefined;
  opportunity: Opportunity;
  ownerName: string;
  /**
   * Saves the workbench, and any account change made in the same gesture.
   * Both travel together so the two records cannot be written twice in one
   * tick from the same stale array.
   */
  onChange: (bench: Workbench, accountPatch?: Partial<Opportunity>) => void;
  /**
   * Writes to the account itself — stage, next action, notes and lines. The
   * workbench never keeps its own copy of these, which is what stops Operator
   * showing one answer and this screen another.
   */
  onOpportunityChange: (patch: Partial<Opportunity>) => void;
  /** Fixing a phone number mid-quote should not mean leaving the workbench. */
  onProspectChange: (patch: Partial<Prospect>) => void;
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
  onProspectChange,
  onClose,
}: QuoteWorkbenchProps) {
  const [pane, setPane] = useState<WorkbenchPane>("overview");
  const [composing, setComposing] = useState(false);
  const [editingContact, setEditingContact] = useState(false);

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
    onChange(syncLines(bench, next), {
      lines: opportunityLinesFrom(next, opportunity.lines),
    });
  }

  const blockerCount =
    (outstanding.length > 0 ? 1 : 0) +
    (prebind.selected.length === 0 ? 1 : 0) +
    (prebind.outstanding.length > 0 ? 1 : 0);

  const contactLine =
    [prospect?.phone, prospect?.email, prospect?.area].filter(Boolean).join(" · ") ||
    "No contact details yet";

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

          <div className="wb-contact-row">
            <p className="wb-contact">{contactLine}</p>
            {prospect && (
              <button
                type="button"
                className="link-btn"
                aria-expanded={editingContact}
                onClick={() => setEditingContact((v) => !v)}
              >
                {editingContact ? "Done" : "Edit contact"}
              </button>
            )}
          </div>

          {editingContact && prospect && (
            <div className="wb-grid wb-contact-edit">
              <label className="wb-field">
                <span className="wb-label">Phone</span>
                <input
                  value={prospect.phone}
                  onChange={(e) => onProspectChange({ phone: e.target.value })}
                />
              </label>
              <label className="wb-field">
                <span className="wb-label">Email</span>
                <input
                  value={prospect.email}
                  onChange={(e) => onProspectChange({ email: e.target.value })}
                />
              </label>
            </div>
          )}

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

          <details className="wb-presets">
            <summary>Quick set</summary>
            <div className="wb-preset-row">
              {NEXT_ACTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="wb-preset"
                  onClick={() => onOpportunityChange({ nextAction: preset })}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="wb-preset-row">
              {DATE_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  className="wb-preset"
                  onClick={() => onOpportunityChange({ nextActionDate: dayFromNow(shortcut.days) })}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </details>

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
                {p.id === "overview" && blockerCount > 0 && (
                  <span className="wb-pane-count">{blockerCount}</span>
                )}
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
          {pane === "overview" && (
            <WorkbenchOverview
              bench={bench}
              prospect={prospect}
              opportunity={opportunity}
              onGo={setPane}
              onOpenRequest={() => setComposing(true)}
            />
          )}
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

          {pane !== "overview" && (
            <section className="wb-section">
              <header className="wb-section-head">
                <h3>Account notes</h3>
              </header>
              <label className="wb-field">
                <span className="wb-label">
                  Notes — kept on the account, shared with the pipeline
                </span>
                <textarea
                  rows={4}
                  value={opportunity.notes}
                  placeholder="What was said, what is owed next"
                  onChange={(e) => onOpportunityChange({ notes: e.target.value })}
                />
              </label>
            </section>
          )}
        </div>

        <footer className="wb-foot">
          <span className="wb-saved">
            Changes save as you make them · last saved {bench.updatedAt}
          </span>
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
