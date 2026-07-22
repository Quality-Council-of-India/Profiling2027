import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, evaluationsApi, scoresApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner } from "../components/ui.jsx";
import RadarComparison from "../components/charts/RadarComparison.jsx";
import { ACCENT } from "../utils/constants.js";

export default function DashboardPage() {
  const { user } = useAuth();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;

  const weeks = weeksQuery.data || [];
  const openWeek = weeks.find((w) => w.status === "open");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {openWeek ? `${openWeek.label} is currently open` : "No week is currently open for submissions"}
        </p>
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
        <Link to="/compliance" className="block">
          <Card className="p-5 hover:shadow-md transition-shadow">
            <p className="text-sm font-semibold text-gray-800">✅ Compliance Tracker</p>
            <p className="text-xs text-gray-500 mt-1">See who's filled their forms and send reminders</p>
          </Card>
        </Link>
        <Link to="/analytics" className="block">
          <Card className="p-5 hover:shadow-md transition-shadow">
            <p className="text-sm font-semibold text-gray-800">🔬 Analytics</p>
            <p className="text-xs text-gray-500 mt-1">Field heatmaps, SAPA distribution, quadrant plot</p>
          </Card>
        </Link>
        <Link to="/admin" className="block">
          <Card className="p-5 hover:shadow-md transition-shadow">
            <p className="text-sm font-semibold text-gray-800">⚙️ Admin Panel</p>
            <p className="text-xs text-gray-500 mt-1">Open/close weeks, import roster, export scores</p>
          </Card>
        </Link>
      </div>
    </>
  );
}

function ProfessionalSummary({ user, weeks, openWeek }) {
  const pendingQuery = useQuery({ queryKey: ["pending"], queryFn: evaluationsApi.pending, retry: false });
  const latestScoredWeek = [...weeks].reverse().find((w) => w.status !== "upcoming");

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            Pending Evaluations{openWeek ? ` — ${openWeek.label}` : ""}
          </h2>
          {!openWeek && (
            <p className="text-sm text-gray-400">No week is currently open. Check back once the admin opens the next one.</p>
          )}
          {openWeek && pendingQuery.isLoading && <Spinner />}
          {openWeek && pending && (
            <div className="space-y-2">
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                  pending.selfDone ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      pending.selfDone ? "bg-green-500 text-white" : "bg-orange-400 text-white"
                    }`}
                  >
                    {pending.selfDone ? "✓" : "!"}
                  </span>
                  <span className="text-sm font-medium text-gray-800">Self-Evaluation</span>
                </div>
                {!pending.selfDone && (
                  <Link to="/evaluate" className="px-3 py-1 text-xs font-medium text-white rounded-md" style={{ background: ACCENT }}>
                    Fill Now
                  </Link>
                )}
              </div>
              {pending.peers.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                    p.done ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                        p.done ? "bg-green-500 text-white" : "bg-gray-300 text-gray-600"
                      }`}
                    >
                      {p.done ? "✓" : "○"}
                    </span>
                    <span className="text-sm text-gray-700">Peer Evaluation — {p.name}</span>
                  </div>
                  {!p.done && (
                    <Link
                      to={`/evaluate?peer=${p.id}`}
                      className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
                    >
                      Evaluate
                    </Link>
                  )}
                </div>
              ))}
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-green-500"
                    style={{ width: `${(pending.completed / pending.total) * 100}%` }}
                  />
                </div>
                <span>{pending.completed}/{pending.total} completed</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">
            {latestScoredWeek ? `${latestScoredWeek.label} Radar` : "Radar"}
          </h2>
          {scoreQuery.isLoading ? <Spinner /> : <RadarComparison computed={computed} />}
        </Card>
      </div>
    </>
  );
}
