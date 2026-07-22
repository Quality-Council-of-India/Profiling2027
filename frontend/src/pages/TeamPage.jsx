import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, scoresApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";
import { Badge } from "../components/ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, FIELDS } from "../utils/constants.js";

export default function TeamPage() {
  const { user } = useAuth();
  const hasOwnField = !!user.field;
  const [field, setField] = useState(user.field || FIELDS[0]);

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const weeks = weeksQuery.data || [];
  const currentWeek = [...weeks].reverse().find((w) => w.status !== "upcoming");

  const teamQuery = useQuery({
    queryKey: ["fieldScores", field, currentWeek?.id],
    queryFn: () => scoresApi.field(field, currentWeek.id),
    enabled: !!currentWeek && !!field,
  });

  if (weeksQuery.isLoading) return <Spinner />;
  if (!currentWeek) return <p className="text-sm text-gray-400">No scored weeks yet.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team View</h1>
          <p className="text-sm text-gray-500">{currentWeek.label}</p>
        </div>
        {!hasOwnField && (
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        )}
      </div>

      {teamQuery.isLoading && <Spinner />}
      {teamQuery.isError && <ErrorBanner message="You cannot view this field's team scores" />}

      {teamQuery.data && (
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
              {teamQuery.data.members.map((m, i) => {
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
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
