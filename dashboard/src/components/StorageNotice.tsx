import { useState } from "react";
import type { Prospect } from "../types";
import { localDay } from "../lib/calls";
import { today } from "../lib/storage";

interface StorageNoticeProps {
  prospects: Prospect[];
  /** ISO date of the last export, or empty when there has never been one. */
  lastBackupAt: string;
  onDismissed: () => void;
  dismissed: boolean;
}

/** How long a book can go unexported before it is worth saying something. */
const STALE_DAYS = 14;

function daysSince(iso: string): number {
  if (!iso) return Infinity;
  const then = new Date(`${localDay(iso)}T00:00:00`).getTime();
  const now = new Date(`${today()}T00:00:00`).getTime();
  return Math.round((now - then) / 86_400_000);
}

/**
 * The two things a person can lose data by not knowing: this lives in one
 * browser, and backups only happen when the button is pressed.
 *
 * It appears on first run, and again when a book with real work in it has gone
 * a fortnight without an export. It is not a permanent banner — a warning that
 * is always there stops being read.
 */
export function StorageNotice({
  prospects,
  lastBackupAt,
  onDismissed,
  dismissed,
}: StorageNoticeProps) {
  const [open, setOpen] = useState(true);

  const firstRun = prospects.length === 0;
  const stale = !firstRun && daysSince(lastBackupAt) > STALE_DAYS;

  if (!open) return null;
  if (dismissed && !stale) return null;
  if (!firstRun && !stale) return null;

  if (firstRun) {
    return (
      <aside className="storage-notice">
        <div>
          <strong>Before you put real work in here</strong>
          <p>
            This dashboard keeps everything <em>in this browser, on this computer</em>. It
            does not sync, and no copy exists anywhere else. Opening it on your phone or
            another machine shows a different, empty book.
          </p>
          <p>
            <strong>Back up</strong>, at the foot of the Vault screen, saves everything
            to a file. Nothing does that for you — it only happens when you press it. Do
            it after any session where you enter real households or calls.
          </p>
        </div>
        <button
          className="ghost-btn"
          onClick={() => {
            setOpen(false);
            onDismissed();
          }}
        >
          Understood
        </button>
      </aside>
    );
  }

  const days = daysSince(lastBackupAt);
  return (
    <aside className="storage-notice warn">
      <div>
        <strong>
          {lastBackupAt
            ? `Last backup was ${days} days ago`
            : "You have never taken a backup"}
        </strong>
        <p>
          {prospects.length} household{prospects.length === 1 ? "" : "s"} live only in this
          browser. One cleared cache and they are gone. <strong>Back up</strong> is at
          the foot of the Vault screen.
        </p>
      </div>
      <button className="ghost-btn" onClick={() => setOpen(false)}>
        Later
      </button>
    </aside>
  );
}
