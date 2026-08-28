import type { Meeting } from "../types";
import { newId, today } from "./storage";

/**
 * This week and next week.
 *
 * Both lists are derived from the date on each meeting rather than stored
 * against a bucket, so a meeting moves from next week into this week on its
 * own when the week turns. A stored bucket would need a chore nobody will
 * remember to do, and would be wrong every Monday morning until they did.
 *
 * Weeks run Sunday to Saturday, the US calendar convention.
 */

/** Local midnight for an ISO day. Never `new Date(iso)` — that parses as UTC. */
function dayOf(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Sunday that begins the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = dayOf(iso);
  d.setDate(d.getDate() - d.getDay());
  return toIso(d);
}

export function addDays(iso: string, days: number): string {
  const d = dayOf(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export type Bucket = "this" | "next" | "later" | "past";

/** Which list a meeting belongs in, worked out from its date alone. */
export function bucketOf(meeting: Meeting, todayIso = today()): Bucket {
  if (!meeting.date) return "later";
  const thisStart = weekStart(todayIso);
  const nextStart = addDays(thisStart, 7);
  const weekAfter = addDays(thisStart, 14);

  if (meeting.date < thisStart) return "past";
  if (meeting.date < nextStart) return "this";
  if (meeting.date < weekAfter) return "next";
  return "later";
}

/** "Tue" — read off the date, so it can never disagree with it. */
export function dayName(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dayOf(iso));
}

/** "26 Aug" — the date beside the day. */
export function dateLabel(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dayOf(iso));
}

/** Earliest first. A meeting with no date sorts last rather than leading. */
export function sortMeetings(rows: Meeting[]): Meeting[] {
  return [...rows].sort(
    (a, b) =>
      (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") ||
      a.time.localeCompare(b.time) ||
      a.name.localeCompare(b.name),
  );
}

export function meetingsIn(rows: Meeting[], bucket: Bucket, todayIso = today()): Meeting[] {
  return sortMeetings(rows.filter((m) => bucketOf(m, todayIso) === bucket));
}

/** Whether the day has already gone by — shown as past, never hidden. */
export function isPast(meeting: Meeting, todayIso = today()): boolean {
  return Boolean(meeting.date) && meeting.date < todayIso;
}

export interface MeetingDraft {
  name: string;
  date: string;
  time: string;
  place: string;
}

export function emptyMeetingDraft(): MeetingDraft {
  return { name: "", date: "", time: "", place: "" };
}

/** A meeting with no name is not a meeting. Everything else is optional. */
export function draftIsUsable(draft: MeetingDraft): boolean {
  return draft.name.trim().length > 0;
}

export function meetingFromDraft(draft: MeetingDraft): Meeting {
  return {
    id: newId(),
    name: draft.name.trim(),
    date: draft.date,
    time: draft.time.trim(),
    place: draft.place.trim(),
    createdAt: new Date().toISOString(),
  };
}
