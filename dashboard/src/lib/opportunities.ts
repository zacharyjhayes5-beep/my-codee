import type {
  Appointment,
  Call,
  Opportunity,
  OpportunityEvent,
  OpportunityLine,
  OpportunityStage,
  Prospect,
  Temperature,
} from "../types";
import { newId, today } from "./storage";

/**
 * Opportunities and the rules that govern them.
 *
 * The one rule that never bends: an opportunity may not exist without a next
 * action and a next action date. Everything else here supports that.
 */

export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  "Qualified / Open",
  "Fact-Find / Information Gathering",
  "Quoting",
  "Quote Presented",
  "Decision Pending",
  "Written",
  "Lost",
  "Nurture",
];

export const OPPORTUNITY_LINES: OpportunityLine[] = [
  "Auto",
  "Home",
  "Umbrella",
  "Life",
  "Commercial",
  "Other",
];

/** Stages where nothing further is expected to happen on its own. */
export const CLOSED_STAGES: OpportunityStage[] = ["Written", "Lost"];

export const stageClassFor: Record<OpportunityStage, string> = {
  "Qualified / Open": "badge-muted",
  "Fact-Find / Information Gathering": "badge-info",
  Quoting: "badge-info",
  "Quote Presented": "badge-serious",
  "Decision Pending": "badge-warning",
  Written: "badge-good",
  Lost: "badge-critical",
  Nurture: "badge-muted",
};

/** Stages that sit still too long are the ones worth chasing. */
export const STALL_DAYS: Partial<Record<OpportunityStage, number>> = {
  "Quote Presented": 7,
  "Decision Pending": 10,
};

