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

export type ProspectStatus =
  | "New"
  | "Contacted"
  | "Meeting Scheduled"
  | "Open to Quote"
  | "Closed"
  | "Lost";

export interface ProspectNote {
  id: string;
  date: string; // ISO yyyy-mm-dd — when the call happened
  title: string;
  body: string;
  source: "granola" | "manual";
}

export interface Prospect {
  id: string;
  name: string;
  status: ProspectStatus;
  lines: LineId[];
  area: string;
  phone: string;
  email: string;
  nextStep: string;
  notes: ProspectNote[];
  createdAt: string;
  updatedAt: string;
}
