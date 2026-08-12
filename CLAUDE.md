# Agency Dashboard — project context

Read this first. It's the working context for the project so a fresh session
doesn't have to re-derive decisions that were already made.

## Who this is for

Zach Hayes, a Farm Bureau Insurance agent in Michigan, in the New Agent
Development Program (NADP 6.0). He is not a programmer — explain things in
plain language, don't assume familiarity with code, and prefer doing the work
over handing back instructions.

## What it is

A single-page dashboard for tracking his book of business, deployed to GitHub
Pages. No backend, no database. Everything lives in the browser's local
storage on whatever machine he opens it on.

- Repo: `zacharyjhayes5-beep/my-codee` (note the double *e* — the local git
  remote may still say `my-code`, which redirects)
- Live: https://zacharyjhayes5-beep.github.io/my-codee/
- Deploy: pushing to `main` triggers `.github/workflows/deploy-pages.yml`
- App lives in `dashboard/`; `vite.config.ts` sets `base: '/my-codee/'` —
  this matches the repo name and must not be "fixed"

## Commands

```sh
cd dashboard
npm install
npm run dev      # local dev server
npm run build    # tsc -b && vite build — run before every commit
npm run lint     # oxlint
```

## Tabs

| Tab | File | What it does |
| --- | --- | --- |
| Operator | `OperatorTab.tsx` | Console-style home: vitals, progress orb, command deck, big goal |
| Progress | `ProgressTab.tsx` | Book of business, earnings, goals, pace, NADP tiers |
| To-Do | `TodoTab.tsx` | Tasks in four urgency buckets, with Obsidian/Gmail import |
| Prospects | `ProspectsTab.tsx` | Profiles built from Granola call notes |
| Lead Map | `LeadMap.tsx` | Force-directed graph of prospects, lines and areas |

## Decisions already made — don't relitigate these

**Goals.** Property 40 policies, Casualty 40, Life 25. Period runs
2026-01-01 → 2027-01-01. He gave the end date; the start is an assumption he
has been told about and can edit on the Progress tab.

**Book of business formulas.** Ported from his own spreadsheet and must stay
exactly this:

```
Gross Commission = Premium × Percentage Earned
Net Commission   = Gross + (Gross × Multiplier)
```

Three books mirror his workbook's sheets: Personal, Life (adds death benefit
and a running count), Commercial (company name and notes). A month filter
stands in for the twelve monthly sheets.

**One source of truth.** Policy counts and premium are *derived* from the
book of business, never typed twice. `PolicyLine` holds only the goals.
Line of business is a catalog in `lib/policies.ts`, each option mapped to a
property/casualty/life category, which is what drives the meters and gauges.

**NADP tiers.** From the commission multiplier table (Part V, month-6 row) of
the 2026 Agency Compensation guide. He chose ascending — Tier 3 is the top:

| Tier | Multiplier | Property + Casualty | Life |
| --- | --- | --- | --- |
| Tier 1 | 0.50× | 50 | 12 |
| Tier 2 | 0.70× | 63 | 18 |
| Tier 3 | 1.00× | 77 | 24 |

Property and Casualty are counted **together** because the guide's P/C table
is one combined policy count. Targets live in `monthSixTiers` in
`lib/defaultData.ts`; other month rows from the same table drop in there.

**Theme.** Single dark theme, neon blue (`--accent`) and neon red
(`--neon-red`). No light mode. Console styling on the Operator tab: monospace
labels, bracketed panel corners, uppercase headers. Pulsing animation is
rationed to things worth looking at and must stay behind
`prefers-reduced-motion`.

**No new dependencies** unless there's a real reason. The force-directed
graph, the gas tanks and the progress orb are all hand-rolled SVG.

## Local storage keys

`fb-dashboard:` prefixed — `lines:v3`, `policies`, `tasks`, `suggestions`,
`dismissed`, `prospects`, `period`, `owner`. `lib/migrate.ts` carries old
shapes forward; add a migration rather than orphaning his data.

## How to verify work

There are no unit tests. Verify by driving the real app in a browser and
checking computed figures against hand calculation — that's how every feature
so far was checked. Playwright with the system Chromium works. Don't report
something as working without having actually run it.

## Open questions

1. **Tier reference.** He said the tier tables were out of date and sent a
   replacement, but the PDF was byte-identical to the previous one and the
   photo was the All-American qualifications page, not a tier table. Still
   waiting on a straight-on photo of the pages with the new numbers.
2. **All-American tracking.** Not built. The 2026 qualifications for agents
   contracted 2022 or after are two alternative paths: $11,000 new life
   commission + 85% 36-month life persistency + 35 new inforce and retained
   life policies + 1 new annuity, **or** $9,000 + 85% + 50 policies + 1
   annuity. Would make a natural second set of gauges.
3. **Premium goals.** Per-line premium goals are unset (0), so those meters
   read "no goal set" until he enters targets.
4. **Backup/restore.** Local storage is one "clear browsing data" away from
   gone. An export-to-file and import button has been suggested and not built.

## Things he's asked about

Obsidian, second brain, mind maps, the "agentic OS" dashboards circulating on
social media. He has a plain Obsidian vault and no plugins. The To-Do tab
already parses dropped Obsidian notes and Gmail `.eml` files into
suggestions. A local session can read the vault directly — that was the main
reason for moving to the desktop app.
