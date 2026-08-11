import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import TopBar from "./TopBar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { ROLE_LABELS } from "../utils/constants.js";

export default function Layout() {
  const { user, impersonating, returnToAdmin } = useAuth();
  const navigate = useNavigate();

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
          <TopBar />
          <main className="flex-1 overflow-y-auto bg-slate-50">
            <div className="max-w-[1400px] mx-auto p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
