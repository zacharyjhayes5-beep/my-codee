import { useEffect, useMemo, useState } from "react";
import type { Prospect, Workbench } from "../types";
import { LINE_LABELS, isSensitive, outstandingItems, requestDraft } from "../lib/workbench";
import { CopyButton } from "./CopyButton";

interface RequestComposerProps {
  bench: Workbench;
  prospect: Prospect | undefined;
  ownerName: string;
  /** Marks the chosen items requested. Called only by the explicit button. */
  onMarkRequested: (ids: string[]) => void;
  onClose: () => void;
}

/**
 * Draft the "here's what I still need" message.
 *
 * Three things this deliberately does not do.
 *
 * It does not send anything, and there is no mail or SMS integration behind
 * it — the output is text on the clipboard and the agent sends it however he
 * normally would.
 *
 * It does not offer items that have already come in. The list starts from
 * what is outstanding, so a received declarations page cannot be asked for
 * twice by accident.
 *
 * And **copying does not mark anything requested.** Copying is not sending;
 * the two are separated by a second, explicit button, pressed once the
 * message has actually gone out.
 */
export function RequestComposer({
  bench,
  prospect,
  ownerName,
  onMarkRequested,
  onClose,
}: RequestComposerProps) {
  const available = useMemo(() => outstandingItems(bench.items), [bench.items]);

  const [chosen, setChosen] = useState<string[]>(() => available.map((i) => i.id));
  /** Null until the agent types — then the edited text is what gets copied. */
  const [edited, setEdited] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = available.filter((i) => chosen.includes(i.id));

  const generated = useMemo(
    () => requestDraft({ prospect, items, lines: bench.lines, ownerName }),
    [prospect, items, bench.lines, ownerName],
  );

  const text = edited ?? generated;

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    // Changing the selection means the last "marked requested" no longer
    // describes what is on screen, so the button stops claiming it did.
    setMarked(false);
    // Re-generating under an edit would throw the agent's wording away, so an
    // edited draft is left alone and the mismatch is called out instead.
  }

  return (
    <>
      <div className="quote-scrim" onClick={onClose} aria-hidden="true" />
      <div className="wb-modal" role="dialog" aria-modal="true" aria-label="Draft a request">
        <header className="wb-modal-head">
          <span className="kicker">Missing information</span>
          <h3>Ask for what is outstanding</h3>
          <button type="button" className="quote-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="wb-modal-body">
          {available.length === 0 ? (
            <p className="empty">Nothing is outstanding — there is nothing to ask for.</p>
          ) : (
            <>
              <div className="wb-modal-col">
                <span className="wb-label">Include</span>
                <ul className="wb-pick-list">
                  {available.map((item) => (
                    <li key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={chosen.includes(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <span>
                          {item.line && <em>{LINE_LABELS[item.line]}: </em>}
                          {item.label}
                        </span>
                        {isSensitive(item.label) && (
                          <span className="wb-item-flag" title="Handled over the secure method">
                            secure
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="wb-hint">
                  Only outstanding items appear here. Anything received or verified is left
                  out.
                </p>
              </div>

              <div className="wb-modal-col wb-modal-draft">
                <span className="wb-label">Message</span>
                <textarea
                  rows={14}
                  value={text}
                  onChange={(e) => setEdited(e.target.value)}
                  aria-label="Request message"
                />
                {edited !== null && (
                  <p className="wb-hint">
                    You have edited this draft, so changing the list above no longer rewrites
                    it.{" "}
                    <button type="button" className="link-btn" onClick={() => setEdited(null)}>
                      Start again from the list
                    </button>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="wb-modal-foot">
          <CopyButton
            className="primary-btn"
            label="Copy message"
            done="Copied — nothing marked"
            text={() => text}
            disabled={items.length === 0}
          />
          <button
            type="button"
            className="ghost-btn"
            disabled={items.length === 0 || marked}
            onClick={() => {
              onMarkRequested(items.map((i) => i.id));
              setMarked(true);
            }}
          >
            {marked
              ? `Marked ${items.length} requested`
              : `Mark ${items.length} item${items.length === 1 ? "" : "s"} requested`}
          </button>
          <span className="wb-hint">
            Copying never changes a status. Mark them requested once you have actually sent
            the message.
          </span>
        </footer>
      </div>
    </>
  );
}
