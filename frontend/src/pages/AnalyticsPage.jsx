import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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
import { PARAM_FIELDS, PARAM_LABELS, ACCENT, NAV, ROLE_LABELS, TRAJECTORY_LABELS } from "../utils/constants.js";

const AGGREGATE_ROLES = ["project_lead", "casu_lead", "admin"];

// Categorical palette for the trend line charts (7 parameters / top-5 tags) —
// distinct enough to tell apart, starting with the app's own NAV/ACCENT so
// the first couple of lines feel consistent with the rest of the portal.
const TREND_COLORS = ["#1F3864", "#E07B00", "#22C55E", "#8B5CF6", "#EC4899", "#0EA5E9", "#78716C"];

function shortTagLabel(tag, max = 28) {
  return tag.length > max ? `${tag.slice(0, max - 1)}…` : tag;
}

function tagLabel(tag, otherText) {
  return tag === "Others" && otherText ? `Others (${otherText})` : tag;
}

// Short forms for the x-axis ticks of the Per-Parameter Breakdown bar chart —
// the full labels (e.g. "Work Quality & Attention to Detail") get clipped.
const SHORT_PARAM_LABELS = {
  ownership_discipline: "Ownership",
  team_spirit: "Team Spirit",
  communication_clarity: "Communication",
  domain_knowledge: "Domain Knowledge",
  timeliness_throughput: "Timeliness",
  work_quality: "Work Quality",
  problem_solving_initiative: "Problem Solving",
};

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
  const isMulti = selectedWeekIds.length > 1;
  useEffect(() => {
    if (weeks.length && selectedWeekIds.length === 0) {
      // Prefer the currently open week — falling back to the most recently
      // closed one otherwise. Just taking the highest week_number (the old
      // logic) picks the wrong week whenever an OLDER week has been
      // reopened for corrections while a NEWER one is still closed.
      const current = weeks.find((w) => w.status === "open") || [...weeks].reverse().find((w) => w.status === "closed");
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

  const selfEvalHistoryQuery = useQuery({
    queryKey: ["selfEvalHistory", user.id],
    queryFn: () => scoresApi.selfEvalHistory(user.id),
  });
  const selfEvalHistory = selfEvalHistoryQuery.data || [];
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
  const parameterAlignmentQuery = useQuery({
    queryKey: ["parameterAlignment", aggregateWeekId],
    queryFn: () => analyticsApi.parameterAlignment(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });
  const parameterAlignmentTrendQuery = useQuery({
    queryKey: ["parameterAlignmentTrend", selectedWeekIds],
    queryFn: () => analyticsApi.parameterAlignmentTrend(selectedWeekIds),
    enabled: isAggregate && isMulti,
  });
  const teamTagsQuery = useQuery({
    queryKey: ["teamTags", aggregateWeekId],
    queryFn: () => analyticsApi.teamTags(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });
  const teamTagTrendQuery = useQuery({
    queryKey: ["teamTagTrend", selectedWeekIds],
    queryFn: () => analyticsApi.teamTagTrend(selectedWeekIds),
    enabled: isAggregate && isMulti,
  });
  const teamFocusSuggestionsQuery = useQuery({
    queryKey: ["teamFocusSuggestions", aggregateWeekId],
    queryFn: () => analyticsApi.teamFocusSuggestions(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });
  const teamTrajectoryQuery = useQuery({
    queryKey: ["teamTrajectory", aggregateWeekId],
    queryFn: () => analyticsApi.teamTrajectory(aggregateWeekId),
    enabled: isAggregate && !!aggregateWeekId,
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;
  if (weeks.length === 0) {
    return <EmptyState title="No weeks yet" message="Ask an Admin to add the first week from the Admin Panel." />;
  }
  if (selectedWeekIds.length === 0) return <Spinner />;

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

      {/* ── Personal score summary for the selected range ──
          Admin never submits or receives evaluations, so there's no personal
          score to show them here — this whole section is scoped to roles
          that actually get scored (everyone else, including Project Lead
          and CASU Lead, who ARE evaluated). */}
      {user.role !== "admin" && (
        <>
          {trendQuery.isLoading ? (
            <Spinner />
          ) : !summary ? (
            <Card className="p-6 text-center text-sm text-slate-400">
              No scored data for this selection yet — check back once evaluations start coming in for {rangeLabel}.
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total Self" value={summary.total_self.toFixed(1)} sub={`${rangeLabel} · /49`} tone="accent" />
                <StatCard label="Total Peer" value={summary.total_peer.toFixed(1)} sub={`${summary.peer_count} of ${summary.expected_peer_count} peer responses`} tone="info" />
                <Card className="p-4 flex flex-col">
                  <h2 className="text-sm font-semibold text-slate-800 mb-2">SAPA Factor</h2>
                  <div className="flex-1 flex flex-col justify-center">
                    <SAPAGauge sapa={summary.sapa_factor} />
                  </div>
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
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={PARAM_FIELDS.map(({ key }) => ({
                    param: SHORT_PARAM_LABELS[key] ?? key,
                    Self: summary[`${key}_self`],
                    Peer: summary[`${key}_peer`],
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="param" tick={{ fontSize: 10.5 }} interval={0} angle={-20} textAnchor="end" height={55} />
                    <YAxis domain={[0, 7]} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => Number(v).toFixed(1)} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Self" fill={ACCENT} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Peer" fill={NAV} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card interactive className="p-5">
                <h2 className="text-sm font-semibold text-slate-800 mb-1">My Self-Evaluation History</h2>
                <p className="text-xs text-slate-500 mb-3">
                  What you said about yourself — trajectory, strengths, areas of improvement, and your improvement
                  plan — for every week you've submitted a Self-Evaluation.
                </p>
                {selfEvalHistoryQuery.isLoading ? (
                  <Spinner />
                ) : selfEvalHistoryQuery.isError ? (
                  <ErrorBanner message="Failed to load Self-Evaluation history" />
                ) : selfEvalHistory.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No Self-Evaluations submitted yet.</p>
                ) : (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase whitespace-nowrap">Week</th>
                          <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase whitespace-nowrap">Trajectory</th>
                          <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Strengths</th>
                          <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Areas of Improvement</th>
                          <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Improvement Plan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selfEvalHistory.map((h) => (
                          <tr key={h.week.id} className="border-b border-slate-50 align-top">
                            <td className="px-2 py-2 font-medium text-slate-700 whitespace-nowrap">{h.week.label}</td>
                            <td className="px-2 py-2 whitespace-nowrap text-slate-600">{TRAJECTORY_LABELS[h.trajectory] || "—"}</td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1">
                                {(h.strengths_tags || []).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">
                                    {tagLabel(tag, h.strengths_other_text)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1">
                                {(h.weakness_tags || []).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800">
                                    {tagLabel(tag, h.weakness_other_text)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-slate-600 max-w-xs">{h.improvement_suggestion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}

      {/* ── Standings ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {rankingsQuery.isLoading ? (
          <Card className="p-6 lg:col-span-2 flex items-center justify-center">
            <Spinner />
          </Card>
        ) : rankingsQuery.isError ? (
          <Card className="p-6 lg:col-span-2">
            <ErrorBanner message="Failed to load rankings" />
          </Card>
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
            <p className="text-xs text-slate-500">
              Heatmap, SAPA distribution, Quadrant, and Team Momentum always reflect a single week — the most recent
              one selected above. Per-Parameter Alignment and Team Strengths & Growth Areas also show a trend across
              your full week selection once you pick more than one.
            </p>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Field-Wise Performance Heatmap (Peer Scores)</h2>
            {heatmapQuery.isLoading ? (
              <Spinner />
            ) : heatmapQuery.isError ? (
              <ErrorBanner message="Failed to load heatmap" />
            ) : (
              <>
                <HeatmapCallout rows={heatmapQuery.data.heatmap} />
                <HeatmapGrid rows={heatmapQuery.data.heatmap} />
              </>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">SAPA Distribution by Role</h2>
              {sapaQuery.isLoading ? <Spinner /> : sapaQuery.isError ? <ErrorBanner message="Failed to load SAPA distribution" /> : <SapaBars rows={sapaQuery.data.byRole} />}
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Quadrant Analysis — Performance vs Sentiment</h2>
              {quadrantQuery.isLoading ? <Spinner /> : quadrantQuery.isError ? <ErrorBanner message="Failed to load quadrant data" /> : <QuadrantPlot points={quadrantQuery.data.points} />}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Per-Parameter Alignment — Self vs Peer</h2>
            <p className="text-xs text-slate-500 mb-4">
              For each parameter, what share of the team is Aligned, has Some Gap, or a Large Gap between their
              self-rating and how peers rated them — the same comparison as the individual scorecard, rolled up
              team-wide.
            </p>
            {parameterAlignmentQuery.isLoading ? (
              <Spinner />
            ) : parameterAlignmentQuery.isError ? (
              <ErrorBanner message="Failed to load parameter alignment" />
            ) : (
              <ParameterAlignmentBars rows={parameterAlignmentQuery.data.alignment} />
            )}
            {isMulti && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-600 mb-2">
                  % Aligned — trend across your {selectedWeekIds.length} selected weeks
                </p>
                {parameterAlignmentTrendQuery.isLoading ? (
                  <Spinner />
                ) : parameterAlignmentTrendQuery.isError ? (
                  <ErrorBanner message="Failed to load alignment trend" />
                ) : (
                  <ParameterAlignmentTrendChart rows={parameterAlignmentTrendQuery.data.trend} />
                )}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">Team Strengths & Growth Areas</h2>
              <p className="text-xs text-slate-500 mb-3">Most-selected Strength and Area of Improvement tags across every peer evaluation this week.</p>
              {teamTagsQuery.isLoading ? (
                <Spinner />
              ) : teamTagsQuery.isError ? (
                <ErrorBanner message="Failed to load team tags" />
              ) : (
                <>
                  <TeamTagsCallout strengths={teamTagsQuery.data.strengths} weaknesses={teamTagsQuery.data.weaknesses} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Top Strengths</p>
                      <TagRankBars items={teamTagsQuery.data.strengths} color="#22C55E" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Top Areas of Improvement</p>
                      <TagRankBars items={teamTagsQuery.data.weaknesses} color="#EF4444" />
                    </div>
                  </div>
                  {isMulti && (
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-600 mb-2">
                        Trend across your {selectedWeekIds.length} selected weeks
                      </p>
                      {teamTagTrendQuery.isLoading ? (
                        <Spinner />
                      ) : teamTagTrendQuery.isError ? (
                        <ErrorBanner message="Failed to load tag trend" />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[11px] font-medium text-green-700 uppercase tracking-wide mb-1">Top Strengths</p>
                            <TagTrendChart tags={teamTagTrendQuery.data.strengthTags} data={teamTagTrendQuery.data.strengthTrend} />
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-red-700 uppercase tracking-wide mb-1">Top Areas of Improvement</p>
                            <TagTrendChart tags={teamTagTrendQuery.data.weaknessTags} data={teamTagTrendQuery.data.weaknessTrend} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">What the Team Should Focus On</h2>
              <p className="text-xs text-slate-500 mb-4">
                The most-repeated peer suggestions to "What is the single most impactful action this person could
                take to improve?" — similarly-worded suggestions are grouped together, peer-only.
              </p>
              {teamFocusSuggestionsQuery.isLoading ? (
                <Spinner />
              ) : teamFocusSuggestionsQuery.isError ? (
                <ErrorBanner message="Failed to load focus suggestions" />
              ) : (
                <TeamFocusSuggestions data={teamFocusSuggestionsQuery.data} />
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Team Momentum</h2>
            <p className="text-xs text-slate-500 mb-4">
              Share of peer Trajectory answers this week saying the person Improved, Stayed the Same, or Declined
              compared to last week.
            </p>
            {teamTrajectoryQuery.isLoading ? (
              <Spinner />
            ) : teamTrajectoryQuery.isError ? (
              <ErrorBanner message="Failed to load team momentum" />
            ) : (
              <TeamMomentum data={teamTrajectoryQuery.data} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** The parameter with the widest combined Some Gap + Large Gap share — surfaced as a one-line callout. */
function widestGapParameter(rows) {
  let best = null;
  for (const r of rows) {
    if (!r.total) continue;
    const someGapPct = Math.round((r.someGap / r.total) * 100);
    const largeGapPct = Math.round((r.largeGap / r.total) * 100);
    const gapPct = someGapPct + largeGapPct;
    if (!best || gapPct > best.gapPct) best = { label: r.label, gapPct, someGapPct, largeGapPct };
  }
  return best;
}

function ParameterAlignmentBars({ rows }) {
  if (!rows || rows.every((r) => r.total === 0)) {
    return <p className="text-sm text-slate-400 text-center py-8">No scored data for this week yet.</p>;
  }
  const totalScored = rows.find((r) => r.total > 0)?.total || 0;
  const callout = widestGapParameter(rows);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Based on {totalScored} scored team member{totalScored === 1 ? "" : "s"} this week.</p>
      {callout && callout.gapPct > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          <span className="font-medium">{callout.label}</span> has the widest self-vs-peer gap on the team this
          week — {callout.someGapPct}% Some Gap, {callout.largeGapPct}% Large Gap.
        </p>
      )}
      {rows.map((r) => {
        const total = r.total || 1;
        const alignedPct = Math.round((r.aligned / total) * 100);
        const someGapPct = Math.round((r.someGap / total) * 100);
        const largeGapPct = Math.max(0, 100 - alignedPct - someGapPct);
        return (
          <div key={r.key}>
            <div className="text-xs text-slate-600 mb-1">{r.label}</div>
            <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-100">
              {alignedPct > 0 && <div style={{ width: `${alignedPct}%`, background: "#22C55E" }} title={`Aligned ${alignedPct}%`} />}
              {someGapPct > 0 && <div style={{ width: `${someGapPct}%`, background: "#F59E0B" }} title={`Some Gap ${someGapPct}%`} />}
              {largeGapPct > 0 && <div style={{ width: `${largeGapPct}%`, background: "#EF4444" }} title={`Large Gap ${largeGapPct}%`} />}
            </div>
          </div>
        );
      })}
      <div className="flex gap-4 justify-center pt-1 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#22C55E" }} /> Aligned</span>
        <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#F59E0B" }} /> Some Gap</span>
        <span className="flex items-center gap-1 text-xs text-slate-500"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#EF4444" }} /> Large Gap</span>
      </div>
    </div>
  );
}

/** Multi-week % Aligned trend, one line per parameter — shown once more than one week is selected. */
function ParameterAlignmentTrendChart({ rows }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-400 text-center py-6">No data for this selection yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => (v === null || v === undefined ? "—" : `${v}%`)} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} formatter={(key) => SHORT_PARAM_LABELS[key] ?? key} />
        {PARAM_FIELDS.map((p, i) => (
          <Line
            key={p.key}
            type="monotone"
            dataKey={p.key}
            name={SHORT_PARAM_LABELS[p.key] ?? p.key}
            stroke={TREND_COLORS[i % TREND_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Multi-week frequency trend for a fixed top-N set of tags (either all-strength or all-weakness). */
function TagTrendChart({ tags, data }) {
  if (!data || data.length === 0 || !tags || tags.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">No data for this selection yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} formatter={(tag) => shortTagLabel(tag)} />
        {tags.map((tag, i) => (
          <Line key={tag} type="monotone" dataKey={tag} name={tag} stroke={TREND_COLORS[i % TREND_COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** One-line callout naming the single most-recognized strength and most-flagged growth area. */
function TeamTagsCallout({ strengths, weaknesses }) {
  if (!strengths?.length && !weaknesses?.length) return null;
  return (
    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-3 py-2 mb-3">
      {strengths?.length ? (
        <>
          Most recognized: <span className="font-medium">"{strengths[0].tag}"</span>.{" "}
        </>
      ) : null}
      {weaknesses?.length ? (
        <>
          Most flagged to improve: <span className="font-medium">"{weaknesses[0].tag}"</span>.
        </>
      ) : null}
    </p>
  );
}

/** One-line callout naming the strongest and weakest field/parameter cell in the heatmap. */
function HeatmapCallout({ rows }) {
  if (!rows || rows.length === 0) return null;
  let best = null;
  let worst = null;
  for (const row of rows) {
    for (const label of PARAM_LABELS) {
      const v = row[label];
      if (v === undefined || v === null) continue;
      if (!best || v > best.value) best = { field: row.field, param: label, value: v };
      if (!worst || v < worst.value) worst = { field: row.field, param: label, value: v };
    }
  }
  if (!best || !worst) return null;
  return (
    <p className="text-xs text-slate-500 mb-3">
      Strongest cell: <span className="font-medium text-slate-700">{best.field}</span> on {best.param} (
      {best.value.toFixed(1)}). Weakest cell: <span className="font-medium text-slate-700">{worst.field}</span> on{" "}
      {worst.param} ({worst.value.toFixed(1)}).
    </p>
  );
}

/** Ranked list of clustered peer "focus" suggestions, replacing the old word cloud. */
function TeamFocusSuggestions({ data }) {
  if (!data || !data.items || data.items.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No suggestions submitted yet this week.</p>;
  }
  const top = data.items[0].count;
  return (
    <div className="space-y-2.5">
      {data.items.map((item, i) => (
        <div key={i} className="border border-slate-100 rounded-lg p-2.5">
          <p className="text-xs text-slate-700 mb-1.5">{item.text}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full" style={{ width: `${top > 0 ? (item.count / top) * 100 : 0}%`, background: NAV }} />
            </div>
            <span className="text-[11px] text-slate-400 flex-shrink-0">{item.count} · {item.pct}%</span>
          </div>
          {item.selfOverlapCount > 0 && (
            <p className="text-[11px] text-slate-400 mt-1">Also self-identified in {item.selfOverlapPct}% of self-evaluations.</p>
          )}
        </div>
      ))}
      <p className="text-[11px] text-slate-400 pt-1">
        Based on {data.totalPeerSuggestions} peer suggestion{data.totalPeerSuggestions === 1 ? "" : "s"} this week
        {data.totalSelfSuggestions > 0 ? ` · compared against ${data.totalSelfSuggestions} self-evaluations` : ""}.
      </p>
    </div>
  );
}

function TagRankBars({ items, color }) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-slate-400">No tags selected this week.</p>;
  }
  const top = items[0].count;
  return (
    <div className="space-y-2">
      {items.map((t) => (
        <div key={t.tag}>
          <div className="flex justify-between text-xs text-slate-600 mb-0.5 gap-2">
            <span className="truncate">{t.tag}</span>
            <span className="text-slate-400 flex-shrink-0">{t.count}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full" style={{ width: `${top > 0 ? (t.count / top) * 100 : 0}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamMomentum({ data }) {
  if (!data || data.scoredTotal === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">Not enough data yet — first scored week, or no prior week to compare against.</p>;
  }
  const { counts, scoredTotal } = data;
  const pct = (n) => Math.round((n / scoredTotal) * 100);
  const excluded = data.total - scoredTotal;
  return (
    <div>
      <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 mb-2">
        <div style={{ width: `${pct(counts.improved)}%`, background: "#22C55E" }} title={`Improved ${pct(counts.improved)}%`} />
        <div style={{ width: `${pct(counts.stayed_same)}%`, background: "#94A3B8" }} title={`Stayed the Same ${pct(counts.stayed_same)}%`} />
        <div style={{ width: `${pct(counts.declined)}%`, background: "#EF4444" }} title={`Declined ${pct(counts.declined)}%`} />
      </div>
      <div className="flex justify-center gap-4 text-xs text-slate-600 flex-wrap">
        <span><span className="font-semibold text-green-700">{pct(counts.improved)}%</span> Improved</span>
        <span><span className="font-semibold text-slate-500">{pct(counts.stayed_same)}%</span> Stayed the Same</span>
        <span><span className="font-semibold text-red-600">{pct(counts.declined)}%</span> Declined</span>
      </div>
      {excluded > 0 && (
        <p className="text-[11px] text-slate-400 text-center mt-2">
          {excluded} response{excluded === 1 ? "" : "s"} excluded — first-time pairing, no prior week to compare.
        </p>
      )}
    </div>
  );
}

function SapaBars({ rows }) {
  const [expandedKey, setExpandedKey] = useState(null);
  if (!rows.length) return <p className="text-sm text-slate-400">No SAPA data for this week yet.</p>;
  return (
    <div className="space-y-5">
      {rows.map((r) => {
        const isOpen = expandedKey === r.key;
        return (
          <div key={r.key}>
            <button
              onClick={() => setExpandedKey(isOpen ? null : r.key)}
              className="w-full text-left"
            >
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span className="capitalize">{ROLE_LABELS[r.key] || r.key.replace(/_/g, " ")}</span>
                <span>avg {r.avg ?? "—"} {isOpen ? "▲" : "▼"}</span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                <div style={{ width: `${r.over}%`, background: "#EF4444" }} title={`Over-raters ${r.over}%`} />
                <div style={{ width: `${r.aligned}%`, background: "#22C55E" }} title={`Aligned ${r.aligned}%`} />
                <div style={{ width: `${r.under}%`, background: "#3B82F6" }} title={`Under-raters ${r.under}%`} />
              </div>
            </button>
            {isOpen && r.members && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <SapaMemberGroup label="Over-raters" color="#EF4444" members={r.members.over} />
                <SapaMemberGroup label="Aligned" color="#22C55E" members={r.members.aligned} />
                <SapaMemberGroup label="Under-raters" color="#3B82F6" members={r.members.under} />
              </div>
            )}
          </div>
        );
      })}
      <div className="flex gap-3 text-xs text-slate-500 pt-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Over-raters</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Aligned</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Under-raters</span>
      </div>
    </div>
  );
}

function SapaMemberGroup({ label, color, members }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[11px] font-semibold text-slate-700">{label}</span>
        <span className="text-[11px] text-slate-400">({members.length})</span>
      </div>
      {members.length === 0 ? (
        <p className="text-[11px] text-slate-400">No one here.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {members.map((m) => (
            <span key={m.id} title={`SAPA ${m.sapa.toFixed(2)}`} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-50 border border-slate-100 text-slate-700">
              {m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
