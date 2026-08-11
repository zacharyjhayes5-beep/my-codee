import type { Task } from "../types";
import { urgencyColor } from "../lib/defaultData";

interface WeekAgendaProps {
  tasks: Task[];
  today: string;
  /** yyyy-mm-dd of the seven days shown, starting today. */
  days: string[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return { weekday: DAY_NAMES[date.getDay()], month: MONTH_NAMES[m - 1], day: d };
}

export function WeekAgenda({ tasks, today, days }: WeekAgendaProps) {
  const open = tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);

  return (
    <section className="agenda">
      <div className="agenda-head">
        <h2>This week</h2>
        <p>Everything with a day on it, from today forward.</p>
      </div>

      {overdue.length > 0 && (
        <div className="agenda-overdue">
          <span className="overdue-pill">{overdue.length} overdue</span>
          <ul>
            {overdue.map((t) => (
              <li key={t.id}>
                <span className="agenda-dot" style={{ background: urgencyColor[t.urgency] }} />
                {t.text}
                <span className="agenda-when">{parts(t.dueDate as string).month} {parts(t.dueDate as string).day}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="agenda-week">
        {days.map((iso) => {
          const { weekday, month, day } = parts(iso);
          const dayTasks = open.filter((t) => t.dueDate === iso);
          return (
            <div key={iso} className={`agenda-day${iso === today ? " is-today" : ""}`}>
              <div className="agenda-date">
                <span className="agenda-weekday">{iso === today ? "Today" : weekday}</span>
                <span className="agenda-num">
                  {month} {day}
                </span>
              </div>
              {dayTasks.length === 0 ? (
                <p className="agenda-clear">—</p>
              ) : (
                <ul>
                  {dayTasks.map((t) => (
                    <li key={t.id}>
                      <span className="agenda-dot" style={{ background: urgencyColor[t.urgency] }} />
                      {t.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
