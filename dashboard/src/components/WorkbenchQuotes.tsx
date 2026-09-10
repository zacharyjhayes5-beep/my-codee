import { useState } from "react";
import type { PolicyTerm, Prospect, QuoteVersion, Workbench, WorkbenchLine } from "../types";
import {
  LINE_LABELS,
  TERM_LABELS,
  attachNewDoc,
  blankQuote,
  comparePremiums,
  patchQuote,
  premiumPhrase,
  proposalSummary,
  quoteTitle,
  quotesByLine,
  setPlanningToBind,
} from "../lib/workbench";
import { newId } from "../lib/storage";
import { CopyButton } from "./CopyButton";

const TERMS: PolicyTerm[] = ["annual", "six-month", "quarterly", "monthly", "unknown"];

interface QuotesProps {
  bench: Workbench;
  prospect: Prospect | undefined;
  onChange: (bench: Workbench) => void;
}

/**
 * The current policy and the quotes being considered.
 *
 * One baseline and any number of proposed versions per line. Premiums are
 * kept exactly as typed, with the term stored beside them, and the comparison
 * underneath either states a difference or states why it cannot — a missing
 * premium and an unlabelled term are both refusals rather than assumptions.
 *
 * Price and coverage are shown as separate facts throughout. A lower premium
 * next to a higher deductible is two things, and nothing here rolls them into
 * a single "savings" number.
 */
