import { newId, today } from "./storage";

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

export interface CampaignDraft {
  date: string;
  campaign: string;
  callsMade: string;
  description: string;
  referredBy: string;
  referredPeople: string;
  notes: string;
}

export const CHANNELS: {
  id: CampaignChannel;
  label: string;
  numeral: string;
  description: string;
}[] = [
  {
    id: "mailing",
    label: "Mailing",
    numeral: "I",
    description: "Log each drop, the list it reached, and anything worth remembering.",
  },
  {
    id: "cold-calls",
    label: "Cold Calls",
    numeral: "II",
    description: "Record the volume you put in and any useful context from the session.",
  },
  {
    id: "community",
    label: "Community",
    numeral: "III",
    description: "Capture events, conversations, sponsorships, and time spent in the community.",
  },
  {
    id: "social-media",
    label: "Social Media",
    numeral: "IV",
    description: "Keep a simple record of what you published or worked on.",
  },
  {
    id: "referrals",
    label: "Referrals",
    numeral: "V",
    description: "Record who made the introduction and every person they referred.",
  },
];

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

export function draftIsComplete(channel: CampaignChannel, draft: CampaignDraft): boolean {
  if (!draft.date) return false;
  if (channel === "mailing") return draft.campaign.trim().length > 0;
  if (channel === "cold-calls") return Number(draft.callsMade) > 0;
  if (channel === "community" || channel === "social-media") {
    return draft.description.trim().length > 0;
  }
  return draft.referredBy.trim().length > 0 && draft.referredPeople.trim().length > 0;
}

export function entryFromDraft(
  channel: CampaignChannel,
  draft: CampaignDraft,
): CampaignEntry {
  return {
    id: newId(),
    channel,
    date: draft.date,
    createdAt: new Date().toISOString(),
    ...(channel === "mailing" ? { campaign: draft.campaign.trim() } : {}),
    ...(channel === "cold-calls" ? { callsMade: Number(draft.callsMade) } : {}),
    ...(channel === "community" || channel === "social-media"
      ? { description: draft.description.trim() }
      : {}),
    ...(channel === "referrals"
      ? {
          referredBy: draft.referredBy.trim(),
          referredPeople: draft.referredPeople.trim(),
        }
      : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
}

export function entryTitle(entry: CampaignEntry): string {
  if (entry.channel === "mailing") return entry.campaign || "Mailing campaign";
  if (entry.channel === "cold-calls") {
    return `${entry.callsMade ?? 0} cold call${entry.callsMade === 1 ? "" : "s"}`;
  }
  if (entry.channel === "referrals") return `Referral from ${entry.referredBy || "someone"}`;
  return entry.description || "Activity";
}

export function entryDetail(entry: CampaignEntry): string {
  if (entry.channel === "referrals") {
    return [entry.referredPeople, entry.notes].filter(Boolean).join(" · ");
  }
  if (entry.channel === "community" || entry.channel === "social-media") {
    return entry.notes || "";
  }
  return entry.notes || "";
}
