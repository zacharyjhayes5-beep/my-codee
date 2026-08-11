import { useMemo, useState } from "react";
import type { Book, PolicyEntry } from "../types";
import {
  books,
  currency,
  grossCommission,
  linesForBook,
  monthNames,
  monthOf,
  netCommission,
  percent,
  totalsFor,
} from "../lib/policies";
import { newId, today } from "../lib/storage";

interface BookOfBusinessProps {
  entries: PolicyEntry[];
  onChange: (updater: (prev: PolicyEntry[]) => PolicyEntry[]) => void;
}

function blankEntry(book: Book): PolicyEntry {
  return {
    id: newId(),
    book,
    effectiveDate: today(),
    firstName: "",
    lastName: "",
    companyName: "",
    deathBenefit: 0,
    lineOfBusiness: "",
    policyNumber: "",
    premium: 0,
    percentEarned: 0,
    multiplier: 0,
    lastReview: "",
    notes: "",
  };
}

export function BookOfBusiness({ entries, onChange }: BookOfBusinessProps) {
  const [book, setBook] = useState<Book>("personal");
  const [month, setMonth] = useState<number | "all">("all");

  const visible = useMemo(() => {
    return entries
      .filter((e) => e.book === book)
      .filter((e) => month === "all" || monthOf(e.effectiveDate) === month)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  }, [entries, book, month]);

  const totals = useMemo(() => totalsFor(visible), [visible]);
  const options = useMemo(() => linesForBook(book), [book]);

  function patch(id: string, next: Partial<PolicyEntry>) {
    onChange((prev) => prev.map((e) => (e.id === id ? { ...e, ...next } : e)));
  }

  function addRow() {
    const entry = blankEntry(book);
    if (month !== "all") {
      const year = new Date().getFullYear();
      entry.effectiveDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    }
    onChange((prev) => [...prev, entry]);
  }

  const isLife = book === "life";
  const isCommercial = book === "commercial";

  return (
    <section className="book-section">
      <div className="book-head">
        <div>
          <h2>Book of business</h2>
          <p>
            Gross is premium × rate. Net adds the multiplier on top — the same math as the
            workbook.
          </p>
        </div>
        <div className="book-controls">
          <div className="book-tabs">
            {books.map((b) => (
              <button
                key={b.id}
                className={b.id === book ? "active" : ""}
                onClick={() => setBook(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>
          <select
            className="month-select"
            value={month}
            onChange={(e) => setMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All months</option>
            {monthNames.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <button className="primary-btn" onClick={addRow}>
            Add policy
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="book-table">
          <thead>
            <tr>
              {isLife && <th className="col-num">#</th>}
              <th>Effective</th>
              {isCommercial ? <th>Company</th> : <th>First name</th>}
              {!isCommercial && <th>Last name</th>}
              {isLife && <th>Death benefit</th>}
              <th>Line of business</th>
              {!isLife && <th>Policy #</th>}
              <th className="col-money">Premium</th>
              <th className="col-rate">Rate</th>
              <th className="col-money">Gross</th>
              <th className="col-rate">Mult.</th>
              <th className="col-money">Net</th>
              {isCommercial ? <th>Notes</th> : <th>Last review</th>}
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={14} className="empty">
                  Nothing in this book yet — add your first policy.
                </td>
              </tr>
            )}
            {visible.map((e, i) => (
              <tr key={e.id}>
                {isLife && <td className="col-num">{i + 1}</td>}
                <td>
                  <input
                    type="date"
                    value={e.effectiveDate}
                    onChange={(ev) => patch(e.id, { effectiveDate: ev.target.value })}
                  />
                </td>
                {isCommercial ? (
                  <td>
                    <input
                      value={e.companyName}
                      onChange={(ev) => patch(e.id, { companyName: ev.target.value })}
                      placeholder="Company"
                    />
                  </td>
                ) : (
                  <td>
                    <input
                      value={e.firstName}
                      onChange={(ev) => patch(e.id, { firstName: ev.target.value })}
                    />
                  </td>
                )}
                {!isCommercial && (
                  <td>
                    <input
                      value={e.lastName}
                      onChange={(ev) => patch(e.id, { lastName: ev.target.value })}
                    />
                  </td>
                )}
                {isLife && (
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={e.deathBenefit || ""}
                      onChange={(ev) => patch(e.id, { deathBenefit: Number(ev.target.value) })}
                    />
                  </td>
                )}
                <td>
                  <select
                    value={e.lineOfBusiness}
                    onChange={(ev) => patch(e.id, { lineOfBusiness: ev.target.value })}
                    className={e.lineOfBusiness ? "" : "needs-input"}
                  >
                    <option value="">Select…</option>
                    {options.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </td>
                {!isLife && (
                  <td>
                    <input
                      value={e.policyNumber}
                      onChange={(ev) => patch(e.id, { policyNumber: ev.target.value })}
                    />
                  </td>
                )}
                <td className="col-money">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={e.premium || ""}
                    onChange={(ev) => patch(e.id, { premium: Number(ev.target.value) })}
                    placeholder="0.00"
                  />
                </td>
                <td className="col-rate">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={e.percentEarned ? +(e.percentEarned * 100).toFixed(2) : ""}
                    onChange={(ev) =>
                      patch(e.id, { percentEarned: Number(ev.target.value) / 100 })
                    }
                    placeholder="%"
                  />
                </td>
                <td className="col-money computed">{currency(grossCommission(e))}</td>
                <td className="col-rate">
                  <input
                    type="number"
                    min={0}
                    step={0.05}
                    value={e.multiplier || ""}
                    onChange={(ev) => patch(e.id, { multiplier: Number(ev.target.value) })}
                    placeholder="0"
                  />
                </td>
                <td className="col-money computed strong">{currency(netCommission(e))}</td>
                {isCommercial ? (
                  <td>
                    <input
                      value={e.notes}
                      onChange={(ev) => patch(e.id, { notes: ev.target.value })}
                    />
                  </td>
                ) : (
                  <td>
                    <input
                      type="date"
                      value={e.lastReview}
                      onChange={(ev) => patch(e.id, { lastReview: ev.target.value })}
                    />
                  </td>
                )}
                <td>
                  <button
                    className="remove-btn"
                    aria-label="Remove policy"
                    onClick={() => onChange((prev) => prev.filter((x) => x.id !== e.id))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="book-totals">
        <div>
          <span>Total premium</span>
          <strong>{currency(totals.premium)}</strong>
        </div>
        <div>
          <span>Average premium</span>
          <strong>{currency(totals.avgPremium)}</strong>
        </div>
        <div>
          <span>Average commission</span>
          <strong>{percent(totals.avgRate)}</strong>
        </div>
        <div>
          <span>Total gross</span>
          <strong>{currency(totals.gross)}</strong>
        </div>
        <div>
          <span>Total net</span>
          <strong className="net">{currency(totals.net)}</strong>
        </div>
        {isLife && (
          <div>
            <span>Death benefit</span>
            <strong>{currency(totals.deathBenefit, 0)}</strong>
          </div>
        )}
      </div>
    </section>
  );
}
