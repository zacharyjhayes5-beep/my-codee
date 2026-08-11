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

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
}

export interface CalendarEvent {
  id: string;
  date: string; // ISO yyyy-mm-dd
  time?: string;
  title: string;
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
