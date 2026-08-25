import { Fragment, useEffect, useMemo, useState } from "react";
import type {
  AuditEntry,
  Call,
  Opportunity,
  Prospect,
  ReviewProposal,
  Stage,
  Task,
} from "../types";
import { prospectStages } from "../lib/defaultData";
import { appendAudit, auditEntry, diffEntries } from "../lib/audit";
import { opportunitiesFor, opportunityFromCall, patchOpportunity } from "../lib/opportunities";
import { quoteReadiness } from "../lib/rules";
import { mergeInto } from "../lib/dedupe";
import { IntakePanel } from "./IntakePanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { WorkMode } from "./WorkMode";
import { callsFor, withLatestCallFields } from "../lib/calls";
import { blankProspect } from "../lib/prospectSchema";
import { reconcileProspect } from "../lib/rules";
import { today } from "../lib/storage";
import { whenPersisted } from "../lib/repository";
import { ProspectCard } from "./ProspectCard";
import { tagColor } from "../lib/tags";
import { needsResearch, researchCount } from "../lib/research";
import {
  isQuiet,
  isTerminal,
  lastTouchLabel,
  linesHeldLabel,
  nextStepOf,
  stageTone,
  townOf,
} from "../lib/leadView";
import { LeadMap } from "./LeadMap";
import {
  DEFAULT_ENDPOINT,
  GisSyncError,
  readSyncSettings,
  runSync,
  writeSyncSettings,
} from "../lib/gisSync";

/**
 * The filters are intents, not stages — that is the point of the screen.
 *
 * A stage list makes you translate "what should I do" into "which stage is
 * that", every time. These four are the questions actually being asked.
 */
type Intent = "move" | "quiet" | "all" | "won";

const INTENTS: { id: Intent; label: string }[] = [
  { id: "move", label: "Needs a move" },
  { id: "quiet", label: "Gone quiet" },
  { id: "all", label: "All households" },
  { id: "won", label: "Won" },
];

/** Hue by tone name. Stage is always spelled out as well as toned. */
const TONE_VAR: Record<string, string> = {
  slate: "var(--hue-slate)",
  cognac: "var(--hue-cognac)",
  terracotta: "var(--hue-terracotta)",
  verdigris: "var(--hue-verdigris)",
  brass: "var(--hue-brass)",
  grey: "var(--hue-grey)",
};

function matchesIntent(p: Prospect, intent: Intent, todayIso: string): boolean {
  switch (intent) {
    case "won":
      return p.stage === "Won";
    case "quiet":
      return isQuiet(p, todayIso);
    case "move":
      // Open, not terminal, and still live enough to be worth a move today.
      return !isTerminal(p) && !isQuiet(p, todayIso);
    default:
      return true;
  }
}

interface ProspectsTabProps {
  prospects: Prospect[];
  onChange: (updater: (prev: Prospect[]) => Prospect[]) => void;
  calls: Call[];
  onCallsChange: (updater: (prev: Call[]) => Call[]) => void;
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  audit: AuditEntry[];
  onAuditChange: (entries: AuditEntry[]) => void;
  opportunities: Opportunity[];
  onOpportunitiesChange: (opportunities: Opportunity[]) => void;
  /** Arrived here from somewhere that named a household — open it. */
  focusProspectId: string | null;
  onFocusHandled: () => void;
  /** A transcript review joins the same inbox everything else goes through. */
  onQueueReview: (proposal: ReviewProposal) => void;
  ownerName: string;
  onOwnerNameChange: (name: string) => void;
}

