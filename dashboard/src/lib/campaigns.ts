import { newId, today } from "./storage";

/**
 * The five channels, and what each one asks you for.
 *
 * The forms differ per channel, and that is the whole feature — a mailing
 * wants a campaign name, a cold-call session wants a volume, and a referral
 * wants two names. One shared form with everything on it would ask four
 * irrelevant questions every time it was used.
 */

export type CampaignChannel =
  | "mailing"
  | "cold-calls"
  | "community"
  | "social-media"
  | "referrals";

export interface CampaignEntry {
  id: string;
  channel: CampaignChannel;
  date: string;
  createdAt: string;
  campaign?: string;
  callsMade?: number;
  description?: string;
  referredBy?: string;
  referredPeople?: string;
  notes?: string;
}

/** Every field the five forms can show. Each channel names the ones it wants. */
export interface CampaignDraft {
  date: string;
  campaign: string;
  callsMade: string;
  description: string;
  referredBy: string;
  referredPeople: string;
  notes: string;
}

export type DraftField = keyof CampaignDraft;

export interface FieldSpec {
  key: DraftField;
  label: string;
  placeholder: string;
  multiline?: boolean;
  /** Numeric entry, so the control gets the right keyboard and validation. */
  numeric?: boolean;
}

export interface ChannelSpec {
  id: CampaignChannel;
  label: string;
  numeral: string;
  hint: string;
  /** The node's hue, and the dot on the form kicker. */
  hue: string;
  /** Pentagon geometry in the 720×720 map, first node at 12 o'clock. */
  x: number;
  y: number;
  fields: FieldSpec[];
}

