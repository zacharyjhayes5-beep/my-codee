import { useState } from "react";
import "./App.css";
import { ProgressTab } from "./components/ProgressTab";
import { CalendarTab } from "./components/CalendarTab";
import { CrmTab } from "./components/CrmTab";
import { useLocalStorage } from "./lib/storage";
import { defaultPolicyLines } from "./lib/defaultData";
import type { CalendarEvent, Lead, PolicyLine, TodoItem } from "./types";

type Tab = "progress" | "calendar" | "crm";

const tabs: { id: Tab; label: string }[] = [
  { id: "progress", label: "Progress" },
  { id: "calendar", label: "Calendar & To-Do" },
  { id: "crm", label: "Leads & Customers" },
];

function App() {
  const [tab, setTab] = useState<Tab>("progress");
  const [lines, setLines] = useLocalStorage<PolicyLine[]>("fb-dashboard:lines", defaultPolicyLines);
  const [events, setEvents] = useLocalStorage<CalendarEvent[]>("fb-dashboard:events", []);
  const [todos, setTodos] = useLocalStorage<TodoItem[]>("fb-dashboard:todos", []);
  const [leads, setLeads] = useLocalStorage<Lead[]>("fb-dashboard:leads", []);

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
        {tab === "progress" && <ProgressTab lines={lines} onChange={setLines} />}
        {tab === "calendar" && (
          <CalendarTab events={events} onEventsChange={setEvents} todos={todos} onTodosChange={setTodos} />
        )}
        {tab === "crm" && <CrmTab leads={leads} onChange={setLeads} />}
      </main>
    </div>
  );
}

export default App;
