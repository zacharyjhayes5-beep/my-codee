/**
 * Lead tags.
 *
 * A tag is a label and a colour, and nothing more — there is no tag registry,
 * no rename, no usage counts. Deliberately: the value is being able to mark a
 * household in a second, and every piece of management machinery added here
 * would be something to maintain for very little return.
 *
 * The colour is stored as a *name* rather than a hex value, so the palette can
 * be retuned in one place without rewriting every record that used it.
 */

import type { ProspectTag } from "../types";

export interface TagColor {
  id: string;
  name: string;
  /** Background of the chip. */
  background: string;
  /** Text on that background. Paired so contrast is guaranteed, not hoped for. */
  foreground: string;
}

/**
 * Six options drawn from the interface's own palette.
 *
 * Every pairing clears WCAG AA at the small size these chips render, which is
 * why foreground is fixed per colour rather than left to chance — the tags are
 * small and a mis-paired colour would be the least readable text on the page.
 */
export const TAG_COLORS: TagColor[] = [
  { id: "navy", name: "Navy", background: "#131e2b", foreground: "#f7f4ed" },
  { id: "cognac", name: "Cognac", background: "#854d2c", foreground: "#f7f4ed" },
  { id: "green", name: "Green", background: "#3f5c47", foreground: "#f7f4ed" },
  { id: "red", name: "Red", background: "#8a3a34", foreground: "#f7f4ed" },
  { id: "blue", name: "Blue", background: "#35506b", foreground: "#f7f4ed" },
  { id: "gray", name: "Warm gray", background: "#5d5648", foreground: "#f7f4ed" },
];

export const DEFAULT_TAG_COLOR = TAG_COLORS[0].id;

/**
 * The colour for a stored value.
 *
 * Falls back rather than failing: a record written before a colour was renamed,
 * or carrying something unexpected from a restored backup, still renders as a
 * legible chip instead of an invisible one.
 */
export function tagColor(id: string): TagColor {
  return TAG_COLORS.find((c) => c.id === id) ?? TAG_COLORS[0];
}

/** Tag labels are short by design; anything longer is a note, not a tag. */
export const MAX_TAG_LENGTH = 24;

export function normalizeTagLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

/**
 * Add a tag, or return the list unchanged.
 *
 * Refuses blanks and case-insensitive repeats, so clicking Add twice on the
 * same word cannot leave a household wearing "Referral" beside "referral".
 */
export function addTag(tags: ProspectTag[], label: string, color: string): ProspectTag[] {
  const clean = normalizeTagLabel(label);
  if (!clean) return tags;
  if (tags.some((t) => t.label.toLowerCase() === clean.toLowerCase())) return tags;

  return [
    ...tags,
    {
      id: `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      label: clean,
      color: tagColor(color).id,
    },
  ];
}

export function removeTag(tags: ProspectTag[], id: string): ProspectTag[] {
  return tags.filter((t) => t.id !== id);
}
