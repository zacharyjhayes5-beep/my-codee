import { useMemo } from "react";
import type { Opportunity, Prospect, Workbench } from "../types";
import { patchOpportunity } from "../lib/opportunities";
import {
  blankWorkbench,
  linesFromOpportunity,
  quoteRowsFromWorkbench,
  upsertWorkbench,
  workbenchFor,
} from "../lib/workbench";
import { QuoteWorkbench } from "./QuoteWorkbench";

interface HostProps {
  /** The account whose workbench to show. Null renders nothing. */
  opportunityId: string | null;
  opportunities: Opportunity[];
  prospects: Prospect[];
  workbenches: Workbench[];
  onWorkbenchesChange: (next: Workbench[]) => void;
  onOpportunitiesChange: (next: Opportunity[]) => void;
  onProspectsChange: (updater: (prev: Prospect[]) => Prospect[]) => void;
  ownerName: string;
  onClose: () => void;
}

/**
 * Finds — or makes up on the spot — the workbench for one account.
 *
 * A workbench is materialised lazily and only persisted once something is
 * actually entered. Opening an account to look at it therefore writes nothing,
 * which keeps the store free of empty rows for every card that was ever
 * clicked, and means an older record opens exactly as it did before.
 *
 * The draft's identity is memoised on the opportunity id so it survives
 * re-renders; without that, every keystroke would mint a new workbench.
 *
 * Both entry points — the household record and the pipeline board — come
 * through here, so there is one workbench per account however it was reached.
 */
export function QuoteWorkbenchHost({
  opportunityId,
  opportunities,
  prospects,
  workbenches,
  onWorkbenchesChange,
  onOpportunitiesChange,
  onProspectsChange,
  ownerName,
  onClose,
}: HostProps) {
  const opportunity = opportunityId
    ? opportunities.find((o) => o.id === opportunityId)
    : undefined;

  const stored = opportunityId ? workbenchFor(workbenches, opportunityId) : undefined;

  const draft = useMemo(
    () =>
      opportunity && !stored
        ? blankWorkbench(opportunity.id, opportunity.prospectId, linesFromOpportunity(opportunity))
        : null,
    // Deliberately keyed on the account rather than the whole record: a draft
    // must not be rebuilt because a premium was typed elsewhere on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opportunity?.id, stored?.id],
  );

  const bench = stored ?? draft;
  if (!opportunity || !bench) return null;

  const prospect = prospects.find((p) => p.id === opportunity.prospectId);

  /**
   * Saves the workbench, and keeps the pipeline card showing the same money.
   *
   * The board reads `quoteRows` and asks for one annual figure per line, so
   * the chosen proposals are annualized on the way across — writing a
   * six-month premium straight onto the card would halve what the account
   * looks like it is worth. `quoteRowsFromWorkbench` returns null until at
   * least one proposal carries a usable premium, and until then whatever was
   * typed in the quick drawer is left exactly as it is.
   */
  function save(next: Workbench) {
    onWorkbenchesChange(upsertWorkbench(workbenches, next));

    const rows = quoteRowsFromWorkbench(next);
    if (!rows) return;

    const before = JSON.stringify(opportunity!.quoteRows ?? []);
    if (JSON.stringify(rows) === before) return;

    onOpportunitiesChange(
      opportunities.map((o) =>
        o.id === opportunity!.id ? patchOpportunity(o, { quoteRows: rows }) : o,
      ),
    );
  }

  return (
    <QuoteWorkbench
      bench={bench}
      prospect={prospect}
      opportunity={opportunity}
      ownerName={ownerName}
      onChange={save}
      onOpportunityChange={(patch) =>
        onOpportunitiesChange(
          opportunities.map((o) => (o.id === opportunity.id ? patchOpportunity(o, patch) : o)),
        )
      }
      onProspectChange={(patch) =>
        onProspectsChange((prev) =>
          prev.map((p) => (p.id === opportunity.prospectId ? { ...p, ...patch } : p)),
        )
      }
      onClose={onClose}
    />
  );
}
