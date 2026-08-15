import { useRef, useState } from "react";
import { BackupError, backupFilename, buildBackup, countsOf, parseBackup } from "../lib/backup";
import { replaceAll } from "../lib/repository";

/**
 * Back up writes everything the app has saved — the records now in IndexedDB
 * and the settings still in localStorage — to one file. Restore reads a file
 * of either format back in.
 */
export function BackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    setBusy(true);
    try {
      const file = await buildBackup();
      const total = Object.values(file.records).reduce((sum, rows) => sum + rows.length, 0);

      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backupFilename();
      link.click();
      URL.revokeObjectURL(url);

      setStatus({
        tone: "good",
        text: `Saved ${total} record${total === 1 ? "" : "s"} and your settings to your Downloads folder.`,
      });
    } catch {
      setStatus({ tone: "bad", text: "Could not save the backup file." });
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(file: File) {
    setBusy(true);
    try {
      const parsed = parseBackup(await file.text());

      const when = parsed.exportedAt
        ? new Date(parsed.exportedAt).toLocaleString()
        : "an unknown date";
      const counts = countsOf(parsed.snapshot);
      const summary = `${counts.prospects} prospects · ${counts.calls} calls · ${counts.policies} policies · ${counts.tasks} tasks`;

      const ok = window.confirm(
        `Restore the backup from ${when}?\n\n${summary}\n\n` +
          `This replaces everything currently on this dashboard. It cannot be undone.`,
      );
      if (!ok) {
        setBusy(false);
        return;
      }

      await replaceAll(parsed.snapshot);
      window.location.reload();
    } catch (error) {
      setStatus({
        tone: "bad",
        text:
          error instanceof BackupError
            ? error.message
            : "Could not read that file — it may be damaged.",
      });
      setBusy(false);
    }
  }

  return (
    <div className="backup-panel">
      <div className="backup-buttons">
        <button className="ghost-btn" onClick={() => void exportBackup()} disabled={busy}>
          Back up
        </button>
        <button className="ghost-btn" onClick={() => fileInput.current?.click()} disabled={busy}>
          Restore
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice in a row still fires.
            e.target.value = "";
            if (file) void importBackup(file);
          }}
        />
      </div>
      {status && <p className={`backup-status ${status.tone}`}>{status.text}</p>}
    </div>
  );
}
