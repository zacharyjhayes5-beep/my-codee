export type LineId = "property" | "casualty" | "life";

/** Which book a policy is written in — mirrors the workbook's sheet split. */
export type Book = "personal" | "life" | "commercial";

export interface PolicyLine {
  id: LineId;
  name: string;
  policyGoal: number;
  premiumGoal: number;
}

/** One row of the book of business. Gross and net are always derived. */
export interface PolicyEntry {
  id: string;
  book: Book;
  effectiveDate: string; // ISO yyyy-mm-dd
  firstName: string;
  lastName: string;
  companyName: string; // commercial book
  deathBenefit: number; // life book
  lineOfBusiness: string; // id from the line-of-business catalog
  policyNumber: string;
  premium: number;
  percentEarned: number; // decimal — 0.09 is 9%
  multiplier: number;
  lastReview: string;
  notes: string;
  /** Optional link to the household that produced the business. */
  prospectId?: string;
}

export interface Period {
  start: string; // ISO yyyy-mm-dd
  end: string; // ISO yyyy-mm-dd
}

/** How soon a task needs attention — drives the sections on the To-Do tab. */
export type Urgency = "now" | "week" | "soon" | "someday";

/** Where a task came from. Suggestions keep their origin after approval. */
export type TaskSource = "manual" | "obsidian" | "gmail";

export interface Task {
  id: string;
  text: string;
  /** The context that came with it — the note excerpt, the email body. */
  detail: string;
  urgency: Urgency;
  done: boolean;
  dueDate?: string; // ISO yyyy-mm-dd
  source: TaskSource;
  /** Note title or "sender — subject", so the task can be traced back. */
  sourceRef?: string;
  createdAt: string;
  completedAt?: string;
  /** Links added in phase 2, unused until follow-up rules land. */
  prospectId?: string;
  callId?: string;
  kind?: "manual" | "followup" | "appointment" | "quote";
  ruleId?: string;
}

/**
 * A task the importer thinks is worth doing, held until it's approved or
 * rejected. Same shape as a task minus the state a task carries.
 */
export interface Suggestion {
  id: string;
  text: string;
  detail: string;
  urgency: Urgency;
  dueDate?: string;
  source: "obsidian" | "gmail";
  sourceRef: string;
  /** Why the importer flagged it — shown on the card. */
  reason: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Prospect — schema v4                                                */
/* ------------------------------------------------------------------ */

/**
 * Where a household sits in the pipeline. Replaces the old six-value
 * `status`, which was doing three jobs at once.
 */
export type Stage =
  | "New"
  | "Attempting"
  | "Contacted"
  | "Qualifying"
  | "Quoting"
  | "Review Scheduled"
  | "Opportunity"
  | "Won"
  | "Nurture"
  | "Closed";

/** Why a household is closed. Only meaningful when stage is "Closed". */
export type ClosedReason =
  | "not-interested"
  | "unreachable"
  | "bad-number"
  | "dormant"
  | "lost"
  /** Carried over from the old "Closed" status, which recorded no reason. */
  | "legacy-unknown";

/**
 * Priority grade — who to work first. Deliberately *not* an estimate of
 * likelihood to buy; that is `conversionScore`. Blank until graded.
 */
export type PriorityGrade = "A" | "B" | "C" | "D" | "";

/** The eight call outcomes. Nothing writes these until phase 3. */
export type CallOutcome =
  | "No Answer — No Voicemail"
  | "No Answer — Voicemail Left"
  | "Bad Phone Number"
  | "Definitely Not Interested"
  | "Not at This Time"
  | "Somewhat Interested"
  | "Hot Lead — Very Interested"
  | "Insurance Review Scheduled";

/** One person inside a household. */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  dob: string; // ISO yyyy-mm-dd, blank when unknown
  phone: string;
  email: string;
  isPrimary: boolean;
  /**
   * Quote-readiness is derived from what is filled in, but the note is kept
   * so a partial answer ("wouldn't give DOB") isn't mistaken for unasked.
   */
  quoteReadyNote: string;
}

export interface Address {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface ProspectNote {
  id: string;
  date: string; // ISO yyyy-mm-dd — when the call happened
  title: string;
  body: string;
  source: "granola" | "manual";
}

/**
 * One household. `id` is the stable household id and `name` is its display
 * name — both kept under their existing keys so the Granola importer, the
 * search box and the Lead Map did not have to be rewritten for a rename.
 */
export interface Prospect {
  id: string;
  name: string;
  /** People in the household. Empty until somebody is actually entered. */
  contacts: Contact[];
  /** Structured address. Blank after migration — `area` is the live label. */
  address: Address;
  /** Free-text "City, ST" the Lead Map clusters on. Unchanged from v3. */
  area: string;
  stage: Stage;
  closedReason: ClosedReason | null;
  priorityGrade: PriorityGrade;
  /** 1–10, or null when ungraded. Never guessed. */
  conversionScore: number | null;
  lastOutcome: CallOutcome | null;
  lastOutcomeAt: string;
  lastContactedAt: string;
  nextAction: string;
  nextActionDate: string;
  doNotContact: boolean;
  /** How the household arrived. Blank when it predates the field. */
  source: "granola" | "manual" | "import" | "";
  lines: LineId[];
  /** Household-level contact details, kept from v3. */
  phone: string;
  email: string;
  notes: ProspectNote[];
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Records reserved for later phases                                   */
/* ------------------------------------------------------------------ */

/**
 * Phase 3. The type and its object store exist now so the storage layer and
 * the backup file are already shaped for them — nothing reads or writes calls
 * yet.
 */
export interface Call {
  id: string;
  prospectId: string;
  at: string; // ISO datetime
  direction: "outbound" | "inbound";
  outcome: CallOutcome;
  durationMin: number | null;
  summary: string;
  notes: string;
  /** Pointer to the Granola note — a reference, never the transcript body. */
  sourceRef: { system: "granola" | "manual"; title: string; id?: string; url?: string } | null;
  transcriptExcerpt?: string;
  reviewId?: string;
  createdBy: "manual" | "review";
  createdAt: string;
}

/** Phase 5. A proposed change set awaiting approval. */
export interface ReviewProposal {
  id: string;
  kind: "call-review" | "task-suggestion";
  prospectId: string | null;
  proposedCall: Partial<Call> | null;
  changes: { field: string; from: unknown; to: unknown; rationale?: string }[];
  proposedTasks: Partial<Task>[];
  sourceRef: string;
  status: "pending" | "approved" | "edited" | "rejected";
  dedupeKey: string;
  createdAt: string;
  resolvedAt?: string;
}

/** Phase 5. Append-only log of what changed and who changed it. */
export interface AuditEntry {
  id: string;
  at: string;
  entity: "prospect" | "call" | "task" | "policy";
  entityId: string;
  field: string;
  from: unknown;
  to: unknown;
  actor: "user" | "review";
  reviewId?: string;
}
