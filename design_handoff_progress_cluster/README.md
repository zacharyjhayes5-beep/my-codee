# Handoff: Progress Cluster (Command Center)

## Overview
The Progress tab of the Agency Control Center, redesigned as a car instrument
cluster. Two gauges came out of the design review and both are wanted:

- **Cluster** — a binnacle in the language of a Shelby GT500 dash: a racetrack
  "comb" scale for policies written, a trip readout in the middle, a round
  weekly-rate dial on the right, raked segment strips for pipeline temperature
  and tank level.
- **Fuel** — the same period read as a jerry can filling up, with a small can
  per line of business and a weekly fuel-flow chart.

A two-button switch (CLUSTER / FUEL) toggles them. Everything else on the
Progress tab — period bar, stat row, Book of Business, Goals, Tier, All
American — is unchanged.

## About the Design Files
`Command Center.dc.html` in this bundle is a **design reference created in
HTML** — a prototype of the intended look, not production code to copy. It
contains four options from the review; the ones that matter are **2a** (the
cluster) and **1c** (the fuel can), both in the top two sections of the file.
Open it in a browser to see them.

**This bundle also contains real implementation code** written against the
target repo (`zacharyjhayes5-beep/my-codee`, branch `main`, app at
`dashboard/` — React 18 + TypeScript + Vite). Those files in
`implementation/` are meant to be dropped in as-is, not re-derived:

| File | Destination |
| --- | --- |
| `implementation/ClusterGauge.tsx` | `dashboard/src/components/ClusterGauge.tsx` |
| `implementation/TankCluster.tsx` | `dashboard/src/components/TankCluster.tsx` |
| `implementation/ProgressTab.patch.tsx` | split: the `ProgressGauges` component → `dashboard/src/components/ProgressGauges.tsx` |
| `implementation/cluster.css` | append verbatim to `dashboard/src/App.css` |

Then one line in `dashboard/src/components/ProgressTab.tsx`, inside the first
`<div className="p3d-deck">`, after the `.period-bar` block and **before**
`<div className="stat-row earnings-row dolly">`:

```tsx
<ProgressGauges lines={lines} period={period} entries={entries} />
```

…plus `import { ProgressGauges } from "./ProgressGauges";` at the top.

## Fidelity
**High-fidelity.** Geometry, type sizes and layout are final. One deliberate
deviation from the HTML prototype: the prototype is coloured papaya/cyan on
carbon, while the implementation is built **entirely on the app's existing
Nocturne tokens** (violet `--accent`, `--cognac-2`, `--series-1/2/3`,
`--attention`, `--success`, `--danger`, `--metal`). Use the tokens, not the
prototype's hexes — the prototype had no access to the token sheet.

## Screens / Views

### 1. Progress → Cluster view (design option 2a)
**Purpose:** answer "am I going to hit the goal, and how hard do I have to
drive" in one glance.

**Layout:** CSS grid, three columns —
`minmax(0,590px) minmax(240px,1fr) 300px`, `align-items:center`, gap 12px,
padding `16px 24px 12px`, `border-radius:26px`, 1px `--border`, background is
two radial gradients of `--surface-2` (58% 88% at 20% 42%, and 46% 88% at 86%
46%) over `--page`, plus `inset 0 1px 0 rgba(238,233,228,.06)` and
`--shadow-2`. Under 1180px it collapses to a single centred column.

**Components:**

1. **Policy comb** (left pod) — SVG, `viewBox="0 0 620 330"`, full width,
   `overflow:visible`. One path is the scale:
   `M170 300 A130 130 0 1 1 170 40 L560 40` — a half-circle up the left side
   (centre 170,170 r130) then a straight rail across the top. It is drawn three
   times: track (`--gridline`, 15px), fill (15px, `pathLength=100`,
   `strokeDasharray="{writtenPct} 100"`, linear gradient `--navy-2` → 
   `--text-primary` at x1=0,y1=1 → x2=1,y2=0), and pace mark (`--cognac-2`,
   17px, `strokeDasharray="0.5 99.5"`, `strokeDashoffset={-expectedPct}`).
   43 ticks are placed along the same parameterisation, radius 130 → 114 for
   minors (1.4px `--metal`) and 130 → 100 for majors (3px `--text-primary`),
   every 6th tick major; ticks past 87.5% of the goal turn `--danger` — the
   redline. Major ticks carry a label at radius 88, 27px 500, tabular nums.
   Centre readout, all anchored middle at x=370: value 96px/700 at y=200,
   `POLICIES · GOAL {n}` 12px mono at y=232, the verdict
   `{n} BEHIND · MARK AT {n}` 13px mono `--attention` (or `ON PACE …` in
   `--success`) at y=266, and `RED ZONE = FINAL {n}` 11px mono `--text-muted`
   at y=294. Letter-spacing 0.14em on all three mono lines.

