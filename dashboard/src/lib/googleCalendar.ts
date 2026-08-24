export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
/** OAuth client IDs identify public browser apps; unlike client secrets, this belongs in the client. */
export const DEFAULT_GOOGLE_CALENDAR_CLIENT_ID =
  "189807205799-d77qdgf3j61te1or9s0rv9iihfsabr4p.apps.googleusercontent.com";

const GIS_SCRIPT = "https://accounts.google.com/gsi/client";
const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  htmlLink: string;
}

interface GoogleEventResource {
  id?: string;
  summary?: string;
  status?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleIdentityWindow extends Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: {
          client_id: string;
          scope: string;
          callback: (response: TokenResponse) => void;
          error_callback?: (error: { type?: string }) => void;
        }): TokenClient;
        revoke(token: string, callback?: () => void): void;
      };
    };
  };
}

let scriptPromise: Promise<void> | null = null;

export function isGoogleClientId(value: string): boolean {
  return /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(value.trim());
}

function loadGoogleIdentity(): Promise<void> {
  const googleWindow = window as GoogleIdentityWindow;
  if (googleWindow.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  const loading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");

    const loaded = () => {
      if (googleWindow.google?.accounts.oauth2) resolve();
      else reject(new Error("Google authorization did not load."));
    };
    const failed = () => reject(new Error("Google authorization could not be loaded."));

    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = GIS_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  scriptPromise = loading;

  return loading;
}

/**
 * Opens Google's own account picker and consent dialog. The short-lived access
 * token is returned to the caller and is deliberately never persisted.
 */
export async function authorizeGoogleCalendar(clientId: string): Promise<string> {
  const normalized = clientId.trim();
  if (!isGoogleClientId(normalized)) throw new Error("Enter a valid Google OAuth client ID.");

  await loadGoogleIdentity();
  const googleWindow = window as GoogleIdentityWindow;

  return new Promise((resolve, reject) => {
    const client = googleWindow.google!.accounts.oauth2.initTokenClient({
      client_id: normalized,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Access was not granted."));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) => {
        reject(new Error(error.type === "popup_closed" ? "Google sign-in was closed." : "Google sign-in could not open."));
      },
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export function revokeGoogleCalendar(accessToken: string): Promise<void> {
  const googleWindow = window as GoogleIdentityWindow;
  if (!accessToken || !googleWindow.google?.accounts.oauth2) return Promise.resolve();
  return new Promise((resolve) => googleWindow.google!.accounts.oauth2.revoke(accessToken, resolve));
}

function localDayBounds(day: string): { timeMin: string; timeMax: string } {
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date);
  const end = new Date(year, month - 1, date + 1);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

export function normalizeGoogleEvents(items: GoogleEventResource[]): GoogleCalendarEvent[] {
  return items
    .filter((item) => item.status !== "cancelled" && item.start && item.end)
    .map((item) => {
      const allDay = Boolean(item.start?.date);
      return {
        id: item.id || `${item.start?.dateTime || item.start?.date}-${item.summary || "event"}`,
        title: item.summary?.trim() || "Busy",
        start: item.start?.dateTime || item.start?.date || "",
        end: item.end?.dateTime || item.end?.date || "",
        allDay,
        location: item.location?.trim() || "",
        htmlLink: item.htmlLink || "",
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchGoogleCalendarDay(
  accessToken: string,
  day: string,
): Promise<GoogleCalendarEvent[]> {
  const bounds = localDayBounds(day);
  const params = new URLSearchParams({
    timeMin: bounds.timeMin,
    timeMax: bounds.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const response = await fetch(`${EVENTS_ENDPOINT}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) throw new Error("Your Google session expired. Connect again.");
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || "Google Calendar could not be loaded.");
  }

  const body = (await response.json()) as { items?: GoogleEventResource[] };
  return normalizeGoogleEvents(body.items ?? []);
}
