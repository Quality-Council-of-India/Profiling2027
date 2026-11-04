CREATE TABLE "recognition_celebrations" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "week_id" INTEGER NOT NULL,
    "times_shown" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recognition_celebrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recognition_celebrations_user_id_week_id_key" ON "recognition_celebrations"("user_id", "week_id");

ALTER TABLE "recognition_celebrations" ADD CONSTRAINT "recognition_celebrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recognition_celebrations" ADD CONSTRAINT "recognition_celebrations_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
