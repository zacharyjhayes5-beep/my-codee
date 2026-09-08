# Braindump tab — implementation handoff

Target: `zacharyjhayes5-beep/my-codee`, `dashboard/` (React + Vite + TS,
IndexedDB via `lib/repository.ts`).

**Status: implemented.** This file is the record of what was asked for and
where it deviates from what was built. `Braindump.dc.html` was never
committed to the repo, so the tab was built from this written spec and the
dashboard's existing visual language rather than from the design file.

## What the tab does

A single always-open textarea. Dictation goes straight into it. ~2.2s after
the last keystroke (or ⌘/Ctrl+Enter), the text is filed:

- split into one item per distinct thing said
- each item assigned to `completed` | `thoughts` | `todo` | `questions`
- items land on the currently selected date; the raw dump is kept verbatim
  with a timestamp
- checking a `todo` moves it to `completed`; unchecking moves it back
- date tabs across the middle switch days

## Data model

One record store, one row per item *and* one row per raw dump, told apart by
`kind`. See `BraindumpRow` in `dashboard/src/types.ts`.

## Storage

- `lib/db.ts` — `"braindump"` added to `RECORD_STORES`, `DB_VERSION` 5 → 6.
  `onupgradeneeded` creates any missing store, so no migration code.
- `lib/repository.ts` — cache, boot read, snapshot and `replaceAll`, all
  mirroring `meetings`.
- `lib/backup.ts` — carried in the export, so `BackupPanel` ships it.

## The sort call

`window.claude.complete` only exists in the design host. The dashboard posts
to the existing Cloudflare Worker instead, so the API key stays server-side:

```
POST /braindump/sort   { text }   ->   { items: [{ category, text }] }
```

`worker/src/braindump.ts` forwards to `api.anthropic.com` with
`claude-haiku-4-5`, `max_tokens: 1024` and `SORT_SYSTEM`. It returns 502 on
any failure and the client falls back to its own splitter.

The route sits behind the same bearer auth as every other route, and the
client reuses `readSyncSettings()` from `lib/gisSync.ts` — no second config
path.

**Set the secret before it can work:**

```sh
cd worker && npx wrangler secret put ANTHROPIC_API_KEY && npx wrangler deploy
```

Until then the tab files locally and says so. That is deliberate: the
heuristic splitter in `lib/braindump.ts` is good enough to ship on its own,
so the tab is useful the moment it renders.

## Deviations from this spec, and why

1. **Styling is in `theme.css`, not `App.css`.** `App.css` is the legacy
   sheet CLAUDE.md describes as shrinking over time, and every tab built
   since has gone in `theme.css`. Same class naming, same tokens.
2. **`labelFor` builds its own string** rather than handing the date to a
   locale. `en-GB` abbreviates September to "Sept" and `en-US` puts the
   month first; the spec says `Mon 7 Sep`, so the order and the abbreviation
   are chosen explicitly.
3. **No design file to port.** Colours, spacing and the four animations come
   from this document and the existing design system. If
   `Braindump.dc.html` lands in the repo later, the styling should be
   reconciled against it.

## Acceptance

All verified in the browser against the real app:

- three sentences of mixed content split into the right four columns
- checking a to-do strikes it through, moves it to Completed, counts update
- unchecking sends it back to To-do
- reload keeps everything
- yesterday's tab shows only yesterday
- with no Worker configured, filing still works and reads "Filed locally"
- backup carries the braindump rows

`npm run lint` and `npm test` clean in `dashboard/` and `worker/`.
