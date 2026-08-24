import { useMemo, useState, type FormEvent } from "react";
import {
  CHANNELS,
  draftIsComplete,
  emptyCampaignDraft,
  entryDetail,
  entryFromDraft,
  entryTitle,
  type CampaignChannel,
  type CampaignDraft,
  type CampaignEntry,
} from "../lib/campaigns";

interface CampaignsTabProps {
  entries: CampaignEntry[];
  onChange: (entries: CampaignEntry[]) => void;
}

const nodePositions: Record<CampaignChannel, { x: number; y: number }> = {
  mailing: { x: 50, y: 14 },
  "cold-calls": { x: 82, y: 39 },
  community: { x: 70, y: 78 },
  "social-media": { x: 30, y: 78 },
  referrals: { x: 18, y: 39 },
};

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

export function CampaignsTab({ entries, onChange }: CampaignsTabProps) {
  const [active, setActive] = useState<CampaignChannel>("mailing");
  const [draft, setDraft] = useState<CampaignDraft>(emptyCampaignDraft);
  const channel = CHANNELS.find((item) => item.id === active) ?? CHANNELS[0];
  const recent = useMemo(
    () =>
      entries
        .filter((entry) => entry.channel === active)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [active, entries],
  );

  function choose(next: CampaignChannel) {
    setActive(next);
    setDraft(emptyCampaignDraft());
  }

  function patch(field: keyof CampaignDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draftIsComplete(active, draft)) return;
    onChange([entryFromDraft(active, draft), ...entries]);
    setDraft(emptyCampaignDraft());
  }

  return (
    <section className="campaigns-shell" aria-label="Campaign activity">
      <div className="campaigns-map-panel">
        <div className="campaigns-section-head">
          <h2>Channel Map</h2>
          <span>Select a node to log</span>
        </div>

        <div className="campaigns-map">
          <div className="campaigns-stars" aria-hidden="true" />
          <div className="campaigns-orbit campaigns-orbit-one" aria-hidden="true" />
          <div className="campaigns-orbit campaigns-orbit-two" aria-hidden="true" />
          <div className="campaigns-orbit campaigns-orbit-three" aria-hidden="true" />

          <svg className="campaigns-spokes" viewBox="0 0 100 100" aria-hidden="true">
            {CHANNELS.map((item) => (
              <line
                key={item.id}
                className={item.id === active ? "is-active" : ""}
                x1="50"
                y1="50"
                x2={nodePositions[item.id].x}
                y2={nodePositions[item.id].y}
              />
            ))}
          </svg>

          <div className="campaigns-hub" aria-label={`${entries.length} total campaign entries`}>
            <strong>Campaigns</strong>
            <span>{entries.length ? `${entries.length} total entries` : "five channels"}</span>
          </div>

          {CHANNELS.map((item) => {
            const count = entries.filter((entry) => entry.channel === item.id).length;
            const position = nodePositions[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`campaigns-node node-${item.id}${item.id === active ? " is-active" : ""}`}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                onClick={() => choose(item.id)}
                aria-pressed={item.id === active}
              >
                <span className="campaigns-node-number">{item.numeral}</span>
                <strong>{item.label}</strong>
                <span className="campaigns-node-count">{count ? `${count} logged` : "No entries"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="campaigns-rail">
        <form className="campaigns-form" onSubmit={submit}>
          <div className="campaigns-form-kicker">
            <span aria-hidden="true" /> Log entry
          </div>
          <h2>{channel.label}</h2>
          <p>{channel.description}</p>

          {active === "mailing" && (
            <label>
              Campaign
              <input
                value={draft.campaign}
                onChange={(event) => patch("campaign", event.target.value)}
                placeholder="e.g. Q3 renewal postcard"
                required
              />
            </label>
          )}

          {active === "cold-calls" && (
            <label>
              Calls made
              <input
                type="number"
                min="1"
                step="1"
                value={draft.callsMade}
                onChange={(event) => patch("callsMade", event.target.value)}
                placeholder="e.g. 30"
                required
              />
            </label>
          )}

          {(active === "community" || active === "social-media") && (
            <label>
              Description
              <textarea
                value={draft.description}
                onChange={(event) => patch("description", event.target.value)}
                placeholder={
                  active === "community"
                    ? "What you attended, supported, or worked on"
                    : "What you posted, recorded, or prepared"
                }
                required
              />
            </label>
          )}

          {active === "referrals" && (
            <>
              <label>
                Referred by
                <input
                  value={draft.referredBy}
                  onChange={(event) => patch("referredBy", event.target.value)}
                  placeholder="Person who made the introduction"
                  required
                />
              </label>
              <label>
                People referred
                <textarea
                  value={draft.referredPeople}
                  onChange={(event) => patch("referredPeople", event.target.value)}
                  placeholder="Names, one per line or separated by commas"
                  required
                />
              </label>
            </>
          )}

          <label>
            Date
            <input
              type="date"
              value={draft.date}
              onChange={(event) => patch("date", event.target.value)}
              required
            />
          </label>

          {(active === "mailing" || active === "cold-calls" || active === "referrals") && (
            <label>
              Notes <span className="campaigns-optional">Optional</span>
              <textarea
                value={draft.notes}
                onChange={(event) => patch("notes", event.target.value)}
                placeholder="Anything worth remembering"
              />
            </label>
          )}

          <div className="campaigns-form-actions">
            <button className="campaigns-save" type="submit" disabled={!draftIsComplete(active, draft)}>
              Save entry
            </button>
            <button className="campaigns-clear" type="button" onClick={() => setDraft(emptyCampaignDraft())}>
              Clear
            </button>
          </div>
        </form>

        <div className="campaigns-recent">
          <div className="campaigns-recent-head">
            <h3>Recent entries</h3>
            <span>{recent.length} {recent.length === 1 ? "entry" : "entries"}</span>
          </div>
          {recent.length === 0 ? (
            <p className="campaigns-empty">Nothing logged here yet.</p>
          ) : (
            <ol>
              {recent.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entryTitle(entry)}</strong>
                    <time dateTime={entry.date}>{displayDate(entry.date)}</time>
                  </div>
                  {entryDetail(entry) && <p>{entryDetail(entry)}</p>}
                  <button
                    type="button"
                    onClick={() => onChange(entries.filter((candidate) => candidate.id !== entry.id))}
                    aria-label={`Delete ${entryTitle(entry)}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </section>
  );
}
