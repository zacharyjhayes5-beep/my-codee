import { useState } from "react";
import "./App.css";
import { BackupPanel } from "./components/BackupPanel";
import { LeadMap } from "./components/LeadMap";
import { OperatorTab, type CommandTarget } from "./components/OperatorTab";
import { ProgressTab } from "./components/ProgressTab";
import { TodoTab } from "./components/TodoTab";
import { ProspectsTab } from "./components/ProspectsTab";
import { PipelineTab } from "./components/PipelineTab";
import { StorageNotice } from "./components/StorageNotice";
import { useStored } from "./lib/repository";
import { appendAudit, auditEntry } from "./lib/audit";
import { applyProposal, rejectProposal, type Conflict } from "./lib/reviews";
import type { ReviewProposal } from "./types";

type Tab = "operator" | "progress" | "todo" | "prospects" | "pipeline" | "map";

const tabs: { id: Tab; label: string }[] = [
  { id: "operator", label: "Operator" },
  { id: "progress", label: "Progress" },
  { id: "todo", label: "To-Do" },
  { id: "prospects", label: "Prospects" },
  { id: "pipeline", label: "Pipeline" },
  { id: "map", label: "Lead Map" },
];

function App() {
  const [tab, setTab] = useState<Tab>("operator");
  /** Set when arriving from another screen, so the right card opens. */
  const [focusProspectId, setFocusProspectId] = useState<string | null>(null);
  const [lines, setLines] = useStored("lines");
  const [period, setPeriod] = useStored("period");
  const [entries, setEntries] = useStored("policies");
  const [tasks, setTasks] = useStored("tasks");
  const [dismissed, setDismissed] = useStored("dismissed");
  const [prospects, setProspects] = useStored("prospects");
  const [calls, setCalls] = useStored("calls");
  const [reviews, setReviews] = useStored("reviews");
  const [audit, setAudit] = useStored("audit");
  const [opportunities, setOpportunities] = useStored("opportunities");
  const [correspondence, setCorrespondence] = useStored("correspondence");
  const [lastBackupAt, setLastBackupAt] = useStored("lastBackupAt");
  const [noticeSeen, setNoticeSeen] = useStored("noticeSeen");

  /**
   * Applies a proposal or nothing at all. The whole next state is assembled
   * first; if a field has moved since the proposal was written, the conflicts
   * come back and not one of the writes below runs.
   */
  function approveProposal(proposal: ReviewProposal): Conflict[] {
    const result = applyProposal(proposal, { prospects, calls, tasks, audit }, reviews, {});
    if (!result.ok) return result.conflicts;

    setProspects(result.prospects);
    setCalls(result.calls);
    setTasks(result.tasks);
    setAudit(result.audit);
    setReviews(result.reviews.map((r) => (r.id === proposal.id ? { ...r, status: "approved" } : r)));
    return [];
  }

  function rejectProposalById(proposal: ReviewProposal) {
    const next = rejectProposal(proposal, reviews, dismissed);
    setReviews(next.reviews);
    setDismissed(next.dismissed);
    setAudit(
      appendAudit(audit, [
        auditEntry({
          entity: "prospect",
          entityId: proposal.prospectId ?? "—",
          field: "review",
          from: "pending",
          to: "rejected",
          actor: "user",
          reviewId: proposal.id,
          summary: `Rejected a proposal from ${proposal.sourceRef || "an import"}`,
        }),
      ]),
    );
  }
  const [ownerName, setOwnerName] = useStored("owner");

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Agency Dashboard</h1>
          <p>Farm Bureau Michigan — book of business tracker</p>
        </div>
        <div className="header-controls">
          <nav className="tab-bar">
            {tabs.map((t) => (
              <button key={t.id} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <BackupPanel onExported={() => setLastBackupAt(new Date().toISOString())} />
        </div>
      </header>

      <StorageNotice
        prospects={prospects}
        lastBackupAt={lastBackupAt}
        dismissed={noticeSeen}
        onDismissed={() => setNoticeSeen(true)}
      />

      <main>
        {tab === "operator" && (
          <OperatorTab
            entries={entries}
            lines={lines}
            period={period}
            prospects={prospects}
            tasks={tasks}
            reviews={reviews}
            calls={calls}
            opportunities={opportunities}
            correspondence={correspondence}
            onCorrespondenceChange={setCorrespondence}
            onCommand={(target: CommandTarget) => setTab(target)}
            onGo={(target, prospectId) => {
              setTab(target);
              if (prospectId) setFocusProspectId(prospectId);
            }}
          />
        )}
        {tab === "progress" && (
          <ProgressTab
            lines={lines}
            onChange={setLines}
            period={period}
            onPeriodChange={setPeriod}
            entries={entries}
            onEntriesChange={setEntries}
          />
        )}
        {tab === "todo" && (
          <TodoTab
            tasks={tasks}
            onTasksChange={setTasks}
            reviews={reviews}
            onReviewsChange={setReviews}
            prospects={prospects}
            onApprove={approveProposal}
            onReject={rejectProposalById}
            dismissed={dismissed}
          />
        )}
        {tab === "pipeline" && (
          <PipelineTab
            opportunities={opportunities}
            prospects={prospects}
            onOpenProspect={(id) => {
              setFocusProspectId(id);
              setTab("prospects");
            }}
          />
        )}
        {tab === "map" && (
          <LeadMap prospects={prospects} onOpenProspect={() => setTab("prospects")} />
        )}
        {tab === "prospects" && (
          <ProspectsTab
            prospects={prospects}
            onChange={setProspects}
            calls={calls}
            onCallsChange={setCalls}
            tasks={tasks}
            onTasksChange={setTasks}
            audit={audit}
            onAuditChange={setAudit}
            opportunities={opportunities}
            onOpportunitiesChange={setOpportunities}
            focusProspectId={focusProspectId}
            onFocusHandled={() => setFocusProspectId(null)}
            onQueueReview={(proposal) => setReviews([...reviews, proposal])}
            ownerName={ownerName}
            onOwnerNameChange={setOwnerName}
          />
        )}
      </main>
    </div>
  );
}

export default App;
