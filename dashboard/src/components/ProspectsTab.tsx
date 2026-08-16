import { useEffect, useMemo, useState } from "react";
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
import { ProspectCard } from "./ProspectCard";

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

  const [stageFilter, setStageFilter] = useState<Stage | "All">("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<Stage, number>();
    for (const p of prospects) map.set(p.stage, (map.get(p.stage) ?? 0) + 1);
    return map;
  }, [prospects]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects
      .filter((p) => stageFilter === "All" || p.stage === stageFilter)
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.area.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.nextAction.toLowerCase().includes(q) ||
          p.notes.some((n) => n.body.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }, [prospects, search, stageFilter]);

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
          <button onClick={() => setMode("browse")}>Browse</button>
          <button className="active">Work</button>
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
      <div className="mode-switch">
        <button className="active">Browse</button>
        <button onClick={() => setMode("work")}>Work</button>
      </div>

      <IntakePanel
        prospects={prospects}
        onCreate={createProspect}
        onMerge={(existingId, incoming) =>
          onChange((prev) =>
            prev.map((p) => (p.id === existingId ? { ...mergeInto(p, incoming), updatedAt: today() } : p)),
          )
        }
      />

      <TranscriptPanel
        prospects={prospects}
        ownerName={ownerName}
        onOwnerNameChange={onOwnerNameChange}
        onQueueReview={onQueueReview}
      />

      <div className="prospect-toolbar">
        <div className="filter-chips">
          <button
            className={`filter-chip${stageFilter === "All" ? " on" : ""}`}
            onClick={() => setStageFilter("All")}
          >
            All <span>{prospects.length}</span>
          </button>
          {prospectStages.map((s) => (
            <button
              key={s}
              className={`filter-chip${stageFilter === s ? " on" : ""}`}
              onClick={() => setStageFilter(s)}
            >
              {s} <span>{counts.get(s) ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names, areas, notes…"
          />
          <button className="primary-btn" onClick={addBlank}>
            Blank profile
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty">
          {prospects.length === 0
            ? "No households yet — add one with Quick add above, or bring a list in with Bulk import."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="prospect-grid">
          {visible.map((p) => (
            <ProspectCard
              key={p.id}
              prospect={p}
              calls={callsFor(calls, p.id)}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
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
          ))}
        </div>
      )}
    </div>
  );
}
