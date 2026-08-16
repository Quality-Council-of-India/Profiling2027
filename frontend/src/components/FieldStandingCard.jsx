import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Spinner, ErrorBanner } from "./ui.jsx";
import { analyticsApi } from "../api/endpoints.js";
import { FIELDS, ROLE_LABELS, ROLE_COLORS, NAV, ACCENT } from "../utils/constants.js";

/**
 * A leaderboard of FIELDS rather than individuals — shown instead of
 * "Standing in your field" for roles that don't belong to a single field
 * (Admin, CASU Lead, Project Lead). A field picker drills into the ranked
 * list of individual members within one chosen field.
 */
export default function FieldStandingCard({ title, standings, weekIds }) {
  const [selectedField, setSelectedField] = useState("");

  const membersQuery = useQuery({
    queryKey: ["fieldMembers", weekIds, selectedField],
    queryFn: () => analyticsApi.fieldMembers(weekIds, selectedField),
    enabled: !!selectedField && (weekIds || []).length > 0,
  });

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <select
          value={selectedField}
          onChange={(e) => setSelectedField(e.target.value)}
          className="px-2 py-1 border border-slate-300 rounded-lg text-xs"
        >
          <option value="">All Fields</option>
          {FIELDS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-slate-400 mb-3">Ranked by avg Total Peer Score</p>

      {selectedField ? (
        membersQuery.isLoading ? (
          <Spinner />
        ) : membersQuery.isError ? (
          <ErrorBanner message="Failed to load field members" />
        ) : (
          <FieldMembersList list={membersQuery.data?.list} field={selectedField} />
        )
      ) : (
        <FieldLeaderboard standings={standings} />
      )}
    </Card>
  );
}

function FieldLeaderboard({ standings }) {
  if (!standings || standings.length === 0) {
    return <p className="text-sm text-slate-400">Not enough data yet for this range.</p>;
  }

  const top = standings[0].avgTotalPeer;

  return (
    <div className="space-y-2.5">
      {standings.map((s) => (
        <div key={s.field}>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="font-medium text-slate-700">
              <span className="text-slate-400 tabular-nums mr-1.5">#{s.rank}</span>
              {s.field}
            </span>
            <span className="tabular-nums text-slate-500">
              <span style={{ color: NAV }} className="font-semibold">{s.avgTotalPeer.toFixed(1)}</span>
              {" "}· {s.memberCount} member{s.memberCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full"
              style={{ width: `${top > 0 ? (s.avgTotalPeer / top) * 100 : 0}%`, background: ACCENT }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ranked list of individual members within one field — mirrors RankingCard's list styling. */
function FieldMembersList({ list, field }) {
  if (!list || list.length === 0) {
    return <p className="text-sm text-slate-400">No scored members in {field} for this range.</p>;
  }

  return (
    <div className="max-h-64 overflow-y-auto -mx-1 px-1">
      <table className="w-full text-xs">
        <tbody>
          {list.map((m) => (
            <tr key={m.id} className="border-b border-slate-50 last:border-0">
              <td className="py-1.5 pr-2 text-slate-400 w-8 tabular-nums">#{m.rank}</td>
              <td className="py-1.5 pr-2 font-medium text-slate-800">{m.name}</td>
              <td className="py-1.5 pr-2">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: ROLE_COLORS[m.role] + "20", color: ROLE_COLORS[m.role] }}
                >
                  {ROLE_LABELS[m.role]}
                </span>
              </td>
              <td className="py-1.5 text-right font-mono text-slate-700 tabular-nums">{m.totalPeer.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
