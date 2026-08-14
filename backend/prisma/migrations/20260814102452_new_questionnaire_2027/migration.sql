/*
  Warnings:

  - You are about to drop the column `knowledge_peer` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `knowledge_self` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `quality_peer` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `quality_self` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `quantity_peer` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `quantity_self` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `sincerity_peer` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `sincerity_self` on the `computed_scores` table. All the data in the column will be lost.
  - You are about to drop the column `knowledge` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `problem_reason` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `problem_solving` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `quality` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `sincerity` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `strength_comment` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `weakness_comment` on the `evaluations` table. All the data in the column will be lost.
  - Added the required column `communication_clarity` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `domain_knowledge` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownership_discipline` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `problem_solving_initiative` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeliness_throughput` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `trajectory` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `work_quality` to the `evaluations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Trajectory" AS ENUM ('improved', 'stayed_same', 'declined', 'not_applicable');

-- AlterTable
ALTER TABLE "computed_scores" DROP COLUMN "knowledge_peer",
DROP COLUMN "knowledge_self",
DROP COLUMN "quality_peer",
DROP COLUMN "quality_self",
DROP COLUMN "quantity_peer",
DROP COLUMN "quantity_self",
DROP COLUMN "sincerity_peer",
DROP COLUMN "sincerity_self",
ADD COLUMN     "communication_clarity_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "communication_clarity_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "domain_knowledge_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "domain_knowledge_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ownership_discipline_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ownership_discipline_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "problem_solving_initiative_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "problem_solving_initiative_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "timeliness_throughput_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "timeliness_throughput_self" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "work_quality_peer" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "work_quality_self" DECIMAL(3,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "evaluations" DROP COLUMN "knowledge",
DROP COLUMN "problem_reason",
DROP COLUMN "problem_solving",
DROP COLUMN "quality",
DROP COLUMN "quantity",
DROP COLUMN "sincerity",
DROP COLUMN "strength_comment",
DROP COLUMN "weakness_comment",
ADD COLUMN     "communication_clarity" SMALLINT NOT NULL,
ADD COLUMN     "domain_knowledge" SMALLINT NOT NULL,
ADD COLUMN     "improvement_suggestion" TEXT,
ADD COLUMN     "ownership_discipline" SMALLINT NOT NULL,
ADD COLUMN     "problem_solving_initiative" SMALLINT NOT NULL,
ADD COLUMN     "timeliness_throughput" SMALLINT NOT NULL,
ADD COLUMN     "trajectory" "Trajectory" NOT NULL,
ADD COLUMN     "work_quality" SMALLINT NOT NULL;

-- DropEnum
DROP TYPE "ProblemSolving";
