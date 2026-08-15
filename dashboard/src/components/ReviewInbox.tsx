import { useRef, useState } from "react";
import type { ProposedChange, Prospect, ReviewProposal, Urgency } from "../types";
import { urgencyLevels } from "../lib/defaultData";
import type { SuggestionSource } from "../lib/suggest";
import { describeValue } from "../lib/audit";
import { type Conflict, detectConflicts, summarize } from "../lib/reviews";

interface ReviewInboxProps {
  proposals: ReviewProposal[];
  prospects: Prospect[];
  onImport: (items: { text: string; filename?: string }[], source?: SuggestionSource) => number;
  onUpdate: (id: string, patch: Partial<ReviewProposal>) => void;
  onApprove: (proposal: ReviewProposal) => Conflict[];
  onReject: (proposal: ReviewProposal) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
}

const SOURCE_LABEL: Record<string, string> = {
  obsidian: "Obsidian",
  gmail: "Gmail",
  granola: "Granola",
  manual: "Manual",
};

const READABLE = /\.(md|markdown|txt|text|eml)$/i;

/**
 * The review queue. Every proposal shows exactly what it would change before
 * anything is applied, and nothing is applied until the Approve button on that
 * card is pressed.
 */
export function ReviewInbox({
  proposals,
  prospects,
  onImport,
  onUpdate,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
}: ReviewInboxProps) {
  const [pasted, setPasted] = useState("");
  const [pasteSource, setPasteSource] = useState<"auto" | SuggestionSource>("auto");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, Conflict[]>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  function report(added: number, scanned: number) {
    if (scanned === 0) {
      setMessage("Nothing readable in that — notes come in as .md or .txt, emails as .eml.");
    } else if (added === 0) {
      setMessage("Read it, but everything in there is already waiting or was turned down before.");
    } else {
      setMessage(`${added} proposal${added === 1 ? "" : "s"} to look at.`);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(
      (f) => READABLE.test(f.name) || f.type.startsWith("text/"),
    );
    if (files.length === 0) {
      report(0, 0);
      return;
    }
    const items = await Promise.all(files.map(async (f) => ({ text: await f.text(), filename: f.name })));
    report(onImport(items), items.length);
  }

  function approve(proposal: ReviewProposal) {
    const found = onApprove(proposal);
    if (found.length > 0) {
      setConflicts((prev) => ({ ...prev, [proposal.id]: found }));
      setOpenId(proposal.id);
    } else {
      setConflicts((prev) => {
        const next = { ...prev };
        delete next[proposal.id];
        return next;
      });
    }
  }

  function patchTask(proposal: ReviewProposal, index: number, patch: Record<string, unknown>) {
    const proposedTasks = proposal.proposedTasks.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onUpdate(proposal.id, { proposedTasks, status: "edited" });
  }

  function patchChange(proposal: ReviewProposal, index: number, to: string) {
    const changes: ProposedChange[] = proposal.changes.map((c, i) => (i === index ? { ...c, to } : c));
    onUpdate(proposal.id, { changes, status: "edited" });
  }

  return (
    <section className="inbox">
      <div className="inbox-head">
        <div>
          <h2>Review inbox</h2>
          <p>
            Proposed changes from notes and email. Nothing reaches a household until you
            approve it.
          </p>
        </div>
        {proposals.length > 0 && (
          <div className="inbox-actions">
            <span className="inbox-count">{proposals.length} waiting</span>
            <button className="primary-btn" onClick={onApproveAll}>
              Approve all
            </button>
            <button className="ghost-btn" onClick={onRejectAll}>
              Reject all
            </button>
          </div>
        )}
      </div>

      {proposals.length === 0 ? (
        <p className="empty">Nothing waiting. Drop a note or an email below to look for work.</p>
      ) : (
        <ul className="suggestion-list">
          {proposals.map((p) => {
            const household = prospects.find((x) => x.id === p.prospectId);
            const live = detectConflicts(p, household);
            const shown = conflicts[p.id] ?? [];
            const isOpen = openId === p.id;

            return (
              <li className={`suggestion-card${shown.length > 0 ? " has-conflict" : ""}`} key={p.id}>
                <div className="suggestion-top">
                  <span className={`src-chip src-${p.source}`}>
                    {SOURCE_LABEL[p.source] ?? p.source}
                  </span>
                  <span className="suggestion-ref">{p.sourceRef}</span>
                  <span className="suggestion-reason">{p.reason}</span>
                  {p.status === "edited" && <span className="edited-chip">edited</span>}
                </div>

                <div className="review-summary">
                  <strong>{household ? household.name : "No household matched"}</strong>
                  <span className="review-what">{summarize(p)}</span>
                  <button className="link-btn" onClick={() => setOpenId(isOpen ? null : p.id)}>
                    {isOpen ? "Hide detail" : "Inspect"}
                  </button>
                </div>

                {live.length > 0 && shown.length === 0 && (
                  <p className="conflict-warning">
                    This record has changed since the proposal was written. Inspect before
                    approving.
                  </p>
                )}

                {shown.length > 0 && (
                  <div className="conflict-block">
                    <strong>Not applied — the record has newer data.</strong>
                    <ul>
                      {shown.map((c) => (
                        <li key={c.field}>
                          <code>{c.field}</code>{" "}
                          {c.reason === "field-not-editable"
                            ? "cannot be set from a review."
                            : `expected ${describeValue(c.expected)}, found ${describeValue(c.actual)}.`}
                        </li>
                      ))}
                    </ul>
                    <span className="conflict-note">Nothing was changed.</span>
                  </div>
                )}

                {isOpen && (
                  <div className="review-detail">
                    {p.proposedCall && (
                      <div className="review-section">
                        <h5>Call to add</h5>
                        <p className="review-line">
                          {p.proposedCall.outcome ?? "No outcome"} ·{" "}
                          {p.proposedCall.summary || "no summary"}
                        </p>
                      </div>
                    )}

                    {p.changes.length > 0 && (
                      <div className="review-section">
                        <h5>Field changes</h5>
                        <table className="diff-table">
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Now</th>
                              <th>Proposed</th>
                              <th>Why</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.changes.map((c, i) => (
                              <tr key={c.field}>
                                <td>{c.field}</td>
                                <td className="diff-from">{describeValue(c.from)}</td>
                                <td>
                                  <input
                                    className="diff-input"
                                    value={String(c.to ?? "")}
                                    onChange={(e) => patchChange(p, i, e.target.value)}
                                  />
                                </td>
                                <td className="diff-why">{c.rationale ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {p.proposedTasks.length > 0 && (
                      <div className="review-section">
                        <h5>Follow-ups to create</h5>
                        {p.proposedTasks.map((t, i) => (
                          <div className="proposed-task" key={i}>
                            <input
                              className="suggestion-text"
                              value={t.text ?? ""}
                              onChange={(e) => patchTask(p, i, { text: e.target.value })}
                              aria-label="Proposed task"
                            />
                            <div className="suggestion-foot">
                              <label className="mini-field">
                                Urgency
                                <select
                                  value={t.urgency ?? "soon"}
                                  onChange={(e) =>
                                    patchTask(p, i, { urgency: e.target.value as Urgency })
                                  }
                                >
                                  {urgencyLevels.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="mini-field">
                                Due
                                <input
                                  type="date"
                                  value={t.dueDate ?? ""}
                                  onChange={(e) =>
                                    patchTask(p, i, { dueDate: e.target.value || undefined })
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="suggestion-buttons">
                  <button className="primary-btn" onClick={() => approve(p)}>
                    Approve
                  </button>
                  <button className="ghost-btn" onClick={() => onReject(p)}>
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="inbox-import">
        <summary>Pull in notes and email</summary>

        <div
          className={`drop-zone${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        >
          <strong>Drop Obsidian notes or saved emails here</strong>
          <span>
            .md and .txt from the vault, .eml from Gmail. Each one is read for open tasks
            and asks.
          </span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".md,.markdown,.txt,.text,.eml,text/plain,text/markdown,message/rfc822"
            hidden
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="paste-block">
          <div className="paste-head">
            <span>Or paste the text</span>
            <div className="mode-toggle">
              {(["auto", "obsidian", "gmail"] as const).map((mode) => (
                <button
                  key={mode}
                  className={pasteSource === mode ? "active" : ""}
                  onClick={() => setPasteSource(mode)}
                >
                  {mode === "auto" ? "Auto" : SOURCE_LABEL[mode]}
                </button>
              ))}
            </div>
          </div>
          <textarea
            rows={5}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste a note from Obsidian, or an email straight out of Gmail…"
          />
          <button
            className="primary-btn"
            onClick={() => {
              if (!pasted.trim()) return;
              report(onImport([{ text: pasted }], pasteSource === "auto" ? undefined : pasteSource), 1);
              setPasted("");
            }}
          >
            Look for work
          </button>
        </div>

        {message && <p className="inbox-message">{message}</p>}
      </details>
    </section>
  );
}
