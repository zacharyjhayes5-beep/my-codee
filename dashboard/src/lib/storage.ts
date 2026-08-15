/**
 * Small shared helpers. The `useLocalStorage` hook that used to live here is
 * gone — components go through `repository.ts` now, which is the only place
 * that decides whether something belongs in IndexedDB or localStorage.
 *
 * `readJson` stays because the legacy migration in `migrate.ts` still has to
 * read the old localStorage keys.
 */

export function readJson<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : null;
  } catch {
    return null;
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
