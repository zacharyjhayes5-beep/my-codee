import { useState } from "react";
import { format } from "date-fns";
import type { LineId, Prospect, ProspectStatus } from "../types";
import { lineOptions, prospectStatuses, statusClass } from "../lib/defaultData";
import { newId, today } from "../lib/storage";

interface ProspectCardProps {
  prospect: Prospect;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Prospect>) => void;
  onRemove: () => void;
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
  expanded,
  onToggle,
  onChange,
  onRemove,
}: ProspectCardProps) {
  const [newNote, setNewNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

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
          className={`status-select ${statusClass[prospect.status]}`}
          value={prospect.status}
          onChange={(e) => onChange({ status: e.target.value as ProspectStatus })}
          aria-label="Status"
        >
          {prospectStatuses.map((s) => (
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
            value={prospect.nextStep}
            onChange={(e) => onChange({ nextStep: e.target.value })}
            placeholder="e.g. send home + auto quote"
          />
        </label>
      </div>

      <footer className="prospect-foot">
        <span className="muted-note">
          {notes.length} note{notes.length === 1 ? "" : "s"} · last {formatDay(lastTouch)}
        </span>
        <button className="link-btn" onClick={onToggle}>
          {expanded ? "Close" : "Open profile"}
        </button>
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

          <h4>Call notes</h4>
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
