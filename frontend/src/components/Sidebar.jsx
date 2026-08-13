import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ROLE_LABELS, AZURE } from "../utils/constants.js";
import AboutProfileModal from "./AboutProfileModal.jsx";
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
} from "./icons.jsx";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  // Navigate explicitly (with no `state`) instead of letting ProtectedRoute's
  // post-logout redirect carry the current path forward as `state.from` —
  // otherwise the next person to log in on this browser gets bounced to
  // whatever page the previous user was last on, regardless of their role.
  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const isAdmin = user.role === "admin";
  const isLead = ["casu_lead", "project_lead"].includes(user.role);
  const isAnchor = ["group_anchor", "casu_anchor"].includes(user.role);

  const navItems = [
    { to: "/dashboard", label: "Dashboard", Icon: DashboardIcon, show: true },
    // Admins never submit/receive evaluations — these two are meaningless
    // for their own account; use "View portal as..." in the Admin Panel
    // to preview them for real.
    { to: "/evaluate", label: "Evaluate", Icon: EvaluateIcon, show: !isAdmin },
    { to: "/scores", label: "My Scores", Icon: ScoresIcon, show: !isAdmin },
    { to: "/team", label: "Team View", Icon: TeamIcon, show: isAnchor || isLead || isAdmin },
    { to: "/compliance", label: "Compliance", Icon: ComplianceIcon, show: isLead || isAdmin },
    { to: "/analytics", label: "Analytics", Icon: AnalyticsIcon, show: true },
    { to: "/hall-of-recognition", label: "Hall of Recognition", Icon: TrophyIcon, show: true },
    { to: "/concerns", label: "Raise Your Concern", Icon: ConcernIcon, show: !isAdmin },
    { to: "/admin", label: "Admin Panel", Icon: AdminIcon, show: isAdmin },
    { to: "/admin/grievances", label: "Grievances", Icon: ConcernIcon, show: isAdmin },
  ];

  return (
    <div
      className="w-56 flex-shrink-0 flex flex-col h-screen"
      style={{ background: "linear-gradient(180deg, #1F3864 0%, #142647 100%)" }}
    >
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-white text-xs font-bold font-display">
            QCI
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight font-display">Profiling 2027</p>
            <p style={{ color: AZURE }} className="text-xs">Feedback Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto thin-scrollbar">
        {navItems
          .filter((n) => n.show)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                `group relative w-full flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-lg text-sm transition-standard ${
                  isActive ? "bg-white/10 text-white font-medium" : "text-white/55 hover:text-white/90 hover:bg-white/5"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent transition-standard"
                    style={{ opacity: isActive ? 1 : 0 }}
                  />
                  <n.Icon className={isActive ? "text-accent" : "text-white/50 group-hover:text-white/80"} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <button
          onClick={() => setShowProfile(true)}
          title="View profile"
          className="group w-full flex items-center justify-between gap-2 text-left px-3 py-2 mb-2 rounded-lg hover:bg-white/5 transition-standard"
        >
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs truncate" style={{ color: AZURE }}>
              {ROLE_LABELS[user.role]}
              {user.field ? ` · ${user.field}` : ""}
            </p>
          </div>
          <svg
            className="w-3.5 h-3.5 flex-shrink-0 text-white/30 group-hover:text-white/70 transition-standard"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7.5 4.5l6 5.5-6 5.5" />
          </svg>
        </button>
        <button
          onClick={handleLogout}
          className="w-full px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-xs transition-standard"
        >
          Sign Out
        </button>
      </div>

      {showProfile && <AboutProfileModal user={user} onClose={() => setShowProfile(false)} />}
    </div>
  );
}
