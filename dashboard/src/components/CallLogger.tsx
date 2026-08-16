import { useState } from "react";
import type { Call, CallOutcome, NextActionKind, Prospect } from "../types";
import { VALUABLE_OUTCOMES, callOutcomes, nextActionKinds } from "../lib/defaultData";
import { attemptCounts, fromLocalInput, toLocalInput } from "../lib/calls";
import { RULE_CONSTANTS, quoteReadiness } from "../lib/rules";

interface CallLoggerProps {
  /** Shown so it is never ambiguous which household is being logged against. */
  householdName: string;
  prospect: Prospect;
  /** This household's existing calls — used only to show where the caps stand. */
  priorCalls: Call[];
  call: Call;
  mode: "new" | "edit";
  onSave: (call: Call, conversionScore: number | null) => void;
  onCancel: () => void;
}

/**
 * The call form. Short by design — this gets filled in between dials, so
 * everything except the outcome is optional and the defaults are already
 * right for the common case: an outbound call, right now.
 *
 * Two outcomes ask for one more thing before they can be saved, because the
 * rule they trigger cannot produce a sensible follow-up without it.
 */
export function CallLogger({
  householdName,
  prospect,
  priorCalls,
  call,
  mode,
  onSave,
  onCancel,
}: CallLoggerProps) {
  const [draft, setDraft] = useState<Call>(call);
  const [sourceTitle, setSourceTitle] = useState(call.sourceRef?.title ?? "");
  const [score, setScore] = useState<string>("");

  function patch(next: Partial<Call>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  // The three valuable outcomes may not be logged without saying what happens
  // next and when — that is the whole point of logging them.
  const needsNextAction = VALUABLE_OUTCOMES.includes(draft.outcome);
  const needsAppointment = draft.outcome === "Insurance Review Scheduled";

  const missingNextAction = needsNextAction && !(draft.nextAction ?? "").trim();
  const missingNextDate = needsNextAction && !(draft.nextActionAt ?? "").trim();
  const missingAppointment = needsAppointment && !(draft.appointmentAt ?? "").trim();
  const blocked = missingNextAction || missingNextDate || missingAppointment;

  // Counts exclude the call being edited so an edit doesn't double-count itself.
  const others = priorCalls.filter((c) => c.id !== draft.id);
  const counts = attemptCounts(others);
  const voicemailCapUsed = counts.voicemails >= RULE_CONSTANTS.maxVoicemails;
  const voicemailCapHit = draft.outcome === "No Answer — Voicemail" && voicemailCapUsed;
  const readiness = quoteReadiness(prospect);

  function save() {
    if (blocked) return;
    const title = sourceTitle.trim();
    const parsed = Number(score);
    const validScore = score.trim() && parsed >= 1 && parsed <= 10 ? parsed : null;

    onSave(
      {
        ...draft,
        summary: draft.summary.trim(),
        notes: draft.notes.trim(),
        nextAction: needsNextAction ? (draft.nextAction ?? "").trim() : undefined,
        nextActionKind: needsNextAction ? draft.nextActionKind : undefined,
        nextActionAt: needsNextAction ? draft.nextActionAt : undefined,
        appointmentAt: needsAppointment ? draft.appointmentAt : undefined,
        // A pointer to the Granola note, never its contents.
        sourceRef: title ? { system: "granola", title } : null,
      },
      validScore,
    );
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
                {/* Once three messages are left the rule says stop offering a
                    fourth. It stays selectable so a call that really happened
                    can still be recorded — it is just no longer suggested. */}
                {o === "No Answer — Voicemail" && voicemailCapUsed ? `${o} — cap reached` : o}
              </option>
            ))}
          </select>
        </label>

        {needsNextAction && (
          <>
            <label className="mini-field">
              What happens next <span className="required-mark">required</span>
              <select
                value={draft.nextActionKind ?? ""}
                onChange={(e) => {
                  const kind = e.target.value as NextActionKind;
                  patch({
                    nextActionKind: kind,
                    // Pre-fill the wording but leave it editable.
                    nextAction: draft.nextAction?.trim() ? draft.nextAction : kind,
                  });
                }}
              >
                <option value="">Choose…</option>
                {nextActionKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="mini-field">
              Due <span className="required-mark">required</span>
              <input
                type="date"
                className={missingNextDate ? "needs-input" : ""}
                value={draft.nextActionAt ?? ""}
                onChange={(e) => patch({ nextActionAt: e.target.value })}
              />
            </label>
            <label className="mini-field wide">
              Next action <span className="required-mark">required</span>
              <input
                className={missingNextAction ? "needs-input" : ""}
                value={draft.nextAction ?? ""}
                onChange={(e) => patch({ nextAction: e.target.value })}
                placeholder="e.g. send home + auto quote"
              />
            </label>
          </>
        )}

        {needsAppointment && (
          <label className="mini-field wide">
            Review date <span className="required-mark">required</span>
            <input
              type="datetime-local"
              className={missingAppointment ? "needs-input" : ""}
              value={draft.appointmentAt ? toLocalInput(draft.appointmentAt) : ""}
              onChange={(e) => {
                const at = fromLocalInput(e.target.value);
                // For a booked review the next action *is* the review and the
                // date *is* the appointment. Asking for all three separately
                // is the same question three times, so these fill themselves —
                // still editable if the real next step is something else.
                patch({
                  appointmentAt: at,
                  nextActionKind: draft.nextActionKind ?? "Schedule review",
                  nextAction: draft.nextAction?.trim() ? draft.nextAction : "Insurance review",
                  nextActionAt: draft.nextActionAt?.trim() ? draft.nextActionAt : at.slice(0, 10),
                });
              }}
            />
          </label>
        )}

        {needsNextAction && (
          <label className="mini-field">
            Conversion score <span className="optional-mark">optional, 1–10</span>
            <input
              type="number"
              min={1}
              max={10}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="—"
            />
          </label>
        )}

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

      {voicemailCapHit && (
        <p className="rule-hint warn">
          {counts.voicemails} voicemails already left. The rule allows{" "}
          {RULE_CONSTANTS.maxVoicemails} — keep dialling, but stop leaving messages.
        </p>
      )}

      {draft.outcome === "Somewhat Interested" && !readiness.ready && (
        <p className="rule-hint">
          Quote details still missing: {readiness.missing.join(", ")}. This will go to
          Qualifying rather than Quoting.
        </p>
      )}

      {counts.attempts >= RULE_CONSTANTS.maxAttempts - 1 && (
        <p className="rule-hint warn">
          {counts.attempts} of {RULE_CONSTANTS.maxAttempts} unanswered attempts used. One more
          closes this household as unreachable.
        </p>
      )}

      <div className="call-logger-foot">
        <button className="primary-btn" onClick={save} disabled={blocked}>
          {mode === "new" ? "Save call" : "Save changes"}
        </button>
        <button className="ghost-btn" onClick={onCancel}>
          Cancel
        </button>
        {blocked && (
          <span className="blocked-why">
            {missingAppointment
              ? "Enter the review date first"
              : missingNextAction
                ? "Say what happens next first"
                : "Give the next action a date"}
          </span>
        )}
      </div>
    </div>
  );
}
