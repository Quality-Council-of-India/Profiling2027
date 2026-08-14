import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { ROLE_LABELS, AZURE } from "../utils/constants.js";
import { getNavItems } from "../utils/navItems.js";
import AboutProfileModal from "./AboutProfileModal.jsx";

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

  const navItems = getNavItems(user);

  return (
    <div
      className="w-56 flex-shrink-0 flex flex-col h-screen"
      style={{ background: "linear-gradient(180deg, #1F3864 0%, #142647 100%)" }}
    >
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2.5" data-tour="logo">
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
              data-tour={`nav-${n.to}`}
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
          data-tour="profile"
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
