import {
  DashboardIcon,
  EvaluateIcon,
  ScoresIcon,
  TeamIcon,
  ComplianceIcon,
  AnalyticsIcon,
  TrophyIcon,
  ConcernIcon,
  AdminIcon,
} from "../components/icons.jsx";

/** Single source of truth for the sidebar's nav list, shared with the
 * onboarding tour so both always agree on what's actually visible for a
 * given role. */
export function getNavItems(user) {
  const isAdmin = user.role === "admin";
  const isLead = ["casu_lead", "project_lead"].includes(user.role);
  const isAnchor = ["group_anchor", "casu_anchor"].includes(user.role);

  return [
    {
      to: "/dashboard",
      label: "Dashboard",
      Icon: DashboardIcon,
      show: true,
      tourText: "Your home base — a quick snapshot of the current week's status, your latest scores, and what's still pending.",
    },
    {
      to: "/evaluate",
      label: "Evaluate",
      Icon: EvaluateIcon,
      show: !isAdmin,
      tourText: "Submit your Self-Evaluation and Peer Evaluations here whenever a week is open.",
    },
    {
      to: "/scores",
      label: "My Scores",
      Icon: ScoresIcon,
      show: !isAdmin,
      tourText: "Your own detailed breakdown for the current week — every parameter, self vs. peer, and the SAPA factor.",
    },
    {
      to: "/team",
      label: "Team View",
      Icon: TeamIcon,
      show: isAnchor || isLead || isAdmin,
      tourText: "See how the people you oversee are scoring and whether they've completed their evaluations.",
    },
    {
      to: "/compliance",
      label: "Compliance",
      Icon: ComplianceIcon,
      show: isLead || isAdmin,
      tourText: "Track who has and hasn't submitted their evaluations yet, with the ability to send reminders.",
    },
    {
      to: "/analytics",
      label: "Analytics",
      Icon: AnalyticsIcon,
      show: true,
      tourText: "Trends, rankings, and standings over any week range — including a cumulative view across the whole cycle.",
    },
    {
      to: "/hall-of-recognition",
      label: "Hall of Recognition",
      Icon: TrophyIcon,
      show: true,
      tourText: "See which top performers were recognized each week they've been evaluated.",
    },
    {
      to: "/concerns",
      label: "Raise Your Concern",
      Icon: ConcernIcon,
      show: !isAdmin,
      tourText: "Run into a problem or need something changed (like your password)? Raise it here and the Admin team is notified.",
    },
    {
      to: "/admin",
      label: "Admin Panel",
      Icon: AdminIcon,
      show: isAdmin,
      tourText: "Manage the roster, weeks, passwords, and view the raw data behind every number in the portal.",
    },
    {
      to: "/admin/grievances",
      label: "Grievances",
      Icon: ConcernIcon,
      show: isAdmin,
      tourText: "Concerns raised by the team land here for you to respond to and resolve.",
    },
  ];
}
