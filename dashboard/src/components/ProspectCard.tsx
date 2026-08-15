import { useState } from "react";
import { format } from "date-fns";
import type { Call, LineId, Prospect, Stage } from "../types";
import { lineOptions, prospectStages, stageClass } from "../lib/defaultData";
import { blankCall } from "../lib/calls";
import { newId, today } from "../lib/storage";
import { CallHistory } from "./CallHistory";
import { CallLogger } from "./CallLogger";

interface ProspectCardProps {
  prospect: Prospect;
  /** This household's calls, newest first. */
  calls: Call[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Prospect>) => void;
  onRemove: () => void;
  onSaveCall: (call: Call) => void;
  onDeleteCall: (callId: string) => void;
}

function formatDay(iso: string) {
  try {
    return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function ProspectCard({
  prospect,
  calls,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onSaveCall,
  onDeleteCall,
}: ProspectCardProps) {
  const [newNote, setNewNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  /** The call being written or corrected — null when the form is closed. */
  const [callDraft, setCallDraft] = useState<{ call: Call; mode: "new" | "edit" } | null>(null);

  function startCall() {
    setCallDraft({ call: blankCall(prospect.id), mode: "new" });
  }

  function saveCall(call: Call) {
    onSaveCall(call);
    setCallDraft(null);
  }

  const notes = [...prospect.notes].sort((a, b) => b.date.localeCompare(a.date));
  const lastTouch = notes[0]?.date ?? prospect.updatedAt;

  function toggleLine(id: LineId) {
    const on = prospect.lines.includes(id);
    onChange({ lines: on ? prospect.lines.filter((l) => l !== id) : [...prospect.lines, id] });
  }

  function addNote() {
    if (!newNote.trim()) return;
    onChange({
      notes: [
        ...prospect.notes,
        {
          id: newId(),
          date: today(),
          title: "Manual note",
          body: newNote.trim(),
          source: "manual" as const,
        },
      ],
    });
    setNewNote("");
  }

  return (
    <article className={`prospect-card${expanded ? " expanded" : ""}`}>
      <header className="prospect-head">
        <input
          className="prospect-name"
          value={prospect.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Prospect name"
        />
        <select
          className={`status-select ${stageClass[prospect.stage]}`}
          value={prospect.stage}
          onChange={(e) => onChange({ stage: e.target.value as Stage })}
          aria-label="Stage"
        >
          {prospectStages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </header>

      <div className="chip-row">
        {lineOptions.map((l) => {
          const on = prospect.lines.includes(l.id);
          return (
            <button
              key={l.id}
              className={`chip chip-${l.id}${on ? " on" : ""}`}
              onClick={() => toggleLine(l.id)}
              aria-pressed={on}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      <div className="prospect-meta">
        <label className="inline-field">
          <span>Area</span>
          <input
            value={prospect.area}
            onChange={(e) => onChange({ area: e.target.value })}
            placeholder="City or region"
          />
        </label>
        <label className="inline-field">
          <span>Next step</span>
          <input
            value={prospect.nextAction}
            onChange={(e) => onChange({ nextAction: e.target.value })}
            placeholder="e.g. send home + auto quote"
          />
        </label>
      </div>

      <footer className="prospect-foot">
        <span className="muted-note">
          {calls.length > 0
            ? `${calls.length} call${calls.length === 1 ? "" : "s"} · ${notes.length} note${notes.length === 1 ? "" : "s"}`
            : `${notes.length} note${notes.length === 1 ? "" : "s"} · last ${formatDay(lastTouch)}`}
        </span>
        <div className="prospect-foot-actions">
          <button
            className="primary-btn log-call-btn"
            onClick={() => {
              if (!expanded) onToggle();
              startCall();
            }}
          >
            Log call
          </button>
          <button className="link-btn" onClick={onToggle}>
            {expanded ? "Close" : "Open profile"}
          </button>
        </div>
      </footer>

      {expanded && (
        <div className="prospect-detail">
          <div className="prospect-meta">
            <label className="inline-field">
              <span>Phone</span>
              <input value={prospect.phone} onChange={(e) => onChange({ phone: e.target.value })} />
            </label>
            <label className="inline-field">
              <span>Email</span>
              <input value={prospect.email} onChange={(e) => onChange({ email: e.target.value })} />
            </label>
          </div>

          <h4>Calls</h4>
          {callDraft ? (
            <CallLogger
              householdName={prospect.name}
              call={callDraft.call}
              mode={callDraft.mode}
              onSave={saveCall}
              onCancel={() => setCallDraft(null)}
            />
          ) : (
            <button className="ghost-btn add-call-btn" onClick={startCall}>
              Log a call
            </button>
          )}

          <CallHistory
            calls={calls}
            onEdit={(call) => setCallDraft({ call, mode: "edit" })}
            onDelete={onDeleteCall}
          />

          <h4>Notes</h4>
          {notes.length === 0 && <p className="empty">No notes yet.</p>}
          {notes.map((note) => (
            <div className="note-block" key={note.id}>
              <div className="note-head">
                <span>
                  <strong>{note.title}</strong> · {formatDay(note.date)}
                  {note.source === "granola" && <span className="source-tag">Granola</span>}
                </span>
                <button
                  className="remove-btn"
                  aria-label="Remove note"
                  onClick={() => onChange({ notes: prospect.notes.filter((n) => n.id !== note.id) })}
                >
                  ×
                </button>
              </div>
              <pre className="note-body">{note.body}</pre>
            </div>
          ))}

          <div className="add-note">
            <textarea
              rows={3}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a quick note…"
            />
            <button className="primary-btn" onClick={addNote}>
              Add note
            </button>
          </div>

          <div className="prospect-danger">
            {confirmRemove ? (
              <>
                <span>Delete {prospect.name || "this profile"} and all notes?</span>
                <button className="danger-btn" onClick={onRemove}>
                  Delete
                </button>
                <button className="ghost-btn" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="link-btn danger" onClick={() => setConfirmRemove(true)}>
                Delete profile
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
