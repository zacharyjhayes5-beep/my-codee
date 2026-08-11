import type { Suggestion, Urgency } from "../types";
import { newId } from "./storage";

/**
 * Turns raw text — an Obsidian note or an email — into to-do suggestions.
 * Nothing here writes to the list: every suggestion goes to the inbox on the
 * To-Do tab and waits to be approved or rejected.
 */

export type SuggestionSource = "obsidian" | "gmail";

export interface ParseOptions {
  filename?: string;
  /** Today, as yyyy-mm-dd — every relative date is resolved against it. */
  today: string;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shift(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Days between two ISO dates — negative when `iso` is already past. */
export function daysUntil(iso: string, today: string): number {
  return Math.round((fromIso(iso).getTime() - fromIso(today).getTime()) / 86_400_000);
}

/** The next time this weekday comes around, today included. */
function nextWeekday(name: string, today: string): string {
  const target = WEEKDAYS.indexOf(name);
  if (target < 0) return today;
  const current = fromIso(today).getDay();
  const delta = (target - current + 7) % 7;
  return shift(today, delta);
}

/**
 * Pulls a due date out of free text. Absolute dates win over relative ones,
 * because a note that says "call Friday — 2026-08-14" means the 14th.
 */
export function findDueDate(text: string, today: string): string | undefined {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : fromIso(today).getFullYear();
    const candidate = `${year}-${pad(month)}-${pad(day)}`;
    // A bare "Aug 3" written in December means next year's August.
    if (!named[3] && daysUntil(candidate, today) < -180) {
      return `${year + 1}-${pad(month)}-${pad(day)}`;
    }
    return candidate;
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}|\d{2}))?\b/);
  if (slash) {
    const year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : fromIso(today).getFullYear();
    return `${year}-${pad(Number(slash[1]))}-${pad(Number(slash[2]))}`;
  }

  const lowered = text.toLowerCase();
  if (/\b(today|tonight|by eod|end of day|this afternoon|this morning)\b/.test(lowered)) return today;
  if (/\btomorrow\b/.test(lowered)) return shift(today, 1);
  if (/\b(end of (the )?week|by friday|before the weekend)\b/.test(lowered)) {
    return nextWeekday("friday", today);
  }
  if (/\bnext week\b/.test(lowered)) return shift(today, 7);
  if (/\bin (a|1) week\b/.test(lowered)) return shift(today, 7);
  if (/\bnext month\b/.test(lowered)) return shift(today, 30);

  const inDays = lowered.match(/\bin (\d{1,2}) (day|business day|week)s?\b/);
  if (inDays) {
    const n = Number(inDays[1]);
    return shift(today, inDays[2] === "week" ? n * 7 : n);
  }

  const weekday = lowered.match(
    /\b(?:by|on|this|next|due)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  );
  if (weekday) {
    const base = nextWeekday(weekday[1], today);
    // "next Tuesday" means the one after this coming Tuesday.
    return /\bnext\s/.test(weekday[0]) ? shift(base, 7) : base;
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/* Urgency                                                             */
/* ------------------------------------------------------------------ */

const NOW_CUES = [
  "urgent", "asap", "as soon as possible", "immediately", "right away", "today",
  "eod", "end of day", "overdue", "past due", "final notice", "last chance",
  "expires today", "expiring", "time sensitive", "time-sensitive", "emergency",
  "critical", "!!!", "🔺", "❗",
];

const WEEK_CUES = [
  "this week", "high priority", "important", "priority", "soon", "before friday",
  "follow up", "follow-up", "⏫", "!!",
];

const SOMEDAY_CUES = [
  "someday", "eventually", "when you get a chance", "when there's time",
  "no rush", "low priority", "backburner", "back burner", "nice to have",
  "🔽", "⏬", "#low",
];

/**
 * Urgency is the stronger of what the words say and what the date says, so an
 * "urgent" note without a date still lands in Now, and a date two days out
 * still lands in This week even when the wording is casual.
 */
export function inferUrgency(text: string, dueDate: string | undefined, today: string): Urgency {
  const lowered = text.toLowerCase();

  if (SOMEDAY_CUES.some((c) => lowered.includes(c)) && !dueDate) return "someday";

  const byWords: Urgency | null = NOW_CUES.some((c) => lowered.includes(c))
    ? "now"
    : WEEK_CUES.some((c) => lowered.includes(c))
      ? "week"
      : null;

  let byDate: Urgency | null = null;
  if (dueDate) {
    const days = daysUntil(dueDate, today);
    byDate = days <= 0 ? "now" : days <= 7 ? "week" : "soon";
  }

  const rank: Record<Urgency, number> = { now: 3, week: 2, soon: 1, someday: 0 };
  const options: Urgency[] = [];
  if (byWords) options.push(byWords);
  if (byDate) options.push(byDate);
  if (options.length === 0) return "soon";
  return options.reduce((a, b) => (rank[a] >= rank[b] ? a : b));
}

/* ------------------------------------------------------------------ */
/* Text tidying                                                        */
/* ------------------------------------------------------------------ */

function collapse(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function clip(s: string, max = 140) {
  const t = collapse(s);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Strips the markup Obsidian adds so the task reads like a sentence. */
function cleanObsidian(line: string): string {
  return collapse(
    line
      .replace(/^\s*[-*+]\s*\[[^\]]?\]\s*/, "") // "- [ ] "
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\s*>\s*/, "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // [[note|alias]]
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url)
      .replace(/[[(]\s*\w+::[^\])]*[\])]/g, "") // dataview [due:: 2026-08-14]
      .replace(/[📅🗓⏳🛫➕✅❌🔺⏫🔼🔽⏬🔁]/gu, "")
      .replace(/(^|\s)#[\w/-]+/g, "$1")
      .replace(/\*\*|__|`/g, "")
      .replace(/^(todo|to-do|action item|action|next step|follow up|follow-up)\s*[:\-–]\s*/i, "")
  );
}

/**
 * Once a date has been lifted out into the due field, the bare timestamp left
 * behind in the text is noise — "Call Mike 2026-08-13" reads as "Call Mike".
 * Written-out phrasing ("by Friday") is left alone: it still reads as English.
 */
function stripDateMarkers(text: string, dueDate: string | undefined): string {
  let out = text.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "");
  if (dueDate) out = out.split(dueDate).join("");
  return collapse(out.replace(/\b(due|scheduled|start|created)\s*[:：]\s*$/i, "").replace(/[\s,;·—–-]+$/, ""));
}

/* ------------------------------------------------------------------ */
/* Obsidian                                                            */
/* ------------------------------------------------------------------ */

const TODO_LINE = /^\s*(?:[-*+]\s*)?(?:todo|to-do|action item|action|next step|follow[- ]?up)\s*[:\-–]/i;
const TAG_TODO = /(?:^|\s)[#@](?:todo|task|action|followup|follow-up|next)\b/i;
const OPEN_CHECKBOX = /^\s*[-*+]\s*\[\s\]\s+/;
const DONE_CHECKBOX = /^\s*[-*+]\s*\[[xX\-/]\]/;
const ACTION_HEADING = /^#{1,6}\s*(action items?|next steps?|to-?dos?|to do|follow[- ]?ups?|tasks?)\b/i;

/** The note's own title — a front-matter title, the first heading, or the filename. */
function noteTitle(raw: string, filename?: string): string {
  const front = raw.match(/^---\n([\s\S]*?)\n---/);
  if (front) {
    const t = front[1].match(/^title:\s*(.+)$/m);
    if (t) return collapse(t[1].replace(/^["']|["']$/g, ""));
  }
  const heading = raw.split(/\r?\n/).find((l) => /^#{1,3}\s+\S/.test(l));
  if (heading) return clip(heading.replace(/^#{1,6}\s*/, ""), 60);
  if (filename) return filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  return "Obsidian note";
}

export function parseObsidianNote(raw: string, options: ParseOptions): Suggestion[] {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const title = noteTitle(text, options.filename);

  const found: Suggestion[] = [];
  const seen = new Set<string>();
  let heading = "";
  let underActionHeading = false;

  lines.forEach((line, i) => {
    if (/^#{1,6}\s+/.test(line)) {
      heading = collapse(line.replace(/^#{1,6}\s*/, ""));
      underActionHeading = ACTION_HEADING.test(line);
      return;
    }

    const isOpenBox = OPEN_CHECKBOX.test(line);
    const isDoneBox = DONE_CHECKBOX.test(line);
    const isTodoLine = TODO_LINE.test(line) || TAG_TODO.test(line);
    const isActionBullet = underActionHeading && /^\s*[-*+]\s+\S/.test(line);

    if (isDoneBox) return; // already ticked off in the vault
    if (!isOpenBox && !isTodoLine && !isActionBullet) return;

    const raw = cleanObsidian(line);
    if (raw.length < 3) return;

    const key = dedupeKey(raw);
    if (seen.has(key)) return;
    seen.add(key);

    // Indented lines directly beneath a task are its context.
    const context: string[] = [];
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    for (let j = i + 1; j < lines.length && context.length < 4; j++) {
      const next = lines[j];
      if (!next.trim()) break;
      const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
      if (nextIndent <= indent) break;
      context.push(cleanObsidian(next));
    }

    const scanned = `${line} ${context.join(" ")}`;
    const dueDate = findDueDate(scanned, options.today);
    const body = stripDateMarkers(raw, dueDate) || raw;
    found.push({
      id: newId(),
      text: clip(capitalize(body)),
      detail: [heading && `Under "${heading}"`, ...context].filter(Boolean).join("\n"),
      urgency: inferUrgency(scanned, dueDate, options.today),
      dueDate,
      source: "obsidian",
      sourceRef: title,
      reason: isOpenBox
        ? "Unchecked task in the note"
        : isActionBullet
          ? `Listed under "${heading}"`
          : "Marked as a to-do in the note",
      createdAt: options.today,
    });
  });

  return found;
}

/* ------------------------------------------------------------------ */
/* Gmail                                                               */
/* ------------------------------------------------------------------ */

/**
 * Only sentences that ask *you* for something become their own task. Topic
 * words alone — "policy", "premium" — are left out on purpose: they describe
 * what the email is about, which the reply task already covers, and turning
 * them into tasks fills the list with things that aren't actions.
 */
const ASK_CUES: { re: RegExp; reason: string }[] = [
  { re: /\b(can|could|would|will) you\b/i, reason: "They asked you directly" },
  { re: /\bplease\s+\w+/i, reason: "A direct request" },
  { re: /\blet me know\b/i, reason: "They're waiting on an answer" },
  { re: /\b(send|forward|share)\s+(me|us|over|the|a|your)\b/i, reason: "They asked for something" },
  { re: /\b(i|we) need\b|\bneed you to\b/i, reason: "Something is needed from you" },
  { re: /\bwaiting (on|for) (you|your)\b/i, reason: "They're waiting on you" },
  { re: /\b(sign|e-?sign|docusign)\b.*\b(by|before|and return|please)\b/i, reason: "Paperwork to sign" },
  { re: /\b(schedule|reschedule|set up a (call|time|meeting)|book a)\b/i, reason: "A time needs setting" },
  { re: /\b(call|reach out to) (me|us|him|her|them)\b/i, reason: "They want a call" },
  { re: /\b(confirm|verify|approve|review) (the|this|that|your|our|my|it)\b/i, reason: "Needs your confirmation" },
  { re: /\b(deadline is|due (by|on)|by (monday|tuesday|wednesday|thursday|friday|tomorrow|eod))\b/i, reason: "There's a deadline" },
];

const HEADER = /^(from|to|cc|subject|date|sent|reply-to|return-path|message-id|delivered-to|received|content-type|mime-version|x-[\w-]+):/i;

function headerValue(lines: string[], name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*)$`, "i");
  for (const line of lines.slice(0, 60)) {
    const m = line.match(re);
    if (m) return collapse(m[1]);
  }
  return "";
}

/** "Jane Doe <jane@x.com>" -> "Jane Doe"; a bare address -> "Jane Doe" too. */
function senderName(from: string): string {
  if (!from) return "";
  const named = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  if (named && !/@/.test(named[1])) return collapse(named[1]);
  const address = from.match(/[\w.+-]+@[\w.-]+/);
  if (!address) return collapse(from);
  return address[0]
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, "")
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase()) || address[0];
}

