import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, weeksApi, downloadExport } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "./ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, PARAM_FIELDS, TRAJECTORY_LABELS } from "../utils/constants.js";
import { Badge } from "./ui.jsx";

const LOCKABLE_TABLES = ["self_evaluations", "peer_evaluations"];
const EXPORTABLE_TABLES = ["self_evaluations", "peer_evaluations"];

const TABLE_LABELS = {
  projects: "Projects",
  users: "Users",
  peer_mappings: "Peer Mappings",
  weeks: "Weeks",
  self_evaluations: "Self Evaluations",
  peer_evaluations: "Peer Evaluations",
  computed_scores: "Computed Scores",
};

const WEEK_FILTERABLE = ["self_evaluations", "peer_evaluations", "computed_scores"];

/**
 * View-only browser into every backend table — so the admin can see who
 * filled what, for whom, per week, directly in the portal instead of
 * going into Supabase. Read-only by design: real changes still go
 * through the purpose-built actions (roster import, week open/close,
 * evaluation submission) so score recomputation etc. stay correct.
 */
const LOCKED_FILTERABLE = ["self_evaluations", "peer_evaluations"];
const SEARCH_FILTERABLE = ["self_evaluations", "peer_evaluations"];

export default function RawDataBrowser() {
  const queryClient = useQueryClient();
  const [table, setTable] = useState("peer_evaluations");
  const [page, setPage] = useState(1);
  const [weekId, setWeekId] = useState("");
  const [search, setSearch] = useState("");
  const [locked, setLocked] = useState("");

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const dataQuery = useQuery({
    queryKey: ["rawData", table, page, weekId, search, locked],
    queryFn: () =>
      adminApi.rawTable(table, {
        page,
        pageSize: 25,
        weekId: weekId || undefined,
        search: search || undefined,
        locked: locked || undefined,
      }),
  });

  const unlockMutation = useMutation({
    mutationFn: (id) => adminApi.unlockEvaluation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rawData"] }),
  });

  function handleUnlock(id, evaluatorName) {
    if (window.confirm(`Unlock this submission${evaluatorName ? ` from ${evaluatorName}` : ""} so they can resubmit once?`)) {
      unlockMutation.mutate(id);
    }
  }

  const [exportError, setExportError] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  function selectTable(t) {
    setTable(t);
    setPage(1);
    setSearch("");
    setLocked("");
  }

  async function handleExport() {
    setExportError("");
    setIsExporting(true);
    try {
      const weekLabel = weekId ? (weeksQuery.data || []).find((w) => String(w.id) === String(weekId))?.label : null;
      const suffix = weekLabel ? `_${weekLabel.replace(/\s+/g, "_")}` : "_all_weeks";
      await downloadExport(
        `/admin/data/${table}/export${weekId ? `?weekId=${weekId}` : ""}`,
        `${table}${suffix}.xlsx`
      );
    } catch (err) {
      setExportError(err.response?.data?.error || "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="text-sm font-semibold text-slate-800">Raw Data Browser</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {SEARCH_FILTERABLE.includes(table) && (
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name…"
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-36"
            />
          )}
          {LOCKED_FILTERABLE.includes(table) && (
            <select
              value={locked}
              onChange={(e) => { setLocked(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
            >
              <option value="">Locked + unlocked</option>
              <option value="true">Locked only</option>
              <option value="false">Unlocked only</option>
            </select>
          )}
          {WEEK_FILTERABLE.includes(table) && (
            <select
              value={weekId}
              onChange={(e) => { setWeekId(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
            >
              <option value="">All weeks</option>
              {(weeksQuery.data || []).map((w) => (
                <option key={w.id} value={w.id}>{w.label}</option>
              ))}
            </select>
          )}
          {EXPORTABLE_TABLES.includes(table) && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
            >
              <ExportIcon />
              {isExporting ? "Exporting…" : "Export (.xlsx)"}
            </button>
          )}
        </div>
      </div>

      {exportError && (
        <div className="mb-4">
          <ErrorBanner message={exportError} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(TABLE_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => selectTable(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-standard ${
              table === key ? "text-white bg-nav shadow-sm" : "text-slate-600 bg-slate-100 hover:bg-slate-200"
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
          <TableBody
            table={table}
            rows={dataQuery.data.rows}
            onUnlock={handleUnlock}
            unlockingId={unlockMutation.isPending ? unlockMutation.variables : null}
          />
          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>
              {dataQuery.data.total} row{dataQuery.data.total === 1 ? "" : "s"} · page {dataQuery.data.page} of {dataQuery.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-400 transition-standard"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(dataQuery.data.totalPages, p + 1))}
                disabled={page >= dataQuery.data.totalPages}
                className="px-2.5 py-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50 hover:border-slate-400 transition-standard"
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

function ExportIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v9.5M6 9l4 4 4-4" />
      <path d="M3.5 15v1a1.5 1.5 0 001.5 1.5h10a1.5 1.5 0 001.5-1.5v-1" />
    </svg>
  );
}

function RoleBadge({ role }) {
  return <Badge text={ROLE_LABELS[role] || role} color={ROLE_COLORS[role] || "#6B7280"} />;
}

function TableBody({ table, rows, onUnlock, unlockingId }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No rows.</p>;
  }

  const isSelf = table === "self_evaluations";
  const wrappingColumns = ["strengths_tags", "weakness_tags", "improvement_suggestion"];
  const isLockable = LOCKABLE_TABLES.includes(table);

  const columns = {
    projects: ["id", "name", "year", "start_date", "end_date", "is_active"],
    users: ["id", "name", "email", "role", "field", "is_active"],
    weeks: ["id", "week_number", "label", "start_date", "end_date", "status"],
    peer_mappings: ["id", "evaluator", "evaluatee"],
    self_evaluations: [
      "id", "week", "evaluator", "scores", "trajectory",
      "strengths_tags", "weakness_tags", "improvement_suggestion", "submitted_at", "locked",
    ],
    peer_evaluations: [
      "id", "week", "evaluator", "evaluatee", "scores", "trajectory",
      "strengths_tags", "weakness_tags", "improvement_suggestion", "submitted_at", "locked",
    ],
    computed_scores: ["user", "week", "total_self", "total_peer", "peer_count", "expected_peer_count", "sapa_factor"],
  }[table];

  const LABELS = { evaluator: isSelf ? "professional" : "evaluator", scores: "quantitative scores", locked: "status" };

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs px-1">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((c) => (
              <th key={c} className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase whitespace-nowrap">
                {(LABELS[c] || c).replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={i % 2 === 0 ? "bg-slate-50/60" : ""}>
              {columns.map((c) => (
                <td
                  key={c}
                  className={`px-2 py-1.5 align-top ${
                    wrappingColumns.includes(c) ? "whitespace-normal max-w-[16rem] break-words" : "whitespace-nowrap"
                  }`}
                >
                  {isLockable && c === "locked" ? (
                    <LockCell locked={r.locked} onUnlock={() => onUnlock(r.id, r.evaluator?.name)} isUnlocking={unlockingId === r.id} />
                  ) : (
                    renderCell(table, c, r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LockCell({ locked, onUnlock, isUnlocking }) {
  if (!locked) {
    return <span className="inline-flex items-center gap-1 text-[11px] text-green-700">🔓 unlocked</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-slate-500">🔒 locked</span>
      <button
        onClick={onUnlock}
        disabled={isUnlocking}
        title="Unlock so the evaluator can submit one corrective edit"
        className="px-1.5 py-0.5 rounded border border-slate-300 text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
      >
        {isUnlocking ? "…" : "Unlock"}
      </button>
    </div>
  );
}

const SCORE_PARAMS = PARAM_FIELDS.map((p) => [p.label, p.key]);

function renderCell(table, column, row) {
  const val = row[column];

  if (column === "evaluator" || column === "evaluatee" || column === "user") {
    if (!val) return "—";
    return (
      <span className="inline-flex items-center gap-1">
        {val.name}
        <RoleBadge role={val.role} />
        {val.field && <span className="text-slate-400 text-[10px]">{val.field}</span>}
      </span>
    );
  }
  if (column === "week") return val?.label || "—";
  if (column === "role") return <RoleBadge role={val} />;
  if (column === "trajectory") return TRAJECTORY_LABELS[val] || "—";
  if (column === "is_active") return val ? <span className="text-green-700">active</span> : <span className="text-slate-400">inactive</span>;
  if (column === "scores" && (table === "self_evaluations" || table === "peer_evaluations")) {
    return (
      <div className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5">
        {SCORE_PARAMS.map(([label, key]) => (
          <div key={key} className="contents">
            <span className="text-slate-400">{label}</span>
            <span className="font-medium tabular-nums text-slate-700">{row[key]}</span>
          </div>
        ))}
      </div>
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
