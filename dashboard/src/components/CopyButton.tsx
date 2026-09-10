import { useEffect, useRef, useState } from "react";
import { copyText } from "../lib/clipboard";

interface CopyButtonProps {
  /** Called at press time, so the text is always what is on screen now. */
  text: () => string;
  label: string;
  /** What it says for a moment afterwards. */
  done?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
  /** Runs only when the copy actually succeeded. */
  onCopied?: () => void;
}

/**
 * A copy button that tells the truth about what happened.
 *
 * Three states rather than two: copied, and *couldn't copy*. A clipboard write
 * can be refused — an insecure origin, a browser setting — and a button that
 * flashes "Copied" regardless would send the agent off to paste nothing into a
 * message to a customer.
 */
export function CopyButton({
  text,
  label,
  done = "Copied",
  className = "ghost-btn",
  title,
  disabled,
  onCopied,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "ok" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function press() {
    const ok = await copyText(text());
    setState(ok ? "ok" : "failed");
    if (ok) onCopied?.();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2400);
  }

  return (
    <button
      type="button"
      className={`${className} copy-btn is-${state}`}
      onClick={press}
      title={title}
      disabled={disabled}
      /* Announced rather than only coloured — the state is the whole point. */
      aria-live="polite"
    >
      {state === "ok" ? done : state === "failed" ? "Couldn't copy — select and copy by hand" : label}
    </button>
  );
}
