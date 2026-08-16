import { useRef, useState } from "react";
import type { PriorityGrade, Prospect, ReviewProposal } from "../types";
import { SCORE_MEANINGS } from "../lib/opportunities";
import {
  analyzeTranscript,
  matchProspect,
  proposalFromReview,
  type TranscriptReview,
} from "../lib/transcriptReview";

interface TranscriptPanelProps {
  prospects: Prospect[];
  ownerName: string;
  onOwnerNameChange: (name: string) => void;
  onQueueReview: (proposal: ReviewProposal) => void;
}

interface Draft {
  raw: string;
  review: TranscriptReview;
  prospectId: string | null;
  matched: boolean;
}

/**
 * Granola transcripts in, structured reviews out.
 *
 * The transcript is read here and stays here — what leaves is a proposal for
 * the review inbox. Nothing touches a household until that proposal is
 * approved, and every field below is editable first.
 */
export function TranscriptPanel({
  prospects,
  ownerName,
  onOwnerNameChange,
  onQueueReview,
}: TranscriptPanelProps) {
  const [pasted, setPasted] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function read(raw: string, filename?: string) {
    if (!raw.trim()) {
      setStatus("That looked empty.");
      return;
    }
    const review = analyzeTranscript(raw, { filename, ownerName });
    const match = matchProspect(raw, prospects, ownerName);
    setDraft({ raw, review, prospectId: match?.id ?? null, matched: Boolean(match) });
    setStatus("");
  }

  function patch(next: Partial<TranscriptReview>) {
    setDraft((prev) => (prev ? { ...prev, review: { ...prev.review, ...next } } : prev));
  }

  function send() {
    if (!draft?.prospectId) return;
    const prospect = prospects.find((p) => p.id === draft.prospectId);
    if (!prospect) return;

    onQueueReview(proposalFromReview(draft.review, prospect));
    setDraft(null);
    setPasted("");
    setStatus(`Review sent to the inbox for ${prospect.name}. Nothing has changed yet.`);
  }

  if (!draft) {
    return (
      <section className="intake-panel">
        <div className="import-head">
          <h3>Granola call review</h3>
          <label className="owner-field">
            Your name
            <input
              value={ownerName}
              onChange={(e) => onOwnerNameChange(e.target.value)}
              placeholder="Used to tell you apart from the prospect"
            />
          </label>
        </div>

        {prospects.length === 0 && (
          <p className="rule-hint">
            A call review attaches to a household, so add one above first — otherwise there
            is nothing for the review to belong to.
          </p>
        )}

        <div
          className="drop-zone"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void file.text().then((t) => read(t, file.name));
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        >
          <strong>Drop a Granola transcript here</strong>
          <span>
            It is read into a structured review you can edit. The transcript stays in
            Granola — only the review and a reference are kept.
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.txt,.text"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void file.text().then((t) => read(t, file.name));
            }}
          />
        </div>

        <details className="paste-block">
          <summary>Or paste the transcript</summary>
          <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button className="primary-btn" onClick={() => read(pasted)}>
            Read the call
          </button>
        </details>

        {status && <p className="inbox-message">{status}</p>}
      </section>
    );
  }

  const { review } = draft;
  const prospect = prospects.find((p) => p.id === draft.prospectId);

  return (
    <section className="intake-panel">
      <div className="import-head">
        <h3>Call review — {review.sourceRef}</h3>
        <button className="ghost-btn" onClick={() => setDraft(null)}>
          Discard
        </button>
      </div>

      <label className="mini-field wide">
        Which household was this?
        {draft.matched ? (
          <span className="match-note">Matched automatically — change it if that is wrong</span>
        ) : (
          <span className="match-note warn">No match found — pick the household before sending</span>
        )}
        <select
          value={draft.prospectId ?? ""}
          onChange={(e) => setDraft({ ...draft, prospectId: e.target.value || null })}
        >
          <option value="">Choose a household…</option>
          {prospects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || "Untitled"}
            </option>
          ))}
        </select>
      </label>

      <div className="review-fields">
        <div className="review-field">
          <h5>Information gathered</h5>
          {review.informationGathered.length === 0 ? (
            <p className="muted-note">Nothing specific picked up.</p>
          ) : (
            <ul className="fact-list">
              {review.informationGathered.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
          )}
        </div>

        <label className="mini-field wide">
          Prospect&rsquo;s attitude
          <input value={review.attitude} onChange={(e) => patch({ attitude: e.target.value })} />
        </label>

        <div className="review-two-up">
          <label className="mini-field">
            Quality
            <select
              value={review.quality}
              onChange={(e) => patch({ quality: e.target.value as PriorityGrade })}
            >
              <option value="">Ungraded</option>
              <option value="A">A — strategic</option>
              <option value="B">B — strong fit</option>
              <option value="C">C — callable</option>
              <option value="D">D — lower priority</option>
            </select>
          </label>

          <label className="mini-field">
            Conversion score
            <input
              type="number"
              min={1}
              max={10}
              value={review.conversionScore}
              onChange={(e) => patch({ conversionScore: Number(e.target.value) })}
            />
          </label>
        </div>

        <p className="score-meaning">
          <strong>{review.conversionScore}</strong> — {SCORE_MEANINGS[review.conversionScore] ?? "—"}
          <span className="muted-note"> · {review.scoreReason}</span>
        </p>

        <label className="mini-field wide">
          Notes
          <textarea rows={3} value={review.notes} onChange={(e) => patch({ notes: e.target.value })} />
        </label>
      </div>

      <div className="proposed-block">
        <h5>What this would propose</h5>
        <ul className="proposed-list">
          {review.suggestedOutcome ? (
            <li>
              <span className="proposed-label">Call outcome</span>
              {review.suggestedOutcome}
            </li>
          ) : (
            <li className="muted-note">No outcome confident enough to propose</li>
          )}
          {review.suggestedImportantNotes && (
            <li>
              <span className="proposed-label">Important notes</span>
              {prospect?.importantNotes ? "added to existing · " : ""}
              {review.suggestedImportantNotes}
            </li>
          )}
          {review.suggestedNextAction && (
            <li>
              <span className="proposed-label">Next action</span>
              {review.suggestedNextAction}
              {review.suggestedNextActionDate && ` · due ${review.suggestedNextActionDate}`}
            </li>
          )}
          {review.suggestedStage && (
            <li>
              <span className="proposed-label">Opportunity stage</span>
              {review.suggestedStage}
            </li>
          )}
        </ul>
        <p className="muted-note">
          Nothing here is applied yet. It goes to the review inbox, where you can edit it
          again or turn it down.
        </p>
      </div>

      <div className="call-logger-foot">
        <button className="primary-btn" onClick={send} disabled={!draft.prospectId}>
          Send to review inbox
        </button>
        <button className="ghost-btn" onClick={() => setDraft(null)}>
          Cancel
        </button>
        {!draft.prospectId && <span className="blocked-why">Pick the household first</span>}
      </div>

      <details className="paste-block">
        <summary>The transcript this came from</summary>
        <pre className="note-body">{draft.raw}</pre>
        <p className="muted-note">
          Kept here for this review only. It is not stored — Granola stays the record.
        </p>
      </details>
    </section>
  );
}
