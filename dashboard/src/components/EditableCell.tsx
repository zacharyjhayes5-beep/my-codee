import { useEffect, useRef, useState } from "react";

interface EditableCellProps {
  value: string;
  placeholder: string;
  /** Called on blur or Enter — never on every keystroke. */
  onCommit: (next: string) => void;
  ariaLabel: string;
  className?: string;
  type?: "text" | "tel";
}

/**
 * A table cell you can type straight into.
 *
 * It reads as plain text until it is hovered or focused, which is the whole
 * trick: the screen stays as quiet as it was, and every cell is still a field.
 * The alternative — open a card, find the control, press Save — costs four
 * actions for every one-word change, and that cost is why a spreadsheet felt
 * faster than this.
 *
 * Writes land on blur or Enter rather than on each keystroke, because every
 * write rewrites the whole store. Escape restores what was there.
 */
export function EditableCell({
  value,
  placeholder,
  onCommit,
  ariaLabel,
  className = "",
  type = "text",
}: EditableCellProps) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  /** True while the field has focus, so an edit in progress is never clobbered. */
  const editing = useRef(false);

  // The record changed underneath — accept it, unless it is being typed into.
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  function commit() {
    editing.current = false;
    const next = draft.trim();
    if (next !== value) onCommit(next);
  }

  /**
   * Commit whatever is in the field if this cell goes away while it is being
   * typed into — a filter changing, a search narrowing, the row dropping out
   * of view. Blur does not fire on unmount, so without this the edit is lost
   * without a word. The refs are read at teardown so the last draft is used,
   * not the one from the render that registered the effect.
   */
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };
  useEffect(
    () => () => {
      const { draft: d, value: v, onCommit: fn } = latest.current;
      if (editing.current && d.trim() !== v) fn(d.trim());
    },
    [],
  );

  return (
    <input
      ref={ref}
      type={type}
      className={`cell-input${className ? ` ${className}` : ""}`}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          ref.current?.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          editing.current = false;
          setDraft(value);
          ref.current?.blur();
        }
        // The row underneath opens a record on click; a keystroke in a field
        // is not a click on the row.
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
