import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { scoresApi, weeksApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, RefreshButton } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import SAPAGauge from "../components/charts/SAPAGauge.jsx";
import { PARAM_FIELDS, TRAJECTORY_LABELS, ACCENT, NAV } from "../utils/constants.js";

/**
 * My Scores — the ongoing week's score card only (open week if one exists,
 * else the most recently closed one). Multi-week exploration, cumulative
 * views, and rankings live in Analytics instead — this tab mirrors what the
 * demo prototype showed: "what does my current week look like."
 */
export default function ScoresPage({ userId, userLabel }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const targetId = userId || user.id;

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];
  const currentWeek = [...weeks].reverse().find((w) => w.status !== "upcoming");

  const detailQuery = useQuery({
    queryKey: ["score", targetId, currentWeek?.id],
    queryFn: () => scoresApi.userWeek(targetId, currentWeek.id),
    enabled: !!currentWeek,
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;
  if (!currentWeek) return <p className="text-sm text-slate-400">No scored weeks yet.</p>;
  if (detailQuery.isLoading) return <Spinner />;
  if (detailQuery.isError) return <ErrorBanner message="Failed to load this week's score" />;

  const { computed, subjective, user: targetUser } = detailQuery.data;
  const totalSelf = computed ? Number(computed.total_self) : 0;
  const totalPeer = computed ? Number(computed.total_peer) : 0;
  const sapa = computed?.sapa_factor !== null && computed?.sapa_factor !== undefined ? Number(computed.sapa_factor) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Scores</h1>
            <p className="text-sm text-slate-500">{userLabel || targetUser.name} · {targetUser.field || "All Fields"}</p>
          </div>
          <RefreshButton
            onClick={() => queryClient.invalidateQueries({ queryKey: ["score", targetId] })}
            isFetching={detailQuery.isFetching}
            label="Refresh My Scores"
          />
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: currentWeek.status === "open" ? "#DCFCE7" : "#F3F4F6", color: currentWeek.status === "open" ? "#166534" : "#4B5563" }}
        >
          {currentWeek.status === "open" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
          {currentWeek.label} · {currentWeek.status === "open" ? "Open now" : "Last closed week"}
        </span>
      </div>

      {!computed ? (
        <Card className="p-6 text-center text-sm text-slate-400">
          No scores computed for {currentWeek.label} yet — check back once evaluations start coming in.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {PARAM_FIELDS.map(({ key, label }) => (
              <Card key={label} interactive className="p-3 text-center">
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <div className="flex justify-center gap-3">
                  <div>
                    <p className="text-lg font-bold" style={{ color: ACCENT }}>{Number(computed[`${key}_self`])}</p>
                    <p className="text-xs text-slate-400">Self</p>
                  </div>
                  <div className="w-px bg-slate-200" />
                  <div>
                    <p className="text-lg font-bold" style={{ color: NAV }}>{Number(computed[`${key}_peer`])}</p>
                    <p className="text-xs text-slate-400">Peer</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">Self vs Peer — {currentWeek.label}</h2>
              <RadarComparison computed={computed} height={260} />
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">SAPA Factor</p>
              <SAPAGauge sapa={sapa} />
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Total Self" value={totalSelf.toFixed(1)} sub="/49" />
            <StatCard label="Total Peer" value={totalPeer.toFixed(1)} sub={`${computed.peer_count} of ${computed.expected_peer_count} peers responded`} />
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Peer Feedback Received — {currentWeek.label}</h2>
            {!subjective ? (
              <Spinner />
            ) : subjective.peer.responseCount === 0 ? (
              <p className="text-sm text-slate-400">No peer responses received for this week.</p>
            ) : (
              <>
                {(subjective.peer.trajectory.improved > 0 || subjective.peer.trajectory.stayed_same > 0 || subjective.peer.trajectory.declined > 0) && (
                  <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-100">
                    <span className="text-xs text-slate-500 mr-1">Compared to last week:</span>
                    {subjective.peer.trajectory.improved > 0 && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-green-100 text-green-800">
                        {TRAJECTORY_LABELS.improved} × {subjective.peer.trajectory.improved}
                      </span>
                    )}
                    {subjective.peer.trajectory.stayed_same > 0 && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                        {TRAJECTORY_LABELS.stayed_same} × {subjective.peer.trajectory.stayed_same}
                      </span>
                    )}
                    {subjective.peer.trajectory.declined > 0 && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-red-100 text-red-800">
                        {TRAJECTORY_LABELS.declined} × {subjective.peer.trajectory.declined}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Strengths</p>
                    {subjective.peer.strengthsFrequency.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {subjective.peer.strengthsFrequency.map((f) => (
                          <span key={f.tag} className="text-[11px] px-2 py-1 rounded-full bg-green-100 text-green-800">
                            {f.tag} ({f.count})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No strength tags selected this week.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Areas of Improvement</p>
                    {subjective.peer.weaknessFrequency.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {subjective.peer.weaknessFrequency.map((f) => (
                          <span key={f.tag} className="text-[11px] px-2 py-1 rounded-full bg-red-100 text-red-800">
                            {f.tag} ({f.count})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No improvement tags selected this week.</p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">Suggested Actions to Improve</p>
                  <div className="space-y-1.5">
                    {subjective.peer.improvementSuggestions.length ? (
                      subjective.peer.improvementSuggestions.map((r, i) => (
                        <p key={i} className="text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2 border border-slate-100">"{r}"</p>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">No suggestions submitted this week.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
