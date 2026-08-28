import { useState, type FormEvent } from "react";
import type { Meeting } from "../types";
import {
  dateLabel,
  dayName,
  draftIsUsable,
  emptyMeetingDraft,
  isPast,
  meetingFromDraft,
  type MeetingDraft,
} from "../lib/meetings";

interface MeetingsPanelProps {
  kicker: string;
  meetings: Meeting[];
  today: string;
  emptyText: string;
  onAdd: (meeting: Meeting) => void;
  onRemove: (id: string) => void;
}

/**
 * One week's meetings, entered by hand.
 *
 * Deliberately the same shape as the to-do list and the queue beside it —
 * a kicker, a rule, a count, rows, and a row of fields at the foot. These
 * are the first thing on the screen because they are the first thing that
 * matters, and looking like the panels either side of them is what keeps
 * the screen readable rather than making them shout.
 */
export function MeetingsPanel({
  kicker,
  meetings,
  today,
  emptyText,
  onAdd,
  onRemove,
}: MeetingsPanelProps) {
  const [draft, setDraft] = useState<MeetingDraft>(emptyMeetingDraft);
  const [adding, setAdding] = useState(false);

  function patch(field: keyof MeetingDraft, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draftIsUsable(draft)) return;
    onAdd(meetingFromDraft(draft));
    setDraft(emptyMeetingDraft());
    setAdding(false);
  }

  return (
    <div className="mtg-panel">
      <div className="op-section-head">
        <span className="kicker">{kicker}</span>
        <span className="op-rule" aria-hidden="true" />
        <span className="op-count">
          {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}
        </span>
      </div>

      <ul className="mtg-list">
        {meetings.length === 0 && <li className="op-empty">{emptyText}</li>}
        {meetings.map((m) => (
          <li key={m.id} className={`mtg-row${isPast(m, today) ? " is-past" : ""}`}>
            <span className="mtg-when">
              {/* The day is read off the date, so the two can never disagree. */}
              <span className="mtg-day">{dayName(m.date) || "—"}</span>
              <span className="mtg-date">{dateLabel(m.date)}</span>
            </span>
            <span className="mtg-body">
              <span className="mtg-name">{m.name}</span>
              <span className="mtg-meta">
                {[m.time, m.place].filter(Boolean).join(" · ") || "No time or place yet"}
              </span>
            </span>
            <button
              type="button"
              className="mtg-remove"
              onClick={() => onRemove(m.id)}
              aria-label={`Remove the meeting with ${m.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form className="mtg-add" onSubmit={submit}>
          <input
            type="text"
            className="op-field"
            value={draft.name}
            placeholder="Who it's with"
            aria-label="Who the meeting is with"
            autoFocus
            onChange={(e) => patch("name", e.target.value)}
          />
          <div className="mtg-add-row">
            <input
              type="date"
              className="op-field"
              value={draft.date}
              aria-label="Date"
              onChange={(e) => patch("date", e.target.value)}
            />
            <input
              type="text"
              className="op-field"
              value={draft.time}
              placeholder="Time"
              aria-label="Time"
              onChange={(e) => patch("time", e.target.value)}
            />
          </div>
          <input
            type="text"
            className="op-field"
            value={draft.place}
            placeholder="Place"
            aria-label="Place"
            onChange={(e) => patch("place", e.target.value)}
          />
          <div className="mtg-add-actions">
            <button type="submit" className="op-btn" disabled={!draftIsUsable(draft)}>
              Add
            </button>
            <button
              type="button"
              className="camp-clear"
              onClick={() => {
                setDraft(emptyMeetingDraft());
                setAdding(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="mtg-open-add" onClick={() => setAdding(true)}>
          + Add a meeting
        </button>
      )}
    </div>
  );
}
