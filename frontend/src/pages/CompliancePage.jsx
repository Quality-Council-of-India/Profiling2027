import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { weeksApi, complianceApi } from "../api/endpoints.js";
import { Card, StatCard, Spinner, ErrorBanner, Badge } from "../components/ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, ACCENT } from "../utils/constants.js";

export default function CompliancePage() {
  const queryClient = useQueryClient();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];

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

  if (weeksQuery.isLoading || !weekId) return <Spinner />;
  if (complianceQuery.isError) return <ErrorBanner message="You cannot view the compliance tracker" />;

  const data = complianceQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Compliance Tracker</h1>
          <p className="text-sm text-gray-500">{data?.week.label} · {data?.week.status}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={weekId}
            onChange={(e) => setWeekId(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
          <button
            onClick={() => remindMutation.mutate()}
            disabled={remindMutation.isPending || !data || data.summary.completionPct === 100}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            📧 {remindMutation.isPending ? "Sending…" : `Send Reminders (${data ? data.summary.totalProfessionals - data.summary.fullyCompliant : 0} pending)`}
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Overall Completion"
              value={`${data.summary.completionPct}%`}
              sub={`${data.summary.totalReceived} of ${data.summary.totalExpected} submissions`}
            />
            <StatCard
              label="Self-Eval Done"
              value={`${data.summary.selfDone}/${data.summary.totalProfessionals}`}
              sub={`${data.summary.totalProfessionals - data.summary.selfDone} yet to fill`}
              accent={data.summary.selfDone < data.summary.totalProfessionals}
            />
            <StatCard label="Fully Complete" value={data.summary.fullyCompliant} sub={`of ${data.summary.totalProfessionals} professionals`} />
            <StatCard label="Non-Compliant" value={data.summary.totalProfessionals - data.summary.fullyCompliant} sub="Need follow-up" accent />
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#0D2B52" }}>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-white uppercase">Name</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase">Role</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase">Field</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Self-Eval</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Peer Evals</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Progress</th>
                    <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => {
                    const pct = Math.round((r.completed / r.total) * 100);
                    return (
                      <tr key={r.id} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                        <td className="px-3 py-2"><Badge text={ROLE_LABELS[r.role]} color={ROLE_COLORS[r.role]} /></td>
                        <td className="px-3 py-2 text-gray-600">{r.field || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block w-6 h-6 rounded-full text-xs leading-6 text-center ${r.selfDone ? "bg-green-500 text-white" : "bg-red-100 text-red-600"}`}>
                            {r.selfDone ? "✓" : "✗"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-700">{r.peersDone}/{r.peersExpected}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? "#059669" : pct > 50 ? ACCENT : "#DC2626" }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.isCompliant ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                            {r.isCompliant ? "Done" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
