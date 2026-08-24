# Handoff: Agency Control Center — ink & gold revamp

## Overview

A visual and structural revamp of the agency control center dashboard (`zacharyjhayes5-beep/my-codee`, branch `main`, app root `dashboard/`). Two deliverables:

1. **Reskin + restructure of the existing app** — a dark "quiet luxury" palette (ink ground, champagne gold accent, serif display type) replacing the current cream theme; the left sidebar nav replaced by a top bar; the Operator and Leads screens rebuilt around fewer, better-prioritized panels.
2. **A new Campaigns tab** — a hub-and-spoke channel map with per-channel activity logging. This does not exist upstream.

The brief that drove it, in the user's words: "way too much shit everywhere, no structure, too much volume not enough organization." Every structural decision below is a subtraction. Do not add panels back.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior. They are **not production code to copy**. They are single-file components written in a bespoke streaming-template runtime (`support.js`, `<x-dc>`, `{{ }}` holes, `sc-for`/`sc-if`) that has nothing to do with the target app.

Your job is to **recreate these designs in the existing Vite + React + TypeScript app** using its established patterns: function components in `dashboard/src/components/`, class-based CSS in `dashboard/src/App.css` and `theme.css`, state through the `useStored` repository hooks in `dashboard/src/lib/repository.ts`. Read the HTML for exact values and layout; write idiomatic React and CSS.

Open the HTML files in a browser to see them live and interact with them.

## Fidelity

**High fidelity.** Colors, type, spacing, borders, and hover states are final. Reproduce them exactly. The only intentionally unfinished thing is **content**: every number, name, and label is plausible placeholder data. All of it must be wired to real state (see *State & data wiring*).

---

## Design tokens

The current theme is cream/light. These tokens replace it. Add them as CSS custom properties in `dashboard/src/theme.css` and let the existing component classes read them, rather than hardcoding hexes in components.

### Color

| Token | Value | Role |
| --- | --- | --- |
| `--ink-900` | `#0c0b0f` | Page ground (base) |
| `--ink-800` | `#121116` | Page ground (mid stop) |
| `--ink-700` | `#191720` | Page ground (top stop) |
| `--ink-panel-a` | `rgba(26,24,30,.55)` | Panel fill, top of gradient |
| `--ink-panel-b` | `rgba(13,12,16,.70)` | Panel fill, bottom of gradient |
| `--ink-hero-a` | `rgba(32,29,37,.70)` | Hero panel fill, top |
| `--ink-hero-b` | `rgba(13,12,16,.80)` | Hero panel fill, bottom |
| `--ink-field` | `rgba(10,9,13,.60)` | Input background |
| `--ink-header` | `rgba(14,13,17,.82)` | Sticky header (with `backdrop-filter: blur(10px)`) |
| `--gold-500` | `#c9a86a` | Primary accent — rules, kickers, active nav, primary button fill |
| `--gold-300` | `#dfc9a1` | Accent text, hover states |
| `--gold-200` | `#e0c891` | Active nav label, brightest accent text |
| `--gold-600` | `#a88a52` | Progress fill, low end of gradient |
| `--text-primary` | `#ece9e3` | Body text |
| `--text-secondary` | `#a8a39b` | Supporting text |
| `--text-muted` | `#8f8b84` | Standfirsts, meta |
| `--text-faint` | `#7e7a74` | Micro-labels, small caps labels |
| `--on-gold` | `#14120f` | Text on a gold fill |

Gold at alpha, used for every border and rule:

| Usage | Value |
| --- | --- |
| Header bottom border, hero panel border | `rgba(201,168,106,.20)` |
| Standard panel border | `rgba(201,168,106,.16)` |
| Quiet panel border, grid gap lines | `rgba(201,168,106,.14)` |
| Input border | `rgba(201,168,106,.18)` |
| Row divider inside a panel | `rgba(201,168,106,.10)` |
| Table row divider | `rgba(201,168,106,.07)` |
| Progress track | `rgba(201,168,106,.12)` |
| Row hover wash | `rgba(201,168,106,.05)` |
| Checkbox border (unchecked) | `rgba(201,168,106,.35)` |
| Outlined button border | `rgba(201,168,106,.30)` → hover `rgba(201,168,106,.60)` |
| Input focus border | `rgba(201,168,106,.50)` |

### Channel / semantic hues

Muted jewels, never bright. Used for the campaign channels, policy lines, and status tones.