export function ProspectsTab({
  prospects,
  onChange,
  calls,
  onCallsChange,
  tasks,
  onTasksChange,
  audit,
  onAuditChange,
  opportunities,
  onOpportunitiesChange,
  focusProspectId,
  onFocusHandled,
  onQueueReview,
  ownerName,
  onOwnerNameChange,
}: ProspectsTabProps) {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"browse" | "work">("browse");

  useEffect(() => {
    if (!focusProspectId) return;
    setMode("browse");
    setExpandedId(focusProspectId);
    onFocusHandled();
  }, [focusProspectId, onFocusHandled]);

  const [intent, setIntent] = useState<Intent>("move");
  const [stageFilter, setStageFilter] = useState<Stage | "All" | "Needs research">("All");
  const [mapOpen, setMapOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  /**
   * Manual retry.
   *
   * The dashboard already syncs on every load, so this is not part of the
   * normal workflow — it exists to force an attempt after a failure and to
   * show the error, which the silent startup sync deliberately swallows. It
   * runs exactly the same `runSync` the startup path does.
   */
  async function syncGis() {
    setSyncNote(null);

    let settings = readSyncSettings();
    if (!settings) {
      const token = window.prompt("Access token for the lead service")?.trim();
      if (!token) return;
      settings = { endpoint: DEFAULT_ENDPOINT, token };
      writeSyncSettings(settings);
    }

    setSyncing(true);
    try {
      const result = await runSync(settings, prospects, async (added) => {
        onChange((prev) => [...prev, ...added]);
        await whenPersisted();
      });

      if (result.fetched === 0) {
        setSyncNote({ tone: "good", text: "No new leads waiting." });
        return;
      }

      const parts = [`Added ${result.added} lead${result.added === 1 ? "" : "s"}`];
      if (result.duplicates > 0) parts.push(`${result.duplicates} already here`);
      setSyncNote({
        tone: "good",
        text: `${parts.join(" · ")}. They need a phone number before they can be called.`,
      });
    } catch (cause) {
      setSyncNote({
        tone: "bad",
        text: cause instanceof GisSyncError ? cause.message : "The sync could not finish.",
      });
    } finally {
      setSyncing(false);
    }
  }

  const researchTotal = useMemo(() => researchCount(prospects), [prospects]);

  const counts = useMemo(() => {
    const map = new Map<Stage, number>();
    for (const p of prospects) map.set(p.stage, (map.get(p.stage) ?? 0) + 1);
    return map;
  }, [prospects]);

  const day = today();

  /** Each filter carries its own count, so the cut is visible before it is made. */
  const intentCounts = useMemo(() => {
    const map = new Map<Intent, number>();
    for (const i of INTENTS) map.set(i.id, prospects.filter((p) => matchesIntent(p, i.id, day)).length);
    return map;
  }, [prospects, day]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects
      .filter((p) => matchesIntent(p, intent, day))
      .filter((p) =>
        stageFilter === "All"
          ? true
          : stageFilter === "Needs research"
            ? needsResearch(p)
            : p.stage === stageFilter,
      )
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.nextAction.toLowerCase().includes(q) ||
          (p.notes ?? []).some((n) => n.body.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }, [prospects, search, stageFilter, intent, day]);

  function patchProspect(id: string, patch: Partial<Prospect>) {
    const before = prospects.find((p) => p.id === id);

    onChange((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: today() } : p))
    );

    // Only the decisions worth a record — not every keystroke in a text field.
    if (before) {
      const entries = diffEntries(
        before as unknown as Record<string, unknown>,
        { ...before, ...patch } as unknown as Record<string, unknown>,
        ["stage", "priorityGrade", "conversionScore", "closedReason"],
        { entity: "prospect", entityId: id, actor: "user", label: "Changed" },
      );
      if (entries.length > 0) onAuditChange(appendAudit(audit, entries));
    }
  }

  function createProspect(prospect: Prospect) {
    onChange((prev) => [prospect, ...prev]);
  }

  /**
   * Saves a new or corrected call, then rewrites the household's three
   * latest-call fields from the resulting list. Recomputing rather than
   * patching is what makes an edit or a delete settle to the right answer —
   * including clearing the fields when the last call is removed.
   */
  function saveCall(call: Call, isNew: boolean) {
    const previous = calls.find((c) => c.id === call.id);

    // Outcomes that mean real business is in play create or move an
    // opportunity, with the review attached as an appointment rather than
    // becoming a stage of its own.
    const household = prospects.find((p) => p.id === call.prospectId);
    if (household) {
      const result = opportunityFromCall(call, opportunities, quoteReadiness(household).ready);
      if (result) onOpportunitiesChange(result.next);
    }
    onCallsChange((prev) => {
      const next = [...prev.filter((c) => c.id !== call.id), call];
      // A newly logged call is an explicit action, so its rule wins even over
      // a stage that was moved by hand. A correction to an old call is not.
      syncProspect(call.prospectId, next, isNew);
      return next;
    });

    onAuditChange(
      appendAudit(audit, [
        auditEntry({
          entity: "call",
          entityId: call.id,
          field: isNew ? "created" : "outcome",
          from: previous?.outcome ?? null,
          to: call.outcome,
          actor: "user",
          summary: isNew
            ? `Logged a call: ${call.outcome}`
            : `Corrected a call: ${previous?.outcome ?? "unknown"} → ${call.outcome}`,
        }),
      ]),
    );
  }

  function deleteCall(callId: string) {
    const removed = calls.find((c) => c.id === callId);
    onCallsChange((prev) => {
      const next = prev.filter((c) => c.id !== callId);
      if (removed) syncProspect(removed.prospectId, next, false);
      return next;
    });

    if (removed) {
      onAuditChange(
        appendAudit(audit, [
          auditEntry({
            entity: "call",
            entityId: callId,
            field: "deleted",
            from: removed.outcome,
            to: null,
            actor: "user",
            summary: `Deleted a call: ${removed.outcome}`,
          }),
        ]),
      );
    }
  }

  /**
   * Rewrites the household's latest-call fields, replays the outcome rules,
   * and brings its rule-generated tasks into line. Hand-typed tasks and
   * completed ones are never touched.
   */
  function syncProspect(prospectId: string, allCalls: Call[], applyStage: boolean) {
    const mine = callsFor(allCalls, prospectId);
    const before = prospects.find((p) => p.id === prospectId);

    onChange((prev) =>
      prev.map((p) => {
        if (p.id !== prospectId) return p;
        const withCallFields = withLatestCallFields(p, mine);
        const { prospect } = reconcileProspect(withCallFields, allCalls, tasks, {
          applyStage,
          today: today(),
        });
        return { ...prospect, updatedAt: today() };
      }),
    );

    if (!before) return;
    const { prospect: after, tasks: nextTasks } = reconcileProspect(before, allCalls, tasks, {
      applyStage,
      today: today(),
    });
    onTasksChange(nextTasks);

    // A stage the rules moved is logged as the rules' doing, not the user's.
    const entries = diffEntries(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
      ["stage", "closedReason", "doNotContact"],
      { entity: "prospect", entityId: prospectId, actor: "rule", label: "Rule set" },
    );
    if (entries.length > 0) onAuditChange(appendAudit(audit, entries));
  }

  function addBlank() {
    const prospect = blankProspect({ createdAt: today(), updatedAt: today() });
    createProspect(prospect);
    setExpandedId(prospect.id);
  }

  if (mode === "work") {
    return (
      <div className="tab-panel">
        <div className="mode-switch">
          <button onClick={() => setMode("browse")}>Households</button>
          <button className="active">Call queue</button>
        </div>
        <WorkMode
          prospects={prospects}
          calls={calls}
          tasks={tasks}
          opportunities={opportunities}
          onSaveCall={saveCall}
          onOpenProfile={(id) => {
            setMode("browse");
            setExpandedId(id);
          }}
          onClearReview={(id, decision) =>
            patchProspect(
              id,
              decision === "close"
                ? { needsReview: false, stage: "Closed", closedReason: "unreachable", stageSource: "manual" }
                : { needsReview: false },
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="tab-panel">
      <div className="pipeline-toolbar">
        <div className="mode-switch" aria-label="Pipeline view">
          <button className="active">Households</button>
          <button onClick={() => setMode("work")}>Call queue</button>
        </div>

        <details className="pipeline-tools">
          <summary>Add or import</summary>
          <div className="pipeline-tools-body">
            <IntakePanel
              prospects={prospects}
              onCreate={createProspect}
              onMerge={(existingId, incoming) =>
                onChange((prev) =>
                  prev.map((p) =>
                    p.id === existingId ? { ...mergeInto(p, incoming), updatedAt: today() } : p,
                  ),
                )
              }
            />

            <TranscriptPanel
              prospects={prospects}
              ownerName={ownerName}
              onOwnerNameChange={onOwnerNameChange}
              onQueueReview={onQueueReview}
            />
          </div>
        </details>
      </div>

      <div className="lead-intents" role="group" aria-label="Filter households by intent">
        {INTENTS.map((i) => (
          <button
            key={i.id}
            type="button"
            className={`lead-intent${intent === i.id ? " is-current" : ""}`}
            aria-pressed={intent === i.id}
            onClick={() => setIntent(i.id)}
          >
            {i.label}
            <span className="lead-intent-count"> {intentCounts.get(i.id) ?? 0}</span>
          </button>
        ))}
        <button
          type="button"
          className={`lead-intent${mapOpen ? " is-current" : ""}`}
          aria-pressed={mapOpen}
          onClick={() => setMapOpen((v) => !v)}
        >
          Lead map
        </button>
      </div>

      {mapOpen && (
        <LeadMap
          prospects={visible}
          onOpenProspect={(id) => {
            setMapOpen(false);
            setExpandedId(id);
          }}
        />
      )}

      <div className="lead-toolbar">
        <div className="lead-toolbar-left">
          <label className="sr-only" htmlFor="lead-search">
            Search leads
          </label>
          <input
            id="lead-search"
            className="search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names, areas, notes…"
          />
          <label className="pipeline-stage-filter">
            <span className="sr-only">Filter by stage</span>
            <select
              value={stageFilter}
              onChange={(event) =>
                setStageFilter(event.target.value as Stage | "All" | "Needs research")
              }
            >
              <option value="All">All stages ({prospects.length})</option>
              {researchTotal > 0 && (
                <option value="Needs research">Needs research ({researchTotal})</option>
              )}
              {prospectStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage} ({counts.get(stage) ?? 0})
                </option>
              ))}
            </select>
          </label>
          <span className="lead-count">
            {visible.length} of {prospects.length} households
          </span>
        </div>
        <div className="lead-toolbar-actions">
          <button
            className="ghost-btn"
            onClick={() => void syncGis()}
            disabled={syncing}
            title="New leads arrive on their own when the dashboard opens. Use this only to retry after a failure."
          >
            {syncing ? "Syncing…" : "Retry lead sync"}
          </button>
          <button className="primary-btn" onClick={addBlank}>
            Add household
          </button>
        </div>
      </div>

      {syncNote && <p className={`sync-note enter ${syncNote.tone}`}>{syncNote.text}</p>}

      {visible.length === 0 ? (
        <p className="lead-empty">
          {prospects.length === 0
            ? "No households yet — use Add household, or open Add or import for a list."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="lead-table">
          <div className="lead-head" role="row">
            <span className="column-header">Household</span>
            <span className="column-header">Stage</span>
            <span className="column-header">Lines held</span>
            <span className="column-header">Next step</span>
            <span className="column-header lead-right">Last touch</span>
          </div>

          {visible.map((p) => {
            const open = expandedId === p.id;
            const quiet = isQuiet(p, day);
            return (
              <Fragment key={p.id}>
                <button
                  type="button"
                  className={`lead-row${open ? " is-open" : ""}`}
                  aria-expanded={open}
                  onClick={() => setExpandedId(open ? null : p.id)}
                >
                  <span className="lead-cell-name">
                    <span className="lead-name">{p.name || "Untitled household"}</span>
                    <span className="lead-town">
                      {townOf(p) || "No town on file"}
                      {/* Tags read inline, so the table can be scanned
                          without opening a single row. */}
                      {(p.tags ?? []).map((tag) => {
                        const c = tagColor(tag.color);
                        return (
                          <span
                            key={tag.id}
                            className="lead-tag"
                            style={{ background: c.background, color: c.foreground }}
                          >
                            {tag.label}
                          </span>
                        );
                      })}
                    </span>
                  </span>

                  <span className="lead-stage" style={{ color: TONE_VAR[stageTone(p.stage)] }}>
                    {p.stage}
                  </span>

                  <span className="lead-lines">{linesHeldLabel(p)}</span>

                  {/* The most important cell on the screen. Never muted. */}
                  <span className="lead-next">{nextStepOf(p, tasks, opportunities)}</span>

                  <span
                    className="lead-touch"
                    style={{ color: quiet ? "var(--hue-terracotta)" : "var(--hue-grey)" }}
                  >
                    {lastTouchLabel(p, day)}
                  </span>
                </button>

                {open && (
                  <div className="lead-detail">
                    <ProspectCard
                      prospect={p}
                      calls={callsFor(calls, p.id)}
                      expanded
                      onToggle={() => setExpandedId(null)}
                      onChange={(patch) => patchProspect(p.id, patch)}
                      onRemove={() => {
                        onCallsChange((prev) => prev.filter((c) => c.prospectId !== p.id));
                        // Rule-made tasks go with the household; hand-typed ones stay.
                        onTasksChange(tasks.filter((t) => !(t.prospectId === p.id && t.ruleId)));
                        onChange((prev) => prev.filter((x) => x.id !== p.id));
                      }}
                      onSaveCall={saveCall}
                      onDeleteCall={deleteCall}
                      onSetScore={(score) => patchProspect(p.id, { conversionScore: score })}
                      opportunities={opportunitiesFor(opportunities, p.id)}
                      onSaveOpportunity={(o, isNew) =>
                        onOpportunitiesChange(
                          isNew
                            ? [...opportunities, o]
                            : opportunities.map((x) => (x.id === o.id ? patchOpportunity(x, o) : x)),
                        )
                      }
                      onRemoveOpportunity={(id) =>
                        onOpportunitiesChange(opportunities.filter((x) => x.id !== id))
                      }
                    />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
