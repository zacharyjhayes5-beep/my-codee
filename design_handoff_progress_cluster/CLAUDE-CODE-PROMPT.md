# Paste this to Claude Code

Run from the repo root of zacharyjhayes5-beep/my-codee (branch main).

---

Implement the Progress cluster from the handoff bundle in
design_handoff_progress_cluster/. Read
design_handoff_progress_cluster/README.md first, then:

1. Copy implementation/ClusterGauge.tsx and implementation/TankCluster.tsx to
   dashboard/src/components/.
2. From implementation/ProgressTab.patch.tsx, create
   dashboard/src/components/ProgressGauges.tsx containing the ProgressGauges
   component (drop the trailing comment block).
3. Append implementation/cluster.css verbatim to dashboard/src/App.css.
4. In dashboard/src/components/ProgressTab.tsx, import ProgressGauges and
   render <ProgressGauges lines={lines} period={period} entries={entries} />
   inside the first <div className="p3d-deck">, after the .period-bar block and
   before <div className="stat-row earnings-row dolly">.
5. Resolve the two open questions in the README against the real schema: the
   household field on PolicyEntry, and where quotes-out lives. Wire the real
   values; do not leave the stand-ins if the real fields exist.
6. Run the existing checks (npm run lint / test / build in dashboard/) and fix
   anything the new files break. Do not change any other component, and do not
   remove the existing StatTile row, Meter bars, BookOfBusiness, Goals, Tier or
   All American sections.

Keep every colour as a token from dashboard/src/index.css. No new dependencies.
