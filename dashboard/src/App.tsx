import { useEffect, useRef, useState } from "react";
import "./App.css";
// Loaded last: the design system that governs the whole interface.
import "./theme.css";
import { BackupPanel } from "./components/BackupPanel";
import { OperatorTab } from "./components/OperatorTab";
import { ProgressTab } from "./components/ProgressTab";
import { TodoTab } from "./components/TodoTab";
import { ProspectsTab } from "./components/ProspectsTab";
import { StorageNotice } from "./components/StorageNotice";
import { CommandPalette } from "./components/CommandPalette";
import { WalkthroughTab } from "./components/WalkthroughTab";
import { CampaignsTab } from "./components/CampaignsTab";
import { useStored, whenPersisted } from "./lib/repository";
import { readSyncSettings, runSync } from "./lib/gisSync";
import { appendAudit, auditEntry } from "./lib/audit";
import { applyProposal, rejectProposal, type Conflict } from "./lib/reviews";
import type { CoverageItem, PropertyProfile, ReviewProposal } from "./types";

type Tab =
  | "operator"
  | "progress"
  | "todo"
  | "pipeline"
  | "campaigns"
  | "walkthrough";

/**
 * Navigation, and the page header each destination writes.
 *
 * `title` and `standfirst` answer "where am I" and "what matters here" without
 * a decorative heading. The icons are single-stroke paths drawn inline rather
 * than pulled from a library — six glyphs did not justify a dependency.
 */
