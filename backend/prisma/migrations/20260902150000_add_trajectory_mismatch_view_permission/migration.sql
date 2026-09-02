-- Gates VIEW access (not just edit) to the Compliance Tracker's
-- "Trajectory Mismatches" section: master-Admin-only by default, grantable
-- to a non-master Admin the same way can_manage_weeks/passwords/roster are.
ALTER TABLE "users" ADD COLUMN "can_view_trajectory_mismatches" BOOLEAN NOT NULL DEFAULT false;