| Name | Value | Used for |
| --- | --- | --- |
| Slate blue | `#3f6f9e` | Campaign channel I (Mailing) |
| Cognac | `#b0803e` | Campaign channel II (Cold Calls); "Reviewing" stage |
| Terracotta | `#9c5a48` | Campaign channel III (Community); Life line; overdue / quiet / behind |
| Verdigris | `#4f7f75` | Campaign channel IV (Social Media); Property line; "Quoted"; on pace; done |
| Brass | `#c9a86a` | Campaign channel V (Referrals); Casualty line; "New"; due today |
| Grey | `#8f8b84` | "Won"; neutral / no-date |

### Type

Two families only.

- **Display**: `'Cormorant Garamond', Georgia, serif` — weights 300/400/500. Every number that matters, every panel title, every proper name in a list.
- **UI**: `Inter, system-ui, sans-serif` — weights 300/400/500. Labels, body, buttons, table cells.

Google Fonts: `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500&display=swap`

| Role | Family | Size | Weight | Letter-spacing | Case |
| --- | --- | --- | --- | --- | --- |
| Page title | Cormorant | 40px | 400 | .02em | — |
| Hub / big display | Cormorant | 27–33px | 400 | .01em | — |
| Vital figure | Cormorant | 34px | 400 | .01em | — |
| Panel title | Cormorant | 21–25px | 400 | .03em | — |
| Row name (to-do, table) | Cormorant | 19–20px | 400 | .01em | — |
| Wordmark | Cormorant | 17px | 400 | .05em | — |
| Section kicker | Inter | 10px | 400 | .24em | uppercase |
| Nav item | Inter | 11px | 400 | .16em | uppercase |
| Button label | Inter | 10px | 400 | .18em | uppercase |
| Column header | Inter | 9px | 400 | .20em | uppercase |
| Micro-label | Inter | 9–10px | 400 | .20em | uppercase |
| Body / table cell | Inter | 13–14px | 400 | — | — |
| Meta / caption | Inter | 11–12px | 400 | — | — |

**Rule:** every letterspaced uppercase label needs `white-space: nowrap`. At .16–.24em tracking they wrap unpredictably and break their containers.

### Geometry

- **Border radius: 0.** Nothing is rounded except circles (nodes, dots, status pips). This is the single strongest signal of the style — do not soften it.
- Border width: 1px everywhere. No 2px, no heavy strokes.
- Shadows: essentially none. Elevation is an edge plus a gradient. The one exception is the map panel's `box-shadow: 0 24px 48px rgba(0,0,0,.4), inset 0 1px 0 rgba(233,233,237,.03)`.
- Grid seams: instead of borders on cells, use `display: grid; gap: 1px; background: rgba(201,168,106,.14)` on the container with opaque cell fills. Produces true hairlines.

### Spacing

Page gutter 34px. Panel padding 26–34px. Vertical rhythm between sections 26px. Row padding 11–17px vertical. Header height 70px. Nothing tighter than 8px.

### Transitions

`.18s` for color and background on hover. `.25s` for opacity on selection changes. No easing curves beyond the default. No entrance animations.

---

## Structural changes to the existing app

### Navigation — `dashboard/src/App.tsx`

The `.sidenav` goes away. Replace with a sticky top bar, 70px tall, `position: sticky; top: 0; z-index: 20`, `background: var(--ink-header)` + `backdrop-filter: blur(10px)`, bottom border `1px solid rgba(201,168,106,.20)`.

Contents, left to right, `display: flex; align-items: center; gap: 34px; padding: 0 34px`:

1. **Brand** — `flex: 0 0 auto`. A Cormorant "A" at 21px/500 in gold, a 1px × 20px gold-.35 vertical divider, then a two-line block (`flex: 0 0 auto; white-space: nowrap`): "Agency Control Center" (Cormorant 17px, .05em) over "FARM BUREAU · MICHIGAN" (Inter 9px, .22em, uppercase, `--text-faint`).
2. **Nav** — `display: flex; gap: 2px; align-items: stretch; height: 100%`. Each item is a full-height borderless button, 11px uppercase .16em, padding `0 14px`, `white-space: nowrap`. Inactive: `--text-faint`, transparent bottom border. Active: `--gold-200` with a `1px solid var(--gold-500)` bottom border. Hover: `--gold-200`.
3. Spacer (`flex: 1`).
4. **Right cluster** — the date ("Mon 24 Aug", 10px .18em uppercase, `--text-faint`) and a "Search ⌘K" outlined button.

