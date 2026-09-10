import { useState } from "react";
import type { ChecklistItem, ChecklistStatus, Workbench, WorkbenchLine } from "../types";
import {
  LINE_LABELS,
  STATUS_LABELS,
  addCustomItem,
  countStatuses,
  docById,
  patchItem,
  removeItem,
  summaryLine,
  visibleItems,
} from "../lib/workbench";

const STATUSES: ChecklistStatus[] = ["needed", "requested", "received", "verified", "na"];

interface ChecklistProps {
  bench: Workbench;
  onChange: (bench: Workbench) => void;
  onOpenRequest: () => void;
}

/**
 * What is missing, by line.
 *
 * The starter prompts are the agency's own organising list, not a carrier's
 * requirements, and the panel says so once rather than on every row. Every
 * item can be renamed, restatused, annotated, linked to a document and
 * deleted; new ones can be added anywhere.
 *
 * The one thing the panel refuses to do is infer. Linking a document sets a
 * reference and nothing else — the status stays exactly where the agent put
 * it, because a file arriving is not the same as somebody having read it.
 */
export function WorkbenchChecklist({ bench, onChange, onOpenRequest }: ChecklistProps) {
  const [draft, setDraft] = useState("");
  const [draftLine, setDraftLine] = useState<WorkbenchLine | "household">("household");
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = visibleItems(bench);
  const counts = countStatuses(bench.items);
  const outstanding = counts.needed + counts.requested;

  function setItems(items: ChecklistItem[]) {
    onChange({ ...bench, items });
  }

  function addDraft() {
    if (!draft.trim()) return;
    setItems(
      addCustomItem(bench.items, draft, draftLine === "household" ? null : draftLine),
    );
    setDraft("");
  }

  return (
    <section className="wb-section">
      <header className="wb-section-head">
        <div>
          <h3>Information checklist</h3>
          <p className="wb-summary-line">{summaryLine(counts)}</p>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={onOpenRequest}
          disabled={outstanding === 0}
          title={
            outstanding === 0
              ? "Nothing is outstanding, so there is nothing to ask for"
              : "Draft a message asking for what is still outstanding"
          }
        >
          Draft request
        </button>
      </header>

      <p className="wb-caveat">
        Starter prompts to organise the file. They are not underwriting rules and not a
        complete list of what any carrier requires — edit, add and remove freely.
      </p>

      {bench.items.length === 0 ? (
        <p className="empty">
          No items yet. Choose the lines above to load their starter prompts, or add
          something of your own below.
        </p>
      ) : (
        groups.map((group) => (
          <div className="wb-group" key={group.line ?? "household"}>
            <span className={`wb-group-head${group.selected ? "" : " is-dropped"}`}>
              {group.label}
            </span>

            <ul className="wb-items">
              {group.items.map((item) => {
                const open = expanded === item.id;
                const doc = docById(bench, item.docId);
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
                        {item.notes.trim() && <span className="wb-item-flag">note</span>}
                        {doc && <span className="wb-item-flag">doc</span>}
                        {item.requestedAt && (
                          <span className="wb-item-flag">asked {item.requestedAt}</span>
                        )}
                      </button>

                      <select
                        className={`wb-status wb-status-${item.status}`}
                        value={item.status}
                        aria-label={`Status of ${item.label}`}
                        onChange={(e) =>
                          setItems(
                            patchItem(bench.items, item.id, {
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
                              setItems(patchItem(bench.items, item.id, { label: e.target.value }))
                            }
                          />
                        </label>

                        <label className="wb-field">
                          <span className="wb-label">Notes</span>
                          <textarea
                            rows={2}
                            value={item.notes}
                            placeholder="What was said, what is still unclear"
                            onChange={(e) =>
                              setItems(patchItem(bench.items, item.id, { notes: e.target.value }))
                            }
                          />
                        </label>

                        <label className="wb-field">
                          <span className="wb-label">Supporting document</span>
                          <select
                            value={item.docId ?? ""}
                            onChange={(e) =>
                              setItems(
                                patchItem(bench.items, item.id, {
                                  docId: e.target.value || undefined,
                                }),
                              )
                            }
                          >
                            <option value="">— none —</option>
                            {bench.docs.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name || "Untitled document"}
                              </option>
                            ))}
                          </select>
                          <span className="wb-hint">
                            A linked document is evidence. It does not mark this verified —
                            that stays your call.
                          </span>
                        </label>

                        <div className="wb-item-actions">
                          <span className="wb-hint">Last changed {item.updatedAt}</span>
                          <button
                            type="button"
                            className="wb-remove"
                            onClick={() => {
                              setItems(removeItem(bench.items, item.id));
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
          </div>
        ))
      )}

      <div className="wb-add-row">
        <input
          value={draft}
          placeholder="Add an item of your own"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          aria-label="New checklist item"
        />
        <select
          value={draftLine}
          aria-label="Which line the new item belongs to"
          onChange={(e) => setDraftLine(e.target.value as WorkbenchLine | "household")}
        >
          <option value="household">Household</option>
          {bench.lines.map((l) => (
            <option key={l} value={l}>
              {LINE_LABELS[l]}
            </option>
          ))}
        </select>
        <button type="button" className="ghost-btn" onClick={addDraft} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </section>
  );
}
