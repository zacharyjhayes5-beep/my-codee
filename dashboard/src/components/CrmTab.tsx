import { useState } from "react";
import type { Lead, LeadStatus, LineId } from "../types";
import { newId } from "../lib/storage";

interface CrmTabProps {
  leads: Lead[];
  onChange: (leads: Lead[]) => void;
}

const statuses: LeadStatus[] = ["New", "Contacted", "Quoted", "Sold", "Lost"];
const lines: { id: LineId | "unknown"; name: string }[] = [
  { id: "unknown", name: "Unassigned" },
  { id: "property", name: "Property" },
  { id: "casualty", name: "Casualty" },
  { id: "life", name: "Life" },
  { id: "commercial", name: "Commercial" },
  { id: "surplus", name: "Surplus / Other" },
];

const statusClass: Record<LeadStatus, string> = {
  New: "badge-muted",
  Contacted: "badge-warning",
  Quoted: "badge-serious",
  Sold: "badge-good",
  Lost: "badge-critical",
};

export function CrmTab({ leads, onChange }: CrmTabProps) {
  const [name, setName] = useState("");

  function addLead() {
    if (!name.trim()) return;
    onChange([
      ...leads,
      {
        id: newId(),
        name: name.trim(),
        phone: "",
        email: "",
        status: "New",
        line: "unknown",
        notes: "",
        createdAt: new Date().toISOString().slice(0, 10),
      },
    ]);
    setName("");
  }

  function updateLead(id: string, patch: Partial<Lead>) {
    onChange(leads.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLead(id: string) {
    onChange(leads.filter((l) => l.id !== id));
  }

  return (
    <div className="tab-panel">
      <p className="tab-note">
        Lightweight lead tracker to get started — a fuller CRM (pipeline stages, follow-up reminders, policy
        linking) can be layered on top later.
      </p>

      <div className="add-row">
        <input
          type="text"
          placeholder="Add a lead by name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLead()}
        />
        <button onClick={addLead}>Add lead</button>
      </div>

      <div className="table-wrap">
        <table className="crm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Line</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No leads yet — add your first one above.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <input value={lead.name} onChange={(e) => updateLead(lead.id, { name: e.target.value })} />
                </td>
                <td>
                  <input value={lead.phone} onChange={(e) => updateLead(lead.id, { phone: e.target.value })} placeholder="Phone" />
                </td>
                <td>
                  <input value={lead.email} onChange={(e) => updateLead(lead.id, { email: e.target.value })} placeholder="Email" />
                </td>
                <td>
                  <select value={lead.line} onChange={(e) => updateLead(lead.id, { line: e.target.value as LineId | "unknown" })}>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={`status-select ${statusClass[lead.status]}`}
                    value={lead.status}
                    onChange={(e) => updateLead(lead.id, { status: e.target.value as LeadStatus })}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input value={lead.notes} onChange={(e) => updateLead(lead.id, { notes: e.target.value })} placeholder="Notes" />
                </td>
                <td>
                  <button className="remove-btn" onClick={() => removeLead(lead.id)} aria-label="Remove lead">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
