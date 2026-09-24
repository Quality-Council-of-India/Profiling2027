-- Extends the Data Quality tab (Admin-only by default) to Project Lead /
-- CASU Lead accounts, one user at a time, granted by the Master Admin —
-- same "view gated by an explicit flag" pattern as
-- can_view_trajectory_mismatches, but for non-Admin roles instead of
-- other Admins. Harmless/unused for every other role.
ALTER TABLE "users" ADD COLUMN "can_view_data_quality" BOOLEAN NOT NULL DEFAULT false;
