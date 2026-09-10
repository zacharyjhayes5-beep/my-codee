import { useMemo, useState } from "react";
import type { Opportunity, PolicyEntry, Prospect, Workbench } from "../types";
import { PipelineBoard } from "./PipelineBoard";
import { QuoteDrawer } from "./QuoteDrawer";
import { QuoteWorkbenchHost } from "./QuoteWorkbenchHost";
import {
  OPPORTUNITY_STAGE_FOR,
  blankDeal,
  dealsFromOpportunities,
  recordsFromDeal,
  type Deal,
  type DealStage,
} from "../lib/deals";
import { blankProspect } from "../lib/prospectSchema";
import { applyWritten, undoWritten } from "../lib/written";
import { today } from "../lib/storage";

interface PipelineTabProps {
  opportunities: Opportunity[];
  prospects: Prospect[];
  onChange: (opportunities: Opportunity[]) => void;
  entries: PolicyEntry[];
  onEntriesChange: (updater: (prev: PolicyEntry[]) => PolicyEntry[]) => void;
  onProspectsChange: (updater: (prev: Prospect[]) => Prospect[]) => void;
  onOpenProspect: (prospectId: string) => void;
  workbenches: Workbench[];
  onWorkbenchesChange: (workbenches: Workbench[]) => void;
  ownerName: string;
}

/**
 * The pipeline, as a board.
 *
 * The board is a *view* over the opportunity records the rest of the
 * dashboard already reads — not a second store beside them. That is what
 * keeps Operator's queue, the daily brief, the call queue and the book of
 * business agreeing with what is on screen here, and it is why marking a
 * card Won still posts its policies to the book.
 *
 * There is no separate `pipeline_deals` table and no HTTP endpoint, which
 * the handoff asked for. This application is local-first: IndexedDB through
 * `lib/repository.ts` is the system of record, the Worker exists only to
 * ingest county leads, and a table there would not be the truth about
 * anything. Writes here are synchronous and durable, so an optimistic patch
 * with a revert has nothing to be optimistic about — the equivalent is
 * simply writing through the repository, which is what this does.
 */
export function PipelineTab({
  opportunities,
  prospects,
  onChange,
  entries,
  onEntriesChange,
  onProspectsChange,
  workbenches,
  onWorkbenchesChange,
  ownerName,
}: PipelineTabProps) {
  const deals = useMemo(
    () => dealsFromOpportunities(opportunities, prospects),
    [opportunities, prospects],
  );

  /** The card open in the drawer. Held by value so edits are on a copy. */
  const [editing, setEditing] = useState<Deal | null>(null);
  /**
   * The account whose workbench is open. Separate from `editing`: the drawer
   * is the four-field quick edit for moving a card along, the workbench is the
   * workspace behind it, and opening one must not open the other.
   */
  const [workbenchId, setWorkbenchId] = useState<string | null>(null);
  const isNew = editing !== null && !opportunities.some((o) => o.id === editing.id);

  /**
   * Marking a card Won posts its policies to the book and moves the
   * household; moving it back out takes them away again. Unchanged from what
   * the list view did — the board is just another way to set the stage.
   */
  function settleBook(next: Opportunity, before: Opportunity | undefined) {
    if (next.stage === "Won") {
      const result = applyWritten(next, prospects.find((p) => p.id === next.prospectId), entries);
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

  /** A drag. Writes the stage and restarts the card's clock. */
  function moveTo(id: string, stage: DealStage) {
    const before = opportunities.find((o) => o.id === id);
    if (!before) return;

    const next: Opportunity = {
      ...before,
      stage: OPPORTUNITY_STAGE_FOR[stage] as Opportunity["stage"],
      stageEnteredAt: new Date().toISOString(),
      updatedAt: today(),
    };
    onChange(opportunities.map((o) => (o.id === id ? next : o)));
    settleBook(next, before);
  }

  function save(deal: Deal) {
    const before = opportunities.find((o) => o.id === deal.id);

    // A card added on the board is a household nobody has entered yet, so it
    // becomes one — the pipeline never holds a name that Leads cannot find.
    let household = before
      ? prospects.find((p) => p.id === before.prospectId)
      : prospects.find((p) => p.name.trim().toLowerCase() === deal.name.trim().toLowerCase());

    let created: Prospect | null = null;
    if (!household) {
      created = blankProspect({
        name: deal.name || "Untitled household",
        area: deal.place ? `${deal.place}, MI` : "",
        phone: deal.phone,
        stage: "Quoting",
        source: "manual",
        createdAt: today(),
        updatedAt: today(),
      });
      household = created;
    }

    const records = recordsFromDeal(deal, before, household);

    if (created) {
      onProspectsChange((prev) => [...prev, records.prospect ?? created!]);
    } else if (records.prospect) {
      onProspectsChange((prev) =>
        prev.map((p) => (p.id === records.prospect!.id ? records.prospect! : p)),
      );
    }

    onChange(
      before
        ? opportunities.map((o) => (o.id === deal.id ? records.opportunity : o))
        : [...opportunities, records.opportunity],
    );

    settleBook(records.opportunity, before);
    setEditing(null);
  }

  /**
   * Delete takes the account off the board. The household stays on Leads —
   * dropping a piece of work says nothing about whether the person is still
   * worth calling.
   */
  function remove(id: string) {
    const before = opportunities.find((o) => o.id === id);
    if (before?.stage === "Won") onEntriesChange((prev) => undoWritten(prev, id));
    onChange(opportunities.filter((o) => o.id !== id));
    setEditing(null);
  }

  return (
    <div className="tab-panel">
      <PipelineBoard
        deals={deals}
        onMove={moveTo}
        onOpen={setEditing}
        onAdd={() => setEditing(blankDeal())}
        onOpenWorkbench={setWorkbenchId}
      />

      {editing && (
        <QuoteDrawer
          deal={editing}
          isNew={isNew}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}

      <QuoteWorkbenchHost
        opportunityId={workbenchId}
        opportunities={opportunities}
        prospects={prospects}
        workbenches={workbenches}
        onWorkbenchesChange={onWorkbenchesChange}
        onOpportunitiesChange={onChange}
        ownerName={ownerName}
        onClose={() => setWorkbenchId(null)}
      />
    </div>
  );
}
