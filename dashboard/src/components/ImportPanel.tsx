import { useRef, useState } from "react";
import type { LineId, Prospect, ProspectNote, Stage } from "../types";
import { lineOptions, prospectStages } from "../lib/defaultData";
import { nameKey, parseGranolaNote, type ParsedNote } from "../lib/granola";
import { blankProspect } from "../lib/prospectSchema";
import { newId, today } from "../lib/storage";

interface Draft {
  id: string;
  parsed: ParsedNote;
  name: string;
  area: string;
  phone: string;
  email: string;
  lines: LineId[];
  stage: Stage;
  matchId: string | null;
  mode: "create" | "append";
  showNote: boolean;
}

interface ImportPanelProps {
  prospects: Prospect[];
  ownerName: string;
  onOwnerNameChange: (name: string) => void;
  onCreate: (prospect: Prospect) => void;
  onAppend: (prospectId: string, note: ProspectNote, patch: Partial<Prospect>) => void;
}

function draftFromParsed(parsed: ParsedNote, prospects: Prospect[]): Draft {
  const key = nameKey(parsed.name);
  const match =
    (key && prospects.find((p) => nameKey(p.name) === key)) ||
    (parsed.email && prospects.find((p) => p.email.toLowerCase() === parsed.email.toLowerCase())) ||
    null;

  return {
    id: newId(),
    parsed,
    name: parsed.name,
    area: parsed.area,
    phone: parsed.phone,
    email: parsed.email,
    lines: parsed.lines,
    // A Granola note means the call already happened.
    stage: match ? match.stage : "Contacted",
    matchId: match ? match.id : null,
    mode: match ? "append" : "create",
    showNote: false,
  };
}

