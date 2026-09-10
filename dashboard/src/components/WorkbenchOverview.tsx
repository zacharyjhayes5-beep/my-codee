import { useMemo } from "react";
import type { Opportunity, Prospect, Workbench } from "../types";
import {
  LINE_LABELS,
  STATUS_LABELS,
  countStatuses,
  currentInsurance,
  money,
  outstandingItems,
  portfolioTotals,
  premiumPhrase,
  proposalSummary,
  quoteTitle,
  readPrebind,
  summaryLine,
  type WorkbenchPane,
} from "../lib/workbench";
import { CopyButton } from "./CopyButton";

interface OverviewProps {
  bench: Workbench;
  prospect: Prospect | undefined;
  opportunity: Opportunity;
  onGo: (pane: WorkbenchPane) => void;
  onOpenRequest: () => void;
}

/**
 * The account on one screen.
 *
 * This is the pane that makes the workbench a place rather than a set of
 * forms: what the household already has, what is still owed, where the
 * quotes stand and what is stopping a pre-bind review — each one a summary
 * with a way through to the pane that can change it.
 *
 * Every figure on it is entered or derived from entered figures, and the two
 * places a number could mislead are handled the same way they are everywhere
 * else here: a total says how many lines it covers and names the ones it had
 * to leave out, and a comparison refuses rather than guesses.
 */