const tabs: { id: Tab; label: string; title: string; standfirst: string; icon: string }[] = [
  {
    id: "operator",
    label: "Operator",
    title: "Operator",
    standfirst: "Your calendar, suggestions, and the few updates that matter today.",
    icon: "M5 3v3M19 3v3M4 9h16M5 5h14a1 1 0 011 1v14H4V6a1 1 0 011-1z",
  },
  {
    id: "pipeline",
    label: "Pipeline",
    title: "Pipeline",
    standfirst: "Every household, its stage, and the next action in one place.",
    icon: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  },
  {
    id: "todo",
    label: "To-Do",
    title: "To-Do",
    standfirst: "Tasks by urgency, the week ahead, and the review inbox.",
    icon: "M4 7l2.5 2.5L11 5M4 17l2.5 2.5L11 13M14 7h6M14 17h6",
  },
  {
    id: "progress",
    label: "Progress",
    title: "Progress",
    standfirst: "The book of business against the period's goal.",
    icon: "M4 18l5-6 4 3.5L20 6",
  },
  {
    id: "campaigns",
    label: "Campaigns",
    title: "Campaigns",
    standfirst: "A living record of the five ways you create conversations.",
    icon: "M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2",
  },
  {
    id: "walkthrough",
    label: "Walkthrough",
    title: "Property walkthrough",
    standfirst: "The dwelling area by area, and what underwriting will ask about each.",
    icon: "M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6",
  },
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
  /** Lets the startup sync read the current list without depending on it. */
  const prospectsRef = useRef(prospects);
  prospectsRef.current = prospects;
  /** One sync per load, even under StrictMode's double-invoke. */
  const syncedOnce = useRef(false);
  const [calls, setCalls] = useStored("calls");
  const [reviews, setReviews] = useStored("reviews");
  const [audit, setAudit] = useStored("audit");
  const [opportunities, setOpportunities] = useStored("opportunities");
  const [lastBackupAt, setLastBackupAt] = useStored("lastBackupAt");
  const [noticeSeen, setNoticeSeen] = useStored("noticeSeen");
  const [campaigns, setCampaigns] = useStored("campaigns");
  const [googleCalendarClientId, setGoogleCalendarClientId] = useStored(
    "googleCalendarClientId",
  );

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

  /**
   * Bring in whatever the ingestion Worker has ready, once per load.
   *
   * This is the normal path — the weekday cron builds the batch overnight and
   * it is simply here when the dashboard is opened. Nothing about it is
   * allowed to affect the application:
   *
   *   - it runs after the repository has initialised, because main.tsx does
   *     not render until then;
   *   - every failure is swallowed, so an unreachable Worker is invisible;
   *   - leads are acknowledged only after the write has been persisted, so a
   *     failure part-way leaves them upstream for the next attempt;
   *   - `syncedOnce` guards against StrictMode's double-invoke in development,
   *     which would otherwise fetch twice on every load.
   */
  useEffect(() => {
    if (syncedOnce.current) return;
    syncedOnce.current = true;

    const settings = readSyncSettings();
    if (!settings) return;

    void (async () => {
      try {
        await runSync(settings, prospectsRef.current, async (added) => {
          setProspects((prev) => [...prev, ...added]);
          // Acknowledge only once the write has actually landed.
          await whenPersisted();
        });
      } catch {
        // A lead service that is down must never be something the user sees on
        // open. The manual control on the Leads page reports the real error.
      }
    })();
    // Deliberately once per load: the batch is built daily, not continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /**
   * A research edit — a found phone number, or closing a household nobody can
   * be reached at. Goes through the same prospect state everything else uses,
   * so it persists exactly like any other edit and the queue recomputes on the
   * spot without a reload.
   */
  /**
   * Record what the walkthrough found.
   *
   * Property detail is data entry, not a decision, so it goes straight to the
   * record and nothing is written to the audit log — the same treatment finding
   * a phone number gets.
   */
  function patchProperty(id: string, property: PropertyProfile) {
    setProspects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, assets: { ...p.assets, property } } : p)),
    );
  }

  /** Coverage is data entry, same as property detail — no audit entry. */
  function patchCoverage(id: string, coverage: CoverageItem[]) {
    setProspects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, assets: { ...p.assets, coverage } } : p)),
    );
  }

  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteTrigger = useRef<HTMLButtonElement>(null);

  /**
   * Ctrl+K / Cmd+K from anywhere. Bound on the window rather than a element so
   * it works wherever focus happens to be, and deliberately ignored while a
   * field is focused only for Escape — the shortcut itself should always work.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Focus returns to the control that opened it. */
  function closePalette() {
    setPaletteOpen(false);
    paletteTrigger.current?.focus();
  }

  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <div className="app">
      <nav className="sidenav" aria-label="Sections">
        <div className="sidenav-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            <strong>Agency Control Center</strong>
            <span>Farm Bureau Michigan</span>
          </span>
        </div>

        <ul className="sidenav-list">
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                className={`sidenav-link${t.id === tab ? " is-current" : ""}`}
                onClick={() => setTab(t.id)}
                aria-current={t.id === tab ? "page" : undefined}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="sidenav-foot">
          <BackupPanel onExported={() => setLastBackupAt(new Date().toISOString())} />
        </div>
      </nav>

      <div className="workspace">
        <header className="page-head">
          <div className="page-head-text">
            <h1>{current.title}</h1>
            <p>{current.standfirst}</p>
          </div>

          {/* Visible on purpose. A shortcut nobody finds is worth nothing. */}
          <button
            ref={paletteTrigger}
            className="palette-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-haspopup="dialog"
          >
            <span>Search</span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </button>
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
            prospects={prospects}
            tasks={tasks}
            reviews={reviews}
            calls={calls}
            opportunities={opportunities}
            googleCalendarClientId={googleCalendarClientId}
            onGoogleCalendarClientIdChange={setGoogleCalendarClientId}
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
        {tab === "campaigns" && <CampaignsTab entries={campaigns} onChange={setCampaigns} />}
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
        {tab === "walkthrough" && (
          <WalkthroughTab
            prospects={prospects}
            focusId={focusProspectId}
            onPatch={patchProperty}
            onCoverageChange={patchCoverage}
          />
        )}
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        prospects={prospects}
        onGoTo={(target) => setTab(target)}
        onOpenProspect={(id) => {
          setFocusProspectId(id);
          setTab("pipeline");
        }}
      />
    </div>
  );
}

export default App;
