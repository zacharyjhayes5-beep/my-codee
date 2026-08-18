import { useMemo, useState } from "react";
import type { Call, Opportunity, Prospect, ReviewProposal, Task } from "../types";
import type { AttentionItem } from "../lib/attention";
import { whatNeedsMe } from "../lib/attention";
import {
  BUCKET_LABELS,
  buildDailyBrief,
  dueFollowUps,
  previousDay,
  todaysSchedule,
  triageCorrespondence,
  type CorrespondenceBucket,
  type CorrespondenceNote,
} from "../lib/dailyBrief";
import { countDay, endOfDay, readGoals } from "../lib/goals";
import { newId, today } from "../lib/storage";
import { ResearchQueue } from "./ResearchQueue";

interface CommandCenterProps {
  prospects: Prospect[];
  calls: Call[];
  tasks: Task[];
  opportunities: Opportunity[];
  reviews: ReviewProposal[];
  correspondence: CorrespondenceNote[];
  onCorrespondenceChange: (notes: CorrespondenceNote[]) => void;
  onGo: (target: AttentionItem["target"], prospectId?: string) => void;
  onPatchProspect: (id: string, patch: Partial<Prospect>) => void;
}

/**
 * The Command Center. Today's work first, the book of business afterwards —
 * the ordering is the point. A KPI wall is what this replaces.
 */
