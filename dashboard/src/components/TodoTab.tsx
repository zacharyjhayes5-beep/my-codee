import { useMemo, useState } from "react";
import type { Prospect, ReviewProposal, Task, Urgency } from "../types";
import { urgencyColor, urgencyLevels } from "../lib/defaultData";
import { newId, today as todayIso } from "../lib/storage";
import { daysUntil, dedupeKey, inferUrgency, parseSuggestions, type SuggestionSource } from "../lib/suggest";
import { reviewFromSuggestion } from "../lib/reviews";
import type { Conflict } from "../lib/reviews";
import { ReviewInbox } from "./ReviewInbox";
import { WeekAgenda } from "./WeekAgenda";

interface TodoTabProps {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  reviews: ReviewProposal[];
  onReviewsChange: (reviews: ReviewProposal[]) => void;
  prospects: Prospect[];
  /** Returns any conflicts that stopped the proposal being applied. */
  onApprove: (proposal: ReviewProposal) => Conflict[];
  onReject: (proposal: ReviewProposal) => void;
  /** Dedupe keys turned down before, so the same proposal doesn't come back. */
  dismissed: string[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dueLabel(iso: string, today: string): string {
  const days = daysUntil(iso, today);
  const [y, m, d] = iso.split("-").map(Number);
  const stamp = `${MONTH_NAMES[m - 1]} ${d}`;
  if (days < 0) return `Overdue · ${stamp}`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `${DAY_NAMES[new Date(y, m - 1, d).getDay()]} · ${stamp}`;
  return stamp;
}

function byDue(a: Task, b: Task) {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

/* ------------------------------------------------------------------ */

interface TaskRowProps {
  task: Task;
  today: string;
  onPatch: (patch: Partial<Task>) => void;
  onRemove: () => void;
}

function TaskRow({ task, today, onPatch, onRemove }: TaskRowProps) {
  const [open, setOpen] = useState(false);
  const overdue = Boolean(task.dueDate && task.dueDate < today && !task.done);

  return (
    <li className={`task-row${task.done ? " done" : ""}${overdue ? " overdue" : ""}`}>
      <div className="task-line">
        <input
          type="checkbox"
          checked={task.done}
          onChange={() =>
            onPatch({ done: !task.done, completedAt: task.done ? undefined : today })
          }
          aria-label={task.done ? "Mark as not done" : "Mark as done"}
        />

        <button className="task-text" onClick={() => setOpen(!open)}>
          {task.text}
        </button>

        <div className="task-tags">
          {task.ruleId && <span className="task-origin-chip">auto</span>}
          {task.dueDate && <span className="due-badge">{dueLabel(task.dueDate, today)}</span>}
          {task.source !== "manual" && (
            <span className={`src-chip src-${task.source}`}>
              {task.source === "gmail" ? "Gmail" : "Obsidian"}
            </span>
          )}
        </div>

        <select
          className="urgency-select"
          value={task.urgency}
          onChange={(e) => onPatch({ urgency: e.target.value as Urgency })}
          aria-label="Urgency"
        >
          {urgencyLevels.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <button className="remove-btn" onClick={onRemove} aria-label="Delete task">
          ×
        </button>
      </div>

      {open && (
        <div className="task-open">
          <label className="mini-field wide">
            Task
            <input value={task.text} onChange={(e) => onPatch({ text: e.target.value })} />
          </label>
          <label className="mini-field">
            Due
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => onPatch({ dueDate: e.target.value || undefined })}
            />
          </label>
          <label className="mini-field wide">
            Notes
            <textarea
              rows={3}
              value={task.detail}
              onChange={(e) => onPatch({ detail: e.target.value })}
              placeholder="Anything worth keeping with this one"
            />
          </label>
          {task.sourceRef && <p className="task-origin">From {task.sourceRef}</p>}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */

export function TodoTab({
  tasks,
  onTasksChange,
  reviews,
  onReviewsChange,
  prospects,
  onApprove,
  onReject,
  dismissed,
}: TodoTabProps) {
  const today = useMemo(() => todayIso(), []);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftIso(today, i)), [today]);

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftUrgency, setDraftUrgency] = useState<Urgency>("soon");
  const [showDone, setShowDone] = useState(false);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const dueToday = open.filter((t) => t.dueDate === today).length;
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;

  function addTask() {
    const text = draft.trim();
    if (!text) return;
    onTasksChange([
      ...tasks,
      {
        id: newId(),
        text,
        detail: "",
        urgency: draftUrgency,
        done: false,
        dueDate: draftDue || undefined,
        source: "manual",
        createdAt: today,
      },
    ]);
    setDraft("");
    setDraftDue("");
    setDraftUrgency("soon");
  }

  function patchTask(id: string, patch: Partial<Task>) {
    onTasksChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTask(id: string) {
    onTasksChange(tasks.filter((t) => t.id !== id));
  }

  const pending = useMemo(() => reviews.filter((r) => r.status !== "approved" && r.status !== "rejected"), [reviews]);

  /** Reads raw text into the inbox as proposals, skipping anything already seen. */
  function importItems(items: { text: string; filename?: string }[], source?: SuggestionSource) {
    const seen = new Set<string>([
      ...tasks.map((t) => dedupeKey(t.text)),
      ...reviews.map((r) => r.dedupeKey),
      ...dismissed,
    ]);

    const fresh: ReviewProposal[] = [];
    for (const item of items) {
      for (const s of parseSuggestions(item.text, { filename: item.filename, today, source })) {
        const key = dedupeKey(s.text);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(reviewFromSuggestion(s));
      }
    }

    if (fresh.length > 0) onReviewsChange([...reviews, ...fresh]);
    return fresh.length;
  }

  function approveAll() {
    // One at a time, so a conflict on one proposal cannot take the rest with it.
    for (const proposal of pending) onApprove(proposal);
  }

  function rejectAll() {
    for (const proposal of pending) onReject(proposal);
  }

  return (
    <div className="tab-panel todo-layout">
      <div className="todo-stats">
        <div className="todo-stat">
          <span className="todo-stat-value">{open.length}</span>
          <span className="todo-stat-label">Open</span>
        </div>
        <div className="todo-stat">
          <span className="todo-stat-value">{dueToday}</span>
          <span className="todo-stat-label">Due today</span>
        </div>
        <div className={`todo-stat${overdue > 0 ? " alert" : ""}`}>
          <span className="todo-stat-value">{overdue}</span>
          <span className="todo-stat-label">Overdue</span>
        </div>
        <div className={`todo-stat${pending.length > 0 ? " accent" : ""}`}>
          <span className="todo-stat-value">{pending.length}</span>
          <span className="todo-stat-label">To review</span>
        </div>
      </div>

      <div className="quick-add">
        <input
          className="quick-add-text"
          placeholder="What needs doing?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
        />
        <input
          type="date"
          value={draftDue}
          onChange={(e) => {
            setDraftDue(e.target.value);
            if (e.target.value) setDraftUrgency(inferUrgency("", e.target.value, today));
          }}
          aria-label="Due date"
        />
        <select
          value={draftUrgency}
          onChange={(e) => setDraftUrgency(e.target.value as Urgency)}
          aria-label="Urgency"
        >
          {urgencyLevels.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button className="primary-btn" onClick={addTask}>
          Add
        </button>
      </div>

      <WeekAgenda tasks={tasks} today={today} days={week} />

      <ReviewInbox
        proposals={pending}
        prospects={prospects}
        onImport={importItems}
        onUpdate={(id, patch) =>
          onReviewsChange(reviews.map((r) => (r.id === id ? { ...r, ...patch } : r)))
        }
        onApprove={onApprove}
        onReject={onReject}
        onApproveAll={approveAll}
        onRejectAll={rejectAll}
      />

      <section className="task-sections">
        {urgencyLevels.map((level) => {
          const rows = open.filter((t) => t.urgency === level.id).sort(byDue);
          return (
            <div className="task-section" key={level.id}>
              <div className="task-section-head">
                <span className="section-dot" style={{ background: urgencyColor[level.id] }} />
                <h3>{level.name}</h3>
                <span className="section-blurb">{level.blurb}</span>
                <span className="section-count">{rows.length}</span>
              </div>
              {rows.length === 0 ? (
                <p className="empty">Nothing here.</p>
              ) : (
                <ul className="task-list">
                  {rows.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      today={today}
                      onPatch={(patch) => patchTask(t.id, patch)}
                      onRemove={() => removeTask(t.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {done.length > 0 && (
        <section className="task-section done-section">
          <div className="task-section-head">
            <button className="link-btn" onClick={() => setShowDone(!showDone)}>
              {showDone ? "Hide" : "Show"} done ({done.length})
            </button>
            <button className="ghost-btn" onClick={() => onTasksChange(open)}>
              Clear done
            </button>
          </div>
          {showDone && (
            <ul className="task-list">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  onPatch={(patch) => patchTask(t.id, patch)}
                  onRemove={() => removeTask(t.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
