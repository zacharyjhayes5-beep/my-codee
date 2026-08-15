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
npm run dev        # local dev server
npm run build      # tsc -b && vite build — run before every commit
npm run test       # vitest run — must pass before every commit
npm run test:watch # vitest, re-running as files change
npm run lint       # oxlint
```

## Tabs

| Tab | File | What it does |
| --- | --- | --- |
| Operator | `OperatorTab.tsx` | Console-style home: vitals, progress orb, command deck, big goal |
| Progress | `ProgressTab.tsx` | Book of business, earnings, goals, pace, NADP tiers |
| To-Do | `TodoTab.tsx` | Tasks in four urgency buckets, with Obsidian/Gmail import |
| Prospects | `ProspectsTab.tsx` | Household profiles built from Granola call notes |
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

**All-American.** 2026 qualifications for agents contracted 2022 or after,
shown on the Progress tab below the tiers. Two alternative paths — $11,000 new
life commission + 35 life policies, or $9,000 + 50 — and both additionally need
85% 36-month life persistency and 1 new annuity, so those two are rendered once
above the path cards rather than repeated in each.

He confirmed the commission threshold is measured on **gross** commission, not
net — the multiplier bonus does not count toward it. Annuities are excluded
from the All-American life policy count because the guide lists them as their
own requirement; `annuity: true` in `lib/policies.ts` marks them, and
`lifeBreakdown()` does the split. This is deliberately *not* how the goal
meters and tier gauges count life, which keep annuities in.

**Theme.** Single dark theme, neon blue (`--accent`) and neon red
(`--neon-red`). No light mode. Console styling on the Operator tab: monospace
labels, bracketed panel corners, uppercase headers. Pulsing animation is
rationed to things worth looking at and must stay behind
`prefers-reduced-motion`.

**No new dependencies** unless there's a real reason. The force-directed
graph, the gas tanks and the progress orb are all hand-rolled SVG.

## Storage

**Everything goes through `lib/repository.ts`. No component may touch
`localStorage` or `indexedDB` directly** — that seam is the whole point of
phase 1, and the backup depends on it being the only door.

- **IndexedDB** (`fb-dashboard`, v2) holds records: `prospects`, `policies`,
  `tasks`, `suggestions` and `calls` as one row per record keyed by `id`, plus
  `reviews` and `audit` — created empty and **not read or written by anything
  yet** — and a `meta` store for `dismissed`, the migration flag and the
  prospect schema version. `lib/db.ts` has the primitives.
- **localStorage** holds small settings only: `fb-dashboard:period`, `:owner`,
  `:persistency`, `:lines:v3`.
- The cache is filled by `initRepository()` in `main.tsx` *before* the first
  render, which is why `useStored` can stay synchronous and no component had to
  become async. Don't move storage reads into components.
- Writes are queued (`whenPersisted()` awaits them) so two fast edits to one
  collection can't race on the store-wide rewrite.

**Legacy localStorage record keys are still there on purpose.** Migration
copied them into IndexedDB and left the originals as a frozen rollback point —
frozen, not mirrored, so they stop reflecting reality the moment he edits
anything. Removing them is a later phase, and the honest prerequisite is that
he has a v2 backup he trusts.

`lib/migrate.ts` still carries the pre-v3 shapes forward and runs as part of
the migration; add a step there rather than orphaning his data.

## Calls

`lib/calls.ts` holds everything derived from call records. Two rules matter:

**Counters are never stored on the prospect.** `attemptCounts()` reads them off
the call list every time, so correcting a mis-logged call corrects the tally
with no reconciliation step. `attempts` counts only the two no-answer
outcomes — the dials the seven-attempt cap counts — and `voicemails` is the
subset that left a message. A connected call is not an attempt.

**The three latest-call fields are recomputed, never patched.**
`withLatestCallFields()` takes the whole list and rewrites `lastOutcome`,
`lastOutcomeAt` and `lastContactedAt` from whichever call is newest *by when it
happened*, not by when it was typed. That is what makes editing or deleting the
newest call settle to the right answer instead of leaving a stale outcome
behind, and what clears the fields when the last call goes. `lastContactedAt`
counts any logged call, answered or not.

Deleting a household deletes its calls and its rule-made tasks with it; tasks
he typed by hand survive.

## Outcome rules

`lib/rules.ts` is the engine. **`RULE_CONSTANTS` at the top is the only place
any cap or cadence may live** — 7 attempts, 3 voicemails, 2/3-day callbacks,
1-then-2-month nurture. Never hard-code one of those numbers anywhere else.

**The engine is a replay, not an incremental patch.** `replayCalls()` sorts a
household's calls oldest-first and walks them; whatever state it ends on is the
truth. That is what makes correcting or deleting a call in the middle of a run
come out right — there is no accumulated state to unwind, only the same walk
over a shorter list. Counters, the caps and the nurture sequence all fall out
of the walk.

`reconcileProspect()` applies it. Two rules govern what it may touch:

- **Tasks:** only rule-generated (`ruleId` set), still-open tasks for that
  household are rebuilt. A hand-typed task is never modified. A *completed*
  rule task is left alone — it records something that actually happened.
- **Stage:** `applyStage: true` when a call is newly logged, because that is an
  explicit act and its rule wins even over a hand-moved stage. `false` when a
  call is edited or deleted, so a deliberate manual override outlives a later
  correction. `stageSource` / `stageCallId` carry the provenance; when the last
  call is deleted the stage stays put but stops claiming a rule set it.

Two outcomes block saving until one more field is filled: **Hot Lead** needs a
next action, **Insurance Review Scheduled** needs the appointment date. The
rules cannot produce a sensible follow-up without them. The conversion score is
prompted beside a hot lead and applied only if a number is typed — never
inferred.

## Prospect schema v4

`lib/prospectSchema.ts` holds `normalizeProspect()` — **the only place that
decides what an old record becomes**. It runs from three directions: the
database upgrade on boot, a v1/v2 backup restore, and the v1-leads migration in
`migrate.ts`. It is idempotent, so a current record passes through untouched.
Never write a second conversion; extend that one.

The old six-value `status` is gone, split into `stage` (10 values),
`closedReason`, `priorityGrade`, `conversionScore`, `lastOutcome`,
`lastOutcomeAt`, `lastContactedAt`, `nextAction`, `nextActionDate`.
`nextStep` became `nextAction`.

| Old status | Stage | Closed reason |
| --- | --- | --- |
| New | New | — |
| Contacted | Contacted | — |
| Meeting Scheduled | Review Scheduled | — |
| Open to Quote | Quoting | — |
| Closed | Closed | `legacy-unknown` |
| Lost | Closed | `lost` |

**Migration invents nothing.** Contacts start empty, the structured `address`
starts blank, and `conversionScore`, `priorityGrade`, `lastOutcome`,
`lastContactedAt` and `nextActionDate` all come out empty. `area` is untouched
because the Lead Map clusters on it — the structured address sits alongside it,
not instead of it. A guessed score or an invented follow-up date reads as fact
and is worse than a blank.

**Storage is per origin, and this has already confused him once.** The live
site and a local dev server are two unconnected sets of data — work entered on
one is invisible on the other, and looks to him like the dashboard "lost" it.
Before treating missing data as a bug, ask which address he entered it on.
`components/BackupPanel.tsx` is the bridge: it exports every `fb-dashboard:`
key to a JSON file and restores it anywhere. It reads the prefix rather than a
fixed list, so a new key is included automatically — but a key that does *not*
carry the prefix will be silently left out of backups.

## How to verify work

`npm test` runs vitest over `src/lib/*.test.ts` — the commission and policy
calculations, the localStorage→IndexedDB migration, and the backup formats.
Tests run in Node against `fake-indexeddb`, so the repository's real database
code is exercised rather than a stand-in; `src/test/setup.ts` installs that and
a localStorage shim. Every expected value was worked out by hand off his
workbook.
**If a change makes one of those fail, the change is wrong until proven
otherwise, not the test.** Everything else is still verified by driving the
real app in a browser and checking figures against hand calculation. Playwright
with the system Chromium works. Don't report something as working without
having actually run it.

## v1 direction — locked, don't relitigate

The dashboard is becoming a Farm Bureau sales operating system, evolved in
place. Full spec lives in an artifact outside the repo; these are the decisions
that would be expensive to lose:

- **Local-first stays.** No backend, no cloud database, no browser-side AI key,
  no automatic Granola integration. Granola remains the system of record for
  raw transcripts — the dashboard stores structured reviews, summaries and a
  source reference, not transcript bodies.
- **AI never writes directly.** External review produces a proposal that lands
  in the review inbox. Nothing touches a prospect until he approves or edits it.
- **IndexedDB before call history.** Records (prospects, calls, tasks, reviews,
  policies, audit) move to IndexedDB; small config stays in localStorage. The
  backup file must be extended to span both stores *in the same phase* — an
  un-extended backup would silently export an almost-empty file.
- **Household is the core record**, with contacts underneath it carrying DOB,
  phone, email and quote-readiness per person.
- **Six separate prospect dimensions**: pipeline stage, quality, conversion
  score, most recent call outcome, next action, next-action date. Plus
  last-contacted. The single `status` field is being split into these.
- **Quality is an editable A–D priority grade** — A strategic, B strong fit,
  C callable but unproven, D lower priority. It is for prioritisation, *not* an
  estimate of likelihood to buy. Conversion score (1–10) is the separate
  likelihood read. Never merge the two.
- **Call attempt caps are combined**: 7 total dials per prospect, of which at
  most 3 may leave a voicemail.
- **"Not at This Time"** follows up at +1 month, then +2 months. After the
  second completed follow-up the household goes to Closed — Dormant/Nurture.
  No indefinite automatic timer. Reopened manually on a real trigger: renewal
  timing, referral, new asset or life event, updated contact information.
- **A linked policy never auto-marks a household Won.** It may raise a "Review
  Won status" proposal; he decides.
- **Callback cadence (2 days after no-voicemail, 3 days after a voicemail) is
  an editable rule constant**, not a hard-coded fact. Same for the caps.

## Open questions

1. **Tier reference.** He said the tier tables were out of date and sent a
   replacement, but the PDF was byte-identical to the previous one and the
   photo was the All-American qualifications page, not a tier table. Still
   waiting on a straight-on photo of the pages with the new numbers.
2. **Premium goals.** Per-line premium goals are unset (0), so those meters
   read "no goal set" until he enters targets.
3. **Backup is manual.** Back up / Restore now exist in the header, but he has
   to remember to press the button. Nothing warns him when the last backup is
   old, and nothing carries data between the live site and a local copy on its
   own. The file is format v3; v1 and v2 files still restore, and their
   prospects are migrated to v4 on the way in.
6. **Legacy localStorage records are stale weight.** They were retained as a
   phase 1 rollback point and stop matching reality as soon as he edits
   anything. Decide when to drop them — the prerequisite is a v2 backup he
   trusts, not a code change.
4. **Persistency is typed in.** All-American needs a 36-month life persistency
   figure the book of business cannot produce. It is a manual field on the
   Progress tab (`fb-dashboard:persistency`), so it is only as current as the
   last time he read it off a Farm Bureau report.
5. **"Inforce and retained" is approximated.** The All-American policy count is
   every life policy written in the period. Nothing tracks lapses, so a policy
   that lapses still counts — the real figure could be lower.

## Things he's asked about

Obsidian, second brain, mind maps, the "agentic OS" dashboards circulating on
social media. He has a plain Obsidian vault and no plugins. The To-Do tab
already parses dropped Obsidian notes and Gmail `.eml` files into
suggestions. A local session can read the vault directly — that was the main
reason for moving to the desktop app.
