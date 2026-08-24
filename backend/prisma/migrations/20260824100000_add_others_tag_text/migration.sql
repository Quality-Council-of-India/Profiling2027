-- Free-text detail behind the "Others" Strengths/Areas of Improvement tag.
ALTER TABLE "evaluations" ADD COLUMN "strengths_other_text" VARCHAR(200);
ALTER TABLE "evaluations" ADD COLUMN "weakness_other_text" VARCHAR(200);
