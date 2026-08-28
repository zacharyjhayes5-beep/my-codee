import { useMemo, useState } from "react";
import type {
  Meeting,
  Opportunity,
  PolicyEntry,
  PolicyLine,
  Period,
  Prospect,
  ReviewProposal,
  Task,
} from "../types";
import { countsByCategory, currency, totalsFor } from "../lib/policies";
import { readPace, lineTotals } from "../lib/pace";
import { dueTag, upNext, waitingOnYou } from "../lib/operator";
import { isTerminal } from "../lib/leadView";
import { today } from "../lib/storage";
import { DayCalendar } from "./DayCalendar";
import { MeetingsPanel } from "./MeetingsPanel";
import { meetingsIn } from "../lib/meetings";

interface OperatorTabProps {
  prospects: Prospect[];
  tasks: Task[];
  onTasksChange: (updater: (prev: Task[]) => Task[]) => void;
  reviews: ReviewProposal[];
  opportunities: Opportunity[];
  meetings: Meeting[];
  onMeetingsChange: (updater: (prev: Meeting[]) => Meeting[]) => void;
  lines: PolicyLine[];
  period: Period;
  entries: PolicyEntry[];
  googleCalendarClientId: string;
  onGoogleCalendarClientIdChange: (clientId: string) => void;
  /** Open a household on the Leads screen. */
  onOpenProspect: (prospectId: string) => void;
  /** Jump to another screen, for the "waiting on you" rows. */
  onGo: (target: "leads" | "todo" | "progress") => void;
}

/** A hue token, chosen by tone name. Status always carries a label too. */
const TONE_VAR: Record<string, string> = {
  slate: "var(--hue-slate)",
  cognac: "var(--hue-cognac)",
  terracotta: "var(--hue-terracotta)",
  verdigris: "var(--hue-verdigris)",
  brass: "var(--hue-brass)",
  grey: "var(--hue-grey)",
};

function newTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Operator — what you owe today, and who is up next.
 *
 * Four sections and no more: the hero pairs the to-do list with the queue,
 * the vitals strip carries exactly four figures, and the goal row puts pace
 * beside the short list of things waiting on a decision. Today's calendar
 * follows at the foot.
 */
