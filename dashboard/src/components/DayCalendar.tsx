import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { Opportunity, Prospect } from "../types";
import { todaysSchedule } from "../lib/dailyBrief";
import {
  authorizeGoogleCalendar,
  fetchGoogleCalendarDay,
  isGoogleClientId,
  revokeGoogleCalendar,
  type GoogleCalendarEvent,
} from "../lib/googleCalendar";
import { today } from "../lib/storage";

interface DayCalendarProps {
  prospects: Prospect[];
  opportunities: Opportunity[];
  googleCalendarClientId: string;
  onGoogleCalendarClientIdChange: (clientId: string) => void;
  onOpenProspect: (prospectId: string) => void;
}

function eventTime(event: GoogleCalendarEvent): string {
  return event.allDay ? "All day" : format(new Date(event.start), "h:mm a");
}

/**
 * Today's calendar.
 *
 * This was the top of the Operator screen and is now the foot of it. The
 * revamp gives the top of the page to what is *owed* rather than to what is
 * merely scheduled — but a working read-only Google Calendar connection is a
 * real feature with a real OAuth setup behind it, so it is demoted, not
 * deleted. Every line of the connection logic is unchanged.
 */
export function DayCalendar({
  prospects,
  opportunities,
  googleCalendarClientId,
  onGoogleCalendarClientIdChange,
  onOpenProspect,
}: DayCalendarProps) {
  const now = useMemo(() => new Date(), []);
  const day = today();
  const [draftClientId, setDraftClientId] = useState(googleCalendarClientId);
  const [accessToken, setAccessToken] = useState("");
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [calendarState, setCalendarState] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [calendarError, setCalendarError] = useState("");

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

  const dashboardSchedule = useMemo(
    () => todaysSchedule(opportunities, prospects, day),
    [opportunities, prospects, day],
  );

  const connected = calendarState === "connected" || Boolean(accessToken);

  return (
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
                  <button className="agenda-event" onClick={() => onOpenProspect(item.prospectId)}>
                    <strong>{item.title}</strong><span>{item.detail}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>
  );
}
