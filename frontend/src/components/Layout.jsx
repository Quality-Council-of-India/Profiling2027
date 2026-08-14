import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";
import OnboardingTour, { hasSeenOnboarding } from "./OnboardingTour.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { ROLE_LABELS } from "../utils/constants.js";

export default function Layout() {
  const { user, impersonating, returnToAdmin } = useAuth();
  const navigate = useNavigate();
  const [showTour, setShowTour] = useState(false);

  // First-ever login for this browser+user gets the guided tour
  // automatically; afterwards it's only reachable via the Help icon.
  useEffect(() => {
    if (user && !hasSeenOnboarding(user.id)) setShowTour(true);
  }, [user?.id]);

  async function handleReturnToAdmin() {
    await returnToAdmin();
    navigate("/admin", { replace: true });
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {impersonating && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-2 bg-accent text-white text-sm font-medium">
          <span>
            Viewing as {user?.name} ({ROLE_LABELS[user?.role]}
            {user?.field ? ` · ${user.field}` : ""})
          </span>
          <button
            onClick={handleReturnToAdmin}
            className="px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-standard text-xs font-semibold"
          >
            ← Return to Admin
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar onOpenTour={() => setShowTour(true)} />
          <main
            className="flex-1 overflow-y-auto"
            style={{
              background:
                "radial-gradient(ellipse 900px 500px at top right, rgba(165,201,235,0.16), transparent), radial-gradient(ellipse 700px 500px at bottom left, rgba(224,123,0,0.05), transparent), #F8FAFC",
            }}
          >
            <div className="max-w-[1400px] mx-auto p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {showTour && <OnboardingTour user={user} onClose={() => setShowTour(false)} />}
    </div>
  );
}
