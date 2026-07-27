import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, weeksApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "./ui.jsx";
import { ROLE_LABELS, ROLE_COLORS } from "../utils/constants.js";
import { Badge } from "./ui.jsx";

const TABLE_LABELS = {
  projects: "Projects",
  users: "Users",
  peer_mappings: "Peer Mappings",
  weeks: "Weeks",
  evaluations: "Evaluations",
  computed_scores: "Computed Scores",
};

const WEEK_FILTERABLE = ["evaluations", "computed_scores"];

/**
 * View-only browser into every backend table — so the admin can see who
 * filled what, for whom, per week, directly in the portal instead of
 * going into Supabase. Read-only by design: real changes still go
 * through the purpose-built actions (roster import, week open/close,
 * evaluation submission) so score recomputation etc. stay correct.
 */
export default function RawDataBrowser() {
  const [table, setTable] = useState("evaluations");
  const [page, setPage] = useState(1);
  const [weekId, setWeekId] = useState("");

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const dataQuery = useQuery({
    queryKey: ["rawData", table, page, weekId],
    queryFn: () => adminApi.rawTable(table, { page, pageSize: 25, weekId: weekId || undefined }),
  });

  function selectTable(t) {
    setTable(t);
    setPage(1);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-800">Raw Data Browser</h2>
        <div className="flex items-center gap-2">
          {WEEK_FILTERABLE.includes(table) && (
            <select
              value={weekId}
              onChange={(e) => { setWeekId(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs"
            >
              <option value="">All weeks</option>
              {(weeksQuery.data || []).map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(TABLE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => selectTable(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              table === key ? "text-white bg-[#1F3864]" : "text-gray-600 bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {dataQuery.isLoading ? (
        <Spinner />
      ) : dataQuery.isError ? (
        <ErrorBanner message="Failed to load table data" />
      ) : (
        <>
          <TableBody table={table} rows={dataQuery.data.rows} />
          <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
            <span>
              {dataQuery.data.total} row{dataQuery.data.total === 1 ? "" : "s"} · page {dataQuery.data.page} of {dataQuery.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(dataQuery.data.totalPages, p + 1))}
                disabled={page >= dataQuery.data.totalPages}
                className="px-2.5 py-1 rounded border border-gray-300 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function RoleBadge({ role }) {
  return <Badge text={ROLE_LABELS[role] || role} color={ROLE_COLORS[role] || "#6B7280"} />;
}

function TableBody({ table, rows }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No rows.</p>;
  }

  const columns = {
    projects: ["id", "name", "year", "start_date", "end_date", "is_active"],
    users: ["id", "name", "email", "role", "field", "is_active"],
    weeks: ["id", "week_number", "label", "start_date", "end_date", "status"],
    peer_mappings: ["id", "evaluator", "evaluatee"],
    evaluations: ["id", "week", "evaluator", "evaluatee", "eval_type", "scores", "problem_solving", "submitted_at"],
    computed_scores: ["user", "week", "total_self", "total_peer", "peer_count", "expected_peer_count", "sapa_factor"],
  }[table];

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs px-1">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((c) => (
              <th key={c} className="text-left px-2 py-1.5 font-medium text-gray-500 uppercase whitespace-nowrap">
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={i % 2 === 0 ? "bg-gray-50/60" : ""}>
              {columns.map((c) => (
                <td key={c} className="px-2 py-1.5 whitespace-nowrap align-top">
                  {renderCell(table, c, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(table, column, row) {
  const val = row[column];

  if (column === "evaluator" || column === "evaluatee" || column === "user") {
    return val ? <span>{val.name} <RoleBadge role={val.role} /></span> : "—";
  }
  if (column === "week") return val?.label || "—";
  if (column === "role") return <RoleBadge role={val} />;
  if (column === "is_active") return val ? <span className="text-green-700">active</span> : <span className="text-gray-400">inactive</span>;
  if (column === "scores" && table === "evaluations") {
    return (
      <span className="font-mono">
        S{row.sincerity} T{row.team_spirit} K{row.knowledge} Q{row.quantity} Ql{row.quality}
      </span>
    );
  }
  if (column === "submitted_at" || column === "start_date" || column === "end_date" || column === "computed_at") {
    return val ? new Date(val).toLocaleString() : "—";
  }
  if (["total_self", "total_peer", "sapa_factor"].includes(column)) {
    return val === null || val === undefined ? "—" : Number(val).toFixed(2);
  }
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  return val ?? "—";
}