2. **Trip readout** (centre) — flex column, 1px `--border` rules between
   blocks. Title "Period" 16px/500. Three rows on a
   `18px 1fr auto` grid, baseline-aligned, 11px gap: an 11px square swatch
   (`--series-1` premium, `--series-3` commission, `--series-2` households),
   the value 19px/600 tabular, the unit 11px mono `--text-secondary`
   letter-spacing 0.1em, `white-space:nowrap`. Then
   `HOLD ⌘K TO OPEN THE BOOK` (11px mono, `kbd` in a 1px `--border` box), then
   the foot row: `{daysLeft} days` / **OFF PACE** (20px/600, letter-spacing
   0.22em, `--attention`; `ON PACE` in `--success`) / `{remaining} to go`.

3. **Weekly-rate dial** (right pod) — SVG `viewBox="0 0 300 300"`, 292×292.
   Scale sweeps 240° starting at 150° (so zero sits at lower-left, max at
   lower-right). 41 ticks: minors radius 116 → 102 (1.4px `--metal`), every
   8th major 118 → 92 (3px `--text-primary`) with a 24px/500 label at radius
   84. Inner disc: circle r58, no fill, 2.5px `--text-secondary`. Inside it
   `PER WK` 11px mono at y=126 and the live rate 62px/700 at y=184;
   `NEED {n} / WK` 11px mono `--attention` at y=248, below the disc. Two
   pointers, both rotating about 150,150: a fixed `--danger` index for the
   required rate (line y 34→64, 4px) and the live pointer (line y 34→78, 5px
   round `--text-primary`, plus a r4 dot at y=84) — an **outer-ring** pointer
   with no centre hub, so it never crosses the digits. Transition
   `transform 600ms var(--ease)`.

4. **Raked strips** — one under each pod. `COLD`/`HOT` and `E`/`F` end labels
   11px mono, twelve bars 4×11px with `transform:skewX(-14deg)` and 3px gaps,
   unlit `--gridline`, lit `--accent`, the tail bar `--danger`, then a note in
   10px mono `--text-muted` letter-spacing 0.12em
   (`PIPELINE TEMP · {n} QUOTES OUT`, `TANK {n}%`).

### 2. Progress → Fuel view (design option 1c)
**Purpose:** the emotional read — how much is left in the can.

**Layout:** grid `320px minmax(0,1fr)`, gap 24px, padding 24px, 1px
`--border`, `--radius-lg`, background `--surface-1`.

**Components:**

1. **Hero can** — SVG `viewBox="0 0 200 300"`, 186×279, drawn from rectangles
   only (no organic path): handle `rect 46,40 58×30 rx12` (stroke `--metal`
   4px, no fill), cap `rect 118,44 36×28 rx7`, body `rect 40,70 120×200 rx16`
   (fill `--surface-2`, stroke `--metal` 3px). Cavity y 70 → 270 is a
   clipPath; the liquid is a rect from the surface down, filled with a vertical
   `--navy-3` → `--navy-2` gradient, a 3px `--navy-3` surface line, and four
   graduation rules at y 96/140/184/228 in `rgba(238,233,228,.1)`. An embossed
   `rect 62,118 76×76 rx10` (1px `--border`) sits on the face, with the
   percentage 40px/700 `--on-accent` at y=252. Liquid transitions
   `y, height 600ms var(--ease)`.
   To its right a 200px-tall column of scale marks, space-between:
   `F · {goal}`, 75%, 50%, 25% (in `--attention`), `E · 0`, 10–11px mono.
   Below: `{written}` 56px/700 + "in the tank · {remaining} to fill" 12px, and
   a pill — 7px dot + `{n} BEHIND PACE` — 10px mono on `--attention-soft`
   (`--success-soft` + `ON PACE` when on pace).

2. **Mini cans** — three cards on a 1fr×3 grid, gap 12px, padding 16px,
   `--surface-2`, 1px `--border`, `--radius-lg`. Each holds a 38×61 can
   (`viewBox="0 0 60 96"`, cavity y 24 → 90, same rect vocabulary) filled with
   that line's `seriesColors` value, then the line name 10px mono in the same
   colour, the count 32px/700 with `/ goal` 13px `--text-muted`, and
   `{n}% FULL` 9.5px mono.

3. **Fuel flow** — header `FUEL FLOW · POLICIES PER WEEK` / `NEED {n} / WK`
   (10px mono, 0.16em), a 118px-tall flex row of bars (`--accent-soft`, the
   best week `--accent`, `--radius-sm` top corners, min-height 4%), and a foot
   row of three 9.5px mono labels: first week, `{week} · BEST WEEK, {n}`, last
   week.

## Interactions & Behavior
- **Gauge switch:** `.gauge-switch` is a `role="group"` of two buttons using
  `aria-pressed`; state is local `useState<"cluster"|"fuel">`, default
  `cluster`. Active button gets `--surface-3` + `--text-primary`; inactive is
  `--text-muted` → `--text-primary` on hover, `--t-fast`.