**Destinations drop from eight to five**: Operator, Leads, Pipeline, Campaigns, Vault.

- **To-Do** loses its tab. Its content moves into the Operator hero, and its counts surface in the "Waiting on you" panel.
- **Progress** loses its tab. Collapsed into the goal-pace strip on Operator.
- **Walkthrough** and **Lead Map** come off the nav. Keep the components and routes; reach them from a household record (Walkthrough) and from Leads (Lead Map), not from top-level nav. If a route must remain reachable directly, put it in the command palette only.

The existing `tabs` array with its inline SVG icon paths is no longer needed — the top bar is type-only, no icons.

### Page header

Below the nav, before content. `padding: 34px 34px 12px`, `display: flex; align-items: flex-end; justify-content: space-between; gap: 24px`.

- Left: kicker (10px .24em uppercase gold) over title (Cormorant 40px).
- Right: standfirst, 13px `--text-muted`, `max-width: 380px; text-align: right; text-wrap: pretty`.
- Below both: a 1px rule, `margin: 0 34px 26px`, `background: linear-gradient(90deg, rgba(201,168,106,.4), rgba(201,168,106,.04))`.

Per-destination copy:

| id | kicker | title | standfirst |
| --- | --- | --- | --- |
| operator | Today | Operator | What you owe today, and who is up next. |
| leads | Households | Leads | Every household and the one thing owed to it. |
| pipeline | Open work | Pipeline | Opportunities by stage, and what has gone quiet. |
| campaigns | Outreach | Campaigns | Five channels, logged as you work them. |
| vault | Knowledge | Vault | Everything you have written, searchable. |

---

## Screen: Operator

Replaces `dashboard/src/components/OperatorTab.tsx`. Four sections stacked with 26px gaps.

**Removed from the current implementation, deliberately:** `<CommandCenter>`, `<ProgressOrb>`, the "Command deck" six-button grid, the "Big goal" band, the "Today" ticker row, the "Business snapshot" heading, and the five-item "System vitals" list. Do not reinstate them.

### 1. Hero — to-do list + queue

One bordered section, `display: grid; grid-template-columns: minmax(0,1.25fr) minmax(0,1fr)`, border `rgba(201,168,106,.20)`, background `linear-gradient(140deg, var(--ink-hero-a), var(--ink-hero-b))`, plus an absolutely-positioned non-interactive overlay: `radial-gradient(50% 80% at 12% 30%, rgba(201,168,106,.07), transparent 70%)`.

**Left cell** (`padding: 32px 34px`, right border `rgba(201,168,106,.14)`, `gap: 16px`):

- Header row: "TO-DO" kicker, a flex-1 rule `linear-gradient(90deg, rgba(201,168,106,.3), transparent)`, then a right-aligned count — "`{open} open · {total} total`", 10px .16em uppercase `--text-faint`.
- Task rows. Each: `display: flex; align-items: flex-start; gap: 14px; padding: 13px 0`, top border `rgba(201,168,106,.10)`, whole row clickable, hover wash `rgba(201,168,106,.04)`.
  - Checkbox: 15px square (**not** rounded), `margin-top: 2px`, `flex: 0 0 auto`. Unchecked: `1px solid rgba(201,168,106,.35)`, transparent fill. Checked: `1px solid var(--gold-500)`, fill `var(--gold-500)`, a 10px `✓` in `--on-gold`.
  - Middle: task label (Cormorant 20px; when done → `--text-faint` + `line-through`) over the household name (12px `--text-faint`).
  - Right: due tag, 10px .14em uppercase, `margin-top: 5px`, `white-space: nowrap`. Tone by urgency — overdue terracotta, today/tomorrow brass, later grey, done verdigris.
- Add row: top border, `padding-top: 14px`, `display: flex; gap: 10px`. A flex-1 text input (`--ink-field` bg, `rgba(201,168,106,.18)` border, `padding: 10px 12px`, 13px, focus border `rgba(201,168,106,.50)`, placeholder "Add a task") and an outlined "ADD" button. **Enter in the field must also submit.** Empty/whitespace input is a no-op. On success the field clears.

**Right cell** (`padding: 32px 34px`, `gap: 14px`): "THEN" kicker, then four rows — a Cormorant roman numeral I–IV in gold (20px wide, `flex: 0 0 auto`), the household name (14px) over the reason (12px `--text-faint`), and a right-aligned action tag (10px .14em uppercase, toned, `nowrap`).

