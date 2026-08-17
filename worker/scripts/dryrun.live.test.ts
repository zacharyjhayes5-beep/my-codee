/**
 * A read-only dry run against the live Kent County GIS service.
 *
 * Exercises the real fetcher, normalizer, entity filter and selector — the
 * whole pipeline except the parts that write — so the classification rules can
 * be checked against thousands of actual owner names before anything is
 * deployed or scheduled. Writes nothing and needs no credentials.
 *
 * Not part of `npm test`, which stays offline. Run it deliberately:
 *   npx vitest run --config vitest.live.config.ts
 */

import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { municipalityName } from "../src/config";
import { classifyOwner } from "../src/entities";
import { fetchAllParcels } from "../src/gis";
import { leadId, toParcelRecord } from "../src/normalize";
import { selectBatch } from "../src/select";

it("dry run against live Kent County GIS", async () => {
  const out: string[] = [];
  const log = (s = "") => out.push(s);
  const raw = await fetchAllParcels();
  log(`scanned ................ ${raw.length}`);

  const excluded: { owner: string; token: string }[] = [];
  const eligible: { pnum: string; govtUnit: string; reason: "new-parcel"; owner: string }[] = [];
  let unusable = 0;
  let duplicatePnums = 0;
  const byUnit = new Map<string, number>();
  const seen = new Set<string>();

  for (const attrs of raw) {
    const parcel = toParcelRecord(attrs);
    if (!parcel) {
      unusable++;
      continue;
    }
    if (seen.has(parcel.pnum)) duplicatePnums++;
    seen.add(parcel.pnum);
    byUnit.set(parcel.govtUnit, (byUnit.get(parcel.govtUnit) ?? 0) + 1);

    const verdict = classifyOwner(parcel.ownerRaw);
    if (verdict.isEntity) {
      excluded.push({ owner: parcel.ownerRaw, token: verdict.matched! });
      continue;
    }
    eligible.push({
      pnum: parcel.pnum,
      govtUnit: parcel.govtUnit,
      reason: "new-parcel",
      owner: parcel.ownerRaw,
    });
  }

  log(`unusable rows .......... ${unusable}`);
  log(`duplicate PNUMs ........ ${duplicatePnums}`);
  log(`excluded as entities ... ${excluded.length}`);
  log(`eligible ............... ${eligible.length}\n`);

  log("per municipality:");
  for (const [unit, n] of [...byUnit].sort()) {
    log(`  ${unit}  ${municipalityName(unit).padEnd(20)} ${n}`);
  }

  const byToken = new Map<string, number>();
  for (const e of excluded) byToken.set(e.token, (byToken.get(e.token) ?? 0) + 1);
  log("\nexclusions by token:");
  for (const [token, n] of [...byToken].sort((a, b) => b[1] - a[1])) {
    log(`  ${token.padEnd(14)} ${n}`);
  }

  log("\nsample excluded (should all be organizations):");
  for (const e of excluded.slice(0, 12)) log(`  [${e.token}] ${e.owner}`);

  log("\nsample kept (should all be households):");
  for (const e of eligible.slice(0, 12)) log(`  ${e.owner}`);

  const dev = selectBatch(eligible, "dev");
  log(`\ndev batch (1/1/1) -> ${dev.length}`);
  for (const r of dev) {
    log(`  ${municipalityName(r.govtUnit).padEnd(20)} ${r.pnum}  ${r.owner}`);
  }

  const full = selectBatch(eligible, "full");
  const fullByUnit = new Map<string, number>();
  for (const r of full) fullByUnit.set(r.govtUnit, (fullByUnit.get(r.govtUnit) ?? 0) + 1);
  log(`\nfull batch (9/8/8) -> ${full.length}`);
  for (const [unit, n] of [...fullByUnit].sort()) {
    log(`  ${municipalityName(unit).padEnd(20)} ${n}`);
  }

  const ids = new Set(eligible.map((e) => leadId(e.pnum, e.owner)));
  log(`\ndistinct lead ids for ${eligible.length} eligible: ${ids.size}`);
  writeFileSync("dryrun-report.txt", out.join("\n"), "utf8");
});