function cleanSubject(subject: string): string {
  return collapse(subject.replace(/^((re|fwd?|fw)\s*:\s*)+/i, ""));
}

/** Everything above the quoted reply chain — that's the part that's new. */
function emailBody(lines: string[]): string {
  const start = lines.findIndex((l, i) => i > 0 && !HEADER.test(l) && !/^\s*$/.test(l));
  const body: string[] = [];
  for (const line of lines.slice(start < 0 ? 0 : start)) {
    if (/^\s*>/.test(line)) break;
    if (/^-{2,}\s*(original message|forwarded message)/i.test(line)) break;
    if (/^On .{5,80}\s+wrote:\s*$/i.test(line)) break;
    if (/^\s*(--|__)\s*$/.test(line)) break; // signature delimiter
    if (/^(sent from my |get outlook for )/i.test(line)) break;
    if (HEADER.test(line)) continue;
    body.push(line);
  }
  return body.join("\n").trim();
}

function sentences(body: string): string[] {
  return body
    .split(/\n{2,}|\n(?=\s*[-*•\d])|(?<=[.!?])\s+/)
    .map((s) => collapse(s.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "")))
    .filter((s) => s.length > 12 && s.length < 400);
}

/** True when the text looks like an email rather than a note. */
export function looksLikeEmail(raw: string, filename?: string): boolean {
  if (filename && /\.eml$/i.test(filename)) return true;
  const head = raw.replace(/\r\n/g, "\n").split("\n").slice(0, 40);
  const hits = ["from", "subject", "to", "date", "sent"].filter((h) =>
    head.some((l) => new RegExp(`^${h}:\\s*\\S`, "i").test(l))
  );
  return hits.length >= 2;
}

