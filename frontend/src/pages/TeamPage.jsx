import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { weeksApi, scoresApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, Badge } from "../components/ui.jsx";
import { ROLE_LABELS, ROLE_COLORS } from "../utils/constants.js";

/**
 * Team View — membership is decided entirely server-side by role (see
 * backend services/access.js teamViewFilter): a Group Anchor automatically
 * sees their field's Profilers, a Project Lead automatically sees every
 * Profiler + Group Anchor + the other Project Lead(s), and so on. No field
 * picker needed — just a week filter.
 */
export default function TeamPage() {
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

  if (weeksQuery.isLoading || !weekId) return <Spinner />;

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
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team View</h1>
          <p className="text-sm text-gray-500">{weeks.find((w) => w.id === weekId)?.label}</p>
        </div>
        <select
          value={weekId}
          onChange={(e) => setWeekId(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          {weeks.filter((w) => w.status !== "upcoming").map((w) => (
            <option key={w.id} value={w.id}>{w.label}</option>
          ))}
        </select>
      </div>

      {teamQuery.isLoading && <Spinner />}
      {teamQuery.isError && <ErrorBanner message="Your role does not have a Team View" />}

      {teamQuery.data && members.length === 0 && (
        <Card className="p-6 text-center text-sm text-gray-400">No team members to show.</Card>
      )}

      {teamQuery.data && members.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#0D2B52" }}>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-white uppercase">Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-white uppercase">Role</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Self Total</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Peer Total</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">SAPA</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium text-white uppercase">Peer Count</th>
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()].map(([field, groupMembers]) => (
                <FieldGroup key={field} field={field} members={groupMembers} showHeader={showGroupHeaders} />
              ))}
            </tbody>
          </table>
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
          <td colSpan={6} className="px-4 py-1.5 text-xs font-semibold text-gray-500 bg-gray-100 uppercase tracking-wide">
            {field}
          </td>
        </tr>
      )}
      {members.map((m, i) => {
        const c = m.computed;
        const sapa = c?.sapa_factor !== null && c?.sapa_factor !== undefined ? Number(c.sapa_factor) : null;
        return (
          <tr key={m.id} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
            <td className="px-4 py-2 font-medium text-gray-800">{m.name}</td>
            <td className="px-3 py-2"><Badge text={ROLE_LABELS[m.role]} color={ROLE_COLORS[m.role]} /></td>
            <td className="px-3 py-2 text-center font-mono text-gray-700">{c ? Number(c.total_self).toFixed(1) : "—"}</td>
            <td className="px-3 py-2 text-center font-mono text-gray-700">{c ? Number(c.total_peer).toFixed(1) : "—"}</td>
            <td className="px-3 py-2 text-center">
              {sapa !== null ? (
                <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${sapa > 1.1 ? "bg-red-100 text-red-700" : sapa < 0.9 ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                  {sapa.toFixed(2)}
                </span>
              ) : "—"}
            </td>
            <td className="px-3 py-2 text-center text-gray-600">{c ? `${c.peer_count}/${c.expected_peer_count}` : "—"}</td>
          </tr>
        );
      })}
    </>
  );
}