export function WorkbenchQuotes({ bench, prospect, onChange }: QuotesProps) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = quotesByLine(bench);

  function setQuotes(quotes: QuoteVersion[]) {
    onChange({ ...bench, quotes });
  }

  /** "+ New document…" without leaving the quote you are typing into. */
  function linkNewDoc(quoteId: string, name: string, line: WorkbenchLine) {
    const made = attachNewDoc(bench, { name, line, category: "Quote / proposal" });
    onChange({ ...made.bench, quotes: patchQuote(made.bench.quotes, quoteId, { docId: made.docId }) });
  }

  function add(line: WorkbenchLine, kind: "current" | "proposed") {
    const made = blankQuote(line, kind);
    setQuotes([...bench.quotes, made]);
    setOpen(made.id);
  }

  return (
    <section className="wb-section">
      <header className="wb-section-head">
        <div>
          <h3>Current insurance and proposed quotes</h3>
          <p className="wb-summary-line">
            {bench.quotes.length === 0
              ? "Nothing entered yet."
              : `${bench.quotes.filter((q) => q.kind === "current").length} current · ${bench.quotes.filter((q) => q.kind === "proposed").length} proposed`}
          </p>
        </div>
        <CopyButton
          label="Copy proposal summary"
          text={() => proposalSummary(bench, prospect)}
          disabled={bench.quotes.length === 0}
        />
      </header>

      {groups.length === 0 && (
        <p className="empty">
          Choose the lines above, then record what the household has today and what you are
          offering.
        </p>
      )}

      {groups.map((group) => (
        <div className="wb-group" key={group.line}>
          <span className="wb-group-head">{LINE_LABELS[group.line]}</span>

          {/* ---- baseline ---- */}
          {group.current ? (
            <QuoteCard
              quote={group.current}
              bench={bench}
              open={open === group.current.id}
              onToggle={() => setOpen(open === group.current!.id ? null : group.current!.id)}
              onPatch={(patch) => setQuotes(patchQuote(bench.quotes, group.current!.id, patch))}
              onRemove={() => {
                setQuotes(bench.quotes.filter((q) => q.id !== group.current!.id));
                setOpen(null);
              }}
              onNewDoc={() =>
                linkNewDoc(group.current!.id, quoteTitle(group.current!), group.line)
              }
            />
          ) : (
            <button
              type="button"
              className="wb-add-quote"
              onClick={() => add(group.line, "current")}
            >
              + Record the current {LINE_LABELS[group.line].toLowerCase()} policy
            </button>
          )}

          {/* ---- proposals ---- */}
          {group.proposed.map((quote) => {
            const comparison = comparePremiums(group.current, quote);
            return (
              <div className="wb-quote-wrap" key={quote.id}>
                <QuoteCard
                  quote={quote}
                  bench={bench}
                  open={open === quote.id}
                  onToggle={() => setOpen(open === quote.id ? null : quote.id)}
                  onPatch={(patch) => setQuotes(patchQuote(bench.quotes, quote.id, patch))}
                  onRemove={() => {
                    setQuotes(bench.quotes.filter((q) => q.id !== quote.id));
                    setOpen(null);
                  }}
                  onBind={() => setQuotes(setPlanningToBind(bench.quotes, quote.id))}
                  onNewDoc={() => linkNewDoc(quote.id, quoteTitle(quote), group.line)}
                />
                <p className={`wb-compare is-${comparison.status}`}>{comparison.message}</p>
                {comparison.current?.converted && (
                  <p className="wb-hint">Current: {comparison.current.note}</p>
                )}
                {comparison.proposed?.converted && (
                  <p className="wb-hint">Proposed: {comparison.proposed.note}</p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className="wb-add-quote"
            onClick={() => add(group.line, "proposed")}
          >
            + Add a {LINE_LABELS[group.line].toLowerCase()} quote version
          </button>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */

interface QuoteCardProps {
  quote: QuoteVersion;
  bench: Workbench;
  open: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<QuoteVersion>) => void;
  onRemove: () => void;
  onBind?: () => void;
  onNewDoc: () => void;
}

function QuoteCard({ quote, bench, open, onToggle, onPatch, onRemove, onBind, onNewDoc }: QuoteCardProps) {
  return (
    <article className={`wb-quote kind-${quote.kind}${quote.planningToBind ? " is-binding" : ""}`}>
      <div className="wb-quote-top">
        <button type="button" className="wb-quote-open" aria-expanded={open} onClick={onToggle}>
          <span className="wb-quote-kind">
            {quote.kind === "current" ? "Current" : "Proposed"}
          </span>
          <span className="wb-quote-title">{quoteTitle(quote)}</span>
          <span className="wb-quote-premium">{premiumPhrase(quote)}</span>
        </button>

        {quote.kind === "proposed" && onBind && (
          <label className="wb-bind">
            <input type="checkbox" checked={quote.planningToBind} onChange={onBind} />
            <span>Planning to bind</span>
          </label>
        )}
      </div>

      {open && (
        <div className="wb-quote-body">
          <div className="wb-grid">
            <label className="wb-field">
              <span className="wb-label">Carrier</span>
              <input value={quote.carrier} onChange={(e) => onPatch({ carrier: e.target.value })} />
            </label>
            <label className="wb-field">
              <span className="wb-label">Version label</span>
              <input
                value={quote.label}
                placeholder="Version A, higher deductible…"
                onChange={(e) => onPatch({ label: e.target.value })}
              />
            </label>
            <label className="wb-field">
              <span className="wb-label">Quote date</span>
              <input
                type="date"
                value={quote.quoteDate}
                onChange={(e) => onPatch({ quoteDate: e.target.value })}
              />
            </label>
            <label className="wb-field">
              <span className="wb-label">Effective date</span>
              <input
                type="date"
                value={quote.effectiveDate}
                onChange={(e) => onPatch({ effectiveDate: e.target.value })}
              />
            </label>
            <label className="wb-field">
              <span className="wb-label">Premium</span>
              <input
                inputMode="decimal"
                value={quote.premium}
                placeholder="Leave blank if not priced"
                onChange={(e) => onPatch({ premium: e.target.value })}
              />
            </label>
            <label className="wb-field">
              <span className="wb-label">Policy term</span>
              <select
                value={quote.term}
                onChange={(e) => onPatch({ term: e.target.value as PolicyTerm })}
              >
                {TERMS.map((t) => (
                  <option key={t} value={t}>
                    {TERM_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {quote.term === "unknown" && quote.premium.trim() !== "" && (
            <p className="wb-warn">
              A premium with no term cannot be compared against anything. Set the term to
              compare it.
            </p>
          )}

          <label className="wb-field">
            <span className="wb-label">Payment and billing notes</span>
            <input
              value={quote.billingNotes}
              placeholder="Instalments, pay-in-full discount…"
              onChange={(e) => onPatch({ billingNotes: e.target.value })}
            />
            <span className="wb-hint">
              Put the total premium in the premium box above, not an instalment amount.
            </span>
          </label>

          {/* ---- coverages ---- */}
          <div className="wb-field">
            <span className="wb-label">Coverage limits and deductibles</span>
            {quote.coverages.length === 0 && (
              <p className="wb-hint">Nothing entered. These are yours to type — none are inferred.</p>
            )}
            {quote.coverages.map((c, i) => (
              <div className="wb-cover-row" key={c.id}>
                <input
                  value={c.label}
                  placeholder="Coverage"
                  aria-label={`Coverage ${i + 1} name`}
                  onChange={(e) =>
                    onPatch({
                      coverages: quote.coverages.map((x) =>
                        x.id === c.id ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                />
                <input
                  value={c.value}
                  placeholder="Limit or deductible"
                  aria-label={`Coverage ${i + 1} value`}
                  onChange={(e) =>
                    onPatch({
                      coverages: quote.coverages.map((x) =>
                        x.id === c.id ? { ...x, value: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="wb-remove"
                  aria-label={`Remove coverage ${i + 1}`}
                  onClick={() =>
                    onPatch({ coverages: quote.coverages.filter((x) => x.id !== c.id) })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                onPatch({
                  coverages: [...quote.coverages, { id: newId(), label: "", value: "" }],
                })
              }
            >
              + Add a coverage line
            </button>
          </div>

          <label className="wb-field">
            <span className="wb-label">Material coverage differences and trade-offs</span>
            <textarea
              rows={2}
              value={quote.differences}
              placeholder="Higher deductible, no roof replacement cost, added water backup…"
              onChange={(e) => onPatch({ differences: e.target.value })}
            />
            <span className="wb-hint">
              Nothing is assumed equivalent between policies. What you write here is what the
              summary says.
            </span>
          </label>

          <label className="wb-field">
            <span className="wb-label">Unresolved questions</span>
            <textarea
              rows={2}
              value={quote.questions}
              onChange={(e) => onPatch({ questions: e.target.value })}
            />
          </label>

          <label className="wb-field">
            <span className="wb-label">Source document</span>
            <select
              value={quote.docId ?? ""}
              onChange={(e) => {
                if (e.target.value === "__new") {
                  onNewDoc();
                  return;
                }
                onPatch({ docId: e.target.value || undefined });
              }}
            >
              <option value="">— none —</option>
              {bench.docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || "Untitled document"}
                </option>
              ))}
              <option value="__new">+ New document…</option>
            </select>
          </label>

          <div className="wb-item-actions">
            <span className="wb-hint">Last changed {quote.updatedAt}</span>
            <button type="button" className="wb-remove" onClick={onRemove}>
              Remove this {quote.kind === "current" ? "policy" : "quote"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
