import { useMemo, useState } from "react";
import type { Prospect, ProspectNote, ProspectStatus } from "../types";
import { prospectStatuses } from "../lib/defaultData";
import { newId, today } from "../lib/storage";
import { ImportPanel } from "./ImportPanel";
import { ProspectCard } from "./ProspectCard";

interface ProspectsTabProps {
  prospects: Prospect[];
  onChange: (updater: (prev: Prospect[]) => Prospect[]) => void;
  ownerName: string;
  onOwnerNameChange: (name: string) => void;
}

export function ProspectsTab({
  prospects,
  onChange,
  ownerName,
  onOwnerNameChange,
}: ProspectsTabProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "All">("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<ProspectStatus, number>();
    for (const p of prospects) map.set(p.status, (map.get(p.status) ?? 0) + 1);
    return map;
  }, [prospects]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects
      .filter((p) => statusFilter === "All" || p.status === statusFilter)
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.nextStep.toLowerCase().includes(q) ||
          p.notes.some((n) => n.body.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }, [prospects, search, statusFilter]);

  function patchProspect(id: string, patch: Partial<Prospect>) {
    onChange((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: today() } : p))
    );
  }

  function createProspect(prospect: Prospect) {
    onChange((prev) => [prospect, ...prev]);
  }

  function appendNote(id: string, note: ProspectNote, patch: Partial<Prospect>) {
    onChange((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          status: patch.status ?? p.status,
          lines: Array.from(new Set([...p.lines, ...(patch.lines ?? [])])),
          area: p.area || patch.area || "",
          phone: p.phone || patch.phone || "",
          email: p.email || patch.email || "",
          notes: [...p.notes, note],
          updatedAt: today(),
        };
      })
    );
  }

  function addBlank() {
    const prospect: Prospect = {
      id: newId(),
      name: "",
      status: "New",
      lines: [],
      area: "",
      phone: "",
      email: "",
      nextStep: "",
      notes: [],
      createdAt: today(),
      updatedAt: today(),
    };
    createProspect(prospect);
    setExpandedId(prospect.id);
  }

  return (
    <div className="tab-panel">
      <ImportPanel
        prospects={prospects}
        ownerName={ownerName}
        onOwnerNameChange={onOwnerNameChange}
        onCreate={createProspect}
        onAppend={appendNote}
      />

      <div className="prospect-toolbar">
        <div className="filter-chips">
          <button
            className={`filter-chip${statusFilter === "All" ? " on" : ""}`}
            onClick={() => setStatusFilter("All")}
          >
            All <span>{prospects.length}</span>
          </button>
          {prospectStatuses.map((s) => (
            <button
              key={s}
              className={`filter-chip${statusFilter === s ? " on" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s} <span>{counts.get(s) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names, areas, notes…"
          />
          <button className="primary-btn" onClick={addBlank}>
            Blank profile
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty">
          {prospects.length === 0
            ? "No prospects yet — drop a Granola note above to make the first profile."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="prospect-grid">
          {visible.map((p) => (
            <ProspectCard
              key={p.id}
              prospect={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onChange={(patch) => patchProspect(p.id, patch)}
              onRemove={() => onChange((prev) => prev.filter((x) => x.id !== p.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