- **Motion:** only two things move — the dial pointer's `transform` and the
  liquid's `y`/`height`, both 600ms `var(--ease)`. The
  `prefers-reduced-motion` block already in `index.css` neutralises both. No
  entrance animation, no sweep-on-load in the implementation (the HTML
  prototype has one; it was mockup theatre).
- **Hover:** gauges themselves have no hover states. Flow bars carry a
  `title` with the week and count.
- **Empty state:** with nothing written, the comb fill is zero-length, the
  pointer sits at 0, the can is empty, and the flow chart is short. That is
  correct, not broken — do not fake data.
- **Responsive:** at ≤1180px the cluster stacks to one centred column (trip
  readout capped at 420px) and the fuel view goes single-column with the mini
  cans stacked.

## State Management
No new state or fetching. `ProgressGauges` takes `lines`, `period`,
`entries` — the same props ProgressTab already has — and derives:

- `inPeriod` = entries where `effectiveDate >= period.start && < period.end`
- `earnings = totalsFor(inPeriod)` → `.premium`, `.net`
- `derived = countsByCategory(inPeriod)` → `.counts[lineId]`
- `totals` = summed `counts` and `policyGoal` across `lines`
- `pace = readPace(period, totals.policyCount, totals.policyGoal)` — supplies
  `written`, `goal`, `writtenPct`, `expectedTotal`, `remaining`, `perWeek`,
  `onPace`, `behindBy`, `daysLeft`. **Use this, never a local copy** — it is
  the same reading the Operator goal strip shows, and two pace calculations
  drift.
- `weekly` = `inPeriod` bucketed by `format(startOfWeek(effectiveDate), "MMM dd")`
- `ratePerWeek` = mean of `weekly` counts (the live pointer)

Only local state is the view toggle.

## Open questions for the implementer
1. **Households.** The wrapper counts `new Set(e.householdId ?? e.id).size`.
   If `PolicyEntry` names that field differently, point it at the real field —
   or pass the Vault household count down, which is what Operator shows.
2. **Pipeline temp.** The COLD–HOT strip currently reads
   `ratePerWeek / pace.perWeek` and `quotesOut` is `inPeriod.length` as a
   stand-in. If quotes-out lives in the pipeline store, pass the real number.

## Design Tokens
All from `dashboard/src/index.css` — no new tokens, no raw colour:

| Use | Token | Value |
| --- | --- | --- |
| Page ground | `--page` | `#0c0910` |
| Pod / card surface | `--surface-1` / `--surface-2` / `--surface-3` | `#151119` / `#1b151f` / `#241c29` |
| Comb fill, lit segments, flow bars | `--accent` (= `--navy`) | `#766cff` |
| Comb gradient dark end, liquid | `--navy-2` / `--navy-3` | `#5f56d6` / `#8b82ff` |
| Pace mark | `--cognac-2` | `#d8c47a` |
| Redline ticks, dial index, tail segment | `--danger` | `#e58d86` |
| OFF PACE, needed-rate, 25% mark | `--attention` | `#d7b766` |
| ON PACE | `--success` | `#78b58a` |
| Minor ticks, can outlines | `--metal` | `#817b87` |
| Numerals, major ticks | `--text-primary` | `#eee9e4` |
| Units, end labels | `--text-secondary` | `#b7afbc` |
| Notes, captions | `--text-muted` | `#928a99` |
| Track, graduations | `--gridline` | `rgba(238,233,228,.055)` |
| Borders | `--border` | `rgba(238,233,228,.13)` |
| Line swatches / cans | `--series-1/2/3` | `#7c72ff` / `#c5a74e` / `#65a987` |

Spacing uses the 4px scale (`--space-1`…`--space-8`); radii `--radius-sm` 3px,
`--radius` 4px, `--radius-lg` 6px, plus the one bespoke 26px on the cluster
shell (a binnacle, not a card). Type is `--font-sans` for numerals and
`--font-mono` for every label, letter-spacing 0.1–0.22em on mono. All numeric
readouts use `font-variant-numeric: tabular-nums`.

## Assets
None. Every gauge is inline SVG built from paths, rects and circles — no
images, no icon font, no third-party charting. The GT500 dash photo in the
conversation was reference only and is not redistributed here.

## Files
- `Command Center.dc.html` — the design prototype (options 2a and 1c at top,
  1a/1b below as earlier explorations). Needs `support.js` beside it.
- `support.js` — runtime for the prototype only. **Not** part of the
  implementation.
- `implementation/ClusterGauge.tsx`, `implementation/TankCluster.tsx`,
  `implementation/ProgressTab.patch.tsx`, `implementation/cluster.css`,
  `implementation/README.md` — the drop-in code and install notes.
