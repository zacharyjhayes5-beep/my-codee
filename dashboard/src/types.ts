export type LineId = "property" | "casualty" | "life";

export interface PolicyLine {
  id: LineId;
  name: string;
  policyCount: number;
  policyGoal: number;
  premium: number;
  premiumGoal: number;
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
