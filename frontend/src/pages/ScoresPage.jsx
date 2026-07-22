import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { scoresApi, weeksApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import TrendLineChart from "../components/charts/TrendLineChart.jsx";
import SAPAGauge from "../components/charts/SAPAGauge.jsx";
import { PARAM_LABELS, ACCENT, NAV } from "../utils/constants.js";

export default function ScoresPage({ userId, userLabel }) {
  const { user } = useAuth();
  const targetId = userId || user.id;

  const trendQuery = useQuery({ queryKey: ["trend", targetId], queryFn: () => scoresApi.trend(targetId) });
  const trend = trendQuery.data?.trend || [];

  const [selectedWeekNum, setSelectedWeekNum] = useState(null);
  useEffect(() => {
    if (trend.length && selectedWeekNum === null) {
      setSelectedWeekNum(trend[trend.length - 1].week_number);
    }
  }, [trend, selectedWeekNum]);

  const selected = trend.find((t) => t.week_number === selectedWeekNum);

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weekId = weeksQuery.data?.find((w) => w.week_number === selectedWeekNum)?.id;

  const detailQuery = useQuery({
    queryKey: ["score", targetId, weekId],
    queryFn: () => scoresApi.userWeek(targetId, weekId),
    enabled: !!weekId,
  });
  const subjective = detailQuery.data?.subjective;

  if (trendQuery.isLoading) return <Spinner />;
  if (trendQuery.isError) return <ErrorBanner message="Failed to load score trend" />;
  if (!trend.length) return <p className="text-sm text-gray-400">No scored weeks yet.</p>;

  const totalSelf = selected ? Number(selected.total_self) : 0;
  const totalPeer = selected ? Number(selected.total_peer) : 0;
  const sapa = selected?.sapa_factor !== null && selected?.sapa_factor !== undefined ? Number(selected.sapa_factor) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Score Card</h1>
          <p className="text-sm text-gray-500">{userLabel || trendQuery.data.user.name} · {trendQuery.data.user.field || "All Fields"}</p>
        </div>
        <select
          value={selectedWeekNum ?? ""}
          onChange={(e) => setSelectedWeekNum(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {trend.map((t) => (
            <option key={t.week_number} value={t.week_number}>{t.week}</option>
          ))}
        </select>
      </div>

      {selected && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {PARAM_LABELS.map((label, i) => {
              const key = ["sincerity", "team_spirit", "knowledge", "quantity", "quality"][i];
              return (
                <Card key={label} className="p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <div className="flex justify-center gap-3">
                    <div>
                      <p className="text-lg font-bold" style={{ color: ACCENT }}>{Number(selected[`${key}_self`])}</p>
                      <p className="text-xs text-gray-400">Self</p>
                    </div>
                    <div className="w-px bg-gray-200" />
                    <div>
                      <p className="text-lg font-bold" style={{ color: NAV }}>{Number(selected[`${key}_peer`])}</p>
                      <p className="text-xs text-gray-400">Peer</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Self vs Peer — {selected.week}</h2>
              <RadarComparison
                computed={{
                  sincerity_self: selected.sincerity_self, sincerity_peer: selected.sincerity_peer,
                  team_spirit_self: selected.team_spirit_self, team_spirit_peer: selected.team_spirit_peer,
                  knowledge_self: selected.knowledge_self, knowledge_peer: selected.knowledge_peer,
                  quantity_self: selected.quantity_self, quantity_peer: selected.quantity_peer,
                  quality_self: selected.quality_self, quality_peer: selected.quality_peer,
                }}
                height={260}
              />
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-gray-800 mb-2">Week-over-Week Trend</h2>
              <TrendLineChart trend={trend} height={260} />
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Self" value={totalSelf.toFixed(1)} sub="/25" />
            <StatCard label="Total Peer" value={totalPeer.toFixed(1)} sub={`${selected.peer_count} of ${selected.expected_peer_count} peers responded`} />
            <Card className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">SAPA Factor</p>
              <SAPAGauge sapa={sapa} />
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">Peer Feedback Received — {selected.week}</h2>
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
