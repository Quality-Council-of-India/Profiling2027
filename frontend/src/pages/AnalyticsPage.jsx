import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, scoresApi, analyticsApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, EmptyState, RefreshButton } from "../components/ui.jsx";
import WeekSelector from "../components/WeekSelector.jsx";
import RankingCard from "../components/RankingCard.jsx";
import FieldStandingCard from "../components/FieldStandingCard.jsx";
import PeerScoreTrendChart from "../components/charts/PeerScoreTrendChart.jsx";
import HeatmapGrid from "../components/charts/HeatmapGrid.jsx";
import QuadrantPlot from "../components/charts/QuadrantPlot.jsx";
import SAPAGauge from "../components/charts/SAPAGauge.jsx";
import { PARAM_FIELDS, ACCENT, NAV } from "../utils/constants.js";

const AGGREGATE_ROLES = ["project_lead", "casu_lead", "admin"];

function averageRows(rows) {
  if (!rows.length) return null;
  const keys = [...PARAM_FIELDS.flatMap((p) => [`${p.key}_self`, `${p.key}_peer`]), "total_self", "total_peer"];
  const avg = {};
  for (const k of keys) avg[k] = rows.reduce((a, r) => a + Number(r[k]), 0) / rows.length;
  const peer_count = rows.reduce((a, r) => a + r.peer_count, 0);
  const expected_peer_count = rows.reduce((a, r) => a + r.expected_peer_count, 0);
  const sapa_factor = avg.total_self > 0 && avg.total_peer > 0 ? avg.total_self / avg.total_peer : null;
  return { ...avg, peer_count, expected_peer_count, sapa_factor };
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAggregate = AGGREGATE_ROLES.includes(user.role);

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];

  const [selectedWeekIds, setSelectedWeekIds] = useState([]);
  useEffect(() => {
    if (weeks.length && selectedWeekIds.length === 0) {
      const current = [...weeks].reverse().find((w) => w.status !== "upcoming");
      if (current) setSelectedWeekIds([current.id]);
    }
  }, [weeks, selectedWeekIds]);

  const trendQuery = useQuery({
    queryKey: ["trend", user.id],
    queryFn: () => scoresApi.trend(user.id),
  });
  const allRows = trendQuery.data?.trend || [];

  const peerTrendQuery = useQuery({
    queryKey: ["peerTrend", user.id],
    queryFn: () => analyticsApi.peerTrend(user.id),
  });
  const peerTrendRows = peerTrendQuery.data?.trend || [];
  const selectedWeekNums = weeks.filter((w) => selectedWeekIds.includes(w.id)).map((w) => w.week_number);
  const selectedRows = allRows.filter((r) => selectedWeekNums.includes(r.week_number));
  const summary = averageRows(selectedRows);

  const rankingsQuery = useQuery({
    queryKey: ["rankings", selectedWeekIds],
    queryFn: () => analyticsApi.rankings(selectedWeekIds),
    enabled: selectedWeekIds.length > 0,
  });

  // Admin/CASU Lead/Project Lead don't belong to a single field, so "Standing
  // in your field" is meaningless for them — show a field-vs-field
  // leaderboard instead.
  const fieldStandingsQuery = useQuery({
    queryKey: ["fieldStandings", selectedWeekIds],
    queryFn: () => analyticsApi.fieldStandings(selectedWeekIds),
    enabled: selectedWeekIds.length > 0 && !user.field,
  });

  // Aggregate (heatmap/SAPA/quadrant) views are inherently single-week —
  // use the most recent week among the current selection.
  const aggregateWeekId = [...selectedWeekIds].sort((a, b) => b - a)[0];

  const heatmapQuery = useQuery({
    queryKey: ["heatmap", aggregateWeekId],
    queryFn: () => analyticsApi.heatmap(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });
  const sapaQuery = useQuery({
    queryKey: ["sapa", aggregateWeekId],
    queryFn: () => analyticsApi.sapa(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });
  const quadrantQuery = useQuery({
    queryKey: ["quadrant", aggregateWeekId],
    queryFn: () => analyticsApi.quadrant(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;
  if (weeks.length === 0) {
    return <EmptyState title="No weeks yet" message="Ask an Admin to add the first week from the Admin Panel." />;
  }
  if (selectedWeekIds.length === 0) return <Spinner />;

  const isMulti = selectedWeekIds.length > 1;
  const rangeLabel = isMulti
    ? `${selectedWeekIds.length}-week average`
    : weeks.find((w) => w.id === selectedWeekIds[0])?.label || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-500">Pick any week(s) to explore — including a cumulative view across the whole cycle</p>
          </div>
          <RefreshButton
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["trend"] });
              queryClient.invalidateQueries({ queryKey: ["peerTrend"] });
              queryClient.invalidateQueries({ queryKey: ["rankings"] });
              queryClient.invalidateQueries({ queryKey: ["fieldStandings"] });
              queryClient.invalidateQueries({ queryKey: ["heatmap"] });
              queryClient.invalidateQueries({ queryKey: ["sapa"] });
              queryClient.invalidateQueries({ queryKey: ["quadrant"] });
            }}
            isFetching={trendQuery.isFetching || rankingsQuery.isFetching}
            label="Refresh Analytics"
          />
        </div>
      </div>

      <Card className="p-4">
        <WeekSelector weeks={weeks} selectedIds={selectedWeekIds} onChange={setSelectedWeekIds} />
      </Card>

      {/* ── Personal score summary for the selected range ── */}
      {trendQuery.isLoading ? (
        <Spinner />
      ) : !summary ? (
        <Card className="p-6 text-center text-sm text-slate-400">No scored data for this selection yet.</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Self" value={summary.total_self.toFixed(1)} sub={`${rangeLabel} · /49`} tone="accent" />
            <StatCard label="Total Peer" value={summary.total_peer.toFixed(1)} sub={`${summary.peer_count} of ${summary.expected_peer_count} peer responses`} tone="info" />
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">SAPA Factor</p>
              <SAPAGauge sapa={summary.sapa_factor} />
            </Card>
          </div>

          <Card interactive className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Total Peer Score — Week on Week</h2>
            <p className="text-xs text-slate-500 mb-3">
              Your Total Peer Score each week, against your sub-field's average and the overall team's average for
              that same week.
            </p>
            {peerTrendQuery.isLoading ? (
              <Spinner />
            ) : peerTrendQuery.isError ? (
              <ErrorBanner message="Failed to load weekly trend" />
            ) : peerTrendRows.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No weeks have opened yet.</p>
            ) : (
              <PeerScoreTrendChart trend={peerTrendRows} fieldLabel={user.field} />
            )}
          </Card>

          <Card interactive className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Per-Parameter Breakdown — {rangeLabel}</h2>
            <div className="space-y-3">
              {PARAM_FIELDS.map(({ key, label }) => {
                const self = summary[`${key}_self`];
                const peer = summary[`${key}_peer`];
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span>{label}</span>
                      <span className="tabular-nums"><span style={{ color: ACCENT }}>{self.toFixed(1)}</span> self · <span style={{ color: NAV }}>{peer.toFixed(1)}</span> peer</span>
                    </div>
                    <div className="flex gap-1 h-1.5">
                      <div className="flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(self / 7) * 100}%`, background: ACCENT }} /></div>
                      <div className="flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(peer / 7) * 100}%`, background: NAV }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}

      {/* ── Standings ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rankingsQuery.isLoading ? (
          <Spinner />
        ) : rankingsQuery.isError ? (
          <ErrorBanner message="Failed to load rankings" />
        ) : (
          <>
            {user.field ? (
              <RankingCard
                title={`Standing in ${user.field} — ${rangeLabel}`}
                myRank={rankingsQuery.data.field?.myRank}
                total={rankingsQuery.data.field?.totalInField}
                list={rankingsQuery.data.field?.list}
                meId={user.id}
                emptyLabel="Not enough data yet for this range."
              />
            ) : fieldStandingsQuery.isLoading ? (
              <Spinner />
            ) : fieldStandingsQuery.isError ? (
              <ErrorBanner message="Failed to load field standings" />
            ) : (
              <FieldStandingCard
                title={`Field-Wise Standing — ${rangeLabel}`}
                standings={fieldStandingsQuery.data?.standings}
                weekIds={selectedWeekIds}
              />
            )}
            <RankingCard
              title={`Team's Overall Standing — ${rangeLabel}`}
              myRank={rankingsQuery.data.overall?.myRank}
              total={rankingsQuery.data.overall?.totalOverall}
              list={rankingsQuery.data.overall?.list}
              meId={user.id}
            />
          </>
        )}
      </div>

      {/* ── Leads/Admin: full aggregate views (single most-recent selected week) ── */}
      {isAggregate && (
        <>
          <div>
            <h2 className="text-base font-semibold text-slate-800 mt-2">
              Team-Wide Analytics — {weeks.find((w) => w.id === aggregateWeekId)?.label}
            </h2>
            <p className="text-xs text-slate-500">Heatmap, SAPA distribution, and quadrant always reflect a single week — the most recent one selected above.</p>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Field-Wise Performance Heatmap (Peer Scores)</h2>
            {heatmapQuery.isLoading ? <Spinner /> : heatmapQuery.isError ? <ErrorBanner message="Failed to load heatmap" /> : <HeatmapGrid rows={heatmapQuery.data.heatmap} />}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">SAPA Distribution by Role</h2>
              {sapaQuery.isLoading ? <Spinner /> : sapaQuery.isError ? <ErrorBanner message="Failed to load SAPA distribution" /> : <SapaBars rows={sapaQuery.data.byRole} />}
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Quadrant Analysis — Performance vs Sentiment</h2>
              {quadrantQuery.isLoading ? <Spinner /> : quadrantQuery.isError ? <ErrorBanner message="Failed to load quadrant data" /> : <QuadrantPlot points={quadrantQuery.data.points} />}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SapaBars({ rows }) {
  if (!rows.length) return <p className="text-sm text-slate-400">No SAPA data for this week yet.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span className="capitalize">{r.key.replace(/_/g, " ")}</span>
            <span>avg {r.avg ?? "—"}</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
            <div style={{ width: `${r.over}%`, background: "#EF4444" }} title={`Over-raters ${r.over}%`} />
            <div style={{ width: `${r.aligned}%`, background: "#22C55E" }} title={`Aligned ${r.aligned}%`} />
            <div style={{ width: `${r.under}%`, background: "#3B82F6" }} title={`Under-raters ${r.under}%`} />
          </div>
        </div>
      ))}
      <div className="flex gap-3 text-xs text-slate-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Over-raters</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Aligned</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Under-raters</span>
      </div>
    </div>
  );
}
