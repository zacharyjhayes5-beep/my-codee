import { useState } from "react";
import type { Call } from "../types";
import { outcomeClass } from "../lib/defaultData";
import { attemptCounts, formatCallMoment } from "../lib/calls";

interface CallHistoryProps {
  /** Already filtered to one household and sorted newest first. */
  calls: Call[];
  onEdit: (call: Call) => void;
  onDelete: (callId: string) => void;
}

export function CallHistory({ calls, onEdit, onDelete }: CallHistoryProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const counts = attemptCounts(calls);

  if (calls.length === 0) {
    return <p className="empty">No calls logged yet.</p>;
  }

  return (
    <div className="call-history">
      <div className="call-history-head">
        <span className="call-count">
          {calls.length} call{calls.length === 1 ? "" : "s"}
        </span>
        <span className="attempt-tally">
          {counts.attempts} unanswered · {counts.voicemails} voicemail
          {counts.voicemails === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="call-list">
        {calls.map((call) => (
          <li className="call-row" key={call.id}>
            <div className="call-row-top">
              <span className={`outcome-chip ${outcomeClass[call.outcome]}`}>{call.outcome}</span>
              <span className="call-when">{formatCallMoment(call.at)}</span>
              <span className="call-direction">{call.direction}</span>
            </div>

            {call.summary && <p className="call-summary">{call.summary}</p>}
            {call.notes && <p className="call-notes">{call.notes}</p>}

            {call.sourceRef && (
              <span className="call-source">Granola: {call.sourceRef.title}</span>
            )}

            <div className="call-row-actions">
              {confirmingId === call.id ? (
                <>
                  <span className="call-confirm">Delete this call?</span>
                  <button
                    className="danger-btn"
                    onClick={() => {
                      onDelete(call.id);
                      setConfirmingId(null);
                    }}
                  >
                    Delete
                  </button>
                  <button className="ghost-btn" onClick={() => setConfirmingId(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button className="link-btn" onClick={() => onEdit(call)}>
                    Edit
                  </button>
                  <button className="link-btn danger" onClick={() => setConfirmingId(call.id)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