Placeholder content, for reference on tone: "The Okonkwo family / New lead, no first call yet / TODAY"; "Simon Vogel / Waiting on the prior dec page / CHASE"; "Renata Silva / Quote going cold at eleven days / QUIET"; "Bud & Ann Kacher / Annual review due this month / SCHEDULE".

### 2. Vitals strip

`display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1px; background: rgba(201,168,106,.14)`, outer border `rgba(201,168,106,.14)`. Each cell: `background: linear-gradient(180deg, rgba(26,24,30,.75), rgba(13,12,16,.85)); padding: 22px 24px`, three stacked lines with 8px gaps — micro-label (9px .20em uppercase `--text-faint`), figure (Cormorant 34px), sub (11px, toned).

Exactly four, in this order: Net commission · Policies written · Households in play · Days remaining. Four, not five, and never more.

### 3. Goal pace + lines

`display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 26px`.

**Left panel** — standard panel border/fill, `padding: 26px 28px`, `gap: 18px`:

- Title row: "Toward {goal} policies" (Cormorant 21px), flex-1 fading rule, then a pace flag (10px .18em uppercase) — verdigris "ON PACE" or terracotta "{n} BEHIND".
- Track: 3px tall, `rgba(201,168,106,.12)`. Fill `linear-gradient(90deg, var(--gold-600), var(--gold-300))` at `width: {pct}%`. Plus a **pace marker**: a 1px vertical line at `left: {elapsedPct}%`, `top: -5px; bottom: -5px`, `rgba(236,233,227,.45)` — this is what makes the bar mean something.
- Caption row, 11px `--text-faint`, space-between: "{written} written · {remaining} to go" and "{n} per week to finish".
- Line cards: `grid-template-columns: repeat(3, 1fr); gap: 1px; background: rgba(201,168,106,.12)`. Each cell `background: rgba(15,14,18,.6); padding: 16px 18px` — a 5px hue dot + line name (10px .16em uppercase `--text-secondary`), then count (Cormorant 20px) with "/ goal" in 13px `--text-faint`, then a 2px hue-filled mini bar.

Lines come from `useStored("lines")`; hues: Property verdigris, Casualty brass, Life terracotta.

**Right panel — "Waiting on you"**: quiet panel border, `padding: 26px 24px`. A gold kicker, then four rows, each a borderless button (`display: flex; justify-content: space-between; align-items: baseline; padding: 13px 0`, top border, hover → `--gold-300`): label (13px) and count (Cormorant 20px, toned). Rows: Overdue tasks (terracotta) · Due today (brass) · Reviews to approve (brass) · Leads missing a phone (grey). Each navigates to the relevant screen.

---

## Screen: Leads

Replaces the table portion of `dashboard/src/components/ProspectsTab.tsx`. `gap: 20px` column.

### Intent filters

A wrapping flex row, 8px gaps. Four buttons, 10px .16em uppercase, `padding: 9px 15px`, each with its count appended in `--text-faint`. Inactive: transparent bg, `rgba(201,168,106,.16)` border, `--text-secondary`. Active: `rgba(201,168,106,.12)` bg, `rgba(201,168,106,.50)` border, `--gold-200`.

Filters are **intents, not stages** — this is the point of the screen. `Needs a move` (default) · `Gone quiet` · `All households` · `Won`.

- *Needs a move*: open, not terminal, and touched recently enough to still be live.
- *Gone quiet*: open but past the staleness threshold (the mock treats ≥11 days as quiet). Derive it from `lastTouchAt` — do not hardcode a boolean.
- *Won*: `stage === "Won"`.

### Table

One bordered panel, standard border and fill. Grid columns `minmax(0,2fr) 1fr 1fr minmax(0,1.6fr) auto`, `gap: 20px`, cell padding `15px 26px` (header) / `17px 26px` (rows).

Header: five 9px .20em uppercase labels — Household, Stage, Lines held, Next step, Last touch (right-aligned). Bottom border `rgba(201,168,106,.18)`.

Rows: bottom border `rgba(201,168,106,.07)`, `align-items: center`, `cursor: pointer`, hover `rgba(201,168,106,.05)`, click opens the household record.

- **Household**: name (Cormorant 19px) over town (11px `--text-faint`).
- **Stage**: 11px .14em uppercase, toned — New brass, Quoted verdigris, Reviewing cognac, Won grey.
- **Lines held**: 13px `--text-secondary`, comma-joined, em dash when none.
- **Next step**: 13px `--text-primary`. **The most important cell on the screen** — full weight, never muted.
- **Last touch**: 11px, right-aligned, `nowrap`. Grey normally, terracotta when quiet.

