import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { Call, Opportunity, Prospect, ReviewProposal, Task } from "../types";
import { whatNeedsMe } from "../lib/attention";
import { buildDailyBrief, previousDay, todaysSchedule } from "../lib/dailyBrief";
import {
  authorizeGoogleCalendar,
  fetchGoogleCalendarDay,
  isGoogleClientId,
  revokeGoogleCalendar,
  type GoogleCalendarEvent,
} from "../lib/googleCalendar";
import { today } from "../lib/storage";

interface OperatorTabProps {
  prospects: Prospect[];
  tasks: Task[];
  reviews: ReviewProposal[];
  calls: Call[];
  opportunities: Opportunity[];
  googleCalendarClientId: string;
  onGoogleCalendarClientIdChange: (clientId: string) => void;
  onGo: (target: "pipeline" | "todo", prospectId?: string) => void;
}

function eventTime(event: GoogleCalendarEvent): string {
  return event.allDay ? "All day" : format(new Date(event.start), "h:mm a");
}

/** The Operator is deliberately quiet: the day, then a short read on what deserves attention. */
export function OperatorTab({
  prospects,
  tasks,
  reviews,
  calls,
  opportunities,
  googleCalendarClientId,
  onGoogleCalendarClientIdChange,
  onGo,
}: OperatorTabProps) {
  const now = useMemo(() => new Date(), []);
  const day = today();
  const [draftClientId, setDraftClientId] = useState(googleCalendarClientId);
  const [accessToken, setAccessToken] = useState("");
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [calendarState, setCalendarState] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [calendarError, setCalendarError] = useState("");

  const dashboardSchedule = useMemo(
    () => todaysSchedule(opportunities, prospects, day),
    [opportunities, prospects, day],
  );

  const brief = useMemo(
    () =>
      buildDailyBrief({
        prospects,
        calls,
        tasks,
        opportunities,
        reviews,
        today: day,
        yesterday: previousDay(day),
        now,
      }),
    [prospects, calls, tasks, opportunities, reviews, day, now],
  );

  const updates = useMemo(
    () => whatNeedsMe({ prospects, opportunities, tasks, reviews, today: day }, 4),
    [prospects, opportunities, tasks, reviews, day],
  );

  async function loadEvents(token: string) {
    const events = await fetchGoogleCalendarDay(token, day);
    setGoogleEvents(events);
    setCalendarState("connected");
    setCalendarError("");
  }

  async function connectCalendar() {
    const clientId = draftClientId.trim();
    if (!isGoogleClientId(clientId)) {
      setCalendarState("error");
      setCalendarError("Paste the Web application client ID from Google Cloud.");
      return;
    }

    setCalendarState("connecting");
    setCalendarError("");
    try {
      onGoogleCalendarClientIdChange(clientId);
      const token = await authorizeGoogleCalendar(clientId);
      setAccessToken(token);
      await loadEvents(token);
    } catch (error) {
      setCalendarState("error");
      setCalendarError(error instanceof Error ? error.message : "Google Calendar could not connect.");
    }
  }

  async function refreshCalendar() {
    if (!accessToken) return;
    setCalendarState("connecting");
    try {
      await loadEvents(accessToken);
    } catch (error) {
      setCalendarState("error");
      setCalendarError(error instanceof Error ? error.message : "Google Calendar could not refresh.");
    }
  }

  async function disconnectCalendar() {
    const token = accessToken;
    setAccessToken("");
    setGoogleEvents([]);
    setCalendarState("idle");
    setCalendarError("");
    await revokeGoogleCalendar(token);
  }

  const connected = calendarState === "connected" || Boolean(accessToken);

  return (
    <div className="operator operator-simple">
      <section className="operator-calendar" aria-labelledby="calendar-title">
        <header className="operator-calendar-head">
          <div>
            <span className="operator-eyebrow">Today</span>
            <h2 id="calendar-title">{format(now, "EEEE, MMMM d")}</h2>
          </div>
          <div className="calendar-connection">
            <span className={`calendar-source ${connected ? "is-connected" : ""}`}>
              {connected ? "Google Calendar connected" : "Google Calendar not connected"}
            </span>
            {connected && (
              <div className="calendar-actions">
                <button onClick={() => void refreshCalendar()} disabled={calendarState === "connecting"}>Refresh</button>
                <button onClick={() => void disconnectCalendar()}>Disconnect</button>
              </div>
            )}
          </div>
        </header>

        {!connected && (
          <div className="calendar-connect-card">
            <div>
              <span className="operator-eyebrow">Read-only connection</span>
              <h3>Bring today’s Google Calendar here</h3>
              <p>The dashboard can see event names, times, and locations. It cannot create, edit, or delete anything in Google Calendar.</p>
            </div>
            <div className="calendar-connect-form">
              <label htmlFor="google-client-id">Google OAuth client ID</label>
              <input
                id="google-client-id"
                value={draftClientId}
                onChange={(event) => setDraftClientId(event.target.value)}
                placeholder="123456789-…apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="primary" onClick={() => void connectCalendar()} disabled={calendarState === "connecting"}>
                {calendarState === "connecting" ? "Connecting…" : "Connect Google Calendar"}
              </button>
              {calendarError && <p className="calendar-error" role="alert">{calendarError}</p>}
              <details>
                <summary>Where do I get this?</summary>
                <ol>
                  <li>Enable the <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Calendar API</a>.</li>
                  <li>Create an OAuth client of type <strong>Web application</strong> in <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud credentials</a>.</li>
                  <li>Add authorized origins <code>http://127.0.0.1:5173</code>, <code>http://localhost:5173</code>, and <code>https://zacharyjhayes5-beep.github.io</code>.</li>
                  <li>Paste the generated client ID above.</li>
                </ol>
              </details>
            </div>
          </div>
        )}

        {connected && googleEvents.length === 0 ? (
          <div className="calendar-empty">
            <span className="calendar-empty-time">All day</span>
            <div><strong>Your Google Calendar is clear today.</strong><p>No events were returned from your primary calendar.</p></div>
          </div>
        ) : connected ? (
          <ol className="operator-agenda">
            {googleEvents.map((event) => (
              <li key={event.id}>
                <time dateTime={event.start}>{eventTime(event)}</time>
                <span className="agenda-rule" aria-hidden="true" />
                {event.htmlLink ? (
                  <a className="agenda-event" href={event.htmlLink} target="_blank" rel="noreferrer">
                    <strong>{event.title}</strong>
                    <span>{event.location || (event.allDay ? "All-day event" : `${format(new Date(event.start), "h:mm a")}–${format(new Date(event.end), "h:mm a")}`)}</span>
                  </a>
                ) : (
                  <div className="agenda-event"><strong>{event.title}</strong><span>{event.location || "Google Calendar"}</span></div>
                )}
              </li>
            ))}
          </ol>
        ) : dashboardSchedule.length > 0 ? (
          <>
            <p className="calendar-fallback-label">Dashboard appointments</p>
            <ol className="operator-agenda">
              {dashboardSchedule.map((item) => (
                <li key={item.id}>
                  <time dateTime={item.at}>{item.time}</time>
                  <span className="agenda-rule" aria-hidden="true" />
                  <button className="agenda-event" onClick={() => onGo("pipeline", item.prospectId)}>
                    <strong>{item.title}</strong><span>{item.detail}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      <div className="operator-day-grid">
        <section className="operator-day-panel">
          <header><span className="operator-eyebrow">Suggestions</span><h3>{brief.headline}</h3></header>
          {brief.focus.length === 0 ? <p className="empty">Nothing pressing. Use the open space deliberately.</p> : (
            <ol className="operator-suggestions">
              {brief.focus.slice(0, 4).map((line, index) => <li key={line}><span>{String(index + 1).padStart(2, "0")}</span><p>{line}</p></li>)}
            </ol>
          )}
        </section>

        <section className="operator-day-panel">
          <header><span className="operator-eyebrow">Updates</span><h3>What changed or needs you</h3></header>
          {updates.length === 0 ? <p className="empty">Nothing urgent right now.</p> : (
            <ul className="operator-updates">
              {updates.map((item) => (
                <li key={item.id}><button onClick={() => onGo(item.target === "todo" ? "todo" : "pipeline", item.prospectId)}><strong>{item.title}</strong><span>{item.detail}</span></button></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
