import { useState } from "react";
import {
  DEAL_STAGES,
  ageLabel,
  ageTone,
  dealTotal,
  money,
  moveDeal,
  openPremium,
  type Deal,
  type DealStage,
} from "../lib/deals";

interface PipelineBoardProps {
  deals: Deal[];
  onChange: (next: Deal[]) => void;
  /** Opens the quote drawer. Wired in step two. */
  onOpen?: (deal: Deal) => void;
  onAdd?: () => void;
}

/**
 * The pipeline as a board.
 *
 * Four fixed columns, one card per household, dragged between them. The
 * columns are a 1px grid gap showing the container through, so the hairlines
 * between them are true single pixels rather than two borders meeting.
 */
export function PipelineBoard({ deals, onChange, onOpen, onAdd }: PipelineBoardProps) {
  /** The card in flight, and the column under the cursor. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<DealStage | null>(null);

  function drop(stage: DealStage) {
    if (dragId) onChange(moveDeal(deals, dragId, stage));
    setDragId(null);
    setHover(null);
  }

  return (
    <div className="kanban">
      <div className="kanban-head">
        <button type="button" className="kanban-add" onClick={onAdd}>
          + Add household
        </button>
        <span className="kanban-rule" aria-hidden="true" />
        <span className="kanban-meta">
          {deals.length} household{deals.length === 1 ? "" : "s"} ·{" "}
          {money(openPremium(deals))} open premium
        </span>
      </div>

      <div className="kanban-board">
        {DEAL_STAGES.map((stage) => {
          const cards = deals.filter((d) => d.stage === stage.id);
          const sum = cards.reduce((t, d) => t + dealTotal(d), 0);

          return (
            <div
              key={stage.id}
              className={`kanban-column${hover === stage.id ? " is-hover" : ""}`}
              onDragOver={(e) => {
                // Without preventDefault the browser refuses the drop.
                e.preventDefault();
                if (hover !== stage.id) setHover(stage.id);
              }}
              onDragLeave={(e) => {
                // Ignore the events that fire crossing a child of the column.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage.id);
              }}
            >
              <div className="kanban-column-head">
                <div className="kanban-column-title">
                  <span className="kanban-dot" style={{ background: stage.hue }} aria-hidden="true" />
                  <span className="kanban-stage">{stage.label}</span>
                  <span className="kanban-count" style={{ color: stage.hue }}>
                    {cards.length}
                  </span>
                </div>
                <span className="kanban-column-total">
                  {sum ? `${money(sum)} in premium` : "No premium entered"}
                </span>
              </div>

              <div className="kanban-cards">
                {cards.map((deal) => {
                  const total = dealTotal(deal);
                  return (
                    <div
                      key={deal.id}
                      className="kanban-card"
                      draggable
                      onDragStart={(e) => {
                        setDragId(deal.id);
                        // Firefox will not start a drag without payload.
                        e.dataTransfer.setData("text/plain", deal.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setHover(null);
                      }}
                      onClick={() => onOpen?.(deal)}
                    >
                      <span className="kanban-card-who">
                        <span className="kanban-name">{deal.name || "Untitled household"}</span>
                        <span className="kanban-place">{deal.place}</span>
                      </span>

                      <span className="kanban-chips">
                        {(deal.rows ?? [])
                          .map((r) => r.line)
                          .filter(Boolean)
                          .map((line, i) => (
                            <span className="kanban-chip" key={`${line}-${i}`}>
                              {line}
                            </span>
                          ))}
                      </span>

                      <span className="kanban-card-foot">
                        <span className="kanban-premium">
                          {total ? money(total) : "No quote"}
                        </span>
                        <span className="kanban-age" style={{ color: ageTone(deal) }}>
                          {ageLabel(deal)}
                        </span>
                      </span>
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <span className="kanban-empty">Drag a household here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