---

## Screen: Campaigns (new)

A new tab with no upstream equivalent. See `Campaigns Tab.dc.html`. `grid-template-columns: minmax(420px,1fr) 344px; gap: 32px`.

### Channel map (left)

A framed panel: `flex: 1`, border `rgba(201,168,106,.18)`, `background: linear-gradient(180deg, rgba(28,26,33,.6), rgba(13,12,16,.75))`, `padding: 22px`, `overflow: hidden`. Two non-interactive overlays: a centered gold radial wash `radial-gradient(60% 50% at 50% 45%, rgba(201,168,106,.05), transparent 70%)`, and a hairline inner frame at `inset: 14px`, `1px solid rgba(201,168,106,.12)`.

Inside, one SVG, `viewBox="0 0 720 720"`, `preserveAspectRatio="xMidYMid meet"`, `width: 100%; max-width: 760px; height: auto`.

**Geometry** — hub at (360,360); five nodes on a 262px radius pentagon, first at 12 o'clock:

| # | Channel | Center | Hue |
| --- | --- | --- | --- |
| I | Mailing | 360, 98 | `#3f6f9e` |
| II | Cold Calls | 609, 279 | `#b0803e` |
| III | Community | 514, 572 | `#9c5a48` |
| IV | Social Media | 206, 572 | `#4f7f75` |
| V | Referrals | 111, 279 | `#c9a86a` |

**Layers, back to front:**

1. Gold radial glow, r=340, `#c9a86a` at .16 → .05 → 0.
2. Two concentric rings: r=300 at .10, r=262 at .16.
3. A slowly rotating ring, r=180, `stroke-dasharray="1 9"` at .09 — `animation: 140s linear infinite` around `transform-origin: 360px 360px`. This is the only motion in the design besides the particle fade.
4. ~70 particles, r 0.6–1.5, gold, seeded deterministically between r=120 and r=320, each fading on its own `4–9s` cycle between .2 and .6 opacity. Group opacity .5. **Use a seeded PRNG, not `Math.random()`**, so positions are stable across renders.
5. Wireframe mesh — all ten inter-node chords, gold at .07, 1px.
6. Static spokes — hub to each node, in the node's own hue at .28.
7. Lit spoke — hub to the *selected* node, its hue at .95, 1.4px.
8. Node groups (below).
9. Hub, drawn last so it sits above the spokes: r=112 ring gold .14; r=100 disc filled `radialGradient(30% 16%: #2a2530 → #121016)`, stroke gold .55; r=92 inner ring gold .22. Then "Campaigns" (Cormorant 27px, `#f6f2ea`, y=345), a 76px-wide gold .4 rule at y=360, "FIVE CHANNELS" (9px, 2.6em tracking, `#8f8b84`, y=380), and the live total entry count (10.5px, `#dfc9a1`, y=400).

**Each node group** (`cursor: pointer`, click selects):

- Selection halo: r=94 disc, `radialGradient` of the node's hue — .30 at 50% → 0 at 100% — `opacity` bound to selected (0 or 1).
- Body: r=66 disc, fill `radialGradient(30% 16%: #221f28 → #100f14)`, stroke the node's hue at .45.
- Selected rims: r=66 at .95 and r=73 at .30, both the node's hue, both opacity-bound.
- Label stack: roman numeral (Cormorant 12px, hue, 1.6 tracking, y−22); channel name (Cormorant 17px, `#f1efe9`, y+4); entry count (Inter 9.5px, `#8f8b84`, 1.6 tracking, y+26).

**Critical:** no SVG `filter` elements. Glow is stacked low-opacity rings and radial gradients. Blur filters break rasterization on export.

### Entry rail (right)

Two panels, 14px gap. **The forms differ per channel** — that is the whole feature.

| Channel | Fields | Recent-entry title / subtitle |
| --- | --- | --- |
| Mailing | Campaign (text) · Date sent (text) · Notes (textarea) | campaign / notes |
| Cold Calls | Date · Calls made · Notes (textarea) | "{volume} calls" / notes |
| Community | Date · What you did (textarea) | first line of notes, 60 chars / — |
| Social Media | Date · What you posted (textarea) | first line of notes, 60 chars / — |
| Referrals | Referred by · Referred (comma-separated names) · Date · Notes (textarea) | source / "→ {people}" |

