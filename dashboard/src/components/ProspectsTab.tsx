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
  DEFAULT_ENDPOINT,
  GisSyncError,
  readSyncSettings,
  runSync,
  writeSyncSettings,
} from "../lib/gisSync";

type SortKey = "name" | "stage" | "area" | "next" | "touched";

const columns: { key: SortKey; label: string }[] = [
  { key: "name", label: "Household" },
  { key: "stage", label: "Stage" },
  { key: "area", label: "Area" },
  { key: "next", label: "Next action" },
];

/**
 * The working state of a lead, read from fields the record already carries.
 *
 * This is a display derivation and nothing more — no state is stored, and the
 * order of the checks is the priority order: a household that is closed is
 * closed regardless of what else is true, and an overdue follow-up outranks
 * the fact that somebody has been contacted before.
 */
function leadStatus(p: Prospect, now: string): { label: string; tone: string } {
  if (p.stage === "Closed") return { label: "Closed", tone: "is-neutral" };
  if (p.needsPhoneNumber) return { label: "Needs research", tone: "is-warning" };
  if (p.nextActionDate && p.nextActionDate < now) return { label: "Follow-up due", tone: "is-critical" };
  if (p.needsReview) return { label: "Needs review", tone: "is-warning" };
  if (!p.lastContactedAt) return { label: "New", tone: "is-new" };
  if (p.nextActionDate) return { label: "Scheduled", tone: "is-active" };
  return { label: "Contacted", tone: "is-good" };
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

  const [stageFilter, setStageFilter] = useState<Stage | "All" | "Needs research">("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "touched", dir: -1 });
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects
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
          p.notes.some((n) => n.body.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }, [prospects, search, stageFilter]);

  const sorted = useMemo(() => {
    const read = (p: Prospect) => {
      switch (sort.key) {
        case "name":
          return p.name.toLowerCase();
        case "stage":
          return p.stage;
        case "area":
          return p.area.toLowerCase();
        case "next":
          // Undated work sorts last either way rather than leading the list.
          return p.nextActionDate || "9999-12-31";
        default:
          return p.updatedAt;
      }
    };
    return [...visible].sort((a, b) => {
      const x = read(a);
      const y = read(b);
      return x === y ? a.name.localeCompare(b.name) : (x < y ? -1 : 1) * sort.dir;
    });
  }, [visible, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

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
          {researchTotal > 0 && (
            <button
              className={`filter-chip${stageFilter === "Needs research" ? " on" : ""}`}
              onClick={() => setStageFilter("Needs research")}
            >
              Needs research <span>{researchTotal}</span>
            </button>
          )}
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
      </div>

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
          <span className="lead-count">
            {sorted.length} of {prospects.length} households
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
            Blank profile
          </button>
        </div>
      </div>

      {syncNote && <p className={`sync-note ${syncNote.tone}`}>{syncNote.text}</p>}

      {sorted.length === 0 ? (
        <p className="lead-empty">
          {prospects.length === 0
            ? "No households yet — add one with Quick add above, or bring a list in with Bulk import."
            : "Nothing matches that filter."}
        </p>
      ) : (
        <div className="lead-table-wrap">
          <table className="lead-table">
            <caption className="sr-only">
              Households, with stage, area, next action and working status.
            </caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={
                      sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"
                    }
                  >
                    <button onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sort.key === c.key && (
                        <span className="sort-caret" aria-hidden="true">
                          {sort.dir === 1 ? "▲" : "▼"}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
                <th scope="col">Status</th>
                <th scope="col">Contact</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const status = leadStatus(p, today());
                const open = expandedId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className={`lead-row${open ? " is-open" : ""}`}>
                      <td>
                        <button
                          className="lead-name"
                          aria-expanded={open}
                          onClick={() => setExpandedId(open ? null : p.id)}
                        >
                          <span className="lead-disclosure" aria-hidden="true">
                            ▶
                          </span>
                          <span>
                            <span className="lead-name-line">
                              {p.name || "Untitled household"}
                              {/* Tags read inline after the name, so the whole
                                  table can be scanned without expanding rows. */}
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
                            {p.contacts.length > 0 && (
                              <span className="lead-sub">
                                {p.contacts.length} contact
                                {p.contacts.length === 1 ? "" : "s"}
                              </span>
                            )}
                          </span>
                        </button>
                      </td>
                      <td>{p.stage}</td>
                      <td>{p.area || "—"}</td>
                      <td>
                        {p.nextAction || "—"}
                        {p.nextActionDate && <span className="lead-sub">{p.nextActionDate}</span>}
                      </td>
                      <td>
                        <span className={`lead-status ${status.tone}`}>{status.label}</span>
                      </td>
                      <td>
                        {p.phone || p.email || "—"}
                        {p.phone && p.email && <span className="lead-sub">{p.email}</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="lead-detail-row">
                        <td colSpan={6}>
                          <ProspectCard
                            prospect={p}
                            calls={callsFor(calls, p.id)}
                            expanded
                            onToggle={() => setExpandedId(null)}
                            onChange={(patch) => patchProspect(p.id, patch)}
                            onRemove={() => {
                              onCallsChange((prev) => prev.filter((c) => c.prospectId !== p.id));
                              // Rule-made tasks go with the household; hand-typed ones stay.
                              onTasksChange(
                                tasks.filter((t) => !(t.prospectId === p.id && t.ruleId)),
                              );
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
                                  : opportunities.map((x) =>
                                      x.id === o.id ? patchOpportunity(x, o) : x,
                                    ),
                              )
                            }
                            onRemoveOpportunity={(id) =>
                              onOpportunitiesChange(opportunities.filter((x) => x.id !== id))
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
