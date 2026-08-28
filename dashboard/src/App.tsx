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
import { PipelineTab } from "./components/PipelineTab";
import { VaultTab } from "./components/VaultTab";
import { useStored, whenPersisted } from "./lib/repository";
import { readSyncSettings, runSync } from "./lib/gisSync";
import { appendAudit, auditEntry } from "./lib/audit";
import { applyProposal, rejectProposal, type Conflict } from "./lib/reviews";
import type { CoverageItem, PropertyProfile, ReviewProposal } from "./types";

/**
 * The five destinations in the top bar, and the three that are no longer in it.
 *
 * The nav is type-only — no icons — so the inline SVG paths the sidebar needed
 * are gone. Walkthrough is reached from a household record, and To-Do and
 * Progress are folded into Operator; all three keep working routes and stay
 * reachable from the command palette.
 */
type NavTab = "operator" | "leads" | "pipeline" | "campaigns" | "vault";
type QuietTab = "walkthrough" | "todo" | "progress";
type Tab = NavTab | QuietTab;

const NAV: { id: NavTab; label: string }[] = [
  { id: "operator", label: "Operator" },
  { id: "leads", label: "Leads" },
  { id: "pipeline", label: "Pipeline" },
  { id: "campaigns", label: "Campaigns" },
  { id: "vault", label: "Vault" },
];

/**
 * What each screen says about itself: a kicker over a title, and a standfirst
 * that answers "what matters here" without a decorative heading.
 */
const PAGE: Record<Tab, { kicker: string; title: string; standfirst: string }> = {
  operator: {
    kicker: "Today",
    title: "Operator",
    standfirst: "What you owe today, and who is up next.",
  },
  leads: {
    kicker: "Households",
    title: "Leads",
    standfirst: "Every household and the one thing owed to it.",
  },
  pipeline: {
    kicker: "Open work",
    title: "Pipeline",
    standfirst: "Opportunities by stage, and what has gone quiet.",
  },
  campaigns: {
    kicker: "Outreach",
    title: "Campaigns",
    standfirst: "Five channels, logged as you work them.",
  },
  vault: {
    kicker: "Knowledge",
    title: "Vault",
    standfirst: "Everything you have written, searchable.",
  },
  walkthrough: {
    kicker: "Property",
    title: "Walkthrough",
    standfirst: "The dwelling area by area, and what underwriting will ask.",
  },
  todo: {
    kicker: "Owed",
    title: "To-Do",
    standfirst: "Tasks by urgency, the week ahead, and the review inbox.",
  },
  progress: {
    kicker: "The book",
    title: "Progress",
    standfirst: "The book of business against the period's goal.",
  },
};

/** "Mon 24 Aug" — the date the top bar carries, in the reader's own locale. */
function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());
}

/** The palette is Cmd+K on a Mac and Ctrl+K everywhere else. Say which. */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
const PALETTE_HINT = IS_MAC ? "⌘K" : "Ctrl K";

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
  const [meetings, setMeetings] = useStored("meetings");
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

  const current = PAGE[tab];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-monogram" aria-hidden="true">
            A
          </span>
          <span className="topbar-brand-rule" aria-hidden="true" />
          <span className="topbar-wordmark">
            <span className="topbar-name">Agency Control Center</span>
            <span className="topbar-org">Farm Bureau · Michigan</span>
          </span>
        </div>

        <nav className="topbar-nav" aria-label="Sections">
          {NAV.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`topbar-item${t.id === tab ? " is-current" : ""}`}
              onClick={() => setTab(t.id)}
              aria-current={t.id === tab ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="topbar-date">{todayLabel()}</span>
          {/* Visible on purpose. A shortcut nobody finds is worth nothing. */}
          <button
            ref={paletteTrigger}
            type="button"
            className="topbar-search"
            onClick={() => setPaletteOpen(true)}
            aria-haspopup="dialog"
          >
            <span className="topbar-search-word">Search </span>
            {PALETTE_HINT}
          </button>
        </div>
      </header>

      <div className="workspace">
        <div className="page-header">
          <div className="page-header-text">
            <span className="kicker">{current.kicker}</span>
            <h1>{current.title}</h1>
          </div>
          <p className="page-standfirst">{current.standfirst}</p>
        </div>
        <div className="page-rule" aria-hidden="true" />

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
            onTasksChange={setTasks}
            reviews={reviews}
            opportunities={opportunities}
            meetings={meetings}
            onMeetingsChange={setMeetings}
            lines={lines}
            period={period}
            entries={entries}
            googleCalendarClientId={googleCalendarClientId}
            onGoogleCalendarClientIdChange={setGoogleCalendarClientId}
            onOpenProspect={(id) => {
              setFocusProspectId(id);
              setTab("leads");
            }}
            onGo={(target) => setTab(target)}
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
        {tab === "leads" && (
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
        {tab === "pipeline" && (
          <PipelineTab
            opportunities={opportunities}
            prospects={prospects}
            onChange={setOpportunities}
            onOpenProspect={(id) => {
              setFocusProspectId(id);
              setTab("leads");
            }}
          />
        )}
        {tab === "vault" && (
          <>
            <VaultTab />
            {/* Two unlabelled buttons at the foot of a very tall page were
                impossible to find, and this is the control that protects the
                only copy of the book. It gets a heading and says what it is. */}
            <section className="data-panel" aria-labelledby="backup-title">
              <span className="kicker">Your data</span>
              <h2 id="backup-title">Back up and restore</h2>
              <p>
                Everything you have entered lives in this browser, on this computer.
                <strong> Back up</strong> saves all of it to a file you keep.
                <strong> Restore</strong> reads one back in — on this machine or any other.
                Nothing happens automatically; it only happens when you press it.
              </p>
              <BackupPanel onExported={() => setLastBackupAt(new Date().toISOString())} />
            </section>
          </>
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
          setTab("leads");
        }}
      />
    </div>
  );
}

export default App;
