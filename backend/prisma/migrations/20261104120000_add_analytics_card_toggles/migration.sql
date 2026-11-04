ALTER TABLE "projects" ADD COLUMN "analytics_card_heatmap_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "analytics_card_sapa_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "analytics_card_quadrant_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "analytics_card_parameter_alignment_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "analytics_card_team_tags_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "analytics_card_team_focus_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN "analytics_card_team_momentum_enabled" BOOLEAN NOT NULL DEFAULT true;
