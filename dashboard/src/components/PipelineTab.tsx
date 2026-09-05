import { Fragment, useMemo, useState } from "react";
import type { Opportunity, OpportunityStage, PolicyEntry, Prospect } from "../types";
import {
  OPPORTUNITY_STAGES,
  daysBetween,
  isStalled,
  patchOpportunity,
  premiumTotal,
  summarizeByStage,
} from "../lib/opportunities";
import { OpportunityRecord } from "./OpportunityRecord";
import { EditableCell } from "./EditableCell";
import { applyWritten, undoWritten } from "../lib/written";
import { today } from "../lib/storage";

interface PipelineTabProps {
  opportunities: Opportunity[];
  prospects: Prospect[];
  onChange: (opportunities: Opportunity[]) => void;
  /** The book of business, so Written can post to it. */
  entries: PolicyEntry[];
  onEntriesChange: (updater: (prev: PolicyEntry[]) => PolicyEntry[]) => void;
  onProspectsChange: (updater: (prev: Prospect[]) => Prospect[]) => void;
  onOpenProspect: (prospectId: string) => void;
}

function money(n: number): string {
  return n > 0 ? `$${n.toLocaleString("en-US")}` : "—";
}

/**
 * The pipeline is a view over the opportunity records, not a second copy of
 * anybody. It is built to be worked from: what is due, what has gone quiet,
 * and what is still open — not to forecast.
 */