export function OperatorTab({
  prospects,
  tasks,
  onTasksChange,
  reviews,
  opportunities,
  meetings,
  onMeetingsChange,
  lines,
  period,
  entries,
  googleCalendarClientId,
  onGoogleCalendarClientIdChange,
  onOpenProspect,
  onGo,
}: OperatorTabProps) {
  const day = today();
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);

  /* ---------- Hero: the to-do list ----------

     Completed tasks are hidden by default. They accumulate forever, and a
     hero list you have to scroll past forty struck-through lines to reach
     is not a list of what you owe today. The count keeps them in view, and
     the toggle brings them back. */

  const openTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.done), [tasks]);
  const visibleTasks = showDone ? [...openTasks, ...doneTasks] : openTasks;

  function toggleTask(id: string) {
    onTasksChange((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              done: !t.done,
              completedAt: !t.done ? new Date().toISOString() : undefined,
            }
          : t,
      ),
    );
  }

  /** Empty or whitespace is a no-op; on success the field clears. */
  function addTask() {
    const text = draft.trim();
    if (!text) return;
    onTasksChange((prev) => [
      ...prev,
      {
        id: newTaskId(),
        text,
        detail: "",
        urgency: "week",
        done: false,
        source: "manual",
        createdAt: new Date().toISOString(),
        kind: "manual",
      },
    ]);
    setDraft("");
  }

  const byId = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);

  /* ---------- Hero: who is up next ---------- */

  const queue = useMemo(
    () => upNext({ prospects, opportunities, tasks, reviews, today: day }),
    [prospects, opportunities, tasks, reviews, day],
  );

  /* ---------- Vitals ---------- */

  const inPeriod = useMemo(
    () => entries.filter((e) => e.effectiveDate >= period.start && e.effectiveDate < period.end),
    [entries, period.start, period.end],
  );
  const earnings = useMemo(() => totalsFor(inPeriod), [inPeriod]);
  const derived = useMemo(() => countsByCategory(inPeriod), [inPeriod]);
  const totals = useMemo(() => lineTotals(lines, derived.counts), [lines, derived]);
  const pace = useMemo(
    () => readPace(period, totals.policyCount, totals.policyGoal),
    [period, totals.policyCount, totals.policyGoal],
  );

  const inPlay = useMemo(() => prospects.filter((p) => !isTerminal(p)).length, [prospects]);

  const vitals = [
    {
      label: "Net commission",
      value: currency(earnings.net, 0),
      sub: `${currency(earnings.premium, 0)} in premium`,
      tone: "grey" as const,
    },
    {
      label: "Policies written",
      value: String(totals.policyCount),
      sub: `of ${totals.policyGoal} this period`,
      tone: pace.onPace ? ("verdigris" as const) : ("terracotta" as const),
    },
    {
      label: "Households in play",
      value: String(inPlay),
      sub: `${prospects.length} on the books`,
      tone: "grey" as const,
    },
    {
      label: "Days remaining",
      value: pace.valid ? String(pace.daysLeft) : "—",
      sub: pace.valid ? `${Math.round(pace.elapsedPct)}% of the period gone` : "Period not set",
      tone: pace.daysLeft < 30 ? ("brass" as const) : ("grey" as const),
    },
  ];

  /* ---------- Waiting on you ---------- */

  const waiting = useMemo(
    () => waitingOnYou({ tasks, reviews, prospects, today: day }),
    [tasks, reviews, prospects, day],
  );

  /* ---------- Meetings ----------
     Bucketed by their own date, so a meeting crosses from next week into
     this week on its own when the week turns. */

  const thisWeek = useMemo(() => meetingsIn(meetings, "this", day), [meetings, day]);
  const nextWeek = useMemo(() => meetingsIn(meetings, "next", day), [meetings, day]);

  function addMeeting(meeting: Meeting) {
    onMeetingsChange((prev) => [...prev, meeting]);
  }

  function removeMeeting(id: string) {
    onMeetingsChange((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="operator">
      {/* ---------- Meetings, above everything ---------- */}
      <section className="op-meetings">
        <MeetingsPanel
          kicker="Meetings scheduled this week"
          meetings={thisWeek}
          today={day}
          emptyText="Nothing booked this week yet."
          onAdd={addMeeting}
          onRemove={removeMeeting}
        />
        <MeetingsPanel
          kicker="Meetings scheduled next week"
          meetings={nextWeek}
          today={day}
          emptyText="Nothing booked for next week yet."
          onAdd={addMeeting}
          onRemove={removeMeeting}
        />
      </section>

      {/* ---------- 1. Hero ---------- */}
      <section className="op-hero">
        <span className="op-hero-wash" aria-hidden="true" />

        <div className="op-hero-todo">
          <div className="op-section-head">
            <span className="kicker">To-do</span>
            <span className="op-rule" aria-hidden="true" />
            <span className="op-count">
              {openTasks.length} open
              {doneTasks.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="op-count-toggle"
                    aria-pressed={showDone}
                    onClick={() => setShowDone((v) => !v)}
                  >
                    {showDone ? "hide" : "show"} {doneTasks.length} done
                  </button>
                </>
              )}
            </span>
          </div>

          <ul className="op-tasks">
            {visibleTasks.length === 0 && (
              <li className="op-empty">
                {tasks.length === 0
                  ? "Nothing on the list. Add the first thing below."
                  : "Everything on the list is done."}
              </li>
            )}
            {visibleTasks.map((task) => {
              const tag = dueTag(task, day);
              const household = task.prospectId ? byId.get(task.prospectId) : undefined;
              return (
                <li key={task.id} className="op-task">
                  <input
                    type="checkbox"
                    id={`todo-${task.id}`}
                    className="op-check"
                    checked={task.done}
                    onChange={() => toggleTask(task.id)}
                  />
                  <label htmlFor={`todo-${task.id}`} className="op-task-body">
                    <span className={`op-task-label${task.done ? " is-done" : ""}`}>
                      {task.text}
                    </span>
                    <span className="op-task-meta">
                      {household?.name || task.sourceRef || "No household"}
                    </span>
                  </label>
                  <span className="op-due" style={{ color: TONE_VAR[tag.tone] }}>
                    {tag.label}
                  </span>
                </li>
              );
            })}
          </ul>

          <form
            className="op-add"
            onSubmit={(e) => {
              // Enter in the field submits, exactly as pressing Add does.
              e.preventDefault();
              addTask();
            }}
          >
            <input
              type="text"
              className="op-field"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a task"
              aria-label="Add a task"
            />
            <button type="submit" className="op-btn">
              Add
            </button>
          </form>
        </div>

        <div className="op-hero-queue">
          <div className="op-section-head">
            <span className="kicker">Then</span>
            <span className="op-rule" aria-hidden="true" />
          </div>

          {queue.length === 0 ? (
            <p className="op-empty">Nobody is waiting. The queue is genuinely clear.</p>
          ) : (
            <ul className="op-queue">
              {queue.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="op-queue-row"
                    onClick={() => item.prospectId && onOpenProspect(item.prospectId)}
                  >
                    <span className="op-numeral">{item.numeral}</span>
                    <span className="op-queue-body">
                      <span className="op-queue-name">{item.name}</span>
                      <span className="op-queue-reason">{item.reason}</span>
                    </span>
                    <span className="op-queue-action" style={{ color: TONE_VAR[item.tone] }}>
                      {item.action}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---------- 2. Vitals ---------- */}
      <section className="op-vitals" aria-label="Vitals">
        {vitals.map((v) => (
          <div className="op-vital" key={v.label}>
            <span className="micro-label">{v.label}</span>
            <span className="op-figure">{v.value}</span>
            <span className="op-vital-sub" style={{ color: TONE_VAR[v.tone] }}>
              {v.sub}
            </span>
          </div>
        ))}
      </section>

      {/* ---------- 3. Goal pace, and what is waiting ---------- */}
      <section className="op-goal-row">
        <div className="op-panel op-goal">
          <div className="op-section-head">
            <h2 className="op-panel-title">Toward {totals.policyGoal} policies</h2>
            <span className="op-rule" aria-hidden="true" />
            <span
              className="op-pace-flag"
              style={{
                color: pace.onPace ? "var(--hue-verdigris)" : "var(--hue-terracotta)",
              }}
            >
              {pace.onPace ? "On pace" : `${pace.behindBy} behind`}
            </span>
            <button type="button" className="op-link" onClick={() => onGo("progress")}>
              Open the book
            </button>
          </div>

          <div
            className="op-track"
            role="progressbar"
            aria-valuenow={Math.round(pace.writtenPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${totals.policyCount} of ${totals.policyGoal} policies written`}
          >
            <span className="op-track-fill" style={{ width: `${pace.writtenPct}%` }} />
            {/* Where the count *should* be today. Without this the bar is
                just a number; with it, the bar is a verdict. */}
            {pace.valid && (
              <span className="op-pace-marker" style={{ left: `${pace.elapsedPct}%` }} />
            )}
          </div>

          <div className="op-goal-caption">
            <span>
              {totals.policyCount} written · {pace.remaining} to go
            </span>
            <span>
              {pace.valid && pace.daysLeft > 0
                ? `${pace.perWeek.toFixed(1)} per week to finish`
                : "Period closed"}
            </span>
          </div>

          <div className="op-lines">
            {lines.map((line, index) => {
              const count = derived.counts[line.id] ?? 0;
              const pct = line.policyGoal > 0 ? Math.min(100, (count / line.policyGoal) * 100) : 0;
              const hue = `var(--series-${index + 1})`;
              return (
                <div className="op-line" key={line.id}>
                  <span className="op-line-head">
                    <span className="op-line-dot" style={{ background: hue }} aria-hidden="true" />
                    <span className="micro-label">{line.name}</span>
                  </span>
                  <span className="op-line-count">
                    {count}
                    <span className="op-line-goal"> / {line.policyGoal}</span>
                  </span>
                  <span className="op-line-bar" aria-hidden="true">
                    <span style={{ width: `${pct}%`, background: hue }} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="op-panel op-panel-quiet op-waiting">
          <span className="kicker">Waiting on you</span>
          <ul>
            {waiting.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="op-waiting-row"
                  onClick={() => onGo(row.id === "no-phone" ? "leads" : "todo")}
                >
                  <span>{row.label}</span>
                  <span className="op-waiting-count" style={{ color: TONE_VAR[row.tone] }}>
                    {row.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- 4. Today ---------- */}
      <DayCalendar
        prospects={prospects}
        opportunities={opportunities}
        googleCalendarClientId={googleCalendarClientId}
        onGoogleCalendarClientIdChange={onGoogleCalendarClientIdChange}
        onOpenProspect={onOpenProspect}
      />
    </div>
  );
}
