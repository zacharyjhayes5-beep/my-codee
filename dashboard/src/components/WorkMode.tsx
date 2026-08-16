import { useEffect, useMemo, useState } from "react";
import type { Call, Opportunity, Prospect, Task } from "../types";
import { attemptCounts, blankCall, callsFor } from "../lib/calls";
import { temperatureClass, temperatureOf } from "../lib/opportunities";
import { RULE_CONSTANTS } from "../lib/rules";
import { buildQueue, nextCall, queueStats, type QueueEntry } from "../lib/queue";
import { today } from "../lib/storage";
import { CallLogger } from "./CallLogger";

interface WorkModeProps {
  prospects: Prospect[];
  calls: Call[];
  tasks: Task[];
  opportunities: Opportunity[];
  onSaveCall: (call: Call, isNew: boolean) => void;
  onOpenProfile: (prospectId: string) => void;
  onClearReview: (prospectId: string, decision: "keep-calling" | "close") => void;
}

/**
 * Work mode. One household at a time, chosen by the queue rather than by
 * scrolling — the point is to remove the decision of who to call next, not to
 * present another list.
 */
export function WorkMode({
  prospects,
  calls,
  tasks,
  opportunities,
  onSaveCall,
  onOpenProfile,
  onClearReview,
}: WorkModeProps) {
  const now = today();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  /**
   * Saving a call does not update this component's props synchronously, so
   * advancing straight away would pick from the queue as it was *before* the
   * call landed — usually the same household again. Instead the request is
   * parked and taken up once the recomputed queue arrives.
   */
  const [advanceWhenReady, setAdvanceWhenReady] = useState(false);

  const input = useMemo(
    () => ({ prospects, calls, tasks, opportunities, today: now }),
    [prospects, calls, tasks, opportunities, now],
  );

  const queue = useMemo(() => buildQueue(input), [input]);
  const stats = useMemo(() => queueStats(queue), [queue]);

  const current: QueueEntry | null = currentId
    ? (queue.find((e) => e.prospect.id === currentId) ?? null)
    : null;

  const upNext = queue.filter((e) => e.eligibility.eligible).slice(0, 5);
  const forReview = queue.filter((e) => e.eligibility.reason === "attempts-exhausted");

  function advance() {
    const picked = nextCall(input);
    setCurrentId(picked?.prospect.id ?? null);
    setLogging(false);
  }

  useEffect(() => {
    if (!advanceWhenReady) return;
    setAdvanceWhenReady(false);
    advance();
    // `input` changing is exactly the signal that the save has landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, advanceWhenReady]);

  return (
    <div className="work-mode">
      <div className="work-head">
        <button className="next-call-btn" onClick={advance}>
          NEXT CALL
        </button>
        <div className="queue-stats">
          <span>
            <em>{stats.callable}</em> callable
          </span>
          <span>
            <em>{stats.held}</em> held back
          </span>
          {stats.needingReview > 0 && (
            <span className="needs-review-count">
              <em>{stats.needingReview}</em> need review
            </span>
          )}
        </div>
      </div>

      {current ? (
        <CallCard
          entry={current}
          calls={calls}
          logging={logging}
          onStartLog={() => setLogging(true)}
          onCancelLog={() => setLogging(false)}
          onSave={(call) => {
            onSaveCall(call, true);
            setLogging(false);
            setAdvanceWhenReady(true);
          }}
          onSkip={advance}
          onOpenProfile={() => onOpenProfile(current.prospect.id)}
        />
      ) : (
        <p className="empty work-empty">
          {prospects.length === 0
            ? "No households to call yet. Add one in Browse, then come back."
            : stats.callable === 0
              ? "Nobody is callable right now — everyone is scheduled, dormant, closed, or waiting on you."
              : "Press NEXT CALL to start."}
        </p>
      )}

      {forReview.length > 0 && (
        <section className="review-queue">
          <h4>Attempt cap reached — your call</h4>
          <p className="muted-note">
            {RULE_CONSTANTS.maxAttempts} attempts used and nobody picked up. Nothing was closed
            automatically.
          </p>
          <ul className="review-list">
            {forReview.map((entry) => (
              <li key={entry.prospect.id}>
                <span className="review-name">{entry.prospect.name}</span>
                <span className="muted-note">
                  {entry.attempts} attempts · {entry.voicemails} voicemails
                </span>
                <button
                  className="ghost-btn"
                  onClick={() => onClearReview(entry.prospect.id, "keep-calling")}
                >
                  Keep calling
                </button>
                <button
                  className="link-btn danger"
                  onClick={() => onClearReview(entry.prospect.id, "close")}
                >
                  Close as unreachable
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upNext.length > 0 && (
        <section className="up-next">
          <h4>Up next</h4>
          <ul className="up-next-list">
            {upNext.map((entry) => (
              <li key={entry.prospect.id}>
                <span className="tier-pill">{entry.tierLabel}</span>
                <button className="link-btn" onClick={() => setCurrentId(entry.prospect.id)}>
                  {entry.prospect.name || "Untitled household"}
                </button>
                <span className="muted-note">{entry.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CallCard({
  entry,
  calls,
  logging,
  onStartLog,
  onCancelLog,
  onSave,
  onSkip,
  onOpenProfile,
}: {
  entry: QueueEntry;
  calls: Call[];
  logging: boolean;
  onStartLog: () => void;
  onCancelLog: () => void;
  onSave: (call: Call) => void;
  onSkip: () => void;
  onOpenProfile: () => void;
}) {
  const { prospect } = entry;
  const mine = callsFor(calls, prospect.id);
  const counts = attemptCounts(mine);
  const reading = temperatureOf(prospect);
  const last = mine[0];

  return (
    <article className="call-card">
      <header className="call-card-head">
        <div>
          <h3>{prospect.name || "Untitled household"}</h3>
          <span className="call-card-where">
            {prospect.address.city || prospect.area || "No city on file"}
          </span>
        </div>
        <div className="call-card-badges">
          <span className={`temp-chip ${temperatureClass[reading.temperature]}`} title={reading.because}>
            {reading.temperature}
          </span>
          {prospect.priorityGrade && <span className="grade-chip">Grade {prospect.priorityGrade}</span>}
          {prospect.conversionScore !== null && (
            <span className="score-chip">{prospect.conversionScore}/10</span>
          )}
        </div>
      </header>

      <a className="call-number" href={`tel:${prospect.phone.replace(/\D/g, "")}`}>
        {prospect.phone || "No phone on file"}
      </a>

      {prospect.whyTheyFit && (
        <p className="why-fit">
          <span className="context-label">Why they fit</span>
          {prospect.whyTheyFit}
        </p>
      )}

      {prospect.importantNotes && (
        <p className="important-notes">
          <span className="context-label">Important</span>
          {prospect.importantNotes}
        </p>
      )}

      <div className="call-card-facts">
        <span>
          {counts.attempts} of {RULE_CONSTANTS.maxAttempts} attempts
        </span>
        <span>
          {counts.voicemails} of {RULE_CONSTANTS.maxVoicemails} voicemails
        </span>
        {last && <span>Last: {last.outcome}</span>}
        {prospect.nextAction && <span>Next: {prospect.nextAction}</span>}
      </div>

      {entry.eligibility.voicemailCapReached && (
        <p className="rule-hint warn">
          Three messages already left — keep dialling, but do not leave another.
        </p>
      )}

      {logging ? (
        <CallLogger
          householdName={prospect.name}
          prospect={prospect}
          priorCalls={mine}
          call={blankCall(prospect.id)}
          mode="new"
          onSave={(call) => onSave(call)}
          onCancel={onCancelLog}
        />
      ) : (
        <div className="call-card-actions">
          <button className="primary-btn" onClick={onStartLog}>
            Log the result
          </button>
          <button className="ghost-btn" onClick={onSkip}>
            Skip
          </button>
          <button className="link-btn" onClick={onOpenProfile}>
            Open full profile
          </button>
        </div>
      )}
    </article>
  );
}
