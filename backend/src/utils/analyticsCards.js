// Single source of truth for the 7 Master-Admin-togglable cards in the
// Analytics tab's Team-Wide Analytics section (shared by Admin/Project
// Lead/CASU Lead — see analyticsScope in access.js: all three see this same
// set of cards, just scoped differently in content). `column` is the
// backing field on the Project model (see schema.prisma); `key` is the
// stable API/frontend identifier.
export const ANALYTICS_CARDS = [
  { key: "heatmap", column: "analytics_card_heatmap_enabled", label: "Field-Wise Performance Heatmap" },
  { key: "sapa", column: "analytics_card_sapa_enabled", label: "SAPA Distribution by Role" },
  { key: "quadrant", column: "analytics_card_quadrant_enabled", label: "Quadrant Analysis" },
  { key: "parameterAlignment", column: "analytics_card_parameter_alignment_enabled", label: "Per-Parameter Alignment" },
  { key: "teamTags", column: "analytics_card_team_tags_enabled", label: "Team Strengths & Growth Areas" },
  { key: "teamFocus", column: "analytics_card_team_focus_enabled", label: "What the Team Should Focus On" },
  { key: "teamMomentum", column: "analytics_card_team_momentum_enabled", label: "Team Momentum" },
];

export const ANALYTICS_CARD_KEYS = ANALYTICS_CARDS.map((c) => c.key);

/** Projects a Project row down to { [cardKey]: boolean }. */
export function pickAnalyticsCardSettings(project) {
  return Object.fromEntries(ANALYTICS_CARDS.map((c) => [c.key, project[c.column]]));
}
