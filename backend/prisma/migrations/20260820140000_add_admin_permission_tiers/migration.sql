-- Admin permission tiers: a "Master Admin" flag (grants full access
-- everywhere, only ever settable directly in the database) plus three
-- per-Admin edit-access flags for Week Management, Password Management,
-- and Team Roster.
ALTER TABLE "users" ADD COLUMN "is_master_admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "can_manage_weeks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "can_manage_passwords" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "can_manage_roster" BOOLEAN NOT NULL DEFAULT false;
