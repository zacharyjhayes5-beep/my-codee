import type { Workbench, WorkbenchDoc, WorkbenchLine } from "../types";
import { DOC_CATEGORIES, LINE_LABELS, blankDoc, docLinkKind, quoteTitle } from "../lib/workbench";
import { CopyButton } from "./CopyButton";

interface DocsProps {
  bench: Workbench;
  onChange: (bench: Workbench) => void;
}

/**
 * Pointers to documents — never the documents themselves.
 *
 * Nothing is uploaded anywhere. The app stores a name, a category, a location
 * and a note, which keeps document *contents* out of browser storage
 * altogether; what is kept is a reference the agent can follow.
 *
 * A location that is an http(s) URL gets a real link. A Windows path does not,
 * because a browser cannot open one — it gets a copy-path button instead,
 * which is the honest version of the same affordance.
 */
export function WorkbenchDocs({ bench, onChange }: DocsProps) {
  function setDocs(docs: WorkbenchDoc[]) {
    onChange({ ...bench, docs });
  }

  function patch(id: string, change: Partial<WorkbenchDoc>) {
    setDocs(bench.docs.map((d) => (d.id === id ? { ...d, ...change } : d)));
  }

  /** Removing a document also clears every reference to it. */
  function remove(id: string) {
    onChange({
      ...bench,
      docs: bench.docs.filter((d) => d.id !== id),
      items: bench.items.map((i) => (i.docId === id ? { ...i, docId: undefined } : i)),
      quotes: bench.quotes.map((q) => (q.docId === id ? { ...q, docId: undefined } : q)),
      prebind: bench.prebind.map((p) => (p.docId === id ? { ...p, docId: undefined } : p)),
    });
  }

  return (
    <section className="wb-section">
      <header className="wb-section-head">
        <div>
          <h3>Document links</h3>
          <p className="wb-summary-line">
            {bench.docs.length === 0
              ? "Nothing linked yet."
              : `${bench.docs.length} link${bench.docs.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => setDocs([...bench.docs, blankDoc()])}>
          + Add a document
        </button>
      </header>

      <p className="wb-caveat">
        References only — no file is uploaded and no document contents are stored. A linked
        document is evidence; it never marks an item verified on its own.
      </p>

      {bench.docs.length === 0 ? (
        <p className="empty">
          No documents linked. Add a declarations page, a quote PDF or a photo folder and it
          becomes selectable everywhere else in this workbench.
        </p>
      ) : (
        <ul className="wb-docs">
          {bench.docs.map((doc) => {
            const kind = docLinkKind(doc.location);
            const attached = [
              ...bench.items.filter((i) => i.docId === doc.id).map((i) => i.label),
              ...bench.quotes.filter((q) => q.docId === doc.id).map(quoteTitle),
              ...bench.prebind.filter((p) => p.docId === doc.id).map((p) => p.label),
            ];

            return (
              <li className="wb-doc" key={doc.id}>
                <div className="wb-grid">
                  <label className="wb-field">
                    <span className="wb-label">Display name</span>
                    <input
                      value={doc.name}
                      placeholder="Prior auto dec page"
                      onChange={(e) => patch(doc.id, { name: e.target.value })}
                    />
                  </label>
                  <label className="wb-field">
                    <span className="wb-label">Category</span>
                    <select
                      value={doc.category}
                      onChange={(e) => patch(doc.id, { category: e.target.value })}
                    >
                      {DOC_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="wb-field">
                  <span className="wb-label">File location or URL</span>
                  <input
                    value={doc.location}
                    placeholder="https://… or C:\Users\…"
                    onChange={(e) => patch(doc.id, { location: e.target.value })}
                  />
                </label>

                <div className="wb-doc-open">
                  {kind === "url" && (
                    <a
                      className="ghost-btn"
                      href={doc.location.trim()}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open link
                    </a>
                  )}
                  {kind === "path" && (
                    <>
                      <CopyButton label="Copy path" text={() => doc.location.trim()} />
                      <span className="wb-hint">
                        A browser cannot open a file path. Copy it and paste it into Explorer.
                      </span>
                    </>
                  )}
                  {kind === "empty" && <span className="wb-hint">No location recorded yet.</span>}
                </div>

                <div className="wb-grid">
                  <label className="wb-field">
                    <span className="wb-label">Associated line</span>
                    <select
                      value={doc.line ?? ""}
                      onChange={(e) =>
                        patch(doc.id, { line: (e.target.value || null) as WorkbenchLine | null })
                      }
                    >
                      <option value="">— none —</option>
                      {bench.lines.map((l) => (
                        <option key={l} value={l}>
                          {LINE_LABELS[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wb-field">
                    <span className="wb-label">Notes</span>
                    <input
                      value={doc.notes}
                      onChange={(e) => patch(doc.id, { notes: e.target.value })}
                    />
                  </label>
                </div>

                {attached.length > 0 && (
                  <p className="wb-hint">Referenced by: {attached.join(" · ")}</p>
                )}

                <div className="wb-item-actions">
                  <span className="wb-hint">Added {doc.createdAt}</span>
                  <button type="button" className="wb-remove" onClick={() => remove(doc.id)}>
                    Remove link
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
