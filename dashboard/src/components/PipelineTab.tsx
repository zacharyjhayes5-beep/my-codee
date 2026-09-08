import { useState } from "react";
import type { Opportunity, PolicyEntry, Prospect } from "../types";
import { PipelineBoard } from "./PipelineBoard";
import { QuoteDrawer } from "./QuoteDrawer";
import { blankDeal, dealsFromOpportunities, removeDeal, upsertDeal, type Deal } from "../lib/deals";

interface PipelineTabProps {
  opportunities: Opportunity[];
  prospects: Prospect[];
  onChange: (opportunities: Opportunity[]) => void;
  /** The book of business, so Written can post to it. Re-wired in step 3. */
  entries: PolicyEntry[];
  onEntriesChange: (updater: (prev: PolicyEntry[]) => PolicyEntry[]) => void;
  onProspectsChange: (updater: (prev: Prospect[]) => Prospect[]) => void;
  onOpenProspect: (prospectId: string) => void;
}

/**
 * The pipeline, as a board.
 *
 * STEPS ONE AND TWO OF THREE. The board and its drawer hold their cards in
 * local state and nothing else: an edit shows on screen and is forgotten on
 * reload. Persistence is step three.
 *
 * Two things are deliberately disconnected until step three, and both are
 * regressions against what was here yesterday:
 *
 *   - marking a card Written no longer posts to the book of business, so
 *     Progress will not see it;
 *   - the opportunity records the rest of the app reads — Operator's queue,
 *     the daily brief, the call queue — are untouched by anything done here.
 *
 * The seam that did that work is still in `lib/written.ts`, unused rather
 * than deleted.
 */
export function PipelineTab({ opportunities, prospects }: PipelineTabProps) {
  /**
   * Seeded from the opportunities the app already holds, so the board shows
   * his own households at review rather than invented ones.
   */
  const [deals, setDeals] = useState<Deal[]>(() =>
    dealsFromOpportunities(opportunities, prospects),
  );

  /** The card open in the drawer, and whether it is one the board has yet. */
  const [editing, setEditing] = useState<Deal | null>(null);
  const isNew = editing !== null && !deals.some((d) => d.id === editing.id);

  return (
    <div className="tab-panel">
      <PipelineBoard
        deals={deals}
        onChange={setDeals}
        onOpen={setEditing}
        onAdd={() => setEditing(blankDeal())}
      />

      {editing && (
        <QuoteDrawer
          deal={editing}
          isNew={isNew}
          onSave={(next) => {
            setDeals((prev) => upsertDeal(prev, next));
            setEditing(null);
          }}
          onDelete={(id) => {
            setDeals((prev) => removeDeal(prev, id));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
