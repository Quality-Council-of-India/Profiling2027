import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { scoresApi, weeksApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import SAPAGauge from "../components/charts/SAPAGauge.jsx";
import { PARAM_LABELS, ACCENT, NAV } from "../utils/constants.js";

/**
 * My Scores — the ongoing week's score card only (open week if one exists,
 * else the most recently closed one). Multi-week exploration, cumulative
 * views, and rankings live in Analytics instead — this tab mirrors what the
 * demo prototype showed: "what does my current week look like."
 */
export default function ScoresPage({ userId, userLabel }) {
  const { user } = useAuth();
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
  if (!currentWeek) return <p className="text-sm text-gray-400">No scored weeks yet.</p>;
  if (detailQuery.isLoading) return <Spinner />;
  if (detailQuery.isError) return <ErrorBanner message="Failed to load this week's score" />;

  const { computed, subjective, user: targetUser } = detailQuery.data;
  const totalSelf = computed ? Number(computed.total_self) : 0;
  const totalPeer = computed ? Number(computed.total_peer) : 0;
  const sapa = computed?.sapa_factor !== null && computed?.sapa_factor !== undefined ? Number(computed.sapa_factor) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Scores</h1>
          <p className="text-sm text-gray-500">{userLabel || targetUser.name} · {targetUser.field || "All Fields"}</p>
        </div>
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: currentWeek.status === "open" ? "#DCFCE7" : "#F3F4F6", color: currentWeek.status === "open" ? "#166534" : "#4B5563" }}
        >
          {currentWeek.label} · {currentWeek.status === "open" ? "Open now" : "Last closed week"}
        </span>
      </div>

      {!computed ? (
        <Card className="p-6 text-center text-sm text-gray-400">
          No scores computed for {currentWeek.label} yet — check back once evaluations start coming in.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {PARAM_LABELS.map((label, i) => {
              const key = ["sincerity", "team_spirit", "knowledge", "quantity", "quality"][i];
              return (
                <Card key={label} className="p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <div className="flex justify-center gap-3">
                    <div>
                      <p className="text-lg font-bold" style={{ color: ACCENT }}>{Number(computed[`${key}_self`])}</p>
                      <p className="text-xs text-gray-400">Self</p>
                    </div>
                    <div className="w-px bg-gray-200" />
                    <div>
                      <p className="text-lg font-bold" style={{ color: NAV }}>{Number(computed[`${key}_peer`])}</p>
                      <p className="text-xs text-gray-400">Peer</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Self vs Peer — {currentWeek.label}</h2>
              <RadarComparison computed={computed} height={260} />
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">SAPA Factor</p>
              <SAPAGauge sapa={sapa} />
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Total Self" value={totalSelf.toFixed(1)} sub="/25" />
            <StatCard label="Total Peer" value={totalPeer.toFixed(1)} sub={`${computed.peer_count} of ${computed.expected_peer_count} peers responded`} />
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Peer Feedback Received — {currentWeek.label}</h2>
            {!subjective ? (
              <Spinner />
            ) : subjective.peer.responseCount === 0 ? (
              <p className="text-sm text-gray-400">No peer responses received for this week.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Strengths</p>
                  <div className="space-y-1.5">
                    {subjective.peer.strengthComments.length ? (
                      subjective.peer.strengthComments.map((r, i) => (
                        <p key={i} className="text-xs text-gray-600 bg-green-50 rounded-md px-3 py-2 border border-green-100">"{r}"</p>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">No open-ended strength remarks this week.</p>
                    )}
                  </div>
                  {subjective.peer.strengthsFrequency.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {subjective.peer.strengthsFrequency.map((f) => (
                        <span key={f.tag} className="text-[11px] px-2 py-1 rounded-full bg-green-100 text-green-800">
                          {f.tag} ({f.count})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Areas of Improvement</p>
                  <div className="space-y-1.5">
                    {subjective.peer.weaknessComments.length ? (
                      subjective.peer.weaknessComments.map((r, i) => (
                        <p key={i} className="text-xs text-gray-600 bg-red-50 rounded-md px-3 py-2 border border-red-100">"{r}"</p>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">No open-ended improvement remarks this week.</p>
                    )}
                  </div>
                  {subjective.peer.weaknessFrequency.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {subjective.peer.weaknessFrequency.map((f) => (
                        <span key={f.tag} className="text-[11px] px-2 py-1 rounded-full bg-red-100 text-red-800">
                          {f.tag} ({f.count})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
