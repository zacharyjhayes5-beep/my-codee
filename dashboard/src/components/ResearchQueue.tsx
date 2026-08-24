import { useState } from "react";
import type { Prospect } from "../types";
import { buildResearchQueue, researchedPatch, unreachablePatch } from "../lib/research";
import { isValidPhone } from "../lib/phone";
import { tagColor } from "../lib/tags";
import { today } from "../lib/storage";

interface ResearchQueueProps {
  prospects: Prospect[];
  onPatchProspect: (id: string, patch: Partial<Prospect>) => void;
  /** Open the full list on the Leads page. */
  onSeeAll: () => void;
  /** How many rows to work inline before sending you to the full list. */
  limit?: number;
}

/**
 * The bridge between the nightly GIS batch and the calling queue.
 *
 * Each row shows only what is needed to look somebody up — who they are, where
 * the property is, and the parcel number for when the name is ambiguous. The
 * number goes in, the household leaves the queue, and the existing calling
 * rules pick it up from there.
 */
export function ResearchQueue({
  prospects,
  onPatchProspect,
  onSeeAll,
  limit = 5,
}: ResearchQueueProps) {
  const queue = buildResearchQueue(prospects);
  if (queue.length === 0) return null;

  return (
    <section className="op-panel research-queue">
      <header className="op-panel-head">
        Needs research
        {/* Re-keyed on the value so it remounts and replays the tick. */}
        <span className="research-count tick" key={queue.length}>
          {queue.length}
        </span>
      </header>

      <p className="research-blurb">
        New properties wait here while contact enrichment is pending. Add a verified
        number at any time and the household joins your call queue.
      </p>

      <ul className="research-list">
        {queue.slice(0, limit).map((p) => (
          <ResearchRow key={p.id} prospect={p} onPatchProspect={onPatchProspect} />
        ))}
      </ul>

      {queue.length > limit && (
        <button className="link-btn" onClick={onSeeAll}>
          See all {queue.length} in Leads
        </button>
      )}
    </section>
  );
}

function ResearchRow({
  prospect,
  onPatchProspect,
}: {
  prospect: Prospect;
  onPatchProspect: (id: string, patch: Partial<Prospect>) => void;
}) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const ready = isValidPhone(phone);

  function save() {
    const patch = researchedPatch(phone, email, today());
    // Null means the number is not dialable; refusing here is what stops a
    // half-typed entry clearing the flag.
    if (patch) onPatchProspect(prospect.id, patch);
  }

  const address = [prospect.address.line1, prospect.address.city].filter(Boolean).join(", ");

  return (
    <li className="research-item enter">
      <div className="research-who">
        <span className="research-name">{prospect.name || "Untitled household"}</span>
        {(prospect.tags ?? []).map((tag) => {
          const c = tagColor(tag.color);
          return (
            <span
              key={tag.id}
              className="lead-tag"
              style={{ background: c.background, color: c.foreground }}
            >
              {tag.label}
            </span>
          );
        })}
      </div>

      <p className="research-where">
        {address || prospect.area || "No address on file"}
        {prospect.parcelId && <span className="research-parcel">{prospect.parcelId}</span>}
      </p>

      <p className="research-enrichment">
        {prospect.enrichmentStatus === "processing" && "Enrichment running"}
        {prospect.enrichmentStatus === "needs_review" && "Enrichment result needs review"}
        {prospect.enrichmentStatus === "not_found" && "No contact found automatically"}
        {prospect.enrichmentStatus === "failed" && "Enrichment will need a retry"}
        {(!prospect.enrichmentStatus || prospect.enrichmentStatus === "pending") && "Waiting for enrichment"}
      </p>

      <div className="research-entry">
        <label className="sr-only" htmlFor={`phone-${prospect.id}`}>
          Phone number for {prospect.name}
        </label>
        <input
          id={`phone-${prospect.id}`}
          className="research-phone"
          type="tel"
          value={phone}
          placeholder="Phone number"
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ready) {
              e.preventDefault();
              save();
            }
          }}
        />

        <label className="sr-only" htmlFor={`email-${prospect.id}`}>
          Email for {prospect.name} (optional)
        </label>
        <input
          id={`email-${prospect.id}`}
          className="research-email"
          type="email"
          value={email}
          placeholder="Email (optional)"
          onChange={(e) => setEmail(e.target.value)}
        />

        <button className="primary-btn research-save" onClick={save} disabled={!ready}>
          Save
        </button>

        <button
          className="link-btn research-skip"
          onClick={() => onPatchProspect(prospect.id, unreachablePatch(today()))}
          title="Closes the household as unreachable. It stays on file, so GIS will not surface it again."
        >
          No number found
        </button>
      </div>
    </li>
  );
}
