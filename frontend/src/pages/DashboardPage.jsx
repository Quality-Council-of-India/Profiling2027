import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, evaluationsApi, scoresApi, downloadExport } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, RefreshButton } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import { ComplianceIcon, AnalyticsIcon, AdminIcon } from "../components/icons.jsx";
import { ACCENT } from "../utils/constants.js";

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["weeks"] });
    queryClient.invalidateQueries({ queryKey: ["pending"] });
    queryClient.invalidateQueries({ queryKey: ["score"] });
  }

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;

  const weeks = weeksQuery.data || [];
  const openWeek = weeks.find((w) => w.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-nav/10 text-nav font-display font-bold text-lg flex-shrink-0">
          {user.name.charAt(0).toUpperCase()}
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
                {openWeek.label} is currently open
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
    </>
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
  const latestScoredWeek = [...weeks].reverse().find((w) => w.status !== "upcoming");
  const latestClosedWeek = [...weeks].reverse().find((w) => w.status === "closed");
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
  const totalSelf = computed ? Number(computed.total_self) : 0;
  const totalPeer = computed ? Number(computed.total_peer) : 0;
  const sapa = computed?.sapa_factor !== null && computed?.sapa_factor !== undefined ? Number(computed.sapa_factor) : null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Self Score" value={totalSelf.toFixed(1)} sub="Out of 25" />
        <StatCard label="Total Peer Score" value={totalPeer.toFixed(1)} sub="Out of 25" />
        <StatCard
          label="SAPA Factor"
          value={sapa !== null ? sapa.toFixed(2) : "—"}
          sub={sapa === null ? "Awaiting data" : sapa > 1.1 ? "Over-rater" : sapa < 0.9 ? "Under-rater" : "Aligned"}
          accent={sapa !== null && (sapa > 1.1 || sapa < 0.9)}
        />
        <StatCard
          label="Peer Responses"
          value={computed ? `${computed.peer_count}/${computed.expected_peer_count}` : "—"}
          sub={latestScoredWeek ? `Received in ${latestScoredWeek.label}` : ""}
        />
      </div>

      {latestClosedWeek && (
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
                  pending.selfDone ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50 hover:border-orange-300"
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
                {!pending.selfDone && (
                  <Link
                    to="/evaluate"
                    className="px-3 py-1 text-xs font-medium text-white rounded-md transition-standard hover:shadow-sm"
                    style={{ background: ACCENT }}
                  >
                    Fill Now
                  </Link>
                )}
              </div>
              {pending.peers.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-standard ${
                    p.done ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
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
                  {!p.done && (
                    <Link
                      to={`/evaluate?peer=${p.id}`}
                      className="px-3 py-1 text-xs font-medium rounded-md border border-slate-300 text-slate-600 hover:bg-white hover:border-slate-400 transition-standard"
                    >
                      Evaluate
                    </Link>
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
