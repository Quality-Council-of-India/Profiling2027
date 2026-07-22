// Seeds the database with the Padma 2027 project, the demo roster (the same
// 10 users from the interactive prototype, seeded from real Padma 2026
// actuals), auto-generated peer mappings, 6 weeks, and synthetic evaluation
// data for weeks 1-5 (closed) and a partial week 6 (open) — so the portal is
// demoable end-to-end without waiting for the first live cycle.
//
// Run: npm run seed
// Re-running wipes and recreates the project's data (idempotent).

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { regeneratePeerMappings } from "../src/services/peerMapping.js";
import { computeScoresForWeek } from "../src/services/scoreEngine.js";
import { PARAMS, STRENGTH_TAGS, WEAKNESS_TAGS } from "../src/utils/constants.js";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Profiling2027!";

const USERS = [
  { name: "Harshit (Admin)", email: "harshit.qci@gmail.com", role: "admin", field: null },
  { name: "Ashish Gambhir", email: "ashishgambhir.qcin@gmail.com", role: "project_lead", field: null },
  { name: "Pratibha Singh", email: "107pra.qcin@gmail.com", role: "casu_lead", field: null },
  { name: "Shagufta Parveen", email: "shagufta.qcin@gmail.com", role: "group_anchor", field: "Arts" },
  { name: "Saniya Chopra", email: "saniyachopra.qcin@gmail.com", role: "casu_anchor", field: "Arts" },
  { name: "Shikha Yadav", email: "shikha.yadav.qci@gmail.com", role: "profiler", field: "Arts" },
  { name: "Himanshu Gola", email: "himanshu.gola.qci@gmail.com", role: "group_anchor", field: "Literature & Education" },
  { name: "Manish Chaube", email: "manish.chaube.qci@gmail.com", role: "group_anchor", field: "Science & Engineering" },
  { name: "Uday Singh", email: "uday.singh.qci@gmail.com", role: "profiler", field: "Science & Engineering" },
  { name: "Sristi Goswami", email: "sristi.goswami.qci@gmail.com", role: "profiler", field: "Sports" },
];

