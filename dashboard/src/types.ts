export type LineId = "property" | "casualty" | "life" | "commercial" | "surplus";

export interface PolicyLine {
  id: LineId;
  name: string;
  policyCount: number;
  policyGoal: number;
  premium: number;
  premiumGoal: number;
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

export type LeadStatus = "New" | "Contacted" | "Quoted" | "Sold" | "Lost";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  line: LineId | "unknown";
  notes: string;
  createdAt: string;
}
