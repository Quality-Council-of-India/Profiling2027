import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { scoresApi, weeksApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, RefreshButton } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import SAPAGauge from "../components/charts/SAPAGauge.jsx";
import { PARAM_FIELDS, TRAJECTORY_LABELS, ACCENT, NAV } from "../utils/constants.js";

function tagLabel(tag, otherText) {
  return tag === "Others" && otherText ? `Others (${otherText})` : tag;
}

/**
 * Compares what someone said about themselves against what their peers
 * said, using data already fetched for this page — no extra request.
 * Deliberately conservative: only flags a strength with literally zero
 * peer agreement, or a weakness at least 2 peers raised that the person
 * didn't mention themselves. Informational, not a verdict.
 */
function selfAwarenessGaps(subjective) {
  if (!subjective?.self || !subjective.peer || subjective.peer.responseCount === 0) return null;
  const peerResponseCount = subjective.peer.responseCount;
  const peerStrengthMap = Object.fromEntries(subjective.peer.strengthsFrequency.map((f) => [f.tag, f.count]));
  const selfWeaknesses = subjective.self.weakness_tags || [];

  const unconfirmedStrengths = (subjective.self.strengths_tags || []).filter(
    (t) => t !== "Others" && !peerStrengthMap[t]
  );
  const blindSpotWeaknesses = subjective.peer.weaknessFrequency.filter(
    (f) => f.tag !== "Others" && f.count >= 2 && !selfWeaknesses.includes(f.tag)
  );

  if (unconfirmedStrengths.length === 0 && blindSpotWeaknesses.length === 0) return null;
  return { peerResponseCount, unconfirmedStrengths, blindSpotWeaknesses };
}

/**
 * My Scores — defaults to the ongoing week (open week if one exists, else
 * the most recently closed one), but a week selector lets you pull up any
 * past week's score card too. Multi-week/cumulative trends and rankings
 * still live in Analytics instead — this tab is about one week at a time.
 */
export default function ScoresPage({ userId, userLabel }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const targetId = userId || user.id;
  const isOwnView = !userId;

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];
  const [selectedWeekId, setSelectedWeekId] = useState(null);
  useEffect(() => {
    // Prefer the currently open week over just the highest week_number — an
    // older week reopened for corrections should take over here, not stay
    // shadowed by a newer week that's merely still closed. Only picks a
    // default once; after that, the dropdown is fully in the user's control.
    if (weeks.length && selectedWeekId === null) {
      const current = weeks.find((w) => w.status === "open") || [...weeks].reverse().find((w) => w.status === "closed");
      setSelectedWeekId(current?.id ?? weeks[weeks.length - 1].id);
    }
  }, [weeks, selectedWeekId]);
  const currentWeek = weeks.find((w) => w.id === selectedWeekId);

  const detailQuery = useQuery({
    queryKey: ["score", targetId, currentWeek?.id],
    queryFn: () => scoresApi.userWeek(targetId, currentWeek.id),
    enabled: !!currentWeek,
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;
  if (weeks.length === 0) return <p className="text-sm text-slate-400">No scored weeks yet.</p>;
  if (!currentWeek) return <Spinner />;
  if (detailQuery.isLoading) return <Spinner />;
  if (detailQuery.isError) return <ErrorBanner message="Failed to load this week's score" />;

  const { computed, subjective, user: targetUser } = detailQuery.data;
  const totalSelf = computed ? Number(computed.total_self) : 0;
  const totalPeer = computed ? Number(computed.total_peer) : 0;
  const sapa = computed?.sapa_factor !== null && computed?.sapa_factor !== undefined ? Number(computed.sapa_factor) : null;
  const gaps = selfAwarenessGaps(subjective);

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
        <div className="flex items-center gap-2">
          <select
            value={selectedWeekId ?? ""}
            onChange={(e) => setSelectedWeekId(Number(e.target.value))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: currentWeek.status === "open" ? "#DCFCE7" : "#F3F4F6", color: currentWeek.status === "open" ? "#166534" : "#4B5563" }}
          >
            {currentWeek.status === "open" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
            {currentWeek.status === "open" ? "Open now" : currentWeek.status === "closed" ? "Closed" : "Upcoming"}
          </span>
        </div>
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
            <Card className="p-4 flex flex-col">
              <h2 className="text-sm font-semibold text-slate-800 mb-2">SAPA Factor</h2>
              <div className="flex-1 flex flex-col justify-center">
                <SAPAGauge sapa={sapa} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label="Total Self" value={totalSelf.toFixed(1)} sub="/49" tone="accent" />
            <StatCard label="Total Peer" value={totalPeer.toFixed(1)} sub={`${computed.peer_count} of ${computed.expected_peer_count} peers responded`} tone="info" />
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">My Self-Evaluation — {currentWeek.label}</h2>
            {!subjective ? (
              <Spinner />
            ) : !subjective.self ? (
              <p className="text-sm text-slate-400">
                {isOwnView ? "You haven't" : "They haven't"} submitted a Self-Evaluation for this week yet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-100">
                  <span className="text-xs text-slate-500 mr-1">Compared to last week:</span>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                    {TRAJECTORY_LABELS[subjective.self.trajectory] || "—"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">Strengths</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(subjective.self.strengths_tags || []).map((tag) => (
                        <span key={tag} className="text-[11px] px-2 py-1 rounded-full bg-green-100 text-green-800">
                          {tagLabel(tag, subjective.self.strengths_other_text)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Areas of Improvement</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(subjective.self.weakness_tags || []).map((tag) => (
                        <span key={tag} className="text-[11px] px-2 py-1 rounded-full bg-red-100 text-red-800">
                          {tagLabel(tag, subjective.self.weakness_other_text)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">My Improvement Plan</p>
                  <p className="text-xs text-slate-600 bg-slate-50 rounded-md px-3 py-2 border border-slate-100">
                    "{subjective.self.improvement_suggestion}"
                  </p>
                </div>
              </>
            )}
          </Card>

          {gaps && (
            <Card className="p-5 border-amber-200 bg-amber-50/50">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">Self-Awareness Check — {currentWeek.label}</h2>
              <p className="text-xs text-slate-500 mb-3">
                A quick comparison between what {isOwnView ? "you said" : "they said"} about{" "}
                {isOwnView ? "yourself" : "themselves"} and what {gaps.peerResponseCount} peer
                {gaps.peerResponseCount === 1 ? "" : "s"} said. Not a verdict — just worth a look.
              </p>
              <div className="space-y-1.5">
                {gaps.unconfirmedStrengths.map((tag) => (
                  <p key={`s-${tag}`} className="text-xs text-slate-600">
                    {isOwnView ? "You" : "They"} picked <strong>{tag}</strong> as a strength — none of the{" "}
                    {gaps.peerResponseCount} peer{gaps.peerResponseCount === 1 ? "" : "s"} who responded agreed.
                  </p>
                ))}
                {gaps.blindSpotWeaknesses.map((f) => (
                  <p key={`w-${f.tag}`} className="text-xs text-slate-600">
                    {f.count} of {gaps.peerResponseCount} peers flagged <strong>{f.tag}</strong> as an area to improve
                    — {isOwnView ? "you didn't" : "they didn't"} mention it{" "}
                    {isOwnView ? "yourself" : "themselves"}.
                  </p>
                ))}
              </div>
            </Card>
          )}

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
