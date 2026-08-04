import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import type { CalendarEvent, TodoItem } from "../types";
import { newId } from "../lib/storage";

interface CalendarTabProps {
  events: CalendarEvent[];
  onEventsChange: (events: CalendarEvent[]) => void;
  todos: TodoItem[];
  onTodosChange: (todos: TodoItem[]) => void;
}

export function CalendarTab({ events, onEventsChange, todos, onTodosChange }: CalendarTabProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newTodo, setNewTodo] = useState("");

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    const result: Date[] = [];
    let d = start;
    while (d <= end) {
      result.push(d);
      d = addDays(d, 1);
    }
    return result;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  const selectedEvents = (eventsByDay.get(selected) ?? []).slice().sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  function addEvent() {
    if (!newEventTitle.trim()) return;
    onEventsChange([
      ...events,
      { id: newId(), date: selected, title: newEventTitle.trim(), time: newEventTime || undefined },
    ]);
    setNewEventTitle("");
    setNewEventTime("");
  }

  function removeEvent(id: string) {
    onEventsChange(events.filter((e) => e.id !== id));
  }

  function addTodo() {
    if (!newTodo.trim()) return;
    onTodosChange([...todos, { id: newId(), text: newTodo.trim(), done: false }]);
    setNewTodo("");
  }

  function toggleTodo(id: string) {
    onTodosChange(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function removeTodo(id: string) {
    onTodosChange(todos.filter((t) => t.id !== id));
  }

  const pendingCount = todos.filter((t) => !t.done).length;

  return (
    <div className="tab-panel calendar-layout">
      <div className="calendar-card">
        <div className="calendar-toolbar">
          <button onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month">
            ‹
          </button>
          <h3>{format(month, "MMMM yyyy")}</h3>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
            ›
          </button>
        </div>

        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, new Date());
            const isSelected = key === selected;
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <button
                key={key}
                className={`calendar-day${inMonth ? "" : " outside"}${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
                onClick={() => setSelected(key)}
              >
                <span className="day-number">{format(day, "d")}</span>
                {dayEvents.length > 0 && <span className="day-dot" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="calendar-side">
        <div className="side-card">
          <h3>{format(new Date(selected + "T00:00:00"), "EEEE, MMMM d")}</h3>
          <ul className="event-list">
            {selectedEvents.length === 0 && <li className="empty">No events scheduled.</li>}
            {selectedEvents.map((ev) => (
              <li key={ev.id}>
                <span>
                  {ev.time && <span className="event-time">{ev.time}</span>}
                  {ev.title}
                </span>
                <button className="remove-btn" onClick={() => removeEvent(ev.id)} aria-label="Remove event">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="add-row">
            <input
              type="time"
              value={newEventTime}
              onChange={(e) => setNewEventTime(e.target.value)}
              className="time-input"
            />
            <input
              type="text"
              placeholder="Add event…"
              value={newEventTitle}
              onChange={(e) => setNewEventTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
            />
            <button onClick={addEvent}>Add</button>
          </div>
        </div>

        <div className="side-card">
          <h3>To-do list ({pendingCount} open)</h3>
          <ul className="todo-list">
            {todos.length === 0 && <li className="empty">Nothing on the list yet.</li>}
            {todos.map((t) => (
              <li key={t.id} className={t.done ? "done" : ""}>
                <label>
                  <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} />
                  <span>{t.text}</span>
                </label>
                <button className="remove-btn" onClick={() => removeTodo(t.id)} aria-label="Remove to-do">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="add-row">
            <input
              type="text"
              placeholder="Add a task…"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTodo()}
            />
            <button onClick={addTodo}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
