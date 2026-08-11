import { useState } from "react";
import "./App.css";
import { ProgressTab } from "./components/ProgressTab";
import { CalendarTab } from "./components/CalendarTab";
import { ProspectsTab } from "./components/ProspectsTab";
import { useLocalStorage } from "./lib/storage";
import { defaultOwnerName, defaultPeriod } from "./lib/defaultData";
import { ENTRIES_KEY, LINES_KEY, PROSPECTS_KEY, migratedLines, migratedProspects } from "./lib/migrate";
import type { CalendarEvent, Period, PolicyEntry, PolicyLine, Prospect, TodoItem } from "./types";

type Tab = "progress" | "calendar" | "prospects";

const tabs: { id: Tab; label: string }[] = [
  { id: "progress", label: "Progress" },
  { id: "calendar", label: "Calendar & To-Do" },
  { id: "prospects", label: "Prospects" },
];

function App() {
  const [tab, setTab] = useState<Tab>("progress");
  const [lines, setLines] = useLocalStorage<PolicyLine[]>(LINES_KEY, migratedLines);
  const [period, setPeriod] = useLocalStorage<Period>("fb-dashboard:period", defaultPeriod);
  const [entries, setEntries] = useLocalStorage<PolicyEntry[]>(ENTRIES_KEY, []);
  const [events, setEvents] = useLocalStorage<CalendarEvent[]>("fb-dashboard:events", []);
  const [todos, setTodos] = useLocalStorage<TodoItem[]>("fb-dashboard:todos", []);
  const [prospects, setProspects] = useLocalStorage<Prospect[]>(PROSPECTS_KEY, migratedProspects);
  const [ownerName, setOwnerName] = useLocalStorage<string>("fb-dashboard:owner", defaultOwnerName);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Agency Dashboard</h1>
          <p>Farm Bureau Michigan — book of business tracker</p>
        </div>
        <nav className="tab-bar">
          {tabs.map((t) => (
            <button key={t.id} className={t.id === tab ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
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
        {tab === "calendar" && (
          <CalendarTab events={events} onEventsChange={setEvents} todos={todos} onTodosChange={setTodos} />
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
