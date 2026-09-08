import { useEffect, useMemo, useRef, useState } from "react";
import type { BraindumpRow } from "../types";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  clock,
  dayKey,
  dayTabs,
  dumpsFor,
  heuristic,
  itemsFor,
  labelFor,
  rowsFromDump,
  toggleDone,
  type SortedItem,
} from "../lib/braindump";
import { readSyncSettings } from "../lib/gisSync";

interface BraindumpTabProps {
  rows: BraindumpRow[];
  onChange: (next: BraindumpRow[]) => void;
}

/** Long enough that a pause mid-thought is not a filing. */
const SETTLE_MS = 2200;

type Status = "idle" | "listening" | "sorting";

/**
 * Ask the Worker to split the dump, and fall back to the local splitter.
 *
 * The key lives on the Worker and never in this bundle. When the Worker
 * cannot be reached — no token, no network, no key set — the heuristic runs
 * instead and says so, because a tab that refuses to file anything until a
 * server is configured is a tab nobody starts using.
 */
async function sortDump(text: string): Promise<{ items: SortedItem[]; engine: string }> {
  const settings = readSyncSettings();
  if (settings) {
    try {
      const res = await fetch(`${settings.endpoint.replace(/\/+$/, "")}/braindump/sort`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${settings.token}`,
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items?: SortedItem[] };
      if (Array.isArray(data.items) && data.items.length > 0) {
        return { items: data.items, engine: "Filed by Claude" };
      }
    } catch {
      // Fall through. A filing that happened locally beats one that did not
      // happen at all.
    }
  }
  return { items: heuristic(text), engine: "Filed locally" };
}

/**
 * Say it once; it files itself.
 *
 * One textarea that is always open — dictation goes straight in — and about
 * two seconds after the talking stops the text is split into what was done,
 * what is being chewed over, what is owed and what needs answering. The raw
 * dump is kept verbatim underneath, so nothing depends on the split being
 * right.
 */
export function BraindumpTab({ rows, onChange }: BraindumpTabProps) {
  const today = dayKey();
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [engine, setEngine] = useState("");
  const [day, setDay] = useState(today);

  const timer = useRef<number | undefined>(undefined);
  /** Guards against a second filing while one is in flight. */
  const filing = useRef(false);

  const tabs = useMemo(() => dayTabs(rows, today), [rows, today]);
  const dumps = useMemo(() => dumpsFor(rows, day), [rows, day]);

  async function file(text: string) {
    const clean = text.trim();
    if (!clean || filing.current) return;
    filing.current = true;
    setStatus("sorting");
    try {
      const { items, engine: how } = await sortDump(clean);
      // Always onto today. A dump is taken now, whichever day is being read.
      onChange([...rows, ...rowsFromDump(clean, items, today)]);
      setEngine(how);
      setDraft("");
      setDay(today);
    } finally {
      filing.current = false;
      setStatus("idle");
    }
  }

  /** Every keystroke restarts the clock; the pause is what files it. */
  function onType(value: string) {
    setDraft(value);
    setStatus(value.trim() ? "listening" : "idle");
    window.clearTimeout(timer.current);
    if (!value.trim()) return;
    timer.current = window.setTimeout(() => void file(value), SETTLE_MS);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const busy = status === "sorting";

  return (
    <div className="braindump">
      {/* ---------- Capture ---------- */}
      <section className={`braindump-capture${busy ? " is-filing" : ""}`}>
        <div className="braindump-capture-head">
          <span
            className={`braindump-mic${status !== "idle" ? " is-live" : ""}`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span className="braindump-wave" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span
                key={i}
                className={status === "idle" ? "" : "is-live"}
                style={{ animationDelay: `${i * 0.09}s` }}
              />
            ))}
          </span>

          <span className="op-rule" aria-hidden="true" />

          <span className="braindump-status" role="status">
            {status === "sorting"
              ? "Filing…"
              : status === "listening"
                ? "Listening — stops and files on its own"
                : engine || "Say anything"}
          </span>
        </div>

        <textarea
          className="braindump-input"
          value={draft}
          rows={5}
          placeholder="Talk. Everything you did, everything on your mind, everything you owe, everything you need to find out. It sorts itself."
          aria-label="Braindump"
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              window.clearTimeout(timer.current);
              void file(draft);
            }
          }}
        />

        <div className="braindump-capture-foot">
          <span className="braindump-hint">
            Files itself about two seconds after you stop, or press {navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl"}+Enter
          </span>
          <button
            type="button"
            className="op-btn"
            disabled={!draft.trim() || busy}
            onClick={() => {
              window.clearTimeout(timer.current);
              void file(draft);
            }}
          >
            File it
          </button>
        </div>
      </section>

      {/* ---------- Days ---------- */}
      <nav className="braindump-days" aria-label="Day">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            className={`braindump-day${key === day ? " is-current" : ""}`}
            aria-current={key === day ? "true" : undefined}
            onClick={() => setDay(key)}
          >
            {labelFor(key, today)}
          </button>
        ))}
      </nav>

      {/* ---------- The four columns ---------- */}
      <section className="braindump-columns">
        {CATEGORIES.map((category) => {
          const items = itemsFor(rows, day, category);
          return (
            <div className="braindump-column" key={category}>
              <div className="op-section-head">
                <span className="kicker">{CATEGORY_LABEL[category]}</span>
                <span className="op-rule" aria-hidden="true" />
                <span className="braindump-count">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <p className="op-empty">Nothing here.</p>
              ) : (
                <ul className="braindump-items">
                  {items.map((item) => {
                    // Only a to-do, or something that started as one, can be
                    // ticked. A thought is not a task.
                    const tickable = category === "todo" || item.wasTodo;
                    return (
                      <li key={item.id} className={`braindump-item${item.done ? " is-done" : ""}`}>
                        {tickable ? (
                          <>
                            <input
                              type="checkbox"
                              id={`bd-${item.id}`}
                              className="op-check"
                              checked={Boolean(item.done)}
                              onChange={() => onChange(toggleDone(rows, item.id))}
                            />
                            <label htmlFor={`bd-${item.id}`}>{item.text}</label>
                          </>
                        ) : (
                          <span className="braindump-text">{item.text}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* ---------- What was actually said ---------- */}
      {dumps.length > 0 && (
        <section className="op-panel op-panel-quiet braindump-raw">
          <div className="op-section-head">
            <span className="kicker">What you said</span>
            <span className="op-rule" aria-hidden="true" />
            <span className="op-count">
              {dumps.length} {dumps.length === 1 ? "dump" : "dumps"}
            </span>
          </div>
          <ul>
            {dumps.map((d) => (
              <li key={d.id}>
                <span className="braindump-clock">{clock(d.at)}</span>
                <p>{d.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