export function parseGmailMessage(raw: string, options: ParseOptions): Suggestion[] {
  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const from = headerValue(lines, "from");
  const sender = senderName(from) || "the sender";
  const subject = cleanSubject(headerValue(lines, "subject")) || "(no subject)";
  const body = emailBody(lines) || text.trim();
  const sourceRef = `${sender} — ${subject}`;
  const detail = clip(body, 600);

  const found: Suggestion[] = [];
  const seen = new Set<string>();

  function push(taskText: string, reason: string, scanned: string) {
    const cleaned = clip(capitalize(collapse(taskText)));
    if (cleaned.length < 4) return;
    const key = dedupeKey(cleaned);
    if (seen.has(key)) return;
    seen.add(key);
    const dueDate = findDueDate(scanned, options.today);
    found.push({
      id: newId(),
      text: cleaned,
      detail,
      urgency: inferUrgency(`${subject} ${scanned}`, dueDate, options.today),
      dueDate,
      source: "gmail",
      sourceRef,
      reason,
      createdAt: options.today,
    });
  }

  // The email itself is always one suggestion — replying is the default action.
  push(`Reply to ${sender} about ${subject}`, "Email in the inbox", `${subject}\n${body}`);

  // Then anything in the body that reads like a specific ask.
  for (const sentence of sentences(body)) {
    if (found.length >= 3) break;
    const cue = ASK_CUES.find((c) => c.re.test(sentence));
    if (!cue) continue;
    push(sentence, cue.reason, sentence);
  }

  return found;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/** Reads a chunk of text as whichever source it looks like. */
export function parseSuggestions(
  raw: string,
  options: ParseOptions & { source?: SuggestionSource }
): Suggestion[] {
  if (!raw.trim()) return [];
  const source = options.source ?? (looksLikeEmail(raw, options.filename) ? "gmail" : "obsidian");
  return source === "gmail" ? parseGmailMessage(raw, options) : parseObsidianNote(raw, options);
}

/**
 * Identity of a suggestion for de-duping. Importing the same note twice, or
 * re-importing after a reject, shouldn't put it back on the pile.
 */
export function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
