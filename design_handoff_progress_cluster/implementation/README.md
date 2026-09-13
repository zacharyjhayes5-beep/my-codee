# Progress cluster — implementation notes

Two gauges from the mockups, written against the real app: the **cluster** (2a)
and the **fuel tank** (1c), with a switch between them.

## Files

| Drop in at | What it is |
| --- | --- |
| `dashboard/src/components/ClusterGauge.tsx` | The binnacle: policy comb, trip readout, weekly-rate dial, raked strips. |
| `dashboard/src/components/TankCluster.tsx` | Hero fuel can, a mini can per line, weekly fuel-flow chart. |
| `dashboard/src/components/ProgressGauges.tsx` | The wrapper with the CLUSTER / FUEL switch. Body is in `ProgressTab.patch.tsx`. |
| append to `dashboard/src/App.css` | Contents of `cluster.css`. |

Then one line in `ProgressTab.tsx`, inside the first `.p3d-deck`, after the
period bar and before the stat row:

```tsx
<ProgressGauges lines={lines} period={period} entries={entries} />
```

## What it reads

Nothing new is computed. `readPace(period, written, goal)` already returns
every number the gauges show — `written`, `goal`, `writtenPct`,
`expectedTotal`, `remaining`, `perWeek`, `onPace`, `behindBy`, `daysLeft` —
so the comb, the pace mark and the OFF PACE strip cannot drift from the
Operator goal strip. Counts per line come from `countsByCategory`, money from
`totalsFor`, colours from `seriesColors`.

The only derived series is `weekly`: policies bucketed by
`startOfWeek(effectiveDate)`, which drives the fuel-flow bars and the live
needle (the red index on the dial is `pace.perWeek`, the rate you owe).

## Two things to check against your schema

1. **Households.** `ProgressGauges` counts `new Set(e.householdId ?? e.id)`.
   If `PolicyEntry` names that field differently, point it at the real one —
   or pass the Vault household count in, which is what the Operator screen
   shows.
2. **Pipeline temp.** The COLD–HOT strip currently reads
   actual-rate ÷ needed-rate and `quotesOut` is a placeholder count. If quotes
   out lives in the pipeline store, pass that instead.

## Styling

Tokens only — `--accent`, `--navy-2/3`, `--cognac-2`, `--series-1/2/3`,
`--attention`, `--success`, `--danger`, `--metal`, `--font-mono`. No raw
colour, so Nocturne keeps its own material and the gauges re-theme with the
rest of the app. The papaya/cyan of the mockup was mockup-only.

Motion is limited to the needle transform and the liquid surface, both on
`--ease`; `prefers-reduced-motion` in `index.css` already neutralises them.

## Not included

The 1c weekly chart in the mockup had ten bars of invented history. Here it
plots the real weeks in the period, so early in a period it is short — that is
correct, not broken.
