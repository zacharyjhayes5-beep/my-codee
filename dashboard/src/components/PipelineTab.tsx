import { useMemo, useState } from "react";
import type { Opportunity, OpportunityStage, Prospect } from "../types";
import {
  OPPORTUNITY_STAGES,
  daysBetween,
  isStalled,
  stageClassFor,
  summarizeByStage,
} from "../lib/opportunities";
import { today } from "../lib/storage";

interface PipelineTabProps {
  opportunities: Opportunity[];
  prospects: Prospect[];
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
export function PipelineTab({ opportunities, prospects, onOpenProspect }: PipelineTabProps) {
  const now = today();
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "All">("All");

  const byId = useMemo(() => new Map(prospects.map((p) => [p.id, p])), [prospects]);
  const summary = useMemo(() => summarizeByStage(opportunities, now), [opportunities, now]);

  const open = opportunities.filter((o) => o.stage !== "Written" && o.stage !== "Lost");
  const dueOrOverdue = open.filter((o) => o.nextActionDate && o.nextActionDate <= now);
  const stalled = open.filter((o) => isStalled(o, now));

  const visible = opportunities
    .filter((o) => stageFilter === "All" || o.stage === stageFilter)
    .sort((a, b) => (a.nextActionDate || "9999").localeCompare(b.nextActionDate || "9999"));

  const totalOpenValue = open.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);

  return (
    <div className="tab-panel">
      <div className="stat-row">
        <div className="pipe-stat">
          <span className="pipe-stat-value">{open.length}</span>
          <span className="pipe-stat-label">Open</span>
        </div>
        <div className="pipe-stat">
          <span className="pipe-stat-value">{money(totalOpenValue)}</span>
          <span className="pipe-stat-label">Estimated value</span>
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
                <th>Value</th>
                <th>Next action</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const overdue = Boolean(o.nextActionDate && o.nextActionDate < now);
                const dueToday = o.nextActionDate === now;
                const quiet = isStalled(o, now);

                return (
                  <tr key={o.id} className={overdue ? "row-overdue" : quiet ? "row-quiet" : ""}>
                    <td>
                      <button className="link-btn" onClick={() => onOpenProspect(o.prospectId)}>
                        {byId.get(o.prospectId)?.name || "Unknown household"}
                      </button>
                      {o.appointments.length > 0 && (
                        <span className="row-appointment">
                          {o.appointments.length} appointment
                          {o.appointments.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`stage-chip ${stageClassFor[o.stage]}`}>{o.stage}</span>
                      {quiet && (
                        <span className="quiet-note">
                          {daysBetween(o.updatedAt, now)}d quiet
                        </span>
                      )}
                    </td>
                    <td>{o.lines.join(", ") || "—"}</td>
                    <td className="num">{money(o.estimatedValue ?? 0)}</td>
                    <td>{o.nextAction}</td>
                    <td className={overdue ? "due-overdue" : dueToday ? "due-today" : ""}>
                      {o.nextActionDate || "—"}
                    </td>
                  </tr>
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
