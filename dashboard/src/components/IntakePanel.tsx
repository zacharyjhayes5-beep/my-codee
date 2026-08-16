import { useMemo, useRef, useState } from "react";
import type { Prospect } from "../types";
import { findDuplicates, type DuplicateMatch } from "../lib/dedupe";
import {
  FIELD_LABELS,
  IMPORT_FIELDS,
  applyMapping,
  guessMapping,
  parseCsv,
  prospectFromRow,
  rowIsUsable,
  type ImportField,
  type MappedRow,
} from "../lib/intake";
import { blankProspect } from "../lib/prospectSchema";
import { today } from "../lib/storage";

interface IntakePanelProps {
  prospects: Prospect[];
  onCreate: (prospect: Prospect) => void;
  onMerge: (existingId: string, incoming: Partial<Prospect>) => void;
}

type Mode = "quick" | "bulk";

/**
 * Lead intake. Quick Add for one person, Bulk Import for a list — both land in
 * the same prospect table, and both go past the duplicate check first.
 */
export function IntakePanel({ prospects, onCreate, onMerge }: IntakePanelProps) {
  const [mode, setMode] = useState<Mode>("quick");
  return (
    <section className="intake-panel">
      <div className="import-head">
        <h3>Add prospects</h3>
        <div className="mode-toggle">
          <button className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}>
            Quick add
          </button>
          <button className={mode === "bulk" ? "active" : ""} onClick={() => setMode("bulk")}>
            Bulk import
          </button>
        </div>
      </div>

      {mode === "quick" ? (
        <QuickAdd prospects={prospects} onCreate={onCreate} onMerge={onMerge} />
      ) : (
        <BulkImport prospects={prospects} onCreate={onCreate} onMerge={onMerge} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Quick add                                                           */
/* ------------------------------------------------------------------ */

function QuickAdd({ prospects, onCreate, onMerge }: IntakePanelProps) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    line1: "",
    city: "",
    leadSource: "",
    whyTheyFit: "",
  });
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);
  const [status, setStatus] = useState("");

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function build(): Prospect {
    const household = [form.firstName, form.lastName].filter(Boolean).join(" ");
    return blankProspect({
      name: household || "Untitled household",
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      email: form.email,
      address: { line1: form.line1, city: form.city, state: "MI", zip: "" },
      area: form.city ? `${form.city}, MI` : "",
      leadSource: form.leadSource,
      whyTheyFit: form.whyTheyFit,
      source: "manual",
      createdAt: today(),
      updatedAt: today(),
    });
  }

  function check() {
    const draft = build();
    const found = findDuplicates(draft, prospects);
    if (found.length > 0) {
      setMatches(found);
      return;
    }
    commit(draft);
  }

  function commit(draft: Prospect) {
    onCreate(draft);
    setForm({ firstName: "", lastName: "", phone: "", email: "", line1: "", city: "", leadSource: "", whyTheyFit: "" });
    setMatches(null);
    setStatus(`Added ${draft.name}.`);
  }

  const ready = Boolean(form.firstName || form.lastName) && Boolean(form.phone || form.line1);

  return (
    <div className="quick-add-form">
      <div className="intake-grid">
        <label className="mini-field">
          First name
          <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </label>
        <label className="mini-field">
          Last name
          <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </label>
        <label className="mini-field">
          Phone
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="mini-field">
          Email
          <input value={form.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="mini-field">
          Street
          <input value={form.line1} onChange={(e) => set("line1", e.target.value)} />
        </label>
        <label className="mini-field">
          City
          <input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </label>
        <label className="mini-field">
          Lead source
          <input
            value={form.leadSource}
            onChange={(e) => set("leadSource", e.target.value)}
            placeholder="referral, event, list…"
          />
        </label>
        <label className="mini-field wide">
          Why they fit
          <input
            value={form.whyTheyFit}
            onChange={(e) => set("whyTheyFit", e.target.value)}
            placeholder="What makes them worth a call"
          />
        </label>
      </div>

      {matches && (
        <DuplicateReview
          matches={matches}
          onMerge={(id) => {
            onMerge(id, build());
            setMatches(null);
            setStatus("Merged into the existing household.");
          }}
          onCreateAnyway={() => commit(build())}
          onCancel={() => setMatches(null)}
        />
      )}

      <div className="call-logger-foot">
        <button className="primary-btn" onClick={check} disabled={!ready}>
          Add prospect
        </button>
        {!ready && <span className="blocked-why">Needs a name and either a phone or an address</span>}
        {status && <span className="intake-status">{status}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk import                                                         */
/* ------------------------------------------------------------------ */

function BulkImport({ prospects, onCreate, onMerge }: IntakePanelProps) {
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Record<number, ImportField | "">>({});
  const [source, setSource] = useState("");
  const [pasted, setPasted] = useState("");
  const [decisions, setDecisions] = useState<Record<number, "create" | "skip" | string>>({});
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function load(text: string) {
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setStatus("Nothing readable in that file.");
      return;
    }
    setRows(parsed);
    setMapping(guessMapping(parsed[0]));
    setDecisions({});
    setStatus("");
  }

  const mapped: MappedRow[] = useMemo(
    () => (rows.length > 0 ? applyMapping(rows, mapping, hasHeader) : []),
    [rows, mapping, hasHeader],
  );

  const previewed = useMemo(
    () =>
      mapped.map((row) => {
        const usable = rowIsUsable(row);
        const draft = usable ? prospectFromRow(row, source) : null;
        const duplicates = draft ? findDuplicates(draft, prospects) : [];
        return { row, usable, draft, duplicates };
      }),
    [mapped, prospects, source],
  );

  const newCount = previewed.filter((p) => p.usable && p.duplicates.length === 0).length;
  const dupCount = previewed.filter((p) => p.duplicates.length > 0).length;
  const skipCount = previewed.filter((p) => !p.usable).length;

  function runImport() {
    let created = 0;
    let merged = 0;

    for (const item of previewed) {
      if (!item.usable || !item.draft) continue;
      const decision = decisions[item.row.index];

      if (item.duplicates.length > 0) {
        // Default for a duplicate is to do nothing — never create blindly.
        if (decision === "create") {
          onCreate(item.draft);
          created++;
        } else if (decision && decision !== "skip") {
          onMerge(decision, item.draft);
          merged++;
        }
        continue;
      }

      if (decision === "skip") continue;
      onCreate(item.draft);
      created++;
    }

    setStatus(`Imported ${created} new · merged ${merged} · left ${previewed.length - created - merged} alone.`);
    setRows([]);
    setDecisions({});
  }

  if (rows.length === 0) {
    return (
      <div className="bulk-import">
        <div
          className="drop-zone"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void file.text().then(load);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
        >
          <strong>Drop a CSV here</strong>
          <span>You'll match up the columns before anything is created.</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void file.text().then(load);
            }}
          />
        </div>
        <details className="paste-block">
          <summary>Or paste rows</summary>
          <textarea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button className="primary-btn" onClick={() => load(pasted)}>
            Read rows
          </button>
        </details>
        {status && <p className="inbox-message">{status}</p>}
      </div>
    );
  }

  return (
    <div className="bulk-import">
      <div className="import-controls">
        <label className="mini-field">
          Lead source for this list
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Kent County list" />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
          First row is column headings
        </label>
        <button className="ghost-btn" onClick={() => setRows([])}>
          Start over
        </button>
      </div>

      <h5 className="import-step">1 — Match the columns</h5>
      <div className="mapping-grid">
        {rows[0].map((header, column) => (
          <label className="mini-field" key={column}>
            {hasHeader ? header || `Column ${column + 1}` : `Column ${column + 1}`}
            <select
              value={mapping[column] ?? ""}
              onChange={(e) =>
                setMapping((prev) => ({ ...prev, [column]: e.target.value as ImportField | "" }))
              }
            >
              <option value="">Ignore</option>
              {IMPORT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABELS[f]}
                </option>
              ))}
            </select>
            <span className="mapping-sample">
              {(hasHeader ? rows[1]?.[column] : rows[0]?.[column]) || "—"}
            </span>
          </label>
        ))}
      </div>

      <h5 className="import-step">
        2 — Review · {newCount} new, {dupCount} possible duplicate{dupCount === 1 ? "" : "s"},{" "}
        {skipCount} unusable
      </h5>

      <div className="scroller">
        <table className="import-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            {previewed.slice(0, 60).map((item) => (
              <tr key={item.row.index} className={item.duplicates.length > 0 ? "dup-row" : ""}>
                <td>{item.draft?.name ?? <span className="muted-note">—</span>}</td>
                <td>{item.draft?.phone || "—"}</td>
                <td>{item.draft?.address.line1 || "—"}</td>
                <td>
                  {!item.usable ? (
                    <span className="muted-note">Skipped — needs a name and a way to reach them</span>
                  ) : item.duplicates.length > 0 ? (
                    <select
                      value={decisions[item.row.index] ?? "skip"}
                      onChange={(e) =>
                        setDecisions((prev) => ({ ...prev, [item.row.index]: e.target.value }))
                      }
                    >
                      <option value="skip">Skip — already have them</option>
                      {item.duplicates.map((d) => (
                        <option key={d.existing.id} value={d.existing.id}>
                          Merge into {d.existing.name} ({d.reason})
                        </option>
                      ))}
                      <option value="create">Create anyway — different household</option>
                    </select>
                  ) : (
                    <span className="good-note">Create</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previewed.length > 60 && (
        <p className="muted-note">Showing the first 60 of {previewed.length} rows.</p>
      )}

      <div className="call-logger-foot">
        <button className="primary-btn" onClick={runImport}>
          Import {newCount} prospect{newCount === 1 ? "" : "s"}
        </button>
        <button className="ghost-btn" onClick={() => setRows([])}>
          Cancel
        </button>
      </div>
      {status && <p className="inbox-message">{status}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DuplicateReview({
  matches,
  onMerge,
  onCreateAnyway,
  onCancel,
}: {
  matches: DuplicateMatch[];
  onMerge: (id: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dup-review">
      <strong>This may already be in your book.</strong>
      <ul>
        {matches.slice(0, 4).map((m) => (
          <li key={m.existing.id}>
            <span className={`dup-strength ${m.strength}`}>{m.strength}</span>
            <span>
              {m.existing.name} — {m.reason}
            </span>
            <button className="link-btn" onClick={() => onMerge(m.existing.id)}>
              Merge into this
            </button>
          </li>
        ))}
      </ul>
      <div className="dup-actions">
        <button className="ghost-btn" onClick={onCreateAnyway}>
          Create as a separate household
        </button>
        <button className="link-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