**Form panel**: border `rgba(201,168,106,.20)`, `padding: 18px`, with 14px corner ticks at top-left and bottom-right (gold at .75, 1px, two borders each). Contents: a gold kicker row prefixed by an 8px dot in the *selected channel's hue*; the channel name (Cormorant 25px); a 12px `--text-muted` hint line; the fields; then a gold-filled "SAVE ENTRY" primary and a ghost "CLEAR".

Field styling: 9.5px .16em uppercase label, 6px gap, then input/textarea — `--ink-field` bg, `rgba(201,168,106,.18)` border, `padding: 9px 11px`, 13px, focus border `--gold-500`. Textareas `rows="3"`, `resize: vertical`, `line-height: 1.5`.

Save appends to that channel's list and clears the draft; it is a no-op when every field is blank. Node and hub counts update live from the entry counts.

**Recent-entries panel**: quieter border (.14), one top-left corner tick. Kicker + "{n} entries" on the right. Each row: title (13px) with the date right-aligned (10px `--text-faint`, `nowrap`), then the subtitle (12px `--text-muted`, `text-wrap: pretty`). Empty state: "Nothing logged for this channel yet."

---

## State & data wiring

Everything in the mocks is placeholder. Bind it:

| Panel | Source |
| --- | --- |
| To-do list | `useStored("tasks")` — existing `Task[]`. Checkbox toggles `done`; add appends. Due tone from `dueDate` vs today. |
| "Then" queue | Derive from `useStored("prospects")` — the top four by urgency. `dashboard/src/lib/attention.ts` and `suggest.ts` already do this ranking; reuse rather than reimplement. |
| Vitals | `totalsFor` / `countsByCategory` from `lib/policies.ts` over `entries` filtered to `period` — the same math `OperatorTab` does today. |
| Goal + pace + lines | `useStored("lines")`, `useStored("period")`, `useStored("policies")`. Pace math already exists in `ProgressTab.tsx` — lift it into a shared helper rather than duplicating. |
| Waiting on you | Task counts by due date; `reviews` where status is `pending`/`edited`; prospects with no phone (`lib/research.ts`). |
| Leads table | `useStored("prospects")`. "Next step" is the single highest-priority open action per household. |
| Campaigns | **New store.** Add a `campaignEntries` key to the repository, typed per channel, and a matching D1 table + migration in `worker/`. Follow the existing `calls` store as the closest precedent. |

New local UI state only: selected channel (Campaigns), draft entry object (Campaigns), active filter (Leads), active tab (shell).

## Accessibility

The mocks skip this; the implementation must not.

- Nav items are `<button>` with `aria-current="page"` on the active one.
- To-do rows: real `<input type="checkbox">` visually replaced, with a label association — do not ship a clickable `<span>`.
- Channel nodes: focusable, keyboard-activatable, `role="button"` with an accessible name; the map needs a text-equivalent list for screen readers.
- Focus rings: `:focus-visible { outline: 1px solid var(--gold-500); outline-offset: 2px; }` — never the browser default, never `outline: none` alone.
- Gold on ink is ~4.5:1 and fine for labels; the .07–.20 alpha borders are decorative only and must never be the sole carrier of meaning. Status is always carried by text as well as hue.

## Responsive

Designed at ≥1280px. Below ~1100px: the Operator hero, the goal row, and the Campaigns layout each collapse to a single column; the vitals strip goes 4 → 2 across; the Leads table drops "Lines held" first, then "Last touch". No mobile design exists — ask before inventing one.

## Assets

None. No images, no icon fonts, no SVG illustrations. Everything is type, rules, and geometric SVG. The two Google Font families are the only external dependency.

## Files in this bundle

| File | What it is |
| --- | --- |
| `Control Center.dc.html` | The shell: top nav, page header, Operator screen, Leads screen. Open in a browser; click the nav and the Leads filters. |
| `Campaigns Tab.dc.html` | The Campaigns screen: channel map + per-channel entry logging. Click each node. |
| `support.js` | Runtime for the two HTML files. Required to view them; **not** something to port. |
| `github.md` | The repo association and a screen → source-file map. |

## Suggested order

1. Tokens into `theme.css`; confirm the ground, borders, and type land before touching structure.
2. Top nav in `App.tsx`; route the five destinations, demote the other three.
3. Operator: hero to-do + queue, then vitals, then the goal strip. Delete the removed panels as you go.
4. Leads: intent filters and the table.
5. Campaigns: store and D1 migration first, then the rail, then the SVG map last.
