import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, analyticsApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";
import HeatmapGrid from "../components/charts/HeatmapGrid.jsx";
import QuadrantPlot from "../components/charts/QuadrantPlot.jsx";
import ScoresPage from "./ScoresPage.jsx";

const PERSONAL_ROLES = ["profiler", "group_anchor", "casu_anchor"];

export default function AnalyticsPage() {
  const { user } = useAuth();
  const isPersonal = PERSONAL_ROLES.includes(user.role);

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];
  const [weekId, setWeekId] = useState(null);
  useEffect(() => {
    if (weeks.length && weekId === null) {
      const current = [...weeks].reverse().find((w) => w.status !== "upcoming");
      setWeekId(current?.id ?? weeks[weeks.length - 1].id);
    }
  }, [weeks, weekId]);

  const heatmapQuery = useQuery({
    queryKey: ["heatmap", weekId],
    queryFn: () => analyticsApi.heatmap(weekId),
    enabled: !isPersonal && !!weekId,
  });
  const sapaQuery = useQuery({
    queryKey: ["sapa", weekId],
    queryFn: () => analyticsApi.sapa(weekId),
    enabled: !isPersonal && !!weekId,
  });
  const quadrantQuery = useQuery({
    queryKey: ["quadrant", weekId],
    queryFn: () => analyticsApi.quadrant(weekId),
    enabled: !isPersonal && !!weekId,
  });

  if (isPersonal) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Analytics</h1>
          <p className="text-sm text-gray-500">Personalised view · {user.name}</p>
        </div>
        <ScoresPage />
      </div>
    );
  }

  if (weeksQuery.isLoading || !weekId) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">{user.role === "project_lead" ? "Profilers & Group Anchors" : "All fields & roles"}</p>
        </div>
        <select value={weekId} onChange={(e) => setWeekId(Number(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {weeks.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Field-Wise Performance Heatmap (Peer Scores)</h2>
        {heatmapQuery.isLoading ? <Spinner /> : heatmapQuery.isError ? <ErrorBanner message="Failed to load heatmap" /> : <HeatmapGrid rows={heatmapQuery.data.heatmap} />}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">SAPA Distribution by Role</h2>
          {sapaQuery.isLoading ? (
            <Spinner />
          ) : sapaQuery.isError ? (
            <ErrorBanner message="Failed to load SAPA distribution" />
          ) : (
            <SapaBars rows={sapaQuery.data.byRole} />
          )}
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Quadrant Analysis — Performance vs Sentiment</h2>
          {quadrantQuery.isLoading ? <Spinner /> : quadrantQuery.isError ? <ErrorBanner message="Failed to load quadrant data" /> : <QuadrantPlot points={quadrantQuery.data.points} />}
        </Card>
      </div>
    </div>
  );
}

function SapaBars({ rows }) {
  if (!rows.length) return <p className="text-sm text-gray-400">No SAPA data for this week yet.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span className="capitalize">{r.key.replace(/_/g, " ")}</span>
            <span>avg {r.avg ?? "—"}</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div style={{ width: `${r.over}%`, background: "#EF4444" }} title={`Over-raters ${r.over}%`} />
            <div style={{ width: `${r.aligned}%`, background: "#22C55E" }} title={`Aligned ${r.aligned}%`} />
            <div style={{ width: `${r.under}%`, background: "#3B82F6" }} title={`Under-raters ${r.under}%`} />
          </div>
        </div>
      ))}
      <div className="flex gap-3 text-xs text-gray-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Over-raters</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Aligned</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Under-raters</span>
      </div>
    </div>
  );
}
