import { useState } from "react";
import type { Call, CallOutcome } from "../types";
import { callOutcomes } from "../lib/defaultData";
import { fromLocalInput, toLocalInput } from "../lib/calls";

interface CallLoggerProps {
  /** Shown so it is never ambiguous which household is being logged against. */
  householdName: string;
  call: Call;
  mode: "new" | "edit";
  onSave: (call: Call) => void;
  onCancel: () => void;
}

/**
 * The call form. Deliberately short — this gets filled in between dials, so
 * everything except the outcome is optional and the defaults are already
 * right for the common case: an outbound call, right now.
 */
export function CallLogger({ householdName, call, mode, onSave, onCancel }: CallLoggerProps) {
  const [draft, setDraft] = useState<Call>(call);
  const [sourceTitle, setSourceTitle] = useState(call.sourceRef?.title ?? "");

  function patch(next: Partial<Call>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function save() {
    const title = sourceTitle.trim();
    onSave({
      ...draft,
      summary: draft.summary.trim(),
      notes: draft.notes.trim(),
      // A pointer to the Granola note, never its contents.
      sourceRef: title ? { system: "granola", title } : null,
    });
  }

  return (
    <div className="call-logger">
      <div className="call-logger-head">
        <h4>{mode === "new" ? "Log a call" : "Edit call"}</h4>
        <span className="call-logger-who">{householdName || "This household"}</span>
      </div>

      <div className="call-form-grid">
        <label className="mini-field">
          When
          <input
            type="datetime-local"
            value={toLocalInput(draft.at)}
            onChange={(e) => patch({ at: fromLocalInput(e.target.value) || draft.at })}
          />
        </label>

        <label className="mini-field">
          Direction
          <select
            value={draft.direction}
            onChange={(e) => patch({ direction: e.target.value as Call["direction"] })}
          >
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </label>

        <label className="mini-field wide">
          Outcome <span className="required-mark">required</span>
          <select
            className="outcome-select"
            value={draft.outcome}
            onChange={(e) => patch({ outcome: e.target.value as CallOutcome })}
          >
            {callOutcomes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="mini-field wide">
          Summary
          <input
            value={draft.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            placeholder="One line — what happened"
          />
        </label>

        <label className="mini-field wide">
          Notes
          <textarea
            rows={3}
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Anything worth keeping"
          />
        </label>

        <label className="mini-field wide">
          Granola note reference
          <input
            value={sourceTitle}
            onChange={(e) => setSourceTitle(e.target.value)}
            placeholder="Note title — the transcript stays in Granola"
          />
        </label>
      </div>

      <div className="call-logger-foot">
        <button className="primary-btn" onClick={save}>
          {mode === "new" ? "Save call" : "Save changes"}
        </button>
        <button className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
