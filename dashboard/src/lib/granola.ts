import type { LineId } from "../types";

export interface ParsedNote {
  title: string;
  name: string;
  area: string;
  phone: string;
  email: string;
  lines: LineId[];
  date: string; // yyyy-mm-dd
  body: string;
}

/* ------------------------------------------------------------------ */
/* Keyword tables                                                      */
/* ------------------------------------------------------------------ */

const LINE_KEYWORDS: Record<LineId, string[]> = {
  property: [
    "home", "homes", "homeowner", "homeowners", "homeowner's", "house", "dwelling",
    "renters", "renter's", "condo", "roof", "property", "ho3", "ho-3", "farm",
    "barn", "outbuilding", "outbuildings", "hail", "water backup", "landlord",
    "rental property", "second home", "cottage", "lake house",
  ],
  casualty: [
    "auto", "autos", "car", "cars", "vehicle", "vehicles", "truck", "trucks",
    "motorcycle", "boat", "watercraft", "pontoon", "rv", "camper", "atv",
    "snowmobile", "umbrella", "liability", "general liability", "commercial auto",
    "fleet", "casualty", "workers comp", "workers' comp", "workers compensation",
    "bodily injury", "collision", "comprehensive",
  ],
  life: [
    "life", "life insurance", "term life", "whole life", "iul", "universal life",
    "annuity", "annuities", "final expense", "beneficiary", "beneficiaries",
    "death benefit", "term policy",
  ],
};

/** Words that mean a title fragment is about the meeting, not a person. */
const NON_NAME_WORDS = [
  "call", "meeting", "meet", "sync", "chat", "zoom", "teams", "intro",
  "discovery", "follow", "followup", "check", "checkin", "review", "quote",
  "quoting", "policy", "policies", "insurance", "coverage", "renewal", "notes",
  "note", "granola", "recording", "transcript", "appointment", "appt", "consult",
  "consultation", "agenda", "recap", "debrief", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "sunday", "am", "pm", "untitled",
];

/** Common Michigan cities, townships and counties — Farm Bureau territory. */
const MI_PLACES = [
  "Adrian", "Albion", "Allendale", "Alma", "Alpena", "Ann Arbor", "Auburn Hills",
  "Bad Axe", "Battle Creek", "Bay City", "Belleville", "Benton Harbor", "Berkley",
  "Beverly Hills", "Big Rapids", "Birmingham", "Bloomfield Hills", "Brighton",
  "Burton", "Cadillac", "Canton", "Cascade", "Charlotte", "Cheboygan", "Chelsea",
  "Clarkston", "Clawson", "Clinton Township", "Coldwater", "Commerce Township",
  "Dearborn", "Dearborn Heights", "Detroit", "Dexter", "Dowagiac", "East Lansing",
  "Eastpointe", "Escanaba", "Farmington", "Farmington Hills", "Fenton", "Ferndale",
  "Flint", "Flushing", "Fowlerville", "Frankenmuth", "Fraser", "Gaylord",
  "Grand Blanc", "Grand Haven", "Grand Ledge", "Grand Rapids", "Grandville",
  "Grosse Pointe", "Hamtramck", "Hancock", "Harrison Township", "Hartland",
  "Hastings", "Highland", "Hillsdale", "Holland", "Holly", "Houghton", "Howell",
  "Hudsonville", "Huntington Woods", "Inkster", "Ionia", "Iron Mountain",
  "Ishpeming", "Jackson", "Jenison", "Kalamazoo", "Kentwood", "Lansing",
  "Lapeer", "Lincoln Park", "Livonia", "Ludington", "Macomb", "Madison Heights",
  "Manistee", "Marquette", "Marshall", "Mason", "Menominee", "Midland", "Milan",
  "Milford", "Monroe", "Mount Clemens", "Mount Pleasant", "Muskegon",
  "Muskegon Heights", "New Baltimore", "Niles", "Northville", "Norton Shores", "Novi", "Oak Park",
  "Okemos", "Owosso", "Oxford", "Petoskey", "Plainwell", "Plymouth", "Pontiac",
  "Port Huron", "Portage", "Portland", "Rochester", "Rochester Hills", "Rockford",
  "Romeo", "Romulus", "Roseville", "Royal Oak", "Saginaw", "Saline",
  "Saint Clair Shores", "Saint Joseph", "Sault Ste. Marie", "Shelby Township",
  "Southfield", "Southgate", "Sparta", "St. Clair Shores", "St. Johns",
  "St. Joseph", "Sterling Heights", "Stevensville", "Sturgis", "Taylor",
  "Tecumseh", "Temperance", "Three Rivers", "Traverse City", "Trenton", "Troy",
  "Utica", "Walker", "Walled Lake", "Warren", "Waterford", "Wayland", "Wayne",
  "West Bloomfield", "West Branch", "Westland", "White Lake", "Whitmore Lake",
  "Williamston", "Wixom", "Woodhaven", "Wyandotte", "Wyoming", "Ypsilanti",
  "Zeeland",
  // Counties that come up by name on calls
  "Allegan County", "Barry County", "Berrien County", "Calhoun County",
  "Clinton County", "Eaton County", "Genesee County", "Ingham County",
  "Ionia County", "Jackson County", "Kalamazoo County", "Kent County",
  "Livingston County", "Macomb County", "Monroe County", "Muskegon County",
  "Oakland County", "Ottawa County", "Saginaw County", "Shiawassee County",
  "St. Clair County", "Van Buren County", "Washtenaw County", "Wayne County",
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip markdown decoration so label scanning works on Granola exports. */
function deMarkdown(line: string) {
  return line
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s*>\s*/, "")
    .trim();
}

