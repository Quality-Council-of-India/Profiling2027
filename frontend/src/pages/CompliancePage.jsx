import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { weeksApi, complianceApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, EmptyState, Badge, RefreshButton, Modal } from "../components/ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, ACCENT } from "../utils/constants.js";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "compliant", label: "Compliant" },
  { key: "non_compliant", label: "Non-Compliant" },
];

export default function CompliancePage() {
  const queryClient = useQueryClient();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [statusFilter, setStatusFilter] = useState("all");
  const [showNonCompliantModal, setShowNonCompliantModal] = useState(false);

  const [weekId, setWeekId] = useState(null);
  useEffect(() => {
    if (weeks.length && weekId === null) {
      const current = [...weeks].reverse().find((w) => w.status !== "upcoming");
      setWeekId(current?.id ?? weeks[weeks.length - 1].id);
    }
  }, [weeks, weekId]);

  const complianceQuery = useQuery({
    queryKey: ["compliance", weekId],
    queryFn: () => complianceApi.get(weekId),
    enabled: !!weekId,
  });

  const remindMutation = useMutation({
    mutationFn: () => complianceApi.remind(weekId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compliance", weekId] }),
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;
  if (weeks.length === 0) {
    return <EmptyState title="No weeks yet" message="Ask an Admin to add the first week from the Admin Panel." />;
  }
  if (!weekId) return <Spinner />;
  if (complianceQuery.isError) return <ErrorBanner message="You cannot view the compliance tracker" />;

  const data = complianceQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Compliance Tracker</h1>
            <p className="text-sm text-slate-500">{data?.week.label} · {data?.week.status}</p>
          </div>
          <RefreshButton
            onClick={() => queryClient.invalidateQueries({ queryKey: ["compliance", weekId] })}
            isFetching={complianceQuery.isFetching}
            label="Refresh Compliance Tracker"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={weekId}
            onChange={(e) => setWeekId(Number(e.target.value))}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
          <button
            onClick={() => remindMutation.mutate()}
            disabled={remindMutation.isPending || !data || data.week.status === "closed" || data.summary.completionPct === 100}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 transition-standard hover:shadow-md"
            style={{ background: ACCENT }}
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
              <path d="M3 5.5l7 5.5 7-5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {remindMutation.isPending
              ? "Sending…"
              : `Send Reminders (${data?.mappingDataAvailable === false ? 0 : data ? data.summary.totalProfessionals - data.summary.fullyCompliant : 0} pending)`}
          </button>
        </div>
      </div>

      {remindMutation.isSuccess && (
        <p className="text-xs text-green-700">
          Sent {remindMutation.data.remindersSent} reminder email(s) to {remindMutation.data.nonCompliantCount} non-compliant professional(s).
        </p>
      )}

      {complianceQuery.isLoading ? (
        <Spinner />
      ) : (
        <>
          {data.mappingDataAvailable === false && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              This week closed before per-peer mapping history was being frozen — self-evaluation completion below is
              accurate, but peer-mapping detail (who was expected to evaluate whom) isn't available for it.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Overall Completion"
              value={data.summary.completionPct === null ? "—" : `${data.summary.completionPct}%`}
              sub={data.summary.completionPct === null ? "Peer-mapping data unavailable" : `${data.summary.totalReceived} of ${data.summary.totalExpected} submissions`}
              tone={data.summary.completionPct === null ? "warning" : data.summary.completionPct >= 90 ? "success" : data.summary.completionPct >= 60 ? "warning" : "danger"}
            />
            <StatCard
              label="Self-Eval Done"
              value={`${data.summary.selfDone}/${data.summary.totalProfessionals}`}
              sub={`${data.summary.totalProfessionals - data.summary.selfDone} yet to fill`}
              tone={data.summary.selfDone < data.summary.totalProfessionals ? "warning" : "success"}
            />
            <StatCard
              label="Fully Complete"
              value={data.summary.fullyCompliant === null ? "—" : data.summary.fullyCompliant}
              sub={data.summary.fullyCompliant === null ? "Peer-mapping data unavailable" : `of ${data.summary.totalProfessionals} professionals`}
              tone="success"
            />
            <StatCard
              label="Non-Compliant"
              value={data.summary.fullyCompliant === null ? "—" : data.summary.totalProfessionals - data.summary.fullyCompliant}
              sub={data.summary.fullyCompliant === null ? "Peer-mapping data unavailable" : "Need follow-up · click to see names"}
              tone={data.summary.fullyCompliant === null ? "warning" : data.summary.totalProfessionals - data.summary.fullyCompliant > 0 ? "danger" : "success"}
              onClick={data.summary.fullyCompliant === null ? undefined : () => setShowNonCompliantModal(true)}
            />
          </div>

          {showNonCompliantModal && (
            <NonCompliantModal rows={data.rows.filter((r) => !r.isCompliant)} onClose={() => setShowNonCompliantModal(false)} />
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Filter by status:</span>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-standard ${
                  statusFilter === f.key ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                style={statusFilter === f.key ? { background: ACCENT } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-nav-deep">
                    <th className="w-6"></th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Name</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Role</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Field</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Self-Eval</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Peer Evals</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Progress</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filteredRows = data.rows.filter((r) =>
                      statusFilter === "all" ? true : statusFilter === "compliant" ? r.isCompliant : !r.isCompliant
                    );
                    if (filteredRows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                            No one matches this filter.
                          </td>
                        </tr>
                      );
                    }
                    return filteredRows.map((r, i) => {
                    const pct = Math.round((r.completed / r.total) * 100);
                    const isExpanded = expandedIds.has(r.id);
                    const donePeers = (r.peers || []).filter((p) => p.done);
                    const pendingPeers = (r.peers || []).filter((p) => !p.done);
                    return (
                      <Fragment key={r.id}>
                        <tr
                          onClick={() => toggleExpanded(r.id)}
                          className={`cursor-pointer transition-standard hover:bg-azure/10 ${i % 2 === 0 ? "bg-slate-50" : "bg-white"}`}
                        >
                          <td className="pl-3">
                            <svg
                              className={`w-3.5 h-3.5 text-slate-400 transition-standard ${isExpanded ? "rotate-90" : ""}`}
                              viewBox="0 0 20 20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M7 5l6 5-6 5" />
                            </svg>
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
                          <td className="px-3 py-2"><Badge text={ROLE_LABELS[r.role]} color={ROLE_COLORS[r.role]} /></td>
                          <td className="px-3 py-2 text-slate-600">{r.field || "—"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block w-6 h-6 rounded-full text-xs leading-6 text-center ${r.selfDone ? "bg-green-500 text-white" : "bg-red-100 text-red-600"}`}>
                              {r.selfDone ? "✓" : "✗"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-slate-700">{r.peersDone}/{r.peersExpected}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#059669" : pct > 50 ? ACCENT : "#DC2626" }} />
                              </div>
                              <span className="text-xs text-slate-500 w-8">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.isCompliant ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                              {r.isCompliant ? "Done" : "Pending"}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                            <td></td>
                            <td colSpan={7} className="px-4 pb-3 pt-0">
                              {r.peersExpected === 0 ? (
                                <p className="text-xs text-slate-400">No peers mapped to {r.name} this week.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-100/70 rounded-lg p-3">
                                  <div>
                                    <p className="text-[11px] font-medium text-green-700 uppercase tracking-wide mb-1.5">
                                      Peer-evaluated ({donePeers.length})
                                    </p>
                                    {donePeers.length === 0 ? (
                                      <p className="text-xs text-slate-400">None yet.</p>
                                    ) : (
                                      <ul className="space-y-1">
                                        {donePeers.map((p) => (
                                          <li key={p.id} className="text-xs text-slate-700 flex items-center gap-1.5">
                                            <span className="w-3.5 h-3.5 rounded-full bg-green-500 text-white text-[9px] leading-[14px] text-center flex-shrink-0">✓</span>
                                            {p.name}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-medium text-orange-700 uppercase tracking-wide mb-1.5">
                                      Still pending ({pendingPeers.length})
                                    </p>
                                    {pendingPeers.length === 0 ? (
                                      <p className="text-xs text-slate-400">None — all done.</p>
                                    ) : (
                                      <ul className="space-y-1">
                                        {pendingPeers.map((p) => (
                                          <li key={p.id} className="text-xs text-slate-700 flex items-center gap-1.5">
                                            <span className="w-3.5 h-3.5 rounded-full bg-orange-200 text-orange-700 text-[9px] leading-[14px] text-center flex-shrink-0">○</span>
                                            {p.name}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Card>

          <TrajectoryMismatchCard mismatches={data.trajectoryMismatches} />
        </>
      )}
    </div>
  );
}

/**
 * Evaluations where the Trajectory answer (Improved/Declined) contradicts
 * the direction that evaluator's own scores for that person actually moved
 * vs. their own submission last week — e.g. marking "Improved" while giving
 * a lower total than last time. A soft signal to spot-check, not proof of
 * an error, so this is a review list rather than a compliance failure.
 */
function TrajectoryMismatchCard({ mismatches }) {
  const [open, setOpen] = useState(true);
  if (!mismatches) return null;
  const significantCount = mismatches.filter((m) => m.significant).length;
  return (
    <Card className="p-5">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <h2 className="text-sm font-semibold text-slate-800">Trajectory Mismatches</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${significantCount > 0 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"}`}>
          {significantCount}
        </span>
        <span className="text-slate-400 text-xs ml-auto">{open ? "▲" : "▼"}</span>
      </button>
      <p className="text-xs text-slate-500 mt-1">
        Submissions where the score given this week moved the opposite way from the Trajectory answer, compared to
        that same evaluator's own scores for that person last week. Worth a spot-check, not necessarily a mistake.
        Only a large gap (7+ points out of 49) is highlighted — a point or two is normal week-to-week noise.
      </p>
      {open && (
        mismatches.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No mismatches this week.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {mismatches.map((m, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                  m.significant ? "border border-amber-200 bg-amber-50" : "border border-slate-100 bg-slate-50/60"
                }`}
              >
                <div>
                  <span className={`font-medium ${m.significant ? "text-slate-800" : "text-slate-600"}`}>{m.evaluator.name}</span>
                  <span className="text-slate-400"> → </span>
                  <span className={`font-medium ${m.significant ? "text-slate-800" : "text-slate-600"}`}>{m.evaluatee.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({m.evalType === "self" ? "Self-Eval" : "Peer Eval"})</span>
                </div>
                <div className={`text-xs flex-shrink-0 ${m.significant ? "text-slate-700" : "text-slate-400"}`}>
                  {m.prevTotal} → {m.currentTotal} (gap {m.gap}), marked{" "}
                  <span className="font-medium">{m.trajectory === "improved" ? "Improved" : "Declined"}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  );
}

/** Triggered by clicking the Non-Compliant stat card — the full list of names behind that count, grouped by field so a large team is easier to scan. */
function NonCompliantModal({ rows, onClose }) {
  const byField = new Map();
  for (const r of rows) {
    const key = r.field || "—";
    if (!byField.has(key)) byField.set(key, []);
    byField.get(key).push(r);
  }
  const groups = [...byField.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <Modal title={`Non-Compliant (${rows.length})`} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">Everyone's compliant for this week.</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([field, members]) => (
            <div key={field}>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                {field} ({members.length})
              </p>
              <ul className="space-y-1.5">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      <span className="text-slate-700">{m.name}</span>
                      <Badge text={ROLE_LABELS[m.role]} color={ROLE_COLORS[m.role]} />
                    </span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {!m.selfDone && "Self-Eval pending"}
                      {!m.selfDone && m.peersExpected - m.peersDone > 0 && " · "}
                      {m.peersExpected - m.peersDone > 0 && `${m.peersExpected - m.peersDone} peer eval(s) pending`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
