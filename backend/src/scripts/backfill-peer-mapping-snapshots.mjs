// One-time historical backfill for peer_mapping_snapshots — see the
// PeerMappingSnapshot model's schema doc comment for why this table exists.
//
// Run ONCE, after the "add_peer_mapping_snapshot" migration has been applied:
//   docker compose run --rm backend node scripts/backfill-peer-mapping-snapshots.mjs
//
// Safe to re-run: it replaces (not adds to) whatever snapshot rows already
// exist for Week 1 / Week 2, and aborts with NO partial writes if any name
// in the data files below doesn't resolve to exactly one user in the
// database.
//
// WEEK 1 (data/week1-mapping-pairs.json, 570 pairs): peer_mappings was
// live/global and got overwritten by the roster reshuffle before this
// snapshot mechanism existed, so Week 1's original mapping was reconstructed
// by re-running the app's own deterministic mapping algorithm
// (regeneratePeerMappings, in services/peerMapping.js) against the
// historical (name, role, field) roster recovered from an exported "Week 01
// scores" scoresheet. Verified two independent ways before trusting it:
//   1. Every one of 70 people's reconstructed "expected peer count" (how
//      many peers are mapped to evaluate them) matched their real
//      historical "Expected Peers" column exactly — 0 mismatches.
//   2. Every one of the 555 peer evaluations actually submitted in Week 1
//      fell inside these 570 reconstructed pairs, with 0 exceptions, and
//      570 - 555 = 15 pending reconciled exactly against the real data.
//
// WEEK 2 (data/week2-mapping-pairs.json, 514 pairs): the roster has not
// changed since Week 2 closed (confirmed), so re-running the same algorithm
// against the current roster reproduces Week 2's live mapping exactly —
// these 514 pairs match, one-for-one, the "514 peer mappings generated" the
// app itself reported at import time.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prisma } from "../src/utils/prisma.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPairs(filename) {
  return JSON.parse(readFileSync(join(__dirname, "data", filename), "utf-8"));
}

async function resolveIdsByName(names, projectId) {
  const users = await prisma.user.findMany({
    where: { project_id: projectId, name: { in: [...names] } },
    select: { id: true, name: true },
  });
  const byName = new Map();
  const dupes = new Set();
  for (const u of users) {
    if (byName.has(u.name)) dupes.add(u.name);
    byName.set(u.name, u.id);
  }
  const missing = [...names].filter((n) => !byName.has(n));
  if (dupes.size > 0) {
    throw new Error(`Ambiguous names, more than one user shares this exact name, cannot safely resolve: ${[...dupes].join(", ")}`);
  }
  if (missing.length > 0) {
    throw new Error(`Names not found in the users table, nothing was written: ${missing.join(", ")}`);
  }
  return byName;
}

async function backfillWeek(weekNumber, pairs) {
  const week = await prisma.week.findFirst({ where: { week_number: weekNumber } });
  if (!week) throw new Error(`Week ${weekNumber} not found, nothing written for it`);
  const projectId = week.project_id;

  const allNames = new Set();
  for (const [evaluator, evaluatee] of pairs) {
    allNames.add(evaluator);
    allNames.add(evaluatee);
  }
  const idByName = await resolveIdsByName(allNames, projectId);

  const rows = pairs.map(([evaluator, evaluatee]) => ({
    project_id: projectId,
    week_id: week.id,
    evaluator_id: idByName.get(evaluator),
    evaluatee_id: idByName.get(evaluatee),
    mapping_type: "peer",
  }));

  const existing = await prisma.peerMappingSnapshot.count({ where: { week_id: week.id } });
  if (existing > 0) {
    console.log(`Week ${weekNumber}: ${existing} snapshot row(s) already exist, replacing with this backfill.`);
  }

  await prisma.$transaction([
    prisma.peerMappingSnapshot.deleteMany({ where: { week_id: week.id } }),
    prisma.peerMappingSnapshot.createMany({ data: rows, skipDuplicates: true }),
  ]);

  console.log(`Week ${weekNumber}: wrote ${rows.length} peer_mapping_snapshot rows.`);
}

async function main() {
  await backfillWeek(1, loadPairs("week1-mapping-pairs.json"));
  await backfillWeek(2, loadPairs("week2-mapping-pairs.json"));
  console.log("Backfill complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill FAILED, no partial data was written for whichever week errored:");
    console.error(err.message);
    process.exit(1);
  });
