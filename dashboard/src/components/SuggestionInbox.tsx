import { useRef, useState } from "react";
import type { Suggestion, Urgency } from "../types";
import { urgencyLevels } from "../lib/defaultData";
import type { SuggestionSource } from "../lib/suggest";

interface SuggestionInboxProps {
  suggestions: Suggestion[];
  /** Reads raw text into suggestions — the parent handles de-duping. */
  onImport: (items: { text: string; filename?: string }[], source?: SuggestionSource) => number;
  onUpdate: (id: string, patch: Partial<Suggestion>) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
}

const SOURCE_LABEL: Record<Suggestion["source"], string> = {
  obsidian: "Obsidian",
  gmail: "Gmail",
};

const READABLE = /\.(md|markdown|txt|text|eml)$/i;

export function SuggestionInbox({
  suggestions,
  onImport,
  onUpdate,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
}: SuggestionInboxProps) {
  const [pasted, setPasted] = useState("");
  const [pasteSource, setPasteSource] = useState<"auto" | SuggestionSource>("auto");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function report(added: number, scanned: number) {
    if (scanned === 0) {
      setMessage("Nothing readable in that — notes come in as .md or .txt, emails as .eml.");
    } else if (added === 0) {
      setMessage("Read it, but everything in there is already on your list or was turned down before.");
    } else {
      setMessage(`${added} suggestion${added === 1 ? "" : "s"} to look at.`);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter(
      (f) => READABLE.test(f.name) || f.type.startsWith("text/")
    );
    if (files.length === 0) {
      report(0, 0);
      return;
    }
    const items = await Promise.all(files.map(async (f) => ({ text: await f.text(), filename: f.name })));
    report(onImport(items), items.length);
  }

  function handlePaste() {
    if (!pasted.trim()) return;
    const source = pasteSource === "auto" ? undefined : pasteSource;
    report(onImport([{ text: pasted }], source), 1);
    setPasted("");
  }

  return (
    <section className="inbox">
      <div className="inbox-head">
        <div>
          <h2>Suggestions</h2>
          <p>
            Pulled out of Obsidian notes and Gmail messages. Nothing reaches the list until you say
            so.
          </p>
        </div>
        {suggestions.length > 0 && (
          <div className="inbox-actions">
            <span className="inbox-count">{suggestions.length} waiting</span>
            <button className="primary-btn" onClick={onApproveAll}>
              Approve all
            </button>
            <button className="ghost-btn" onClick={onRejectAll}>
              Reject all
            </button>
          </div>
        )}
      </div>

      {suggestions.length === 0 ? (
        <p className="empty">Nothing waiting. Drop a note or an email below to look for tasks.</p>
      ) : (
        <ul className="suggestion-list">
          {suggestions.map((s) => (
            <li className="suggestion-card" key={s.id}>
              <div className="suggestion-top">
                <span className={`src-chip src-${s.source}`}>{SOURCE_LABEL[s.source]}</span>
                <span className="suggestion-ref">{s.sourceRef}</span>
                <span className="suggestion-reason">{s.reason}</span>
              </div>

              <input
                className="suggestion-text"
                value={s.text}
                onChange={(e) => onUpdate(s.id, { text: e.target.value })}
                aria-label="Suggested task"
              />

              {s.detail && <p className="suggestion-detail">{s.detail}</p>}

              <div className="suggestion-foot">
                <label className="mini-field">
                  Urgency
                  <select
                    value={s.urgency}
                    onChange={(e) => onUpdate(s.id, { urgency: e.target.value as Urgency })}
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
                    value={s.dueDate ?? ""}
                    onChange={(e) => onUpdate(s.id, { dueDate: e.target.value || undefined })}
                  />
                </label>
                <div className="suggestion-buttons">
                  <button className="primary-btn" onClick={() => onApprove(s.id)}>
                    Approve
                  </button>
                  <button className="ghost-btn" onClick={() => onReject(s.id)}>
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
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
            .md and .txt from the vault, .eml from Gmail — as many at once as you like. Each one is
            read for open tasks and asks.
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
          <button className="primary-btn" onClick={handlePaste}>
            Look for tasks
          </button>
        </div>

        {message && <p className="inbox-message">{message}</p>}
      </details>
    </section>
  );
}
