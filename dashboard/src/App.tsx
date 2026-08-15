import { useState } from "react";
import "./App.css";
import { BackupPanel } from "./components/BackupPanel";
import { LeadMap } from "./components/LeadMap";
import { OperatorTab, type CommandTarget } from "./components/OperatorTab";
import { ProgressTab } from "./components/ProgressTab";
import { TodoTab } from "./components/TodoTab";
import { ProspectsTab } from "./components/ProspectsTab";
import { useStored } from "./lib/repository";

type Tab = "operator" | "progress" | "todo" | "prospects" | "map";

const tabs: { id: Tab; label: string }[] = [
  { id: "operator", label: "Operator" },
  { id: "progress", label: "Progress" },
  { id: "todo", label: "To-Do" },
  { id: "prospects", label: "Prospects" },
  { id: "map", label: "Lead Map" },
];

function App() {
  const [tab, setTab] = useState<Tab>("operator");
  const [lines, setLines] = useStored("lines");
  const [period, setPeriod] = useStored("period");
  const [entries, setEntries] = useStored("policies");
  const [tasks, setTasks] = useStored("tasks");
  const [suggestions, setSuggestions] = useStored("suggestions");
  const [dismissed, setDismissed] = useStored("dismissed");
  const [prospects, setProspects] = useStored("prospects");
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
          <BackupPanel />
        </div>
      </header>

      <main>
        {tab === "operator" && (
          <OperatorTab
            entries={entries}
            lines={lines}
            period={period}
            prospects={prospects}
            tasks={tasks}
            suggestions={suggestions}
            onCommand={(target: CommandTarget) => setTab(target)}
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
            suggestions={suggestions}
            onSuggestionsChange={setSuggestions}
            dismissed={dismissed}
            onDismissedChange={setDismissed}
          />
        )}
        {tab === "map" && (
          <LeadMap prospects={prospects} onOpenProspect={() => setTab("prospects")} />
        )}
        {tab === "prospects" && (
          <ProspectsTab
            prospects={prospects}
            onChange={setProspects}
            ownerName={ownerName}
            onOwnerNameChange={setOwnerName}
          />
        )}
      </main>
    </div>
  );
}

export default App;
