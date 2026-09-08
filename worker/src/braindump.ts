/**
 * Splitting a braindump, server-side.
 *
 * The only reason this route exists is the API key. It has to stay out of the
 * browser bundle, so the dashboard posts the text here and this forwards it.
 * Everything else about the feature works without it — the client has its own
 * splitter and uses it whenever this returns anything but a clean answer, so
 * a missing key degrades the tab rather than breaking it.
 */

export type BraindumpCategory = "completed" | "thoughts" | "todo" | "questions";

export interface SortedItem {
  category: BraindumpCategory;
  text: string;
}

const CATEGORIES: BraindumpCategory[] = ["completed", "thoughts", "todo", "questions"];

/**
 * Kept identical to `dashboard/src/lib/braindump.ts`. Two copies of a prompt
 * is one too many, but the Worker and the dashboard are separate bundles with
 * no shared module, so the duplication is declared here rather than hidden.
 */
export const SORT_SYSTEM = `You sort a working insurance agent's spoken braindump into four buckets.

Split the text into one item per distinct thing said. Do not merge two thoughts into one item, and do not split a single thought into fragments. Keep the agent's own words — tidy the grammar of dictation, never reword the substance, never add detail he did not say.

Assign each item exactly one category:
- "completed": something already done. Past tense — calls made, quotes sent, people met.
- "todo": something he still owes. An intention, an obligation, a next step.
- "questions": something he does not know and needs an answer to, whether or not he phrased it as a question.
- "thoughts": observations, ideas, opinions, worries. Anything that is not one of the other three.

Reply with JSON only, no prose and no code fence:
{"items":[{"category":"todo","text":"..."}]}`;

/**
 * Pull the JSON object out of a model reply.
 *
 * Models wrap JSON in prose or a code fence often enough that trusting the
 * whole body to parse is a guaranteed intermittent failure. The first
 * balanced `{...}` is taken instead.
 */
export function extractItems(reply: string): SortedItem[] {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }

  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  return items
    .map((raw) => {
      const row = raw as { category?: unknown; text?: unknown };
      const text = typeof row.text === "string" ? row.text.trim() : "";
      const category = CATEGORIES.includes(row.category as BraindumpCategory)
        ? (row.category as BraindumpCategory)
        : "thoughts";
      return { category, text };
    })
    .filter((i) => i.text.length > 0);
}

export interface SortEnv {
  /** Set with: wrangler secret put ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY?: string;
}

/**
 * Returns the split, or null when it could not be produced for any reason.
 * Null is not an error worth explaining to the client — it falls back — so
 * the caller answers 502 and the dashboard files locally instead.
 */
export async function sortBraindump(text: string, env: SortEnv): Promise<SortedItem[] | null> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key || !text.trim()) return null;

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: SORT_SYSTEM,
        messages: [{ role: "user", content: text }],
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const body = (await response.json().catch(() => null)) as {
    content?: { type?: string; text?: string }[];
  } | null;

  const reply = (body?.content ?? [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  const items = extractItems(reply);
  return items.length > 0 ? items : null;
}