export function ImportPanel({
  prospects,
  ownerName,
  onOwnerNameChange,
  onCreate,
  onAppend,
}: ImportPanelProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function addParsed(items: { text: string; filename?: string }[]) {
    const parsed = items
      .filter((i) => i.text.trim())
      .map((i) =>
        parseGranolaNote(i.text, {
          filename: i.filename,
          ownerName,
          fallbackDate: today(),
        })
      );
    if (parsed.length === 0) {
      setError("That note looked empty — nothing to import.");
      return;
    }
    setError("");
    setDrafts((prev) => [...prev, ...parsed.map((p) => draftFromParsed(p, prospects))]);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const readable = files.filter((f) => /\.(md|markdown|txt|text)$/i.test(f.name) || f.type.startsWith("text/"));
    if (readable.length === 0) {
      setError("Granola exports as .md or .txt — those are the file types this reads.");
      return;
    }
    const items = await Promise.all(
      readable.map(async (f) => ({ text: await f.text(), filename: f.name }))
    );
    addParsed(items);
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function discard(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function commit(draft: Draft) {
    const note: ProspectNote = {
      id: newId(),
      date: draft.parsed.date,
      title: draft.parsed.title,
      body: draft.parsed.body,
      source: "granola",
    };

    if (draft.mode === "append" && draft.matchId) {
      // The parent merges these into whatever the profile holds right now, so
      // saving several notes at once can't clobber earlier ones.
      onAppend(draft.matchId, note, {
        stage: draft.stage,
        lines: draft.lines,
        area: draft.area,
        phone: draft.phone,
        email: draft.email,
      });
    } else {
      onCreate(
        blankProspect({
          name: draft.name.trim() || "Untitled prospect",
          stage: draft.stage,
          lines: draft.lines,
          area: draft.area,
          phone: draft.phone,
          email: draft.email,
          source: "granola",
          notes: [note],
          createdAt: draft.parsed.date,
          updatedAt: today(),
        }),
      );
    }
    discard(draft.id);
  }

  return (
    <section className="import-panel">
      <div className="import-head">
        <h3>Import Granola notes</h3>
        <label className="owner-field">
          Your name
          <input
            value={ownerName}
            onChange={(e) => onOwnerNameChange(e.target.value)}
            placeholder="Used to tell you apart from the prospect"
          />
        </label>
      </div>

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
        <strong>Drop Granola notes here</strong>
        <span>or click to pick files — .md or .txt, as many at once as you like</span>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".md,.markdown,.txt,text/plain,text/markdown"
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <details className="paste-block">
        <summary>Or paste a note instead</summary>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={6}
          placeholder="Paste the Granola note here…"
        />
        <button
          className="primary-btn"
          onClick={() => {
            addParsed([{ text: pasted }]);
            setPasted("");
          }}
        >
          Read note
        </button>
      </details>

      {error && <p className="import-error">{error}</p>}

      {drafts.length > 0 && (
        <div className="draft-list">
          <div className="draft-list-head">
            <h4>
              {drafts.length} note{drafts.length === 1 ? "" : "s"} ready — check what it picked up
            </h4>
            <div className="draft-actions">
              <button className="primary-btn" onClick={() => drafts.forEach(commit)}>
                Save all
              </button>
              <button className="ghost-btn" onClick={() => setDrafts([])}>
                Discard all
              </button>
            </div>
          </div>

          {drafts.map((draft) => (
            <div className="draft-card" key={draft.id}>
              {draft.matchId && (
                <div className="draft-match">
                  Looks like {prospects.find((p) => p.id === draft.matchId)?.name} — already on your
                  list.
                  <div className="mode-toggle">
                    <button
                      className={draft.mode === "append" ? "active" : ""}
                      onClick={() => updateDraft(draft.id, { mode: "append" })}
                    >
                      Add note to them
                    </button>
                    <button
                      className={draft.mode === "create" ? "active" : ""}
                      onClick={() => updateDraft(draft.id, { mode: "create" })}
                    >
                      Make a new profile
                    </button>
                  </div>
                </div>
              )}

              <div className="draft-fields">
                <label>
                  Name
                  <input
                    value={draft.name}
                    onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                    placeholder="Couldn't find a name — add one"
                    className={draft.name ? "" : "needs-input"}
                  />
                </label>
                <label>
                  Area
                  <input
                    value={draft.area}
                    onChange={(e) => updateDraft(draft.id, { area: e.target.value })}
                    placeholder="City or region"
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={draft.phone}
                    onChange={(e) => updateDraft(draft.id, { phone: e.target.value })}
                  />
                </label>
                <label>
                  Email
                  <input
                    value={draft.email}
                    onChange={(e) => updateDraft(draft.id, { email: e.target.value })}
                  />
                </label>
                <label>
                  Stage
                  <select
                    value={draft.stage}
                    onChange={(e) => updateDraft(draft.id, { stage: e.target.value as Stage })}
                  >
                    {prospectStages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="draft-lines">
                  <span className="field-label">Looking for</span>
                  <div className="chip-row">
                    {lineOptions.map((l) => {
                      const on = draft.lines.includes(l.id);
                      return (
                        <button
                          key={l.id}
                          className={`chip chip-${l.id}${on ? " on" : ""}`}
                          onClick={() =>
                            updateDraft(draft.id, {
                              lines: on
                                ? draft.lines.filter((x) => x !== l.id)
                                : [...draft.lines, l.id],
                            })
                          }
                        >
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="draft-foot">
                <button
                  className="link-btn"
                  onClick={() => updateDraft(draft.id, { showNote: !draft.showNote })}
                >
                  {draft.showNote ? "Hide" : "Show"} note · {draft.parsed.date}
                </button>
                <div className="draft-actions">
                  <button className="primary-btn" onClick={() => commit(draft)}>
                    {draft.mode === "append" ? "Add note" : "Save profile"}
                  </button>
                  <button className="ghost-btn" onClick={() => discard(draft.id)}>
                    Discard
                  </button>
                </div>
              </div>

              {draft.showNote && <pre className="note-body">{draft.parsed.body}</pre>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
