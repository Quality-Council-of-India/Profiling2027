import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ROLE_LABELS, NAV, AZURE } from "../utils/constants.js";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
    { to: "/dashboard", label: "Dashboard", icon: "📊", show: true },
    { to: "/evaluate", label: "Evaluate", icon: "📝", show: true },
    { to: "/scores", label: "My Scores", icon: "📈", show: true },
    { to: "/team", label: "Team View", icon: "👥", show: isAnchor || isLead || isAdmin },
    { to: "/compliance", label: "Compliance", icon: "✅", show: isLead || isAdmin },
    { to: "/analytics", label: "Analytics", icon: "🔬", show: true },
    { to: "/admin", label: "Admin Panel", icon: "⚙️", show: isAdmin },
  ];

  return (
    <div className="w-56 flex-shrink-0 flex flex-col h-screen" style={{ background: NAV }}>
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
            QCI
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">Profiling 2027</p>
            <p style={{ color: AZURE }} className="text-xs">Feedback Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems
          .filter((n) => n.show)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive ? "bg-white/15 text-white font-medium" : "text-white/60 hover:text-white/90 hover:bg-white/5"
                }`
              }
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <div className="px-3 py-2 mb-2">
          <p className="text-white text-sm font-medium truncate">{user.name}</p>
          <p className="text-xs truncate" style={{ color: AZURE }}>
            {ROLE_LABELS[user.role]}
            {user.field ? ` · ${user.field}` : ""}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 text-xs transition-all"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