function titleCase(s: string) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function looksLikeName(candidate: string): boolean {
  const s = candidate.trim();
  if (s.length < 2 || s.length > 60) return false;
  if (!/^[A-Za-z][A-Za-z.'\-\s]*$/.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length > 4) return false;
  const lowered = s.toLowerCase();
  return !NON_NAME_WORDS.some((w) => new RegExp(`\\b${w}\\b`).test(lowered));
}

function ownerTokens(ownerName: string): string[] {
  return ownerName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function isOwner(candidate: string, ownerName: string): boolean {
  const tokens = ownerTokens(ownerName);
  if (tokens.length === 0) return false;
  const lowered = candidate.toLowerCase();
  return tokens.some((t) => new RegExp(`\\b${escapeRe(t)}\\b`).test(lowered));
}

/* ------------------------------------------------------------------ */
/* Field extractors                                                    */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function findDateIn(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    return `${named[3]}-${pad(month)}-${pad(Number(named[2]))}`;
  }

  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) return `${slash[3]}-${pad(Number(slash[1]))}-${pad(Number(slash[2]))}`;

  return null;
}

function findDate(raw: string, filename: string | undefined, fallback: string): string {
  const head = raw.split(/\r?\n/).slice(0, 6).join("\n");
  return (
    findDateIn(head) ??
    (filename ? findDateIn(filename) : null) ??
    findDateIn(raw) ??
    fallback
  );
}

function findEmail(raw: string, ownerName: string): string {
  const matches = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g) ?? [];
  const external = matches.find((m) => !isOwner(m.split("@")[0].replace(/[._-]/g, " "), ownerName));
  return (external ?? matches[0] ?? "").replace(/[.,;]$/, "");
}

function findPhone(raw: string): string {
  const m = raw.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
  if (!m) return "";
  const digits = m[0].replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Phrases that mean "they said no to this" — the sentence gets skipped. */
const REJECTION_CUES = [
  "not interested", "no interest", "not looking", "doesn't want", "does not want",
  "don't want", "dont want", "declined", "passed on", "no need for", "not a fit",
  "already covered", "happy with", "staying with", "not now", "no thanks",
];

export function findLines(raw: string): LineId[] {
  // Work sentence by sentence so "not interested in life insurance" doesn't
  // register as a life lead.
  const chunks = raw
    .split(/\n|(?<=[.!?])\s+/)
    .map((c) => c.toLowerCase().trim())
    .filter((c) => c && !REJECTION_CUES.some((cue) => c.includes(cue)));

  const found: LineId[] = [];
  for (const id of ["property", "casualty", "life"] as LineId[]) {
    const hit = chunks.some((chunk) =>
      LINE_KEYWORDS[id].some((kw) =>
        new RegExp(`(?:^|[^a-z])${escapeRe(kw)}(?:$|[^a-z])`).test(chunk)
      )
    );
    if (hit) found.push(id);
  }
  return found;
}

function findArea(raw: string): string {
  const lines = raw.split(/\r?\n/).map(deMarkdown);

  // 1. Explicit label — "Area: Grand Blanc", "Location - Howell"
  for (const line of lines) {
    const m = line.match(
      /^(?:area|location|region|territory|city|town|hometown|based(?:\s+(?:in|out\s+of))?|lives?\s+in|located\s+in)\s*[:\-–]\s*(.+)$/i
    );
    if (m) {
      const value = m[1].trim().replace(/[.,;]$/, "");
      if (value && value.length <= 60) return withState(value);
    }
  }

  // 2. "City, MI" anywhere in the note
  const cityState = raw.match(/\b([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2}),\s*(?:MI|Michigan)\b/);
  if (cityState) return `${cityState[1]}, MI`;

  // 3. Inline phrasing — "lives in Fenton", "moved to Traverse City".
  //    Cue words are case-insensitive; the captured place must stay capitalized.
  const inline = raw.match(
    /\b(?:[Ll]ives?|[Ll]iving|[Bb]ased|[Ll]ocated|[Mm]oved|[Bb]uying|[Bb]ought)\s+(?:in|out of|to|near|around|a house in|a home in)\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})/
  );
  if (inline) return withState(inline[1].trim());

  // 4. Known Michigan place name mentioned anywhere
  for (const place of MI_PLACES) {
    if (new RegExp(`\\b${escapeRe(place)}\\b`, "i").test(raw)) return `${place}, MI`;
  }

  return "";
}