// Deterministic pseudo-random in [0,1) — mulberry32, seeded per (userId, week, salt)
function rand(seed) {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function ratingFor(userId, week, paramIndex, offset = 0) {
  const seed = userId * 1000 + week * 31 + paramIndex * 7 + offset;
  return 2 + Math.floor(rand(seed) * 4); // 2..5, skews positive like real feedback
}

function pickTags(userId, week, tagList, offset) {
  const count = 2 + Math.floor(rand(userId * 97 + week * 13 + offset) * 2); // 2-3 tags
  const shuffled = [...tagList].sort(
    (a, b) => rand(userId + week + tagList.indexOf(a) + offset) - rand(userId + week + tagList.indexOf(b) + offset)
  );
  return shuffled.slice(0, count);
}

async function main() {
  console.log("Seeding Padma Awards 2027...");

  const project = await prisma.project.upsert({
    where: { year: 2027 },
    update: {},
    create: {
      name: "Padma Awards 2027",
      year: 2027,
      start_date: new Date("2026-08-01"),
      is_active: true,
    },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userRecords = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, field: u.field, project_id: project.id },
      create: { ...u, project_id: project.id, password_hash: passwordHash },
    });
    userRecords[u.email] = user;
  }
  console.log(`  ${USERS.length} users upserted (demo password: "${DEMO_PASSWORD}")`);

  const { mappingsCreated } = await regeneratePeerMappings(project.id);
  console.log(`  ${mappingsCreated} peer mappings generated`);

  const WEEK_COUNT = 6;
  const weeks = [];
  const firstSaturday = new Date("2026-08-01");
  for (let w = 1; w <= WEEK_COUNT; w++) {
    const start = new Date(firstSaturday);
    start.setDate(start.getDate() + (w - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    const status = w < WEEK_COUNT ? "closed" : "open";

    const week = await prisma.week.upsert({
      where: { project_id_week_number: { project_id: project.id, week_number: w } },
      update: { status },
      create: {
        project_id: project.id,
        week_number: w,
        label: `Week ${String(w).padStart(2, "0")}`,
        start_date: start,
        end_date: end,
        status,
      },
    });
    weeks.push(week);
  }
  console.log(`  ${weeks.length} weeks created (Weeks 1-${WEEK_COUNT - 1} closed, Week ${WEEK_COUNT} open)`);

  const activeUsers = await prisma.user.findMany({
    where: { project_id: project.id, role: { not: "admin" } },
  });
  const mappings = await prisma.peerMapping.findMany({ where: { project_id: project.id } });

  for (const week of weeks) {
    const isOpenWeek = week.status === "open";
    // Open week gets partial submissions (demoable pending/compliance state);
    // closed weeks get near-complete submissions (demoable score history).
    const selfSubmitRate = isOpenWeek ? 0.5 : 0.9;
    const peerSubmitRate = isOpenWeek ? 0.45 : 0.85;

    for (const u of activeUsers) {
      const submitsSelf = rand(u.id * 500 + week.week_number) < selfSubmitRate;
      if (submitsSelf) {
        await prisma.evaluation.upsert({
          where: {
            week_id_evaluator_id_evaluatee_id_eval_type: {
              week_id: week.id,
              evaluator_id: u.id,
              evaluatee_id: u.id,
              eval_type: "self",
            },
          },
          update: {},
          create: {
            week_id: week.id,
            evaluator_id: u.id,
            evaluatee_id: u.id,
            eval_type: "self",
            sincerity: ratingFor(u.id, week.week_number, 0, 20),
            team_spirit: ratingFor(u.id, week.week_number, 1, 20),
            knowledge: ratingFor(u.id, week.week_number, 2, 20),
            quantity: ratingFor(u.id, week.week_number, 3, 20),
            quality: ratingFor(u.id, week.week_number, 4, 20),
            problem_solving: rand(u.id + week.week_number + 20) > 0.15 ? "satisfied" : "not_satisfied",
            strengths_tags: pickTags(u.id, week.week_number, STRENGTH_TAGS, 20),
            weakness_tags: pickTags(u.id, week.week_number, WEAKNESS_TAGS, 30),
            strength_comment: "Consistently reliable and easy to collaborate with.",
            weakness_comment: "Could tighten up turnaround time on edge cases.",
          },
        });
      }
    }

    for (const m of mappings) {
      const submits = rand(m.evaluator_id * 700 + m.evaluatee_id * 11 + week.week_number) < peerSubmitRate;
      if (!submits) continue;
      await prisma.evaluation.upsert({
        where: {
          week_id_evaluator_id_evaluatee_id_eval_type: {
            week_id: week.id,
            evaluator_id: m.evaluator_id,
            evaluatee_id: m.evaluatee_id,
            eval_type: "peer",
          },
        },
        update: {},
        create: {
          week_id: week.id,
          evaluator_id: m.evaluator_id,
          evaluatee_id: m.evaluatee_id,
          eval_type: "peer",
          sincerity: ratingFor(m.evaluatee_id, week.week_number, 0, m.evaluator_id),
          team_spirit: ratingFor(m.evaluatee_id, week.week_number, 1, m.evaluator_id),
          knowledge: ratingFor(m.evaluatee_id, week.week_number, 2, m.evaluator_id),
          quantity: ratingFor(m.evaluatee_id, week.week_number, 3, m.evaluator_id),
          quality: ratingFor(m.evaluatee_id, week.week_number, 4, m.evaluator_id),
          problem_solving: rand(m.evaluatee_id + week.week_number + m.evaluator_id) > 0.2 ? "satisfied" : "not_satisfied",
          strengths_tags: pickTags(m.evaluatee_id, week.week_number, STRENGTH_TAGS, m.evaluator_id),
          weakness_tags: pickTags(m.evaluatee_id, week.week_number, WEAKNESS_TAGS, m.evaluator_id + 5),
          strength_comment: "Very responsive and grasps facts quickly.",
          weakness_comment: "Could be more proactive in flagging blockers early.",
        },
      });
    }

    await computeScoresForWeek(week.id, project.id);
  }
  console.log("  Synthetic evaluations seeded and scores computed for all weeks");

  console.log("\nDone. Demo login — any seeded email above, password: " + DEMO_PASSWORD);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