export const CHANNELS: ChannelSpec[] = [
  {
    id: "mailing",
    label: "Mailing",
    numeral: "I",
    hint: "Log each drop as it goes out, plus whatever you want to remember about it.",
    hue: "#3f6f9e",
    x: 360,
    y: 98,
    fields: [
      { key: "campaign", label: "Campaign", placeholder: "e.g. Q3 renewal postcard" },
      { key: "date", label: "Date sent", placeholder: "" },
      {
        key: "notes",
        label: "Notes",
        placeholder: "List used, piece, count, anything worth remembering",
        multiline: true,
      },
    ],
  },
  {
    id: "cold-calls",
    label: "Cold Calls",
    numeral: "II",
    hint: "Log your call volume for the day.",
    hue: "#b0803e",
    x: 609,
    y: 279,
    fields: [
      { key: "date", label: "Date", placeholder: "" },
      { key: "callsMade", label: "Calls made", placeholder: "e.g. 64", numeric: true },
      {
        key: "notes",
        label: "Notes",
        placeholder: "Optional — list, block, anything notable",
        multiline: true,
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    numeral: "III",
    hint: "Write down what you did — event, sponsorship, drop-in.",
    hue: "#9c5a48",
    x: 514,
    y: 572,
    fields: [
      { key: "date", label: "Date", placeholder: "" },
      { key: "description", label: "What you did", placeholder: "Describe it", multiline: true },
    ],
  },
  {
    id: "social-media",
    label: "Social Media",
    numeral: "IV",
    hint: "Write down what you posted or ran.",
    hue: "#4f7f75",
    x: 206,
    y: 572,
    fields: [
      { key: "date", label: "Date", placeholder: "" },
      { key: "description", label: "What you posted", placeholder: "Describe it", multiline: true },
    ],
  },
  {
    id: "referrals",
    label: "Referrals",
    numeral: "V",
    hint: "Log who sent the referral and who they sent.",
    hue: "#c9a86a",
    x: 111,
    y: 279,
    fields: [
      { key: "referredBy", label: "Referred by", placeholder: "e.g. Dave Kowalski" },
      {
        key: "referredPeople",
        label: "Referred",
        placeholder: "Names, separated by commas",
      },
      { key: "date", label: "Date", placeholder: "" },
      { key: "notes", label: "Notes", placeholder: "Optional", multiline: true },
    ],
  },
];

export function channelSpec(id: CampaignChannel): ChannelSpec {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
}

export function emptyCampaignDraft(): CampaignDraft {
  return {
    date: today(),
    campaign: "",
    callsMade: "",
    description: "",
    referredBy: "",
    referredPeople: "",
    notes: "",
  };
}

/**
 * Saving is a no-op only when every field the channel asks for is blank.
 *
 * Deliberately not "all fields required": a community note with no date is
 * still worth keeping, and a form that refuses to save what you typed is how
 * people stop logging anything at all. The date is pre-filled with today, so
 * in practice a save always carries one.
 */
export function draftHasContent(channel: CampaignChannel, draft: CampaignDraft): boolean {
  return channelSpec(channel).fields.some((f) => {
    if (f.key === "date") return false; // pre-filled; never the only content
    return draft[f.key].trim().length > 0;
  });
}

export function entryFromDraft(channel: CampaignChannel, draft: CampaignDraft): CampaignEntry {
  const keys = new Set(channelSpec(channel).fields.map((f) => f.key));
  const has = (k: DraftField) => keys.has(k) && draft[k].trim().length > 0;

  return {
    id: newId(),
    channel,
    date: draft.date || today(),
    createdAt: new Date().toISOString(),
    ...(has("campaign") ? { campaign: draft.campaign.trim() } : {}),
    ...(has("callsMade") ? { callsMade: Number(draft.callsMade) } : {}),
    ...(has("description") ? { description: draft.description.trim() } : {}),
    ...(has("referredBy") ? { referredBy: draft.referredBy.trim() } : {}),
    ...(has("referredPeople") ? { referredPeople: draft.referredPeople.trim() } : {}),
    ...(has("notes") ? { notes: draft.notes.trim() } : {}),
  };
}

/** The first line of a free-text entry, capped so a row stays one line. */
function firstLine(text: string, cap = 60): string {
  const line = (text || "").split("\n")[0].trim();
  return line.length > cap ? `${line.slice(0, cap)}…` : line;
}

export function entryTitle(entry: CampaignEntry): string {
  switch (entry.channel) {
    case "mailing":
      return entry.campaign || "Untitled drop";
    case "cold-calls":
      return entry.callsMade ? `${entry.callsMade} calls` : "Calls";
    case "referrals":
      return entry.referredBy || "Referral";
    default:
      return firstLine(entry.description ?? "") || "Entry";
  }
}

export function entryDetail(entry: CampaignEntry): string {
  switch (entry.channel) {
    case "referrals":
      return entry.referredPeople ? `→ ${entry.referredPeople}` : "";
    case "community":
    case "social-media":
      return "";
    default:
      return entry.notes ?? "";
  }
}

export function countsByChannel(entries: CampaignEntry[]): Record<CampaignChannel, number> {
  const counts = {
    mailing: 0,
    "cold-calls": 0,
    community: 0,
    "social-media": 0,
    referrals: 0,
  } as Record<CampaignChannel, number>;
  for (const e of entries) {
    if (e.channel in counts) counts[e.channel] += 1;
  }
  return counts;
}

/**
 * The particle field behind the map.
 *
 * Seeded rather than random, so the same seventy specks land in the same
 * places on every render. `Math.random()` here would make the background
 * shimmer on every keystroke that re-rendered the screen.
 */
export interface Particle {
  x: number;
  y: number;
  r: number;
  duration: number;
  delay: number;
}

export function particles(count = 70): Particle[] {
  // A plain 32-bit LCG. Not good randomness — repeatable randomness, which
  // is the property that matters here.
  let seed = 0x2f6e2b1;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = next() * Math.PI * 2;
    const radius = 120 + next() * 200; // between the hub and the outer ring
    out.push({
      x: 360 + Math.cos(angle) * radius,
      y: 360 + Math.sin(angle) * radius,
      r: 0.6 + next() * 0.9,
      duration: 4 + next() * 5,
      delay: next() * 5,
    });
  }
  return out;
}

/** Every chord between two nodes — the wireframe under the spokes. */
export function chords(): { x1: number; y1: number; x2: number; y2: number }[] {
  const out = [];
  for (let i = 0; i < CHANNELS.length; i += 1) {
    for (let j = i + 1; j < CHANNELS.length; j += 1) {
      out.push({
        x1: CHANNELS[i].x,
        y1: CHANNELS[i].y,
        x2: CHANNELS[j].x,
        y2: CHANNELS[j].y,
      });
    }
  }
  return out;
}
