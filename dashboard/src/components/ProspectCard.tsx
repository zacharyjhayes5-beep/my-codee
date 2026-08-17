import { useState } from "react";
import { format } from "date-fns";
import type { Call, LineId, Opportunity, Prospect, Stage } from "../types";
import { lineOptions, prospectStages, stageClass } from "../lib/defaultData";
import { blankCall } from "../lib/calls";
import { temperatureClass, temperatureOf } from "../lib/opportunities";
import { newId, today } from "../lib/storage";
import { CallHistory } from "./CallHistory";
import { CallLogger } from "./CallLogger";
import { OpportunityPanel } from "./OpportunityPanel";
import {
  DEFAULT_TAG_COLOR,
  MAX_TAG_LENGTH,
  TAG_COLORS,
  addTag,
  removeTag,
  tagColor,
} from "../lib/tags";

interface ProspectCardProps {
  prospect: Prospect;
  /** This household's calls, newest first. */
  calls: Call[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Prospect>) => void;
  onRemove: () => void;
  onSaveCall: (call: Call, isNew: boolean) => void;
  onDeleteCall: (callId: string) => void;
  onSetScore: (score: number | null) => void;
  opportunities: Opportunity[];
  onSaveOpportunity: (opportunity: Opportunity, isNew: boolean) => void;
  onRemoveOpportunity: (id: string) => void;
}

