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
  kind?: "manual" | "followup" | "appointment" | "quote" | "admin";
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
  relationship: string;
  occupation: string;
  employer: string;
}

/**
 * Researched signals about a household's property and assets.
 *
 * These are **indicators, not verified insurance facts** — they come from
 * public records and research, not from a policy. Nothing here may be shown or
 * treated as confirmed coverage.
 */
export interface AssetIndicators {
  ownership: "owner" | "renter" | "";
  estimatedPropertyValue: number | null;
  propertyType: string;
  yearBuilt: string;
  lakefront: boolean;
  secondHome: boolean;
  vehicles: string;
  boat: boolean;
  rv: boolean;
  recreational: string;
  businessOwnership: string;
  other: string;
}

/** Derived from status and conversion score — never maintained by hand. */
export type Temperature = "Hot" | "Warm" | "Nurture" | "Cold";

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
  /** Household display name — "Tom & Linda Vargas". */
  name: string;
  /** The primary person, kept on the household for fast search and display. */
  firstName: string;
  lastName: string;
  leadSource: string;
  /** Why this household is worth attention — shown before every call. */
  whyTheyFit: string;
  /** Human context to read before dialling. Not transcript, not call history. */
  importantNotes: string;
  assets: AssetIndicators;
  /** Set by the Bad Number rule; puts the record in the research queue. */
  needsPhoneNumber: boolean;
  /** Set when the attempt cap is reached. Flags for review, never auto-closes. */
  needsReview: boolean;
  /** How this record arrived, kept when duplicates are merged. */
  mergedFrom: string[];
  /** People in the household. Empty until somebody is actually entered. */
  contacts: Contact[];
  /** Structured address. Blank after migration — `area` is the live label. */
  address: Address;
  /** Free-text "City, ST" the Lead Map clusters on. Unchanged from v3. */
  area: string;
  stage: Stage;
  /**
   * Whether the current stage was set by an outcome rule or moved by hand.
   * A manual move is respected on later reconciliation; a rule-set stage is
   * recomputed, so correcting or deleting a call cannot leave a stale one.
   */
  stageSource: "manual" | "rule";
  /** The call whose rule produced the current stage, when it came from a rule. */
  stageCallId: string | null;
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
  /**
   * Required by the Hot Lead rule. Lives on the call rather than the household
   * so that editing or deleting the call reconciles the task it produced.
   */
  nextAction?: string;
  /** Required by the Insurance Review rule — when the appointment is. */
  appointmentAt?: string;
}

/* ------------------------------------------------------------------ */
/* Opportunities                                                       */
/* ------------------------------------------------------------------ */

/**
 * The eight pipeline stages. Separate from the household's own status: a
 * prospect can be Contacted while an opportunity on them is at Quote
 * Presented.
 */
export type OpportunityStage =
  | "Qualified / Open"
  | "Fact-Find / Information Gathering"
  | "Quoting"
  | "Quote Presented"
  | "Decision Pending"
  | "Written"
  | "Lost"
  | "Nurture";

/** Lines an opportunity covers. */
export type OpportunityLine = "Auto" | "Home" | "Umbrella" | "Life" | "Commercial" | "Other";

/**
 * An appointment hangs off an opportunity. An insurance review is one of
 * these — deliberately *not* a pipeline stage of its own.
 */
export interface Appointment {
  id: string;
  at: string; // ISO datetime
  kind: "insurance-review" | "meeting" | "call";
  notes: string;
}

/** One traceable change to an opportunity. */
export interface OpportunityEvent {
  id: string;
  at: string;
  field: string;
  from: unknown;
  to: unknown;
  summary: string;
}

/**
 * A realistic chance of writing business, linked to one household. The
 * pipeline is a view over these — never a second copy of the person.
 */
export interface Opportunity {
  id: string;
  prospectId: string;
  stage: OpportunityStage;
  lines: OpportunityLine[];
  estimatedValue: number | null;
  /** Working probability signal, mirrored from the household's score. */
  conversionScore: number | null;
  /** Both required — an opportunity may never exist without them. */
  nextAction: string;
  nextActionDate: string;
  appointments: Appointment[];
  history: OpportunityEvent[];
  closedReason: string;
  createdAt: string;
  updatedAt: string;
}

/** Where a proposal came from. Never the transcript itself. */
export type ReviewSource = "granola" | "obsidian" | "gmail" | "manual";

export type ReviewStatus = "pending" | "approved" | "edited" | "rejected";

/**
 * One field the proposal wants to change. `from` is the value the proposal
 * was written against — if the record has moved on since, that mismatch is a
 * conflict and the change is refused rather than clobbering newer data.
 */
export interface ProposedChange {
  field: string;
  /** Expected current value. */
  from: unknown;
  /** What the proposal suggests instead. */
  to: unknown;
  rationale?: string;
}

/** A proposed change set awaiting approval. Nothing applies until approved. */
export interface ReviewProposal {
  id: string;
  kind: "call-review" | "task-suggestion";
  prospectId: string | null;
  source: ReviewSource;
  /** A pointer — note title, sender and subject. Never transcript text. */
  sourceRef: string;
  proposedCall: Partial<Call> | null;
  changes: ProposedChange[];
  proposedTasks: Partial<Task>[];
  status: ReviewStatus;
  dedupeKey: string;
  createdAt: string;
  resolvedAt?: string;
  /** Why the reviewer flagged it — shown on the card. */
  reason: string;
}

/** Append-only log of what changed and what changed it. */
export interface AuditEntry {
  id: string;
  at: string;
  entity: "prospect" | "call" | "task" | "policy";
  entityId: string;
  /** Field name for an edit, or an action like "created" / "deleted". */
  field: string;
  from: unknown;
  to: unknown;
  actor: "user" | "rule" | "review";
  reviewId?: string;
  /** Short human-readable line, so the log reads without decoding. */
  summary: string;
}