/** Append ", MI" when the value is a bare Michigan place name. */
function withState(value: string): string {
  if (/,\s*(?:MI|Michigan)$/i.test(value)) return value;
  const known = MI_PLACES.some((p) => p.toLowerCase() === value.toLowerCase());
  return known ? `${value}, MI` : value;
}

/**
 * Pick a person out of one segment. Tries the segment whole first so
 * "Tom and Linda Vargas" survives as one household, then falls back to
 * splitting it as a list.
 */
function pickName(segment: string, ownerName: string): string {
  const whole = segment.replace(/\([^)]*\)/g, "").replace(/<[^>]*>/g, "").trim();
  if (!whole) return "";
  if (!isOwner(whole, ownerName) && looksLikeName(whole)) return whole;

  for (const part of whole.split(/,|;|&|\band\b|\+/i)) {
    const cleaned = part.trim();
    if (!cleaned || isOwner(cleaned, ownerName)) continue;
    if (looksLikeName(cleaned)) return cleaned;
  }
  return "";
}

function nameFromAttendeeLine(raw: string, ownerName: string): string {
  const lines = raw.split(/\r?\n/).map(deMarkdown);
  for (const line of lines) {
    const m = line.match(
      /^(?:attendees?|participants?|present|people|with|client|prospect|contact|customer|name)\s*[:\-–]\s*(.+)$/i
    );
    if (!m) continue;
    const found = pickName(m[1], ownerName);
    if (found) return found;
  }
  return "";
}

function nameFromTitle(title: string, ownerName: string): string {
  let t = deMarkdown(title)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[""'']/g, "")
    .trim();

  // "Discovery call with John Smith" -> "John Smith"
  const withMatch = t.match(/\bwith\s+(.+)$/i);
  if (withMatch) t = withMatch[1];

  // Split only on separators that genuinely divide two parties.
  for (const segment of t.split(/<>|\||\/| x |·|—|–| - /i)) {
    const found = pickName(segment.replace(/\d.*$/, ""), ownerName);
    if (found) return found;
  }
  return "";
}

/** Last resort: "talked to Derek about his boat" -> "Derek". */
function nameFromBody(raw: string, ownerName: string): string {
  const m = raw.match(
    /\b(?:[Tt]alked (?:to|with)|[Ss]poke (?:to|with)|[Mm]et with|[Cc]all with|[Cc]hatted with|[Cc]onnected with|[Rr]eached out to)\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})/
  );
  if (!m) return "";
  return pickName(m[1], ownerName);
}

function nameFromFilename(filename: string, ownerName: string): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  return nameFromTitle(titleCase(base), ownerName);
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function parseGranolaNote(
  raw: string,
  options: { filename?: string; ownerName?: string; fallbackDate: string }
): ParsedNote {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const ownerName = options.ownerName ?? "";
  const lines = text.split("\n");

  const firstContentLine = lines.find((l) => deMarkdown(l).length > 0) ?? "";
  const title = deMarkdown(firstContentLine).slice(0, 120);

  const name =
    nameFromAttendeeLine(text, ownerName) ||
    nameFromTitle(title, ownerName) ||
    (options.filename ? nameFromFilename(options.filename, ownerName) : "") ||
    nameFromBody(text, ownerName) ||
    "";

  return {
    title: title || options.filename || "Untitled note",
    name,
    area: findArea(text),
    phone: findPhone(text),
    email: findEmail(text, ownerName),
    lines: findLines(text),
    date: findDate(text, options.filename, options.fallbackDate),
    body: text,
  };
}

/** Normalized key used to spot a note about someone already in the list. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}
