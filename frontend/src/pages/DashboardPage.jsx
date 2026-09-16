import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, evaluationsApi, scoresApi, analyticsApi, downloadExport } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, RefreshButton } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import { ComplianceIcon, AnalyticsIcon, AdminIcon } from "../components/icons.jsx";
import { ACCENT, ROLE_LABELS } from "../utils/constants.js";

function formatDateRange(start, end) {
  if (!start || !end) return "";
  const opts = { month: "short", day: "numeric" };
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}${sameYear ? `, ${e.getFullYear()}` : ""}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["weeks"] });
    queryClient.invalidateQueries({ queryKey: ["pending"] });
    queryClient.invalidateQueries({ queryKey: ["score"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardSignals"] });
  }

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;

  const weeks = weeksQuery.data || [];
  const openWeek = weeks.find((w) => w.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center bg-nav/10 text-nav font-display font-bold text-lg flex-shrink-0">
          {user.photo_url ? (
            <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Welcome, {user.name.split(" ")[0]}</h1>
            <RefreshButton onClick={handleRefresh} isFetching={weeksQuery.isFetching} label="Refresh Dashboard" />
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {openWeek ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {openWeek.label} is currently open · {formatDateRange(openWeek.start_date, openWeek.end_date)}
              </span>
            ) : (
              "No week is currently open for submissions"
            )}
          </p>
        </div>
      </div>

      {user.role === "admin" ? (
        <AdminSummary weeks={weeks} openWeek={openWeek} />
      ) : (
        <ProfessionalSummary user={user} weeks={weeks} openWeek={openWeek} />
      )}
    </div>
  );
}

function AdminSummary({ weeks, openWeek }) {
  const closedCount = weeks.filter((w) => w.status === "closed").length;
  const upcomingCount = weeks.filter((w) => w.status === "upcoming").length;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Open Week" value={openWeek ? openWeek.label : "None"} sub={openWeek ? `Closes ${new Date(openWeek.end_date).toLocaleDateString()}` : "Open one from Admin Panel"} />
        <StatCard label="Closed Weeks" value={closedCount} sub="Scored & available for export" />
        <StatCard label="Upcoming Weeks" value={upcomingCount} sub="Not yet opened" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickLink to="/compliance" Icon={ComplianceIcon} title="Compliance Tracker" desc="See who's filled their forms and send reminders" />
        <QuickLink to="/analytics" Icon={AnalyticsIcon} title="Analytics" desc="Field heatmaps, SAPA distribution, quadrant plot" />
        <QuickLink to="/admin" Icon={AdminIcon} title="Admin Panel" desc="Open/close weeks, import roster, export scores" />
      </div>
      <AttentionSignalsCard weeks={weeks} />
    </>
  );
}

function personHeader(p) {
  return (
    <p className="text-xs font-semibold text-slate-800">
      {p.name} <span className="text-slate-400 font-normal">({ROLE_LABELS[p.role] || p.role}{p.field ? ` · ${p.field}` : ""})</span>
    </p>
  );
}

function personLine(p, suffix) {
  if (!p) return null;
  return (
    <div>
      {personHeader(p)}
      <p className="text-xs text-slate-500">{suffix}</p>
    </div>
  );
}

/** Declining-trend entry — kept as two lines (label, then the number sequence) rather than one run-on sentence. */
function declineLine(p) {
  const weeks = p.recentWeeks;
  const sequence = weeks.map((w) => w.totalPeer.toFixed(1)).join(" → ");
  const range = weeks.length > 1 ? `(${weeks[0].week} to ${weeks[weeks.length - 1].week})` : `(${weeks[0].week})`;
  return (
    <div key={p.id}>
      {personHeader(p)}
      <p className="text-xs text-slate-500">Total Peer Score has fallen for {weeks.length - 1} weeks running:</p>
      <p className="text-xs text-slate-500">
        {sequence} <span className="text-slate-400">{range}</span>
      </p>
    </div>
  );
}

/**
 * Admin-only proactive signals — patterns a manual read of Analytics would
 * eventually surface, pulled to the front so an Admin doesn't have to go
 * looking for them: multi-week declining performers, this week's most
 * strength/weakness-tagged person (by average per response received, not
 * raw count — see weeklyTagLeaders.minResponses below), and whose peer
 * feedback has skewed most positive/constructive, this week and over the
 * whole cycle so far.
 *
 * Nothing here is stored or snapshotted separately — it's computed on
 * demand from the same underlying data every other Analytics card reads
 * (same as Hall of Recognition), which is itself frozen per week at close
 * time. The week selector below lets an Admin revisit an earlier week's
 * signals exactly as they were as of that week — since a closed week's
 * data doesn't change, recomputing it later gives the same answer it
 * would have at the time.
 */
function AttentionSignalsCard({ weeks }) {
  const scoredWeeks = weeks.filter((w) => w.status !== "upcoming");
  const [asOfWeekId, setAsOfWeekId] = useState(null);
  useEffect(() => {
    if (scoredWeeks.length && asOfWeekId === null) {
      setAsOfWeekId(scoredWeeks[scoredWeeks.length - 1].id);
    }
  }, [scoredWeeks, asOfWeekId]);

  const signalsQuery = useQuery({
    queryKey: ["dashboardSignals", asOfWeekId],
    queryFn: () => analyticsApi.dashboardSignals(asOfWeekId),
    enabled: asOfWeekId !== null,
  });

  if (scoredWeeks.length === 0) return null;

  if (signalsQuery.isLoading) {
    return (
      <Card className="p-5">
        <Spinner />
      </Card>
    );
  }
  if (signalsQuery.isError) {
    return (
      <Card className="p-5">
        <ErrorBanner message="Failed to load attention signals" />
      </Card>
    );
  }

  const { decliningPerformers, weeklyTagLeaders, suggestionLeaders, weeklySuggestionLeaders } = signalsQuery.data;
  const nothingToShow =
    decliningPerformers.length === 0 &&
    !weeklyTagLeaders?.mostStrengthTags &&
    !weeklyTagLeaders?.mostWeaknessTags &&
    !weeklySuggestionLeaders?.mostPositive &&
    !weeklySuggestionLeaders?.mostCritical &&
    !suggestionLeaders?.mostPositive &&
    !suggestionLeaders?.mostCritical;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-sm font-semibold text-slate-800">Attention & Recognition Signals</h2>
        <select
          value={asOfWeekId ?? ""}
          onChange={(e) => setAsOfWeekId(Number(e.target.value))}
          className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
        >
          {scoredWeeks.map((w) => (
            <option key={w.id} value={w.id}>
              As of {w.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-slate-500 mb-4">Visible to Admins only — patterns worth a look before the next week opens.</p>

      {nothingToShow ? (
        <p className="text-sm text-slate-400">Nothing flagged yet — check back once more weeks are scored.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <div>
            <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">
              Declining Trend ({decliningPerformers.length})
            </p>
            {decliningPerformers.length === 0 ? (
              <p className="text-xs text-slate-400">No one on a multi-week decline right now.</p>
            ) : (
              <div className="space-y-3">{decliningPerformers.map(declineLine)}</div>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-2">
              This Week's Recognition{weeklyTagLeaders?.week ? ` — ${weeklyTagLeaders.week.label}` : ""}
            </p>
            <p className="text-[11px] text-slate-400 mb-1.5">
              Ranked by average tags per peer response (min. {weeklyTagLeaders?.minResponses} responses) — not raw count,
              since roles differ a lot in how many peers evaluate them.
            </p>
            <div className="space-y-2">
              {weeklyTagLeaders?.mostStrengthTags
                ? personLine(
                    weeklyTagLeaders.mostStrengthTags,
                    `${weeklyTagLeaders.mostStrengthTags.avgPerResponse.toFixed(1)} avg strength tags/response (${weeklyTagLeaders.mostStrengthTags.totalCount} across ${weeklyTagLeaders.mostStrengthTags.responseCount} responses)`
                  )
                : <p className="text-xs text-slate-400">Not enough responses yet this week.</p>}
              {weeklyTagLeaders?.mostWeaknessTags
                ? personLine(
                    weeklyTagLeaders.mostWeaknessTags,
                    `${weeklyTagLeaders.mostWeaknessTags.avgPerResponse.toFixed(1)} avg improvement-area tags/response (${weeklyTagLeaders.mostWeaknessTags.totalCount} across ${weeklyTagLeaders.mostWeaknessTags.responseCount} responses)`
                  )
                : <p className="text-xs text-slate-400">Not enough responses yet this week.</p>}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
              Peer Suggestions — {weeklySuggestionLeaders?.week ? weeklySuggestionLeaders.week.label : "This Week"}
            </p>
            <p className="text-[11px] text-slate-400 mb-1.5">
              Ranked by share of a person's own substantive suggestions (min. {weeklySuggestionLeaders?.minSubstantiveSuggestions}) —
              not raw count, for the same reason as above.
            </p>
            <div className="space-y-2">
              {weeklySuggestionLeaders?.mostPositive
                ? personLine(
                    weeklySuggestionLeaders.mostPositive,
                    `${weeklySuggestionLeaders.mostPositive.pct}% positive / no-action (${weeklySuggestionLeaders.mostPositive.count} of ${weeklySuggestionLeaders.mostPositive.substantiveTotal})`
                  )
                : <p className="text-xs text-slate-400">Not enough suggestions yet this week.</p>}
              {weeklySuggestionLeaders?.mostCritical
                ? personLine(
                    weeklySuggestionLeaders.mostCritical,
                    `${weeklySuggestionLeaders.mostCritical.pct}% constructive/critical (${weeklySuggestionLeaders.mostCritical.count} of ${weeklySuggestionLeaders.mostCritical.substantiveTotal})`
                  )
                : <p className="text-xs text-slate-400">Not enough suggestions yet this week.</p>}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
              Peer Suggestions — Whole Cycle So Far
            </p>
            <p className="text-[11px] text-slate-400 mb-1.5">Same share-based ranking, pooled across every week so far.</p>
            <div className="space-y-2">
              {suggestionLeaders?.mostPositive
                ? personLine(
                    suggestionLeaders.mostPositive,
                    `${suggestionLeaders.mostPositive.pct}% positive / no-action (${suggestionLeaders.mostPositive.count} of ${suggestionLeaders.mostPositive.substantiveTotal})`
                  )
                : <p className="text-xs text-slate-400">Not enough suggestions recorded yet.</p>}
              {suggestionLeaders?.mostCritical
                ? personLine(
                    suggestionLeaders.mostCritical,
                    `${suggestionLeaders.mostCritical.pct}% constructive/critical (${suggestionLeaders.mostCritical.count} of ${suggestionLeaders.mostCritical.substantiveTotal})`
                  )
                : <p className="text-xs text-slate-400">Not enough suggestions recorded yet.</p>}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function QuickLink({ to, Icon, title, desc }) {
  return (
    <Link to={to} className="block group">
      <Card interactive className="p-5 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-nav/10 text-nav flex items-center justify-center flex-shrink-0 group-hover:bg-accent/10 group-hover:text-accent transition-standard">
          <Icon />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500 mt-1">{desc}</p>
        </div>
      </Card>
    </Link>
  );
}

function ProfessionalSummary({ user, weeks, openWeek }) {
  const pendingQuery = useQuery({ queryKey: ["pending"], queryFn: evaluationsApi.pending, retry: false });
  // Prefer the currently open week over just the highest week_number — so
  // the Radar/stat cards below follow whichever week is actually open, even
  // if it's an older week reopened for corrections while a newer one is
  // still (temporarily) closed. The Scorecard download is deliberately
  // still keyed to the latest CLOSED week — an open week's scores aren't final.
  const latestScoredWeek = weeks.find((w) => w.status === "open") || [...weeks].reverse().find((w) => w.status === "closed");
  const latestClosedWeek = [...weeks].reverse().find((w) => w.status === "closed");
  // A week that's open AND has a closed_at is being REOPENED for a
  // correction (as opposed to opened for the first time) — the Scorecard
  // is hidden entirely while that's in progress, since whatever it would
  // currently offer isn't the final corrected report yet. It reappears
  // automatically once that week closes again.
  const reopenedWeek = weeks.find((w) => w.status === "open" && w.closed_at);
  const [scorecardError, setScorecardError] = useState("");
  const [downloadingScorecard, setDownloadingScorecard] = useState(false);

  async function handleDownloadScorecard() {
    if (!latestClosedWeek) return;
    setScorecardError("");
    setDownloadingScorecard(true);
    try {
      await downloadExport(`/export/scorecard/${latestClosedWeek.id}`, `${user.name.replace(/\s+/g, "_")}_${latestClosedWeek.label.replace(/\s+/g, "_")}_Scorecard.docx`);
    } catch (err) {
      setScorecardError(err.response?.data?.error || "Failed to generate scorecard");
    } finally {
      setDownloadingScorecard(false);
    }
  }

  const scoreQuery = useQuery({
    queryKey: ["score", user.id, latestScoredWeek?.id],
    queryFn: () => scoresApi.userWeek(user.id, latestScoredWeek.id),
    enabled: !!latestScoredWeek,
  });

  const pending = pendingQuery.data?.pending;
  const computed = scoreQuery.data?.computed;
  const peerDataLocked = scoreQuery.data?.peerDataLocked;
  const totalSelf = computed ? Number(computed.total_self) : 0;
  const totalPeer = computed ? Number(computed.total_peer) : 0;
  const sapa = computed?.sapa_factor !== null && computed?.sapa_factor !== undefined ? Number(computed.sapa_factor) : null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Self Score" value={totalSelf.toFixed(1)} sub="Out of 49" tone="accent" />
        <StatCard
          label="Total Peer Score"
          value={peerDataLocked ? "🔒" : totalPeer.toFixed(1)}
          sub={peerDataLocked ? "Submit your Self-Eval to unlock" : "Out of 49"}
          tone="info"
        />
        <StatCard
          label="SAPA Factor"
          value={peerDataLocked ? "🔒" : sapa !== null ? sapa.toFixed(2) : "—"}
          sub={peerDataLocked ? "Submit your Self-Eval to unlock" : sapa === null ? "Awaiting data" : sapa > 1.1 ? "Over-rater" : sapa < 0.9 ? "Under-rater" : "Aligned"}
          tone={peerDataLocked ? "neutral" : sapa === null ? "neutral" : sapa > 1.1 || sapa < 0.9 ? "warning" : "success"}
        />
        <StatCard
          label="Peer Responses"
          value={computed ? `${computed.peer_count}/${computed.expected_peer_count}` : "—"}
          sub={latestScoredWeek ? `Received in ${latestScoredWeek.label}` : ""}
          tone={computed && computed.peer_count < computed.expected_peer_count ? "warning" : "success"}
        />
      </div>

      {latestClosedWeek && !reopenedWeek && (
        <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Your Performance Scorecard</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Current vs previous week, cumulative average, and feedback highlights — as a downloadable report.
            </p>
            {scorecardError && <p className="text-xs text-red-600 mt-1">{scorecardError}</p>}
          </div>
          <button
            onClick={handleDownloadScorecard}
            disabled={downloadingScorecard}
            className="px-3.5 py-2 rounded-lg text-white text-xs font-medium bg-nav hover:bg-nav-deep disabled:opacity-50 transition-standard whitespace-nowrap"
          >
            {downloadingScorecard ? "Generating…" : `Download Scorecard (${latestClosedWeek.label})`}
          </button>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            Pending Evaluations{openWeek ? ` — ${openWeek.label}` : ""}
          </h2>
          {!openWeek && (
            <p className="text-sm text-slate-400">No week is currently open. Check back once the admin opens the next one.</p>
          )}
          {openWeek && pendingQuery.isLoading && <Spinner />}
          {openWeek && pending && (
            <div className="space-y-2">
              <div
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-standard ${
                  pending.selfDone && !pending.selfLocked
                    ? "border-amber-200 bg-amber-50"
                    : pending.selfDone
                    ? "border-green-200 bg-green-50"
                    : "border-orange-200 bg-orange-50 hover:border-orange-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                      pending.selfDone ? "bg-green-500 text-white" : "bg-orange-400 text-white"
                    }`}
                  >
                    {pending.selfDone ? "✓" : "!"}
                  </span>
                  <span className="text-sm font-medium text-slate-800">Self-Evaluation</span>
                </div>
                {!pending.selfDone ? (
                  <Link
                    to="/evaluate"
                    className="px-3 py-1 text-xs font-medium text-white rounded-md transition-standard hover:shadow-sm"
                    style={{ background: ACCENT }}
                  >
                    Fill Now
                  </Link>
                ) : (
                  !pending.selfLocked && (
                    <Link
                      to="/evaluate"
                      className="px-3 py-1 text-xs font-medium rounded-md border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 transition-standard whitespace-nowrap"
                    >
                      Unlocked for correction
                    </Link>
                  )
                )}
              </div>
              {pending.peers.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-standard ${
                    p.done && !p.locked
                      ? "border-amber-200 bg-amber-50"
                      : p.done
                      ? "border-green-200 bg-green-50"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                        p.done ? "bg-green-500 text-white" : "bg-slate-300 text-slate-600"
                      }`}
                    >
                      {p.done ? "✓" : "○"}
                    </span>
                    <span className="text-sm text-slate-700">Peer Evaluation — {p.name}</span>
                  </div>
                  {!p.done ? (
                    <Link
                      to={`/evaluate?peer=${p.id}`}
                      className="px-3 py-1 text-xs font-medium rounded-md border border-slate-300 text-slate-600 hover:bg-white hover:border-slate-400 transition-standard"
                    >
                      Evaluate
                    </Link>
                  ) : (
                    !p.locked && (
                      <Link
                        to={`/evaluate?peer=${p.id}`}
                        className="px-3 py-1 text-xs font-medium rounded-md border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 transition-standard whitespace-nowrap"
                      >
                        Unlocked for correction
                      </Link>
                    )
                  )}
                </div>
              ))}
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-green-500 transition-standard"
                    style={{ width: `${(pending.completed / pending.total) * 100}%` }}
                  />
                </div>
                <span className="tabular-nums">{pending.completed}/{pending.total} completed</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            {latestScoredWeek ? `${latestScoredWeek.label} Radar` : "Radar"}
          </h2>
          {scoreQuery.isLoading ? <Spinner /> : <RadarComparison computed={computed} />}
        </Card>
      </div>
    </>
  );
}
