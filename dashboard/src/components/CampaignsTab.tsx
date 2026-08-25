import { useMemo, useState, type FormEvent } from "react";
import {
  CHANNELS,
  channelSpec,
  chords,
  countsByChannel,
  draftHasContent,
  emptyCampaignDraft,
  entryDetail,
  entryFromDraft,
  entryTitle,
  particles,
  type CampaignChannel,
  type CampaignDraft,
  type CampaignEntry,
  type DraftField,
} from "../lib/campaigns";

interface CampaignsTabProps {
  entries: CampaignEntry[];
  onChange: (entries: CampaignEntry[]) => void;
}

const HUB = 360;

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

/**
 * Campaigns — five channels, logged as you work them.
 *
 * The map is one SVG rather than positioned elements, so the spokes, the
 * rings and the nodes stay in register at any size. There are no SVG filters
 * anywhere in it: the glow is stacked low-opacity rings and radial gradients,
 * because blur filters break when the page is rasterised for export.
 */
export function CampaignsTab({ entries, onChange }: CampaignsTabProps) {
  const [active, setActive] = useState<CampaignChannel>("mailing");
  const [draft, setDraft] = useState<CampaignDraft>(emptyCampaignDraft);

  const channel = channelSpec(active);
  const counts = useMemo(() => countsByChannel(entries), [entries]);
  const dust = useMemo(() => particles(), []);
  const mesh = useMemo(() => chords(), []);

  const recent = useMemo(
    () =>
      entries
        .filter((e) => e.channel === active)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [active, entries],
  );

  function choose(next: CampaignChannel) {
    setActive(next);
    setDraft(emptyCampaignDraft());
  }

  function patch(field: DraftField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draftHasContent(active, draft)) return;
    onChange([entryFromDraft(active, draft), ...entries]);
    setDraft(emptyCampaignDraft());
  }

  const canSave = draftHasContent(active, draft);

  return (
    <div className="camp">
      {/* ---------- The map ---------- */}
      <section className="camp-map-panel" aria-labelledby="camp-map-title">
        <span className="camp-map-wash" aria-hidden="true" />
        <span className="camp-map-frame" aria-hidden="true" />

        <h2 id="camp-map-title" className="sr-only">
          Channel map
        </h2>

        <svg
          className="camp-map"
          viewBox="0 0 720 720"
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
        >
          <defs>
            <radialGradient id="camp-glow">
              <stop offset="0%" stopColor="#c9a86a" stopOpacity="0.16" />
              <stop offset="55%" stopColor="#c9a86a" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#c9a86a" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="camp-hub-fill" cx="30%" cy="16%">
              <stop offset="0%" stopColor="#2a2530" />
              <stop offset="100%" stopColor="#121016" />
            </radialGradient>
            <radialGradient id="camp-node-fill" cx="30%" cy="16%">
              <stop offset="0%" stopColor="#221f28" />
              <stop offset="100%" stopColor="#100f14" />
            </radialGradient>
            {CHANNELS.map((c) => (
              <radialGradient id={`camp-halo-${c.id}`} key={c.id}>
                <stop offset="50%" stopColor={c.hue} stopOpacity="0.3" />
                <stop offset="100%" stopColor={c.hue} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          {/* 1. Ground glow */}
          <circle cx={HUB} cy={HUB} r={340} fill="url(#camp-glow)" />

          {/* 2. Concentric rings */}
          <circle
            cx={HUB}
            cy={HUB}
            r={300}
            fill="none"
            stroke="#c9a86a"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
          <circle
            cx={HUB}
            cy={HUB}
            r={262}
            fill="none"
            stroke="#c9a86a"
            strokeOpacity="0.16"
            strokeWidth="1"
          />

          {/* 3. The one moving thing in the design, besides the dust. */}
          <circle
            className="camp-spin"
            cx={HUB}
            cy={HUB}
            r={180}
            fill="none"
            stroke="#c9a86a"
            strokeOpacity="0.09"
            strokeWidth="1"
            strokeDasharray="1 9"
          />

          {/* 4. Dust — seeded, so it never reshuffles on a re-render. */}
          <g opacity="0.5">
            {dust.map((p, i) => (
              <circle
                key={i}
                className="camp-dust"
                cx={p.x}
                cy={p.y}
                r={p.r}
                fill="#c9a86a"
                style={{ animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }}
              />
            ))}
          </g>

          {/* 5. Wireframe — every chord between two nodes */}
          {mesh.map((c, i) => (
            <line
              key={i}
              x1={c.x1}
              y1={c.y1}
              x2={c.x2}
              y2={c.y2}
              stroke="#c9a86a"
              strokeOpacity="0.07"
              strokeWidth="1"
            />
          ))}

          {/* 6. Static spokes, each in its own channel's hue */}
          {CHANNELS.map((c) => (
            <line
              key={c.id}
              x1={HUB}
              y1={HUB}
              x2={c.x}
              y2={c.y}
              stroke={c.hue}
              strokeOpacity="0.28"
              strokeWidth="1"
            />
          ))}

          {/* 7. The lit spoke */}
          <line
            x1={HUB}
            y1={HUB}
            x2={channel.x}
            y2={channel.y}
            stroke={channel.hue}
            strokeOpacity="0.95"
            strokeWidth="1.4"
          />

          {/* 8. Nodes */}
          {CHANNELS.map((c) => {
            const on = c.id === active;
            return (
              <g
                key={c.id}
                className="camp-node"
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${c.label} — ${counts[c.id]} ${counts[c.id] === 1 ? "entry" : "entries"}`}
                onClick={() => choose(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(c.id);
                  }
                }}
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={94}
                  fill={`url(#camp-halo-${c.id})`}
                  opacity={on ? 1 : 0}
                />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={66}
                  fill="url(#camp-node-fill)"
                  stroke={c.hue}
                  strokeOpacity="0.45"
                  strokeWidth="1"
                />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={66}
                  fill="none"
                  stroke={c.hue}
                  strokeOpacity="0.95"
                  strokeWidth="1"
                  opacity={on ? 1 : 0}
                />
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={73}
                  fill="none"
                  stroke={c.hue}
                  strokeOpacity="0.3"
                  strokeWidth="1"
                  opacity={on ? 1 : 0}
                />
                <text
                  x={c.x}
                  y={c.y - 22}
                  textAnchor="middle"
                  fill={c.hue}
                  style={{ font: "400 12px var(--font-display)", letterSpacing: "1.6px" }}
                >
                  {c.numeral}
                </text>
                <text
                  x={c.x}
                  y={c.y + 4}
                  textAnchor="middle"
                  fill="#f1efe9"
                  style={{ font: "400 17px var(--font-display)" }}
                >
                  {c.label}
                </text>
                <text
                  x={c.x}
                  y={c.y + 26}
                  textAnchor="middle"
                  fill="#8f8b84"
                  style={{ font: "400 9.5px var(--font-ui)", letterSpacing: "1.6px" }}
                >
                  {counts[c.id] === 0 ? "NONE" : `${counts[c.id]} LOGGED`}
                </text>
              </g>
            );
          })}

          {/* 9. Hub, drawn last so it sits above the spokes */}
          <circle
            cx={HUB}
            cy={HUB}
            r={112}
            fill="none"
            stroke="#c9a86a"
            strokeOpacity="0.14"
            strokeWidth="1"
          />
          <circle
            cx={HUB}
            cy={HUB}
            r={100}
            fill="url(#camp-hub-fill)"
            stroke="#c9a86a"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          <circle
            cx={HUB}
            cy={HUB}
            r={92}
            fill="none"
            stroke="#c9a86a"
            strokeOpacity="0.22"
            strokeWidth="1"
          />
          <text
            x={HUB}
            y={345}
            textAnchor="middle"
            fill="#f6f2ea"
            style={{ font: "400 27px var(--font-display)" }}
          >
            Campaigns
          </text>
          <line
            x1={HUB - 38}
            y1={360}
            x2={HUB + 38}
            y2={360}
            stroke="#c9a86a"
            strokeOpacity="0.4"
            strokeWidth="1"
          />
          <text
            x={HUB}
            y={380}
            textAnchor="middle"
            fill="#8f8b84"
            style={{ font: "400 9px var(--font-ui)", letterSpacing: "2.6px" }}
          >
            FIVE CHANNELS
          </text>
          <text
            x={HUB}
            y={400}
            textAnchor="middle"
            fill="#dfc9a1"
            style={{ font: "400 10.5px var(--font-ui)" }}
          >
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </text>
        </svg>

        {/* The map is geometry; this is the same information as a list, for
            anything that cannot read a diagram. */}
        <ul className="sr-only">
          {CHANNELS.map((c) => (
            <li key={c.id}>
              {c.numeral}. {c.label} — {counts[c.id]} {counts[c.id] === 1 ? "entry" : "entries"}
              {c.id === active ? " (selected)" : ""}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- The rail ---------- */}
      <aside className="camp-rail">
        <form className="camp-form" onSubmit={submit}>
          <span className="camp-tick camp-tick-tl" aria-hidden="true" />
          <span className="camp-tick camp-tick-br" aria-hidden="true" />

          <div className="camp-form-kicker">
            <span className="camp-dot" style={{ background: channel.hue }} aria-hidden="true" />
            <span className="kicker">Log entry</span>
          </div>

          <h2 className="camp-form-title">{channel.label}</h2>
          <p className="camp-hint">{channel.hint}</p>

          {channel.fields.map((f) => (
            <label className="camp-field" key={f.key}>
              <span className="camp-label">{f.label}</span>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => patch(f.key, e.target.value)}
                />
              ) : (
                <input
                  type={f.key === "date" ? "date" : f.numeric ? "number" : "text"}
                  {...(f.numeric ? { min: 0, step: 1 } : {})}
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => patch(f.key, e.target.value)}
                />
              )}
            </label>
          ))}

          <div className="camp-actions">
            <button type="submit" className="camp-save" disabled={!canSave}>
              Save entry
            </button>
            <button
              type="button"
              className="camp-clear"
              onClick={() => setDraft(emptyCampaignDraft())}
            >
              Clear
            </button>
          </div>
        </form>

        <div className="camp-recent">
          <span className="camp-tick camp-tick-tl" aria-hidden="true" />
          <div className="camp-recent-head">
            <span className="kicker">Recent</span>
            <span className="camp-count">
              {recent.length} {recent.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {recent.length === 0 ? (
            <p className="camp-empty">Nothing logged for this channel yet.</p>
          ) : (
            <ul className="camp-entries">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <div className="camp-entry-head">
                    <span className="camp-entry-title">{entryTitle(entry)}</span>
                    <time dateTime={entry.date} className="camp-entry-date">
                      {displayDate(entry.date)}
                    </time>
                  </div>
                  {entryDetail(entry) && <p className="camp-entry-sub">{entryDetail(entry)}</p>}
                  <button
                    type="button"
                    className="camp-delete"
                    onClick={() => onChange(entries.filter((c) => c.id !== entry.id))}
                  >
                    Delete<span className="sr-only"> {entryTitle(entry)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
