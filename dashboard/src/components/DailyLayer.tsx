import { useMemo, useState } from "react";
import type { Call, Opportunity, Prospect, ReviewProposal, Task } from "../types";
import { whatNeedsMe, type AttentionItem } from "../lib/attention";
import { countDay, endOfDay, readGoals } from "../lib/goals";
import { today } from "../lib/storage";

interface DailyLayerProps {
  prospects: Prospect[];
  opportunities: Opportunity[];
  tasks: Task[];
  calls: Call[];
  reviews: ReviewProposal[];
  onGo: (target: AttentionItem["target"], prospectId?: string) => void;
}

/**
 * The daily operational layer: what needs you now, how the day is pacing, and
 * where it finished. Deliberately about today's work — the book-of-business
 * figures stay on the Progress tab.
 */
export function DailyLayer({
  prospects,
  opportunities,
  tasks,
  calls,
  reviews,
  onGo,
}: DailyLayerProps) {
  const now = useMemo(() => new Date(), []);
  const day = today();
  const [showReport, setShowReport] = useState(false);

  const attention = useMemo(
    () => whatNeedsMe({ prospects, opportunities, tasks, reviews, today: day }),
    [prospects, opportunities, tasks, reviews, day],
  );

  const counts = useMemo(() => countDay(calls, prospects, tasks, day), [calls, prospects, tasks, day]);
  const goals = useMemo(() => readGoals(counts, now), [counts, now]);

  const report = useMemo(
    () => (showReport ? endOfDay(calls, prospects, tasks, opportunities, day, now) : null),
    [showReport, calls, prospects, tasks, opportunities, day, now],
  );

  return (
    <>
      <section className="op-panel needs-me">
        <header className="op-panel-head">What needs me</header>
        {attention.length === 0 ? (
          <p className="empty">Nothing urgent. Press NEXT CALL and work the queue.</p>
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

      <section className="op-panel goal-pace">
        <header className="op-panel-head">
          Goal pace
          <span className="op-flag ok">{counts.conversations} conversations</span>
        </header>
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
                <span className="goal-marker" style={{ left: `${Math.min(100, (goal.expected / goal.goal) * 100)}%` }} />
              </div>
              <span className="goal-advice">{goal.advice}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="op-panel end-of-day">
        <header className="op-panel-head">
          End of day
          <button className="link-btn" onClick={() => setShowReport(!showReport)}>
            {showReport ? "Hide" : "Show today's numbers"}
          </button>
        </header>

        {report && (
          <div className="eod-body">
            <div className="eod-figures">
              <Figure label="Dials" value={report.counts.coldCalls} />
              <Figure label="Conversations" value={report.counts.conversations} />
              <Figure label="Somewhat interested" value={report.counts.somewhatInterested} />
              <Figure label="Hot leads" value={report.counts.hotLeads} />
              <Figure label="Reviews booked" value={report.counts.reviewsScheduled} />
              <Figure label="Quote follow-ups" value={report.counts.quoteFollowUps} />
              <Figure label="New opportunities" value={report.newOpportunities} />
            </div>

            {report.pipelineMoves.length > 0 && (
              <div className="eod-block">
                <h5>Pipeline movement</h5>
                <ul>
                  {report.pipelineMoves.map((m, i) => (
                    <li key={i}>
                      <strong>{m.name}</strong> — {m.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="eod-block">
              <h5>Tomorrow's top priorities</h5>
              {report.tomorrow.length === 0 ? (
                <p className="muted-note">Nothing booked yet.</p>
              ) : (
                <ul>
                  {report.tomorrow.map((t, i) => (
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
    </>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="eod-figure">
      <span className="eod-value">{value}</span>
      <span className="eod-label">{label}</span>
    </div>
  );
}
