-- CreateEnum
CREATE TYPE "Role" AS ENUM ('profiler', 'group_anchor', 'casu_anchor', 'casu_lead', 'project_lead', 'admin');

-- CreateEnum
CREATE TYPE "MappingType" AS ENUM ('peer');

-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('upcoming', 'open', 'closed');

-- CreateEnum
CREATE TYPE "EvalType" AS ENUM ('self', 'peer');

-- CreateEnum
CREATE TYPE "ProblemSolving" AS ENUM ('satisfied', 'not_satisfied');

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "field" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_mappings" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "evaluator_id" INTEGER NOT NULL,
    "evaluatee_id" INTEGER NOT NULL,
    "mapping_type" "MappingType" NOT NULL DEFAULT 'peer',

    CONSTRAINT "peer_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weeks" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "week_number" INTEGER NOT NULL,
    "label" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "WeekStatus" NOT NULL DEFAULT 'upcoming',

    CONSTRAINT "weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" SERIAL NOT NULL,
    "week_id" INTEGER NOT NULL,
    "evaluator_id" INTEGER NOT NULL,
    "evaluatee_id" INTEGER NOT NULL,
    "eval_type" "EvalType" NOT NULL,
    "sincerity" SMALLINT NOT NULL,
    "team_spirit" SMALLINT NOT NULL,
    "knowledge" SMALLINT NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "quality" SMALLINT NOT NULL,
    "problem_solving" "ProblemSolving" NOT NULL,
    "problem_reason" TEXT,
    "strengths_tags" TEXT[],
    "weakness_tags" TEXT[],
    "strength_comment" TEXT,
    "weakness_comment" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "computed_scores" (
    "id" SERIAL NOT NULL,
    "week_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "sincerity_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "sincerity_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "team_spirit_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "team_spirit_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "knowledge_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "knowledge_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "quantity_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "quantity_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "quality_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "quality_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_self" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "total_peer" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "peer_count" INTEGER NOT NULL DEFAULT 0,
    "expected_peer_count" INTEGER NOT NULL DEFAULT 0,
    "sapa_factor" DECIMAL(4,3),
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "computed_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_year_key" ON "projects"("year");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_project_id_idx" ON "users"("project_id");

-- CreateIndex
CREATE INDEX "peer_mappings_evaluatee_id_idx" ON "peer_mappings"("evaluatee_id");

-- CreateIndex
CREATE UNIQUE INDEX "peer_mappings_project_id_evaluator_id_evaluatee_id_key" ON "peer_mappings"("project_id", "evaluator_id", "evaluatee_id");

-- CreateIndex
CREATE UNIQUE INDEX "weeks_project_id_week_number_key" ON "weeks"("project_id", "week_number");

-- CreateIndex
CREATE INDEX "evaluations_week_id_evaluatee_id_idx" ON "evaluations"("week_id", "evaluatee_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_week_id_evaluator_id_evaluatee_id_eval_type_key" ON "evaluations"("week_id", "evaluator_id", "evaluatee_id", "eval_type");

-- CreateIndex
CREATE UNIQUE INDEX "computed_scores_week_id_user_id_key" ON "computed_scores"("week_id", "user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_mappings" ADD CONSTRAINT "peer_mappings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_mappings" ADD CONSTRAINT "peer_mappings_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_mappings" ADD CONSTRAINT "peer_mappings_evaluatee_id_fkey" FOREIGN KEY ("evaluatee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluatee_id_fkey" FOREIGN KEY ("evaluatee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computed_scores" ADD CONSTRAINT "computed_scores_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computed_scores" ADD CONSTRAINT "computed_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
