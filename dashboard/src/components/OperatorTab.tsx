import { useMemo } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import type {
  Call,
  Opportunity,
  Period,
  PolicyEntry,
  PolicyLine,
  Prospect,
  ReviewProposal,
  Task,
} from "../types";
import { countsByCategory, currency, totalsFor } from "../lib/policies";
import type { CorrespondenceNote } from "../lib/dailyBrief";
import { CommandCenter } from "./CommandCenter";
import { ProgressOrb } from "./ProgressOrb";

export type CommandTarget = "progress" | "todo" | "prospects" | "map" | "pipeline";

interface OperatorTabProps {
  entries: PolicyEntry[];
  lines: PolicyLine[];
  period: Period;
  prospects: Prospect[];
  tasks: Task[];
  reviews: ReviewProposal[];
  calls: Call[];
  opportunities: Opportunity[];
  correspondence: CorrespondenceNote[];
  onCorrespondenceChange: (notes: CorrespondenceNote[]) => void;
  onCommand: (target: CommandTarget) => void;
  onGo: (target: "prospects" | "todo" | "pipeline", prospectId?: string) => void;
}

function parseDay(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Compact readouts — 14.4K rather than 14,400. */
function compact(n: number) {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}K`;
  }
  return String(Math.round(n));
}

const commands: { id: CommandTarget; label: string; hint: string }[] = [
  { id: "progress", label: "Log policy", hint: "add to the book" },
  { id: "prospects", label: "Import notes", hint: "Granola → profile" },
  { id: "todo", label: "Plan today", hint: "what's due" },
  { id: "map", label: "Lead map", hint: "see the web" },
  { id: "todo", label: "Review inbox", hint: "approve suggestions" },
  { id: "progress", label: "Week review", hint: "pace & tiers" },
];

export function OperatorTab({
  entries,
  lines,
  period,
  prospects,
  tasks,
  reviews,
  calls,
  opportunities,
  correspondence,
  onCorrespondenceChange,
  onCommand,
  onGo,
}: OperatorTabProps) {
  const stats = useMemo(() => {
    const inPeriod = entries.filter(
      (e) => e.effectiveDate >= period.start && e.effectiveDate < period.end
    );
    const earnings = totalsFor(inPeriod);
    const derived = countsByCategory(inPeriod);
    const policyCount =
      derived.counts.property + derived.counts.casualty + derived.counts.life;
    const policyGoal = lines.reduce((sum, l) => sum + l.policyGoal, 0);

    const now = new Date();
    const start = parseDay(period.start);
    const end = parseDay(period.end);
    const totalDays = Math.max(1, differenceInCalendarDays(end, start));
    const elapsed = Math.min(totalDays, Math.max(0, differenceInCalendarDays(now, start)));
    const daysLeft = Math.max(0, differenceInCalendarDays(end, now));
    const elapsedPct = (elapsed / totalDays) * 100;
    const expected = (policyGoal * elapsedPct) / 100;
    const delta = policyCount - expected;

    const openProspects = prospects.filter(
      // "Lost" folded into Closed in schema v4; Won is the other terminal.
      (p) => p.stage !== "Closed" && p.stage !== "Won"
    ).length;
    const iso = todayIso();
    const openTodos = tasks.filter((t) => !t.done).length;
    const dueToday = tasks.filter((t) => !t.done && t.dueDate === iso).length;
    const overdue = tasks.filter((t) => !t.done && t.dueDate && t.dueDate < iso).length;

    return {
      net: earnings.net,
      premium: earnings.premium,
      policyCount,
      policyGoal,
      goalPct: policyGoal > 0 ? (policyCount / policyGoal) * 100 : 0,
      daysLeft,
      elapsedPct,
      delta,
      openProspects,
      openTodos,
      dueToday,
      overdue,
      waiting: reviews.filter((r) => r.status === "pending" || r.status === "edited").length,
    };
  }, [entries, lines, period, prospects, tasks, reviews]);

  const onPace = stats.delta >= -0.5;

  return (
    <div className="operator">
      {/* Today's work comes first. The book-of-business figures are the
          snapshot underneath it, never the thing you open the app to. */}
      <CommandCenter
        prospects={prospects}
        calls={calls}
        tasks={tasks}
        opportunities={opportunities}
        reviews={reviews}
        correspondence={correspondence}
        onCorrespondenceChange={onCorrespondenceChange}
        onGo={onGo}
      />

      <h2 className="snapshot-heading">Business snapshot</h2>

      <div className="op-grid">
        <section className="op-panel op-vitals">
          <header className="op-panel-head">System vitals</header>
          <div className="op-vital">
            <span className="op-vital-label">Net commission</span>
            <span className="op-vital-value">{currency(stats.net, 0)}</span>
          </div>
          <div className="op-vital">
            <span className="op-vital-label">Premium written</span>
            <span className="op-vital-value">${compact(stats.premium)}</span>
          </div>
          <div className="op-vital">
            <span className="op-vital-label">Policies</span>
            <span className="op-vital-value">
              {stats.policyCount}
              <em> / {stats.policyGoal}</em>
            </span>
          </div>
          <div className="op-vital">
            <span className="op-vital-label">Open prospects</span>
            <span className="op-vital-value">{stats.openProspects}</span>
          </div>
          <div className="op-vital">
            <span className="op-vital-label">Days remaining</span>
            <span className="op-vital-value">{stats.daysLeft}</span>
          </div>
        </section>

        <section className="op-panel op-core">
          <header className="op-panel-head">
            Book status
            <span className={`op-flag ${onPace ? "ok" : "alert"}`}>
              {onPace ? "ON PACE" : `${Math.abs(Math.round(stats.delta))} BEHIND`}
            </span>
          </header>
          <ProgressOrb
            pct={stats.goalPct}
            label="of policy goal"
            caption={`${stats.elapsedPct.toFixed(0)}% of period elapsed`}
          />
        </section>

        <section className="op-panel op-deck">
          <header className="op-panel-head">Command deck</header>
          <ul className="op-commands">
            {commands.map((c) => (
              <li key={c.label}>
                <button onClick={() => onCommand(c.id)}>
                  <span className="op-cmd-label">{c.label}</span>
                  <span className="op-cmd-hint">{c.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="op-panel op-bhag">
        <header className="op-panel-head">Big goal</header>
        <div className="op-bhag-body">
          <span className="op-bhag-text">
            Road to {stats.policyGoal} policies
          </span>
          <div className="op-bhag-track">
            <div className="op-bhag-fill" style={{ width: `${Math.min(100, stats.goalPct)}%` }} />
          </div>
          <span className="op-bhag-meta">
            {stats.policyCount} written · {Math.max(0, stats.policyGoal - stats.policyCount)} to go ·
            ends {format(parseDay(period.end), "MMM d, yyyy")}
          </span>
        </div>
      </section>

      <section className="op-panel op-ticker">
        <header className="op-panel-head">Today</header>
        <div className="op-ticker-body">
          <span>
            <em>{stats.dueToday}</em> due today
          </span>
          <span className={stats.overdue > 0 ? "op-overdue" : ""}>
            <em>{stats.overdue}</em> overdue
          </span>
          <span>
            <em>{stats.openTodos}</em> open task{stats.openTodos === 1 ? "" : "s"}
          </span>
          <span>
            <em>{stats.waiting}</em> review{stats.waiting === 1 ? "" : "s"} waiting
          </span>
          <span>
            <em>{stats.openProspects}</em> prospect{stats.openProspects === 1 ? "" : "s"} in play
          </span>
        </div>
      </section>
    </div>
  );
}
