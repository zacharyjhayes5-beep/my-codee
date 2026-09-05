import { useEffect, useMemo, useRef, useState } from "react";
import type { Prospect } from "../types";
import { needsResearch } from "../lib/research";

export type PaletteTarget =
  | "operator"
  | "leads"
  | "pipeline"
  | "campaigns"
  | "vault"
  | "walkthrough"
  | "todo"
  | "progress"
  | "book";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  prospects: Prospect[];
  /** Jump to a section. */
  onGoTo: (target: PaletteTarget) => void;
  /** Jump to a household and open it, the same path Pipeline already uses. */
  onOpenProspect: (id: string) => void;
}

interface Command {
  id: string;
  label: string;
  detail: string;
  run: () => void;
}

/**
 * Search and jump, from the keyboard.
 *
 * With fifty-odd households and twenty-five more every weekday, reaching one
 * meant scrolling or filtering. Typing three letters of a name is faster than
 * either, and it is the one interaction that makes the whole thing feel quick
 * under the hand.
 *
 * Deliberately paired with a visible control in the page header. A shortcut
 * nobody discovers is worth nothing, so the button is the affordance and the
 * shortcut is the accelerator.
 */
export function CommandPalette({
  open,
  onClose,
  prospects,
  onGoTo,
  onOpenProspect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reopening always starts clean; a stale query from last time is never what
  // you wanted.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const sections: Command[] = useMemo(
    () => [
      { id: "go-operator", label: "Operator", detail: "What you owe today, and who is up next", run: () => onGoTo("operator") },
      { id: "go-leads", label: "Leads", detail: "Every household and the one thing owed to it", run: () => onGoTo("leads") },
      { id: "go-pipeline", label: "Pipeline", detail: "Opportunities by stage, and what has gone quiet", run: () => onGoTo("pipeline") },
      { id: "go-campaigns", label: "Campaigns", detail: "Five channels, logged as you work them", run: () => onGoTo("campaigns") },
      { id: "go-vault", label: "Vault", detail: "Everything you have written, searchable", run: () => onGoTo("vault") },
      // Safety-critical and easy to lose track of, so it is findable by name.
      { id: "go-backup", label: "Back up", detail: "Save everything to a file — on the Vault screen", run: () => onGoTo("vault") },
      // Off the nav by design. The palette is the only direct way in.
      { id: "go-walkthrough", label: "Walkthrough", detail: "The property area by area", run: () => onGoTo("walkthrough") },
      { id: "go-todo", label: "To-Do", detail: "Tasks and the review inbox", run: () => onGoTo("todo") },
      { id: "go-progress", label: "Progress", detail: "What you have sold, against the number", run: () => onGoTo("progress") },
      { id: "go-book", label: "Book of business", detail: "Every policy, the goals and the tiers", run: () => onGoTo("book") },
    ],
    [onGoTo],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    /**
     * Households match on the same fields the Leads page searches, plus the
     * parcel number — which is the one identifier you might be reading off a
     * county record with the dashboard open beside it.
     */
    const households: Command[] = prospects
      .filter((p) => {
        if (!q) return false;
        return (
          p.name.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.parcelId.toLowerCase().includes(q)
        );
      })
      .slice(0, 8)
      .map((p) => ({
        id: `p-${p.id}`,
        label: p.name || "Untitled household",
        detail: [p.area, needsResearch(p) ? "Needs research" : p.stage].filter(Boolean).join(" · "),
        run: () => onOpenProspect(p.id),
      }));

    const matchedSections = sections.filter(
      (s) => !q || s.label.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q),
    );

    // Households first when you have typed something — that is nearly always
    // what a search means here.
    return [...households, ...matchedSections];
  }, [query, prospects, sections, onOpenProspect]);

  // Keep the highlight inside the list as it shrinks under you.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    command.run();
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    }
    // Tab is left alone: focus stays on the input because it is the only
    // focusable thing here, which is a simpler trap than managing a ring.
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => {
        // Only a click on the backdrop itself closes it, never a drag that
        // happens to end there.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump"
        onKeyDown={onKeyDown}
      >
        <label className="sr-only" htmlFor="palette-input">
          Search households and sections
        </label>
        <input
          id="palette-input"
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          placeholder="Search a household, or jump to a section…"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          aria-controls="palette-results"
        />

        {results.length === 0 ? (
          <p className="palette-empty">Nothing matches that.</p>
        ) : (
          <ul className="palette-results" id="palette-results" role="listbox" ref={listRef}>
            {results.map((command, i) => (
              <li key={command.id}>
                <button
                  id={`palette-${command.id}`}
                  className={`palette-item${i === active ? " is-active" : ""}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(command)}
                >
                  <span className="palette-label">{command.label}</span>
                  <span className="palette-detail">{command.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="palette-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
