-- AlterTable
ALTER TABLE "users" ADD COLUMN "emp_id" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "users_emp_id_key" ON "users"("emp_id");
