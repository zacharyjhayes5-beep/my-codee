import type { BraindumpCategory, BraindumpRow } from "../types";
import { newId } from "./storage";

/**
 * A day's dictation, filed.
 *
 * You say everything at once — what you did, what you are chewing on, what
 * you owe, what you need to find out — and this pulls the four apart. The
 * splitting is done by Claude when the Worker can be reached and by the
 * heuristic below when it cannot, which is why the heuristic has to be good
 * enough to ship on its own: the tab is useful with no key and no network.
 */

/** The local day. Never `toISOString().slice(0,10)` — that is the UTC day. */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayFromKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/** "Today" / "Yesterday" / "Mon 7 Sep". */
export function labelFor(key: string, todayKey = dayKey()): string {
  if (key === todayKey) return "Today";
  const yesterday = new Date(dayFromKey(todayKey));
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";
  // Assembled from parts rather than handed to a locale: en-GB abbreviates
  // September to "Sept" and en-US puts the month first. The spec is
  // "Mon 7 Sep", so the order and the abbreviation are both chosen here.
  const d = dayFromKey(key);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(d);
  return `${weekday} ${d.getDate()} ${month}`;
}

/** "2:14pm" — the time a dump was taken. */
export function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
    .format(d)
    .replace(/\s/g, "")
    .toLowerCase();
}

export const CATEGORIES: BraindumpCategory[] = ["completed", "thoughts", "todo", "questions"];

export const CATEGORY_LABEL: Record<BraindumpCategory, string> = {
  completed: "Completed",
  thoughts: "Thoughts",
  todo: "To-do",
  questions: "Questions",
};

export interface SortedItem {
  category: BraindumpCategory;
  text: string;
}

/**
 * The prompt the Worker sends. Kept here so the client and the server cannot
 * drift — the Worker imports the same string.
 */
export const SORT_SYSTEM = `You sort a working insurance agent's spoken braindump into four buckets.

Split the text into one item per distinct thing said. Do not merge two thoughts into one item, and do not split a single thought into fragments. Keep the agent's own words — tidy the grammar of dictation, never reword the substance, never add detail he did not say.

Assign each item exactly one category:
- "completed": something already done. Past tense — calls made, quotes sent, people met.
- "todo": something he still owes. An intention, an obligation, a next step.
- "questions": something he does not know and needs an answer to, whether or not he phrased it as a question.
- "thoughts": observations, ideas, opinions, worries. Anything that is not one of the other three.

Reply with JSON only, no prose and no code fence:
{"items":[{"category":"todo","text":"..."}]}`;

/* ------------------------------------------------------------------ */
/* The fallback splitter                                               */
/* ------------------------------------------------------------------ */

/** Past-tense openers and verbs — something that has already happened. */
const DONE = /\b(did|done|finished|completed|called|rang|sent|emailed|texted|met|spoke|talked|quoted|wrote|closed|signed|submitted|filed|dropped off|picked up|booked|scheduled|visited|followed up)\b/i;

/** An obligation, not an observation. */
const TODO = /\b(need to|needs to|have to|has to|must|should|todo|to-do|remember to|don't forget|dont forget|make sure|follow up|chase|going to|gonna|will)\b/i;

/** A gap in what he knows, question mark or not. */
const QUESTION = /(\?|^\s*(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would|will)\b|\b(wonder|not sure|unsure|find out|figure out|check whether|check if|no idea)\b)/i;

/**
 * Split dictation into sentences.
 *
 * Dictation arrives with little punctuation, so this breaks on terminators
 * *and* on the spoken joins people actually use — "and then", "also", "but".
 * Anything shorter than a few characters is noise and is dropped.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .flatMap((part) => part.split(/\s*[,;]?\s+(?:and then|then i|also i|also,|but i)\s+/i))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .map((s) => s.replace(/^(and|also|so|um+|uh+)\b[\s,]*/i, "").trim())
    .filter((s) => s.length > 2);
}

export function categorise(sentence: string): BraindumpCategory {
  // Order matters. A question about something he owes is still a question,
  // and "I need to find out whether…" is a question rather than a to-do.
  if (QUESTION.test(sentence)) return "questions";
  if (TODO.test(sentence)) return "todo";
  if (DONE.test(sentence)) return "completed";
  return "thoughts";
}

/** What runs when the Worker cannot be reached. Good enough to ship alone. */
export function heuristic(text: string): SortedItem[] {
  return splitSentences(text).map((s) => ({
    category: categorise(s),
    text: s.charAt(0).toUpperCase() + s.slice(1),
  }));
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/**
 * The rows one dump produces: the verbatim dump, then an item per thing said.
 *
 * The raw text is kept as its own row and never rewritten. Whatever the
 * splitter makes of it, what he actually said survives.
 */
export function rowsFromDump(
  text: string,
  items: SortedItem[],
  day: string,
  at = new Date().toISOString(),
): BraindumpRow[] {
  const dump: BraindumpRow = { id: newId(), day, at, kind: "dump", text: text.trim() };

  const rows = items
    .filter((i) => i.text.trim().length > 0)
    .map<BraindumpRow>((i) => ({
      id: newId(),
      day,
      at,
      kind: "item",
      text: i.text.trim(),
      category: CATEGORIES.includes(i.category) ? i.category : "thoughts",
      done: false,
      wasTodo: i.category === "todo",
    }));

  return [dump, ...rows];
}

export function itemsFor(
  rows: BraindumpRow[],
  day: string,
  category: BraindumpCategory,
): BraindumpRow[] {
  return rows.filter((r) => r.kind === "item" && r.day === day && r.category === category);
}

export function dumpsFor(rows: BraindumpRow[], day: string): BraindumpRow[] {
  return rows
    .filter((r) => r.kind === "dump" && r.day === day)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Checking a to-do moves it to Completed; unchecking sends it back.
 *
 * `wasTodo` is what makes the return trip possible — without it a checked
 * to-do is indistinguishable from something that was said in the past tense
 * in the first place, and unchecking would have nowhere to put it.
 */
export function toggleDone(rows: BraindumpRow[], id: string): BraindumpRow[] {
  return rows.map((r) => {
    if (r.id !== id || r.kind !== "item") return r;
    const nowDone = !r.done;
    return {
      ...r,
      done: nowDone,
      category: nowDone ? "completed" : r.wasTodo ? "todo" : (r.category ?? "thoughts"),
    };
  });
}

/**
 * The days with tabs: every day that has anything, plus today, newest first.
 * Capped at a fortnight — beyond that it is a history, not a set of tabs.
 */
export function dayTabs(rows: BraindumpRow[], todayKey = dayKey()): string[] {
  const days = new Set(rows.map((r) => r.day));
  days.add(todayKey);
  return [...days].sort((a, b) => b.localeCompare(a)).slice(0, 14);
}
