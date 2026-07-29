import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { weeksApi, scoresApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState, Badge, RefreshButton } from "../components/ui.jsx";
import { ROLE_LABELS, ROLE_COLORS } from "../utils/constants.js";

/**
 * Team View — membership is decided entirely server-side by role (see
 * backend services/access.js teamViewFilter): a Group Anchor automatically
 * sees their field's Profilers, a Project Lead automatically sees every
 * Profiler + Group Anchor + the other Project Lead(s), and so on. No field
 * picker needed — just a week filter.
 */
export default function TeamPage() {
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

  const teamQuery = useQuery({
    queryKey: ["team", weekId],
    queryFn: () => scoresApi.team(weekId),
    enabled: !!weekId,
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (weeksQuery.isError) return <ErrorBanner message="Failed to load weeks" />;
  if (weeks.length === 0) {
    return <EmptyState title="No weeks yet" message="Ask an Admin to add the first week from the Admin Panel." />;
  }
  if (!weekId) return <Spinner />;

  // Group by field for readability when the list spans multiple fields
  // (leads/admin) — a single flat table for a single-field audience (anchors).
  const members = teamQuery.data?.members || [];
  const groups = new Map();
  for (const m of members) {
    const key = m.field || "—";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const showGroupHeaders = groups.size > 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Team View</h1>
            <p className="text-sm text-slate-500">{weeks.find((w) => w.id === weekId)?.label}</p>
          </div>
          <RefreshButton
            onClick={() => queryClient.invalidateQueries({ queryKey: ["team", weekId] })}
            isFetching={teamQuery.isFetching}
            label="Refresh Team View"
          />
        </div>
        <select
          value={weekId}
          onChange={(e) => setWeekId(Number(e.target.value))}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
        >
          {weeks.filter((w) => w.status !== "upcoming").map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>
      </div>

      {teamQuery.isLoading && <Spinner />}
      {teamQuery.isError && <ErrorBanner message="Your role does not have a Team View" />}

      {teamQuery.data && members.length === 0 && (
        <Card className="p-6 text-center text-sm text-slate-400">No team members to show.</Card>
      )}

      {teamQuery.data && members.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-nav-deep">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Name</th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Role</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Self Total</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">Peer Total</th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase tracking-wide">SAPA</th>
                </tr>
              </thead>
              <tbody>
                {[...groups.entries()].map(([field, groupMembers]) => (
                  <FieldGroup key={field} field={field} members={groupMembers} showHeader={showGroupHeaders} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FieldGroup({ field, members, showHeader }) {
  return (
    <>
      {showHeader && (
        <tr>
          <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 uppercase tracking-wide">
            {field}
          </td>
        </tr>
      )}
      {members.map((m, i) => {
        const c = m.computed;
        const sapa = c?.sapa_factor !== null && c?.sapa_factor !== undefined ? Number(c.sapa_factor) : null;
        return (
          <tr key={m.id} className={`transition-standard hover:bg-azure/10 ${i % 2 === 0 ? "bg-slate-50" : "bg-white"}`}>
            <td className="px-4 py-2 font-medium text-slate-800">{m.name}</td>
            <td className="px-3 py-2"><Badge text={ROLE_LABELS[m.role]} color={ROLE_COLORS[m.role]} /></td>
            <td className="px-3 py-2 text-center font-mono text-slate-700">{c ? Number(c.total_self).toFixed(1) : "—"}</td>
            <td className="px-3 py-2 text-center font-mono text-slate-700">{c ? Number(c.total_peer).toFixed(1) : "—"}</td>
            <td className="px-3 py-2 text-center">
              {sapa !== null ? (
                <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${sapa > 1.1 ? "bg-red-100 text-red-700" : sapa < 0.9 ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                  {sapa.toFixed(2)}
                </span>
              ) : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}