export function PipelineTab({
  opportunities,
  prospects,
  onChange,
  entries,
  onEntriesChange,
  onProspectsChange,
  onOpenProspect,
}: PipelineTabProps) {
  const now = today();
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "All">("All");
  const [openId, setOpenId] = useState<string | null>(null);

  /**
   * History travels with the record, so every edit goes through the patch.
   *
   * Marking an account Written also posts it to the book and moves the
   * household to Won. Moving it back out takes those policies away again,
   * because a stage set by mistake has to be correctable without leaving the
   * book claiming business that is not there.
   */
  function save(next: Opportunity) {
    const before = opportunities.find((o) => o.id === next.id);
    onChange(opportunities.map((o) => (o.id === next.id ? patchOpportunity(o, next) : o)));

    if (next.stage === "Won") {
      const result = applyWritten(next, byId.get(next.prospectId), entries);
      if (result) {
        onEntriesChange(() => result.entries);
        if (result.prospect) {
          onProspectsChange((prev) =>
            prev.map((p) => (p.id === result.prospect!.id ? result.prospect! : p)),
          );
        }
      }
    } else if (before?.stage === "Won") {
      onEntriesChange((prev) => undoWritten(prev, next.id));
    }
  }

  /**
   * Take an account off the pipeline.
   *
   * The opportunity goes; the household does not. A piece of work being
   * dropped — a duplicate, a quote that folded into somebody else's — says
   * nothing about whether the person is still worth calling.
   */
  function remove(id: string) {
    onChange(opportunities.filter((o) => o.id !== id));
    setOpenId(null);
  }

  const byId = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);
  const summary = useMemo(() => summarizeByStage(opportunities, now), [opportunities, now]);

  const open = opportunities.filter((o) => o.stage !== "Won" && o.stage !== "Lost");
  const dueOrOverdue = open.filter((o) => o.nextActionDate && o.nextActionDate <= now);
  const stalled = open.filter((o) => isStalled(o, now));

  const visible = opportunities
    .filter((o) => stageFilter === "All" || o.stage === stageFilter)
    .sort((a, b) => (a.nextActionDate || "9999").localeCompare(b.nextActionDate || "9999"));

  const totalOpenValue = open.reduce((sum, o) => sum + premiumTotal(o), 0);

  return (
    <div className="tab-panel">
      <div className="stat-row">
        <div className="pipe-stat">
          <span className="pipe-stat-value">{open.length}</span>
          <span className="pipe-stat-label">Open</span>
        </div>
        <div className="pipe-stat">
          <span className="pipe-stat-value">{money(totalOpenValue)}</span>
          <span className="pipe-stat-label">Premium in play</span>
        </div>
        <div className={`pipe-stat${dueOrOverdue.length > 0 ? " alert" : ""}`}>
          <span className="pipe-stat-value">{dueOrOverdue.length}</span>
          <span className="pipe-stat-label">Due or overdue</span>
        </div>
        <div className={`pipe-stat${stalled.length > 0 ? " warn" : ""}`}>
          <span className="pipe-stat-value">{stalled.length}</span>
          <span className="pipe-stat-label">Gone quiet</span>
        </div>
      </div>

      <section className="stage-board">
        {summary.map((s) => (
          <button
            key={s.stage}
            className={`stage-column${stageFilter === s.stage ? " on" : ""}`}
            onClick={() => setStageFilter(stageFilter === s.stage ? "All" : s.stage)}
          >
            <span className="stage-name">{s.stage}</span>
            <span className="stage-count">{s.count}</span>
            <span className="stage-value">{money(s.value)}</span>
            <span className="stage-flags">
              {s.dueOrOverdue > 0 && <em className="due">{s.dueOrOverdue} due</em>}
              {s.stalled > 0 && <em className="stall">{s.stalled} quiet</em>}
            </span>
          </button>
        ))}
      </section>

      <div className="pipeline-head">
        <h3>{stageFilter === "All" ? "Every opportunity" : stageFilter}</h3>
        {stageFilter !== "All" && (
          <button className="link-btn" onClick={() => setStageFilter("All")}>
            Show all stages
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="empty">
          {opportunities.length === 0
            ? "No opportunities yet. They appear when a call says there is real business in play."
            : "Nothing in that stage."}
        </p>
      ) : (
        <div className="scroller">
          <table className="pipeline-table">
            <thead>
              <tr>
                <th>Household</th>
                <th>Stage</th>
                <th>Lines</th>
                <th>Premium</th>
                <th>Next action</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const overdue = Boolean(o.nextActionDate && o.nextActionDate < now);
                const dueToday = o.nextActionDate === now;
                const quiet = isStalled(o, now);
                const isOpen = openId === o.id;
                const household = byId.get(o.prospectId);

                return (
                  <Fragment key={o.id}>
                    <tr
                      className={`opp-row${isOpen ? " is-open" : ""}${
                        overdue ? " row-overdue" : quiet ? " row-quiet" : ""
                      }`}
                    >
                      <td>
                        {/* The name opens the account here rather than leaving
                            the screen — this is where it is being worked. */}
                        <button
                          className="opp-name"
                          aria-expanded={isOpen}
                          onClick={() => setOpenId(isOpen ? null : o.id)}
                        >
                          {household?.name || "Unknown household"}
                        </button>
                        {o.appointments.length > 0 && (
                          <span className="row-appointment">
                            {o.appointments.length} appointment
                            {o.appointments.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          className="cell-select"
                          value={o.stage}
                          aria-label={`Stage for ${household?.name || "this account"}`}
                          onChange={(e) =>
                            save({ ...o, stage: e.target.value as OpportunityStage })
                          }
                        >
                          {OPPORTUNITY_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        {quiet && (
                          <span className="quiet-note">{daysBetween(o.updatedAt, now)}d quiet</span>
                        )}
                      </td>
                      <td>{o.lines.join(", ") || "—"}</td>
                      {/* Per-line premium needs six fields; the row shows the
                          total and the record breaks it down. */}
                      <td className="num">{money(premiumTotal(o))}</td>
                      <td>
                        <EditableCell
                          value={o.nextAction}
                          placeholder="What happens next"
                          ariaLabel={`Next action for ${household?.name || "this account"}`}
                          onCommit={(next) => save({ ...o, nextAction: next })}
                        />
                      </td>
                      <td className={overdue ? "due-overdue" : dueToday ? "due-today" : ""}>
                        <input
                          type="date"
                          className="cell-input cell-date"
                          value={o.nextActionDate}
                          aria-label={`Due date for ${household?.name || "this account"}`}
                          onChange={(e) => save({ ...o, nextActionDate: e.target.value })}
                        />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="opp-detail-row">
                        <td colSpan={6}>
                          <OpportunityRecord
                            opportunity={o}
                            prospect={household}
                            onSave={save}
                            onRemove={() => remove(o.id)}
                            onClose={() => setOpenId(null)}
                            onOpenHousehold={() => onOpenProspect(o.prospectId)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted-note">
        Insurance reviews are appointments attached to an opportunity, not a stage of their
        own. Every open opportunity carries a next action and a date — the form will not save
        one without both.
      </p>
    </div>
  );
}

export { OPPORTUNITY_STAGES };