export function CommandCenter({
  prospects,
  calls,
  tasks,
  opportunities,
  reviews,
  correspondence,
  onCorrespondenceChange,
  onGo,
  onPatchProspect,
}: CommandCenterProps) {
  const now = useMemo(() => new Date(), []);
  const day = today();
  const [showEod, setShowEod] = useState(false);

  const brief = useMemo(
    () =>
      buildDailyBrief({
        prospects,
        calls,
        tasks,
        opportunities,
        reviews,
        today: day,
        yesterday: previousDay(day),
        now,
      }),
    [prospects, calls, tasks, opportunities, reviews, day, now],
  );

  const schedule = useMemo(
    () => todaysSchedule(opportunities, prospects, day),
    [opportunities, prospects, day],
  );

  const followUps = useMemo(
    () => dueFollowUps(tasks, opportunities, prospects, day),
    [tasks, opportunities, prospects, day],
  );

  const attention = useMemo(
    () => whatNeedsMe({ prospects, opportunities, tasks, reviews, today: day }),
    [prospects, opportunities, tasks, reviews, day],
  );

  const post = useMemo(() => triageCorrespondence(correspondence), [correspondence]);

  const eod = useMemo(
    () => (showEod ? endOfDay(calls, prospects, tasks, opportunities, day, now) : null),
    [showEod, calls, prospects, tasks, opportunities, day, now],
  );

  const goals = useMemo(
    () => readGoals(countDay(calls, prospects, tasks, day), now),
    [calls, prospects, tasks, day, now],
  );

  return (
    <div className="command-center">
      {/* 1 — the one thing */}
      <section className="op-panel cc-headline">
        <header className="op-panel-head">Daily brief</header>
        <p className="cc-headline-text">{brief.headline}</p>
        <ol className="focus-list">
          {brief.focus.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        <p className="cc-yesterday">
          Yesterday: {brief.yesterday.dials} dials · {brief.yesterday.conversations} conversations ·{" "}
          {brief.yesterday.hotLeads} hot · {brief.yesterday.reviewsBooked} booked
        </p>
      </section>

      <div className="cc-grid">
        {/* 2 — what is actually booked */}
        <section className="op-panel">
          <header className="op-panel-head">Today&rsquo;s schedule</header>
          {schedule.length === 0 ? (
            <p className="empty">Nothing booked today.</p>
          ) : (
            <ul className="schedule-list">
              {schedule.map((item) => (
                <li key={item.id}>
                  <span className="schedule-time">{item.time}</span>
                  <button className="link-btn" onClick={() => onGo("prospects", item.prospectId)}>
                    {item.title}
                  </button>
                  <span className="muted-note">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3 — what needs me */}
        <section className="op-panel needs-me">
          <header className="op-panel-head">What needs me</header>
          {attention.length === 0 ? (
            <p className="empty">Nothing urgent. Work the queue.</p>
          ) : (
            <ol className="needs-me-list">
              {attention.map((item) => (
                <li key={item.id} className={`needs-me-item kind-${item.kind}`}>
                  <button className="needs-me-go" onClick={() => onGo(item.target, item.prospectId)}>
                    <span className="needs-me-title">{item.title}</span>
                    <span className="needs-me-detail">{item.detail}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ResearchQueue
        prospects={prospects}
        onPatchProspect={onPatchProspect}
        onSeeAll={() => onGo("prospects")}
      />

      {/* 4 — follow-ups */}
      <section className="op-panel">
        <header className="op-panel-head">
          Follow-ups
          {followUps.length > 0 && (
            <span className={`op-flag ${brief.followUps.overdue > 0 ? "alert" : "ok"}`}>
              {brief.followUps.overdue} overdue · {brief.followUps.today} today
            </span>
          )}
        </header>
        {followUps.length === 0 ? (
          <p className="empty">Nothing due. </p>
        ) : (
          <ul className="followup-list">
            {followUps.slice(0, 8).map((item) => (
              <li key={item.id} className={item.priority === "overdue" ? "overdue" : ""}>
                <span className={`fu-priority ${item.priority}`}>{item.priority}</span>
                <button className="link-btn" onClick={() => onGo("prospects", item.prospectId)}>
                  {item.title}
                </button>
                <span className="muted-note">{item.why}</span>
                <span className="fu-recommended">{item.recommended}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5 — pace */}
      <section className="op-panel goal-pace">
        <header className="op-panel-head">Goal pace</header>
        <div className="goal-grid">
          {goals.map((goal) => (
            <div className={`goal-row${goal.onPace ? "" : " behind"}`} key={goal.id}>
              <div className="goal-top">
                <span className="goal-label">{goal.label}</span>
                <span className="goal-count">
                  <em>{goal.done}</em> / {goal.goal}
                  {goal.stretch && <span className="goal-stretch"> · {goal.stretch} stretch</span>}
                </span>
              </div>
              <div className="goal-track">
                <div className="goal-fill" style={{ width: `${goal.percent}%` }} />
                <span
                  className="goal-marker"
                  style={{ left: `${Math.min(100, (goal.expected / goal.goal) * 100)}%` }}
                />
              </div>
              <span className="goal-advice">{goal.advice}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 6 — correspondence, entered by hand for now */}
      <Correspondence
        notes={correspondence}
        triaged={post}
        onChange={onCorrespondenceChange}
        onGo={onGo}
      />

      {/* 7 — how the day finished */}
      <section className="op-panel">
        <header className="op-panel-head">
          End of day
          <button className="link-btn" onClick={() => setShowEod(!showEod)}>
            {showEod ? "Hide" : "Show today's numbers"}
          </button>
        </header>
        {eod && (
          <div className="eod-body">
            <div className="eod-figures">
              {[
                ["Dials", eod.counts.coldCalls],
                ["Conversations", eod.counts.conversations],
                ["Somewhat interested", eod.counts.somewhatInterested],
                ["Hot leads", eod.counts.hotLeads],
                ["Reviews booked", eod.counts.reviewsScheduled],
                ["Quote follow-ups", eod.counts.quoteFollowUps],
                ["New opportunities", eod.newOpportunities],
              ].map(([label, value]) => (
                <div className="eod-figure" key={label as string}>
                  <span className="eod-value">{value as number}</span>
                  <span className="eod-label">{label as string}</span>
                </div>
              ))}
            </div>
            {eod.pipelineMoves.length > 0 && (
              <div className="eod-block">
                <h5>Pipeline movement</h5>
                <ul>
                  {eod.pipelineMoves.map((m, i) => (
                    <li key={i}>
                      <strong>{m.name}</strong> — {m.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="eod-block">
              <h5>Tomorrow&rsquo;s top priorities</h5>
              {eod.tomorrow.length === 0 ? (
                <p className="muted-note">Nothing booked yet.</p>
              ) : (
                <ul>
                  {eod.tomorrow.map((t, i) => (
                    <li key={i}>
                      {t.text} <span className="muted-note">· {t.why}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Correspondence({
  notes,
  triaged,
  onChange,
  onGo,
}: {
  notes: CorrespondenceNote[];
  triaged: ReturnType<typeof triageCorrespondence>;
  onChange: (notes: CorrespondenceNote[]) => void;
  onGo: CommandCenterProps["onGo"];
}) {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [bucket, setBucket] = useState<CorrespondenceBucket>("action");

  function add() {
    if (!subject.trim()) return;
    onChange([
      ...notes,
      {
        id: newId(),
        at: new Date().toISOString(),
        from: from.trim(),
        subject: subject.trim(),
        bucket,
        handled: false,
      },
    ]);
    setFrom("");
    setSubject("");
  }

  const groups: [CorrespondenceBucket, CorrespondenceNote[]][] = [
    ["action", triaged.action],
    ["worth-knowing", triaged.worthKnowing],
    ["informational", triaged.informational],
  ];

  return (
    <section className="op-panel">
      <header className="op-panel-head">
        New correspondence
        {triaged.total > 0 && <span className="op-flag ok">{triaged.total} open</span>}
      </header>

      {triaged.total === 0 ? (
        <p className="empty">Nothing logged.</p>
      ) : (
        <div className="post-groups">
          {groups.map(([key, items]) =>
            items.length === 0 ? null : (
              <div className={`post-group ${key}`} key={key}>
                <h5>{BUCKET_LABELS[key]}</h5>
                <ul>
                  {items.map((note) => (
                    <li key={note.id}>
                      <span className="post-from">{note.from || "—"}</span>
                      <span className="post-subject">{note.subject}</span>
                      <button
                        className="link-btn"
                        onClick={() =>
                          onChange(notes.map((n) => (n.id === note.id ? { ...n, handled: true } : n)))
                        }
                      >
                        Done
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      )}

      <details className="paste-block">
        <summary>Log something that came in</summary>
        <p className="muted-note">
          Entered by hand. No mail, calendar or messaging connection is wired up — this is
          the shape it will take when one is.
        </p>
        <div className="intake-grid">
          <label className="mini-field">
            From
            <input value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="mini-field">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="mini-field">
            Triage
            <select value={bucket} onChange={(e) => setBucket(e.target.value as CorrespondenceBucket)}>
              <option value="action">Requires action</option>
              <option value="worth-knowing">Worth knowing</option>
              <option value="informational">Informational</option>
            </select>
          </label>
        </div>
        <button className="primary-btn" onClick={add}>
          Log it
        </button>
        <button className="ghost-btn" onClick={() => onGo("todo")}>
          Open the review inbox
        </button>
      </details>
    </section>
  );
}
