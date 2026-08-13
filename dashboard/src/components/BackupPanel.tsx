import { useRef, useState } from "react";

/**
 * Everything the dashboard owns lives under this prefix, so a backup is just
 * "every key that starts with it". Reading the prefix rather than a hard-coded
 * list means a new key added later is picked up without touching this file.
 */
const PREFIX = "fb-dashboard:";

const FILE_VERSION = 1;
const FILE_MARKER = "agency-dashboard-backup";

interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
}

function prefixedKeys(): string[] {
  return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
}

export function BackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  function exportBackup() {
    try {
      const data: Record<string, unknown> = {};
      for (const key of prefixedKeys()) {
        const raw = localStorage.getItem(key);
        if (raw === null) continue;
        // Store the parsed value so the file is readable, but keep the raw
        // string if it was never JSON to begin with.
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
      }

      const file: BackupFile = {
        app: FILE_MARKER,
        version: FILE_VERSION,
        exportedAt: new Date().toISOString(),
        data,
      };

      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agency-dashboard-backup-${stamp}.json`;
      link.click();
      URL.revokeObjectURL(url);

      const count = Object.keys(data).length;
      setStatus({ tone: "good", text: `Saved a backup of ${count} sections to your Downloads folder.` });
    } catch {
      setStatus({ tone: "bad", text: "Could not save the backup file." });
    }
  }

  async function importBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;

      if (parsed?.app !== FILE_MARKER || typeof parsed.data !== "object" || parsed.data === null) {
        setStatus({ tone: "bad", text: "That file isn't a dashboard backup. Look for one named agency-dashboard-backup-….json" });
        return;
      }

      const incoming = Object.entries(parsed.data).filter(([key]) => key.startsWith(PREFIX));
      if (incoming.length === 0) {
        setStatus({ tone: "bad", text: "That backup file is empty — nothing to restore." });
        return;
      }

      const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : "an unknown date";
      const ok = window.confirm(
        `Restore the backup from ${when}?\n\n` +
          `This replaces everything currently on this dashboard — policies, prospects, tasks and goals — ` +
          `with what's in the file. It cannot be undone.`,
      );
      if (!ok) return;

      // Clear first so the restore is an exact copy, not a merge with whatever
      // happened to be here already.
      for (const key of prefixedKeys()) localStorage.removeItem(key);

      for (const [key, value] of incoming) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }

      // Reload so every tab re-reads storage instead of showing stale state.
      window.location.reload();
    } catch {
      setStatus({ tone: "bad", text: "Could not read that file — it may be damaged." });
    }
  }

  return (
    <div className="backup-panel">
      <div className="backup-buttons">
        <button className="ghost-btn" onClick={exportBackup}>
          Back up
        </button>
        <button className="ghost-btn" onClick={() => fileInput.current?.click()}>
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