export function blankOpportunity(prospectId: string, overrides: Partial<Opportunity> = {}): Opportunity {
  const now = today();
  return {
    id: newId(),
    prospectId,
    stage: "Qualified / Open",
    lines: [],
    estimatedValue: null,
    conversionScore: null,
    nextAction: "",
    nextActionDate: "",
    appointments: [],
    history: [],
    closedReason: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* The non-negotiable rule                                             */
/* ------------------------------------------------------------------ */

export interface Validation {
  ok: boolean;
  problems: string[];
}

/**
 * An opportunity with no next action is a note to yourself that you will
 * forget. Saving is refused until both fields are filled.
 */
export function validateOpportunity(opportunity: Partial<Opportunity>): Validation {
  const problems: string[] = [];
  if (!(opportunity.nextAction ?? "").trim()) problems.push("a next action");
  if (!(opportunity.nextActionDate ?? "").trim()) problems.push("a next action date");
  return { ok: problems.length === 0, problems };
}

/** Human-readable reason a save was refused. */
export function validationMessage(validation: Validation): string {
  if (validation.ok) return "";
  return `Every opportunity needs ${validation.problems.join(" and ")}.`;
}

/* ------------------------------------------------------------------ */
/* Changes and history                                                 */
/* ------------------------------------------------------------------ */

const TRACKED: (keyof Opportunity)[] = [
  "stage",
  "nextAction",
  "nextActionDate",
  "estimatedValue",
  "lines",
  "closedReason",
];

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (Array.isArray(value)) return value.join(", ") || "none";
  return String(value);
}

/**
 * Applies a patch and records what moved. History travels with the
 * opportunity so a stage change is always traceable to when it happened.
 */
export function patchOpportunity(
  opportunity: Opportunity,
  patch: Partial<Opportunity>,
  at = new Date().toISOString(),
): Opportunity {
  const events: OpportunityEvent[] = [];

  for (const field of TRACKED) {
    if (!(field in patch)) continue;
    const from = opportunity[field];
    const to = patch[field];
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;
    events.push({
      id: newId(),
      at,
      field,
      from,
      to,
      summary: `${field}: ${describe(from)} → ${describe(to)}`,
    });
  }

  return {
    ...opportunity,
    ...patch,
    history: [...opportunity.history, ...events],
    updatedAt: today(),
  };
}

export function addAppointment(
  opportunity: Opportunity,
  appointment: Omit<Appointment, "id">,
): Opportunity {
  const full: Appointment = { ...appointment, id: newId() };
  return {
    ...opportunity,
    appointments: [...opportunity.appointments, full],
    history: [
      ...opportunity.history,
      {
        id: newId(),
        at: new Date().toISOString(),
        field: "appointment",
        from: null,
        to: full.at,
        summary: `Appointment booked for ${full.at.slice(0, 10)}`,
      },
    ],
    updatedAt: today(),
  };
}

/* ------------------------------------------------------------------ */
/* Created from a call                                                 */
/* ------------------------------------------------------------------ */

/**
 * Some outcomes mean there is now a real chance of writing business, so an
 * opportunity is created or updated to match. An insurance review attaches as
 * an appointment — it is never a stage of its own.
 *
 * Every path here supplies a next action and a date, because the model refuses
 * anything less and an auto-created record must not be the exception.
 */
export function opportunityFromCall(
  call: Call,
  existing: Opportunity[],
  quoteReady: boolean,
): { next: Opportunity[]; created: boolean } | null {
  const mine = existing.filter(
    (o) => o.prospectId === call.prospectId && o.stage !== "Written" && o.stage !== "Lost",
  );
  const current = mine[0];

  const shape = shapeFor(call, quoteReady);
  if (!shape) return null;

  if (!current) {
    const made = blankOpportunity(call.prospectId, {
      stage: shape.stage,
      nextAction: shape.nextAction,
      nextActionDate: shape.nextActionDate,
    });
    const withAppointment = shape.appointmentAt
      ? addAppointment(made, {
          at: shape.appointmentAt,
          kind: "insurance-review",
          notes: call.summary,
        })
      : made;
    return { next: [...existing, withAppointment], created: true };
  }

  let updated = patchOpportunity(current, {
    stage: shape.advanceOnly && rank(current.stage) > rank(shape.stage) ? current.stage : shape.stage,
    nextAction: shape.nextAction,
    nextActionDate: shape.nextActionDate,
  });

  if (shape.appointmentAt) {
    updated = addAppointment(updated, {
      at: shape.appointmentAt,
      kind: "insurance-review",
      notes: call.summary,
    });
  }

  return { next: existing.map((o) => (o.id === current.id ? updated : o)), created: false };
}

function rank(stage: OpportunityStage): number {
  return OPPORTUNITY_STAGES.indexOf(stage);
}

interface Shape {
  stage: OpportunityStage;
  nextAction: string;
  nextActionDate: string;
  appointmentAt?: string;
  /** Don't drag an opportunity backwards down the pipeline. */
  advanceOnly: boolean;
}

function shapeFor(call: Call, quoteReady: boolean): Shape | null {
  const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");
  const fallback = day(call.at);

  switch (call.outcome) {
    case "Insurance Review Scheduled":
      return {
        stage: "Fact-Find / Information Gathering",
        nextAction: "Insurance review",
        nextActionDate: day(call.appointmentAt) || fallback,
        appointmentAt: call.appointmentAt,
        advanceOnly: true,
      };

    case "Hot Lead":
      return {
        stage: "Qualified / Open",
        nextAction: (call.nextAction ?? "").trim() || "Follow up",
        nextActionDate: day(call.nextActionAt) || fallback,
        advanceOnly: true,
      };

    case "Somewhat Interested":
      return {
        stage: quoteReady ? "Quoting" : "Fact-Find / Information Gathering",
        nextAction: (call.nextAction ?? "").trim() || (quoteReady ? "Build the quote" : "Collect details"),
        nextActionDate: day(call.nextActionAt) || fallback,
        advanceOnly: true,
      };

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export function opportunitiesFor(all: Opportunity[], prospectId: string): Opportunity[] {
  return all.filter((o) => o.prospectId === prospectId);
}

export function openOpportunities(all: Opportunity[]): Opportunity[] {
  return all.filter((o) => !CLOSED_STAGES.includes(o.stage));
}

/** True when a stage has sat still longer than it should have. */
export function isStalled(opportunity: Opportunity, asOf = today()): boolean {
  const limit = STALL_DAYS[opportunity.stage];
  if (!limit) return false;
  const days = daysBetween(opportunity.updatedAt, asOf);
  return days > limit;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`);
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface StageSummary {
  stage: OpportunityStage;
  count: number;
  value: number;
  dueOrOverdue: number;
  stalled: number;
}

export function summarizeByStage(all: Opportunity[], asOf = today()): StageSummary[] {
  return OPPORTUNITY_STAGES.map((stage) => {
    const rows = all.filter((o) => o.stage === stage);
    return {
      stage,
      count: rows.length,
      value: rows.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0),
      dueOrOverdue: rows.filter((o) => o.nextActionDate && o.nextActionDate <= asOf).length,
      stalled: rows.filter((o) => isStalled(o, asOf)).length,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Derived temperature                                                 */
/* ------------------------------------------------------------------ */

/**
 * Thresholds are here so the displayed temperature is always explainable
 * from the record rather than maintained by hand alongside the score.
 */
export const TEMPERATURE_THRESHOLDS = {
  hot: 8,
  warm: 6,
  nurture: 4,
};

export interface TemperatureReading {
  temperature: Temperature;
  /** Why it reads that way, in one line. */
  because: string;
}

export function temperatureOf(prospect: Prospect): TemperatureReading {
  const { stage, closedReason, conversionScore } = prospect;

  if (stage === "Closed" || stage === "Won") {
    return {
      temperature: "Cold",
      because: closedReason ? `Closed — ${closedReason}` : `Stage is ${stage}`,
    };
  }

  if (stage === "Opportunity" || stage === "Review Scheduled") {
    return { temperature: "Hot", because: `Stage is ${stage}` };
  }

  if (stage === "Nurture") {
    return { temperature: "Nurture", because: "On the nurture cycle" };
  }

  if (conversionScore === null) {
    return { temperature: "Cold", because: "No conversion score yet" };
  }

  const { hot, warm, nurture } = TEMPERATURE_THRESHOLDS;
  if (conversionScore >= hot) return { temperature: "Hot", because: `Score ${conversionScore} of 10` };
  if (conversionScore >= warm) return { temperature: "Warm", because: `Score ${conversionScore} of 10` };
  if (conversionScore >= nurture) {
    return { temperature: "Nurture", because: `Score ${conversionScore} of 10` };
  }
  return { temperature: "Cold", because: `Score ${conversionScore} of 10` };
}

export const temperatureClass: Record<Temperature, string> = {
  Hot: "badge-critical",
  Warm: "badge-warning",
  Nurture: "badge-info",
  Cold: "badge-muted",
};

/* ------------------------------------------------------------------ */
/* Conversion score meanings                                           */
/* ------------------------------------------------------------------ */

/** The agreed 1–10 scale, shown wherever a score is set. */
export const SCORE_MEANINGS: Record<number, string> = {
  1: "Hostile, or explicitly never call again",
  2: "Immediate rejection or hang-up",
  3: "Polite but clearly uninterested",
  4: "Not interested now; possible later revisit",
  5: "Somewhat open, substantial objections or weak engagement",
  6: "Generally agreeable, one meaningful objection",
  7: "Interested if you can save them money or improve their situation",
  8: "Open to a quote, willing to meet or provide information",
  9: "Very receptive, enthusiastic about a review",
  10: "Ready to sign or move forward immediately",
};