export function WorkbenchOverview({
  bench,
  prospect,
  opportunity,
  onGo,
  onOpenRequest,
}: OverviewProps) {
  // The header above re-renders on every keystroke, so this pane does too.
  // None of these is expensive, but recomputing five passes over the account
  // for a character typed into the next-action box is work nobody asked for.
  const counts = useMemo(() => countStatuses(bench.items), [bench.items]);
  const outstanding = useMemo(() => outstandingItems(bench.items), [bench.items]);
  const prebind = useMemo(() => readPrebind(bench), [bench]);
  const totals = useMemo(() => portfolioTotals(bench), [bench]);
  const held = useMemo(() => currentInsurance(bench), [bench]);

  const empty =
    bench.lines.length === 0 && bench.items.length === 0 && bench.quotes.length === 0;

  if (empty) {
    return (
      <section className="wb-section">
        <div className="wb-empty-state">
          <h3>Start the quote</h3>
          <p>
            Pick the lines you are quoting at the top of this panel. That loads a starter
            checklist for each one, and everything else here follows from it — what is
            missing, what you have quoted, and what is left before a pre-bind review.
          </p>
          <p className="wb-hint">
            Nothing is filled in for you. Every figure on this screen is one you entered.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="wb-section wb-overview">
      {/* ---------- 1. what they already have ---------- */}
      <div className="wb-card">
        <header className="wb-card-head">
          <h3>What they have now</h3>
          <button type="button" className="link-btn" onClick={() => onGo("quotes")}>
            {held.length > 0 ? "Edit" : "Record it"}
          </button>
        </header>

        {held.length === 0 ? (
          <p className="empty">
            No current policy recorded. Without a baseline there is nothing to compare a
            quote against, so this is usually the first thing worth entering.
          </p>
        ) : (
          <ul className="wb-mini-list">
            {held.map(({ line, quote, annual }) => (
              <li key={quote.id}>
                <span className="wb-mini-line">{LINE_LABELS[line]}</span>
                <span className="wb-mini-main">{quoteTitle(quote)}</span>
                <span className="wb-mini-figure">{premiumPhrase(quote)}</span>
                {annual?.converted && (
                  <span className="wb-hint">{money(annual.value)} a year (calculated)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- 2. where the quotes stand ---------- */}
      <div className="wb-card">
        <header className="wb-card-head">
          <h3>Where the quotes stand</h3>
          <div className="wb-card-actions">
            <CopyButton
              className="link-btn"
              label="Copy proposal"
              text={() => proposalSummary(bench, prospect)}
              disabled={bench.quotes.length === 0}
            />
            <button type="button" className="link-btn" onClick={() => onGo("quotes")}>
              Open
            </button>
          </div>
        </header>

        {totals.lines.length === 0 ? (
          <p className="empty">No quotes entered yet.</p>
        ) : (
          <>
            <ul className="wb-mini-list">
              {totals.lines.map((row) => (
                <li key={row.line}>
                  <span className="wb-mini-line">{LINE_LABELS[row.line]}</span>
                  <span className="wb-mini-main">
                    {row.proposed ? quoteTitle(row.proposed) : "No proposal chosen"}
                    {row.proposed?.planningToBind && (
                      <span className="wb-tag-bind">planning to bind</span>
                    )}
                  </span>
                  <span className="wb-mini-figure">
                    {row.proposed ? premiumPhrase(row.proposed) : "—"}
                  </span>
                  <span
                    className={`wb-mini-note is-${row.comparison.status}`}
                  >
                    {row.comparison.message}
                  </span>
                </li>
              ))}
            </ul>

            <p className={`wb-total${totals.difference === null ? " is-refused" : ""}`}>
              {totals.message}
            </p>

            {totals.excluded.length > 0 && (
              <ul className="wb-excluded">
                {totals.excluded.map((x) => (
                  <li key={x.line}>
                    {LINE_LABELS[x.line]} left out of the total — {x.reason}.
                  </li>
                ))}
              </ul>
            )}

            {totals.proposedKnownTotal !== null && (
              <p className="wb-subtotal">
                Proposed premium totals {money(totals.proposedKnownTotal)} a year across{" "}
                {totals.proposedPricedLines} priced line
                {totals.proposedPricedLines === 1 ? "" : "s"} — what you are offering, not a
                saving.
              </p>
            )}

            {totals.proposedUnpriced > 0 && (
              <p className="wb-hint">
                {totals.proposedUnpriced} chosen quote
                {totals.proposedUnpriced === 1 ? " has" : "s have"} no usable premium yet, so
                nothing was assumed for {totals.proposedUnpriced === 1 ? "it" : "them"}.
              </p>
            )}
          </>
        )}
      </div>

      {/* ---------- 3. what is missing ---------- */}
      <div className="wb-card">
        <header className="wb-card-head">
          <h3>What is missing</h3>
          <div className="wb-card-actions">
            <button
              type="button"
              className="link-btn"
              onClick={onOpenRequest}
              disabled={outstanding.length === 0}
            >
              Draft request
            </button>
            <button type="button" className="link-btn" onClick={() => onGo("checklist")}>
              Open
            </button>
          </div>
        </header>

        <p className="wb-summary-line">{summaryLine(counts)}</p>

        {outstanding.length === 0 ? (
          <p className="empty">
            {bench.items.length === 0
              ? "No checklist yet — choose the lines you are quoting."
              : "Nothing outstanding on the information list."}
          </p>
        ) : (
          <ul className="wb-mini-list">
            {outstanding.slice(0, 6).map((item) => (
              <li key={item.id}>
                <span className="wb-mini-line">
                  {item.line ? LINE_LABELS[item.line] : "Household"}
                </span>
                <span className="wb-mini-main">{item.label}</span>
                <span className={`wb-status-word wb-status-${item.status}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </li>
            ))}
            {outstanding.length > 6 && (
              <li className="wb-mini-more">
                <button type="button" className="link-btn" onClick={() => onGo("checklist")}>
                  {outstanding.length - 6} more
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ---------- 4. before a pre-bind review ---------- */}
      <div className="wb-card">
        <header className="wb-card-head">
          <h3>Before a pre-bind review</h3>
          <button type="button" className="link-btn" onClick={() => onGo("prebind")}>
            Open
          </button>
        </header>

        <p className="wb-summary-line">{prebind.summary}</p>

        {prebind.selected.length > 0 && (
          <ul className="wb-mini-list">
            {prebind.selected.map((quote) => (
              <li key={quote.id}>
                <span className="wb-mini-line">{LINE_LABELS[quote.line]}</span>
                <span className="wb-mini-main">{quoteTitle(quote)}</span>
                <span className="wb-mini-figure">
                  {quote.effectiveDate ? `effective ${quote.effectiveDate}` : "no effective date"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="wb-hint">
          A count of what you have gathered. It never means coverage is bound or that
          underwriting has approved anything.
        </p>
      </div>

      {/* ---------- 5. what is owed next ---------- */}
      <div className="wb-card">
        <header className="wb-card-head">
          <h3>What is next</h3>
        </header>
        {opportunity.nextAction.trim() ? (
          <p className="wb-next-read">
            <strong>{opportunity.nextAction}</strong>
            {opportunity.nextActionDate ? (
              <span className="wb-hint"> · due {opportunity.nextActionDate}</span>
            ) : (
              <span className="wb-hint"> · no date set, so Operator cannot queue it</span>
            )}
          </p>
        ) : (
          <p className="empty">
            No next action. Set one at the top of this panel and it appears in Operator.
          </p>
        )}
        <p className="wb-hint">Stage: {opportunity.stage}</p>
      </div>
    </section>
  );
}
