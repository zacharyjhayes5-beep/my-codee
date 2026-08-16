import type {
  CallOutcome,
  Opportunity,
  PriorityGrade,
  ProposedChange,
  Prospect,
  ReviewProposal,
} from "../types";
import { blankProposal } from "./reviews";
import { findLines, nameKey, parseGranolaNote } from "./granola";
import { newId, today } from "./storage";
import { dedupeKey } from "./suggest";

/**
 * Granola transcript → structured call review.
 *
 * There is no model call here and no API key in the browser. This reads the
 * transcript with the same deterministic parsing the importer already uses and
 * produces a *draft* review — every field editable, every proposed change
 * shown, nothing applied until approved through the review inbox.
 *
 * The transcript itself stays in Granola. What the dashboard keeps is the
 * structured review, a source reference, and whatever the user approves.
 */

/* ------------------------------------------------------------------ */
/* Cue tables                                                          */
/* ------------------------------------------------------------------ */

interface Cue {
  re: RegExp;
  score: number;
  outcome?: CallOutcome;
  attitude: string;
  why: string;
}

/**
 * Mapped onto the agreed 1–10 scale. Ordered strongest signal first — the
 * first match wins so a transcript that ends in an appointment is not scored
 * on an objection raised halfway through.
 */
const CUES: Cue[] = [
  {
    re: /\b(book|booked|schedule[d]?|set up|put (?:it|that) in)\b.{0,40}\b(review|appointment|meeting|time)\b/i,
    score: 9,
    outcome: "Insurance Review Scheduled",
    attitude: "Receptive — agreed to sit down",
    why: "An appointment was agreed",
  },
  {
    re: /\b(ready to (?:go|sign|switch)|let'?s do it|sign me up|move forward)\b/i,
    score: 10,
    outcome: "Hot Lead",
    attitude: "Ready to move",
    why: "Said they are ready to proceed",
  },
  {
    re: /\b(send (?:me )?(?:the |a )?quote|quote me|give me a quote|what would it cost|run the numbers)\b/i,
    score: 8,
    outcome: "Somewhat Interested",
    attitude: "Open — asked for numbers",
    why: "Asked for a quote",
  },
  {
    re: /\b(if you can (?:save|beat)|depends on the price|as long as it'?s cheaper|see if you can do better)\b/i,
    score: 7,
    outcome: "Somewhat Interested",
    attitude: "Interested if the price works",
    why: "Interest is conditional on saving money",
  },
  {
    re: /\b(call me (?:back )?(?:in|after)|not right now|maybe (?:later|next)|circle back|renewal is in)\b/i,
    score: 4,
    outcome: "Not At This Time",
    attitude: "Not now, open later",
    why: "Asked to be contacted later",
  },
  {
    re: /\b(happy with|already have|all set|we'?re covered|stick(?:ing)? with)\b/i,
    score: 5,
    attitude: "Content with their current cover",
    why: "Says they are happy where they are",
  },
  {
    re: /\b(not interested|no thanks|don'?t call|take me off|remove me)\b/i,
    score: 3,
    outcome: "Definitely Not Interested",
    attitude: "Declined",
    why: "Declined outright",
  },
  {
    re: /\b(stop calling|never call|harass|report you)\b/i,
    score: 1,
    outcome: "Definitely Not Interested",
    attitude: "Hostile",
    why: "Asked not to be contacted again",
  },
];

/** Facts worth lifting out of the conversation. */
const FACT_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(\d{4})\s+(?:ford|chevy|chevrolet|toyota|honda|jeep|ram|gmc|subaru|nissan|bmw|audi|tesla)\b[\w\s]*/gi, label: "Vehicle" },
  { re: /\b(?:roof|siding|furnace|windows?)\b[^.]{0,60}\b(?:replaced|new|redone|\d{4})\b/gi, label: "Home" },
  { re: /\b(?:renewal|renews?|policy)\b[^.]{0,40}\b(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2})\b/gi, label: "Renewal" },
  { re: /\b(?:currently (?:with|have)|insured (?:with|through)|carrier is)\s+([A-Z][\w&' ]{2,30})/g, label: "Current carrier" },
  { re: /\b(?:paying|premium is|pays?)\s*\$?\s?([\d,]{3,7})\b[^.]{0,20}/gi, label: "Premium" },
  { re: /\b(?:boat|camper|rv|motorhome|atv|snowmobile|pontoon|motorcycle)\b[^.]{0,40}/gi, label: "Other asset" },
  { re: /\b(?:married|spouse|wife|husband|partner|kids?|children|daughter|son)\b[^.]{0,50}/gi, label: "Household" },
];

/** Lines that read as human context to remember before the next call. */
const IMPORTANT_PATTERNS: RegExp[] = [
  /\b(?:rate|premium|price)s? (?:went|going) up\b[^.]{0,60}/i,
  /\b(?:wife|husband|spouse|partner) (?:handles?|makes?|decides?)\b[^.]{0,60}/i,
  /\b(?:don'?t|do not) (?:want|like)\b[^.]{0,60}/i,
  /\b(?:call|reach) (?:me |him |her )?(?:after|before|in the)\b[^.]{0,40}/i,
  /\bwaiting on\b[^.]{0,50}/i,
];

/* ------------------------------------------------------------------ */
/* The review                                                          */
/* ------------------------------------------------------------------ */

export interface TranscriptReview {
  /** The five fields every processed transcript must produce. */
  informationGathered: string[];
  attitude: string;
  quality: PriorityGrade;
  notes: string;
  conversionScore: number;
  /** Why the score reads the way it does — never a bare number. */
  scoreReason: string;
  suggestedOutcome: CallOutcome | null;
  suggestedImportantNotes: string;
  suggestedNextAction: string;
  suggestedNextActionDate: string;
  suggestedStage: Opportunity["stage"] | null;
  /** Granola note title — the pointer that is kept. */
  sourceRef: string;
  noteDate: string;
}

function clip(text: string, max = 110): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function qualityFromScore(score: number): PriorityGrade {
  if (score >= 8) return "A";
  if (score >= 6) return "B";
  if (score >= 4) return "C";
  return "D";
}

function addDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function analyzeTranscript(
  raw: string,
  options: { filename?: string; ownerName?: string; fallbackDate?: string } = {},
): TranscriptReview {
  const fallbackDate = options.fallbackDate ?? today();
  const parsed = parseGranolaNote(raw, {
    filename: options.filename,
    ownerName: options.ownerName,
    fallbackDate,
  });

  const cue = CUES.find((c) => c.re.test(raw));
  const score = cue?.score ?? 5;

  /* --- information gathered --- */
  const facts: string[] = [];
  const seen = new Set<string>();
  for (const { re, label } of FACT_PATTERNS) {
    const matches = raw.match(re);
    if (!matches) continue;
    for (const match of matches.slice(0, 2)) {
      const line = `${label}: ${clip(match)}`;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      facts.push(line);
    }
  }
  const lines = findLines(raw);
  if (lines.length > 0) facts.push(`Lines discussed: ${lines.join(", ")}`);
  if (parsed.phone) facts.push(`Phone: ${parsed.phone}`);
  if (parsed.area) facts.push(`Area: ${parsed.area}`);

  /* --- important notes --- */
  const important: string[] = [];
  for (const pattern of IMPORTANT_PATTERNS) {
    const match = raw.match(pattern);
    if (match) important.push(clip(match[0], 90));
  }

  /* --- next action --- */
  let nextAction = "";
  let nextActionDate = "";
  let stage: Opportunity["stage"] | null = null;

  switch (cue?.outcome) {
    case "Insurance Review Scheduled":
      nextAction = "Insurance review";
      nextActionDate = parsed.date;
      stage = "Fact-Find / Information Gathering";
      break;
    case "Hot Lead":
      nextAction = "Follow up while it is hot";
      nextActionDate = parsed.date;
      stage = "Qualified / Open";
      break;
    case "Somewhat Interested":
      nextAction = "Build and send the quote";
      nextActionDate = addDays(parsed.date, 1);
      stage = "Quoting";
      break;
    case "Not At This Time":
      nextAction = "Follow up when they said";
      nextActionDate = addDays(parsed.date, 30);
      break;
    default:
      break;
  }

  return {
    informationGathered: facts,
    attitude: cue?.attitude ?? "Neutral — nothing decisive either way",
    quality: qualityFromScore(score),
    // Deliberately a written reading, not a slice of the transcript. Storing an
    // excerpt would make the dashboard a partial copy of the record Granola
    // already holds — the user can type whatever else is worth keeping.
    notes: cue
      ? `${cue.attitude}. ${cue.why}.`
      : "Nothing decisive in the transcript — worth a note of your own.",
    conversionScore: score,
    scoreReason: cue?.why ?? "No strong signal either way in the transcript",
    suggestedOutcome: cue?.outcome ?? null,
    suggestedImportantNotes: important.join(" · "),
    suggestedNextAction: nextAction,
    suggestedNextActionDate: nextActionDate,
    suggestedStage: stage,
    sourceRef: parsed.title,
    noteDate: parsed.date,
  };
}

/** Best guess at whose call this was. Never applied without confirmation. */
export function matchProspect(raw: string, prospects: Prospect[], ownerName: string): Prospect | null {
  const parsed = parseGranolaNote(raw, { ownerName, fallbackDate: today() });
  if (!parsed.name) return null;
  const key = nameKey(parsed.name);
  return (
    prospects.find((p) => nameKey(p.name) === key) ??
    prospects.find((p) => key && nameKey(`${p.firstName} ${p.lastName}`) === key) ??
    (parsed.email ? (prospects.find((p) => p.email.toLowerCase() === parsed.email.toLowerCase()) ?? null) : null)
  );
}

/* ------------------------------------------------------------------ */
/* Turning it into a proposal                                          */
/* ------------------------------------------------------------------ */

/**
 * Builds the proposal that lands in the review inbox. Existing human notes are
 * never replaced — a suggested Important Note is appended to what is already
 * there, and the diff shows both so the change is visible before approval.
 */
export function proposalFromReview(
  review: TranscriptReview,
  prospect: Prospect,
): ReviewProposal {
  const changes: ProposedChange[] = [];

  if (review.suggestedImportantNotes) {
    const existing = prospect.importantNotes.trim();
    const addition = review.suggestedImportantNotes;
    const merged = existing
      ? existing.includes(addition)
        ? existing
        : `${existing} · ${addition}`
      : addition;

    if (merged !== existing) {
      changes.push({
        field: "importantNotes",
        from: prospect.importantNotes,
        to: merged,
        rationale: existing ? "Added to what was already there" : "From the call",
      });
    }
  }

  if (review.conversionScore !== prospect.conversionScore) {
    changes.push({
      field: "conversionScore",
      from: prospect.conversionScore,
      to: review.conversionScore,
      rationale: review.scoreReason,
    });
  }

  if (review.quality && review.quality !== prospect.priorityGrade) {
    changes.push({
      field: "priorityGrade",
      from: prospect.priorityGrade,
      to: review.quality,
      rationale: `Score ${review.conversionScore} of 10`,
    });
  }

  if (review.suggestedNextAction && review.suggestedNextAction !== prospect.nextAction) {
    changes.push({
      field: "nextAction",
      from: prospect.nextAction,
      to: review.suggestedNextAction,
      rationale: review.attitude,
    });
    if (review.suggestedNextActionDate) {
      changes.push({
        field: "nextActionDate",
        from: prospect.nextActionDate,
        to: review.suggestedNextActionDate,
        rationale: "From what was agreed on the call",
      });
    }
  }

  return blankProposal({
    kind: "call-review",
    prospectId: prospect.id,
    source: "granola",
    sourceRef: review.sourceRef,
    reason: `${review.attitude} · scored ${review.conversionScore}/10`,
    proposedCall: review.suggestedOutcome
      ? {
          outcome: review.suggestedOutcome,
          at: `${review.noteDate}T12:00:00.000Z`,
          summary: clip(review.attitude, 140),
          notes: review.informationGathered.join("\n"),
          sourceRef: { system: "granola", title: review.sourceRef },
          nextAction: review.suggestedNextAction || undefined,
          nextActionAt: review.suggestedNextActionDate || undefined,
          appointmentAt:
            review.suggestedOutcome === "Insurance Review Scheduled"
              ? `${review.suggestedNextActionDate || review.noteDate}T12:00:00.000Z`
              : undefined,
        }
      : null,
    changes,
    proposedTasks: [],
    dedupeKey: dedupeKey(`${review.sourceRef} ${prospect.id}`),
    createdAt: today(),
    id: newId(),
  });
}
