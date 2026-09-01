-- CreateTable
CREATE TABLE "peer_mapping_snapshots" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "week_id" INTEGER NOT NULL,
    "evaluator_id" INTEGER NOT NULL,
    "evaluatee_id" INTEGER NOT NULL,
    "mapping_type" "MappingType" NOT NULL DEFAULT 'peer',

    CONSTRAINT "peer_mapping_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "peer_mapping_snapshots_week_id_evaluatee_id_idx" ON "peer_mapping_snapshots"("week_id", "evaluatee_id");

-- CreateIndex
CREATE UNIQUE INDEX "peer_mapping_snapshots_week_id_evaluator_id_evaluatee_id_key" ON "peer_mapping_snapshots"("week_id", "evaluator_id", "evaluatee_id");

-- AddForeignKey
ALTER TABLE "peer_mapping_snapshots" ADD CONSTRAINT "peer_mapping_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_mapping_snapshots" ADD CONSTRAINT "peer_mapping_snapshots_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_mapping_snapshots" ADD CONSTRAINT "peer_mapping_snapshots_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_mapping_snapshots" ADD CONSTRAINT "peer_mapping_snapshots_evaluatee_id_fkey" FOREIGN KEY ("evaluatee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