function formatDay(iso: string) {
  try {
    return format(new Date(`${iso}T00:00:00`), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export function ProspectCard({
  prospect,
  calls,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onSaveCall,
  onDeleteCall,
  onSetScore,
  opportunities,
  onSaveOpportunity,
  onRemoveOpportunity,
}: ProspectCardProps) {
  const [tagDraft, setTagDraft] = useState("");
  const [tagShade, setTagShade] = useState(DEFAULT_TAG_COLOR);

  /** Add the typed tag, then clear the field but keep the chosen colour. */
  function commitTag() {
    const current = prospect.tags ?? [];
    const next = addTag(current, tagDraft, tagShade);
    if (next !== current) onChange({ tags: next });
    setTagDraft("");
  }
  const [newNote, setNewNote] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  /** The call being written or corrected — null when the form is closed. */
  const [callDraft, setCallDraft] = useState<{ call: Call; mode: "new" | "edit" } | null>(null);

  function startCall() {
    setCallDraft({ call: blankCall(prospect.id), mode: "new" });
  }

  function saveCall(call: Call, score: number | null) {
    onSaveCall(call, callDraft?.mode === "new");
    // The score is prompted alongside a hot lead but never inferred — it only
    // moves if a number was actually typed.
    if (score !== null) onSetScore(score);
    setCallDraft(null);
  }

  const notes = [...prospect.notes].sort((a, b) => b.date.localeCompare(a.date));
  const lastTouch = notes[0]?.date ?? prospect.updatedAt;
  const reading = temperatureOf(prospect);

  function toggleLine(id: LineId) {
    const on = prospect.lines.includes(id);
    onChange({ lines: on ? prospect.lines.filter((l) => l !== id) : [...prospect.lines, id] });
  }

  function addNote() {
    if (!newNote.trim()) return;
    onChange({
      notes: [
        ...prospect.notes,
        {
          id: newId(),
          date: today(),
          title: "Manual note",
          body: newNote.trim(),
          source: "manual" as const,
        },
      ],
    });
    setNewNote("");
  }

  return (
    <article className={`prospect-card${expanded ? " expanded" : ""}`}>
      <header className="prospect-head">
        <input
          className="prospect-name"
          value={prospect.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Prospect name"
        />
        <span className={`temp-chip ${temperatureClass[reading.temperature]}`} title={reading.because}>
          {reading.temperature}
        </span>
        <select
          className={`status-select ${stageClass[prospect.stage]}`}
          value={prospect.stage}
          onChange={(e) =>
            // Moving it by hand takes ownership — a later correction to an old
            // call will not quietly move it back.
            onChange({ stage: e.target.value as Stage, stageSource: "manual", stageCallId: null })
          }
          aria-label="Stage"
        >
          {prospectStages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </header>

      <section className="tag-editor">
        <h5>Tags</h5>

        {(prospect.tags ?? []).length > 0 && (
          <ul className="tag-list">
            {(prospect.tags ?? []).map((tag) => {
              const c = tagColor(tag.color);
              return (
                <li key={tag.id}>
                  <span
                    className="lead-tag"
                    style={{ background: c.background, color: c.foreground }}
                  >
                    {tag.label}
                    <button
                      className="tag-remove"
                      onClick={() => onChange({ tags: removeTag(prospect.tags ?? [], tag.id) })}
                      aria-label={`Remove tag ${tag.label}`}
                      title={`Remove ${tag.label}`}
                    >
                      ×
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="tag-add">
          <label className="sr-only" htmlFor={`tag-label-${prospect.id}`}>
            New tag
          </label>
          <input
            id={`tag-label-${prospect.id}`}
            className="tag-input"
            value={tagDraft}
            maxLength={MAX_TAG_LENGTH}
            placeholder="High value, Referral…"
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter is the natural way to finish a short label.
              if (e.key === "Enter") {
                e.preventDefault();
                commitTag();
              }
            }}
          />

          <fieldset className="tag-colors">
            <legend className="sr-only">Tag colour</legend>
            {TAG_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`tag-swatch${tagShade === c.id ? " is-chosen" : ""}`}
                style={{ background: c.background }}
                onClick={() => setTagShade(c.id)}
                aria-pressed={tagShade === c.id}
                aria-label={c.name}
                title={c.name}
              />
            ))}
          </fieldset>

          <button className="ghost-btn tag-add-btn" onClick={commitTag} disabled={!tagDraft.trim()}>
            Add
          </button>
        </div>
      </section>

      <div className="chip-row">
        {lineOptions.map((l) => {
          const on = prospect.lines.includes(l.id);
          return (
            <button
              key={l.id}
              className={`chip chip-${l.id}${on ? " on" : ""}`}
              onClick={() => toggleLine(l.id)}
              aria-pressed={on}
            >
              {l.name}
            </button>
          );
        })}
      </div>

      {/* Read before dialling — deliberately above the editable fields. */}
      {(prospect.whyTheyFit || prospect.importantNotes) && (
        <div className="call-context">
          {prospect.whyTheyFit && (
            <p className="why-fit">
              <span className="context-label">Why they fit</span>
              {prospect.whyTheyFit}
            </p>
          )}
          {prospect.importantNotes && (
            <p className="important-notes">
              <span className="context-label">Important</span>
              {prospect.importantNotes}
            </p>
          )}
        </div>
      )}

      <div className="prospect-meta">
        <label className="inline-field">
          <span>Area</span>
          <input
            value={prospect.area}
            onChange={(e) => onChange({ area: e.target.value })}
            placeholder="City or region"
          />
        </label>
        <label className="inline-field">
          <span>Next action</span>
          <input
            value={prospect.nextAction}
            onChange={(e) => onChange({ nextAction: e.target.value })}
            placeholder="e.g. send home + auto quote"
          />
        </label>
      </div>

      <footer className="prospect-foot">
        <span className="muted-note">
          {calls.length > 0
            ? `${calls.length} call${calls.length === 1 ? "" : "s"} · ${notes.length} note${notes.length === 1 ? "" : "s"}`
            : `${notes.length} note${notes.length === 1 ? "" : "s"} · last ${formatDay(lastTouch)}`}
        </span>
        <div className="prospect-foot-actions">
          <button
            className="primary-btn log-call-btn"
            onClick={() => {
              if (!expanded) onToggle();
              startCall();
            }}
          >
            Log call
          </button>
          <button className="link-btn" onClick={onToggle}>
            {expanded ? "Close" : "Open profile"}
          </button>
        </div>
      </footer>

      {expanded && (
        <div className="prospect-detail">
          <div className="prospect-meta">
            <label className="inline-field">
              <span>Phone</span>
              <input value={prospect.phone} onChange={(e) => onChange({ phone: e.target.value })} />
            </label>
            <label className="inline-field">
              <span>Email</span>
              <input value={prospect.email} onChange={(e) => onChange({ email: e.target.value })} />
            </label>
          </div>

          <h4>Opportunities</h4>
          <OpportunityPanel
            prospectId={prospect.id}
            opportunities={opportunities}
            onSave={onSaveOpportunity}
            onRemove={onRemoveOpportunity}
          />

          <details className="profile-section">
            <summary>Contact &amp; household</summary>
            <div className="prospect-meta">
              <label className="inline-field">
                <span>First name</span>
                <input value={prospect.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
              </label>
              <label className="inline-field">
                <span>Last name</span>
                <input value={prospect.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
              </label>
              <label className="inline-field">
                <span>Lead source</span>
                <input value={prospect.leadSource} onChange={(e) => onChange({ leadSource: e.target.value })} />
              </label>
              <label className="inline-field">
                <span>Street</span>
                <input
                  value={prospect.address.line1}
                  onChange={(e) => onChange({ address: { ...prospect.address, line1: e.target.value } })}
                />
              </label>
              <label className="inline-field">
                <span>City</span>
                <input
                  value={prospect.address.city}
                  onChange={(e) => onChange({ address: { ...prospect.address, city: e.target.value } })}
                />
              </label>
              <label className="inline-field">
                <span>ZIP</span>
                <input
                  value={prospect.address.zip}
                  onChange={(e) => onChange({ address: { ...prospect.address, zip: e.target.value } })}
                />
              </label>
            </div>
            {prospect.contacts.length > 0 && (
              <ul className="contact-list">
                {prospect.contacts.map((c) => (
                  <li key={c.id}>
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed"}
                    {c.dob && <span className="muted-note"> · DOB {c.dob}</span>}
                    {c.isPrimary && <span className="muted-note"> · primary</span>}
                  </li>
                ))}
              </ul>
            )}
          </details>

          <details className="profile-section">
            <summary>Property &amp; asset indicators</summary>
            <p className="indicator-warning">
              Research indicators only — not confirmed coverage.
            </p>
            <div className="prospect-meta">
              <label className="inline-field">
                <span>Owner / renter</span>
                <select
                  value={prospect.assets.ownership}
                  onChange={(e) =>
                    onChange({
                      assets: { ...prospect.assets, ownership: e.target.value as "owner" | "renter" | "" },
                    })
                  }
                >
                  <option value="">Unknown</option>
                  <option value="owner">Owner</option>
                  <option value="renter">Renter</option>
                </select>
              </label>
              <label className="inline-field">
                <span>Est. property value</span>
                <input
                  type="number"
                  value={prospect.assets.estimatedPropertyValue ?? ""}
                  onChange={(e) =>
                    onChange({
                      assets: {
                        ...prospect.assets,
                        estimatedPropertyValue: e.target.value ? Number(e.target.value) : null,
                      },
                    })
                  }
                />
              </label>
              <label className="inline-field">
                <span>Vehicles</span>
                <input
                  value={prospect.assets.vehicles}
                  onChange={(e) => onChange({ assets: { ...prospect.assets, vehicles: e.target.value } })}
                />
              </label>
              <label className="inline-field">
                <span>Other assets</span>
                <input
                  value={prospect.assets.other}
                  onChange={(e) => onChange({ assets: { ...prospect.assets, other: e.target.value } })}
                />
              </label>
            </div>
          </details>

          <h4>Calls</h4>
          {callDraft ? (
            <CallLogger
              householdName={prospect.name}
              prospect={prospect}
              priorCalls={calls}
              call={callDraft.call}
              mode={callDraft.mode}
              onSave={saveCall}
              onCancel={() => setCallDraft(null)}
            />
          ) : (
            <button className="ghost-btn add-call-btn" onClick={startCall}>
              Log a call
            </button>
          )}

          <CallHistory
            calls={calls}
            onEdit={(call) => setCallDraft({ call, mode: "edit" })}
            onDelete={onDeleteCall}
          />

          <h4>Why they fit &amp; important notes</h4>
          <div className="prospect-meta">
            <label className="inline-field wide">
              <span>Why they fit</span>
              <input
                value={prospect.whyTheyFit}
                onChange={(e) => onChange({ whyTheyFit: e.target.value })}
                placeholder="What makes them worth a call"
              />
            </label>
            <label className="inline-field wide">
              <span>Important notes</span>
              <textarea
                rows={2}
                value={prospect.importantNotes}
                onChange={(e) => onChange({ importantNotes: e.target.value })}
                placeholder="Read this before dialling — rate increase, who decides, timing…"
              />
            </label>
          </div>

          <h4>Notes</h4>
          {notes.length === 0 && <p className="empty">No notes yet.</p>}
          {notes.map((note) => (
            <div className="note-block" key={note.id}>
              <div className="note-head">
                <span>
                  <strong>{note.title}</strong> · {formatDay(note.date)}
                  {note.source === "granola" && <span className="source-tag">Granola</span>}
                </span>
                <button
                  className="remove-btn"
                  aria-label="Remove note"
                  onClick={() => onChange({ notes: prospect.notes.filter((n) => n.id !== note.id) })}
                >
                  ×
                </button>
              </div>
              <pre className="note-body">{note.body}</pre>
            </div>
          ))}

          <div className="add-note">
            <textarea
              rows={3}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a quick note…"
            />
            <button className="primary-btn" onClick={addNote}>
              Add note
            </button>
          </div>

          <div className="prospect-danger">
            {confirmRemove ? (
              <>
                <span>Delete {prospect.name || "this profile"} and all notes?</span>
                <button className="danger-btn" onClick={onRemove}>
                  Delete
                </button>
                <button className="ghost-btn" onClick={() => setConfirmRemove(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="link-btn danger" onClick={() => setConfirmRemove(true)}>
                Delete profile
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
