import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { weeksApi, adminApi, downloadExport } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";
import RosterManager from "../components/RosterManager.jsx";
import RawDataBrowser from "../components/RawDataBrowser.jsx";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const [exportError, setExportError] = useState("");

  const openMutation = useMutation({
    mutationFn: adminApi.openWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });
  const closeMutation = useMutation({
    mutationFn: adminApi.closeWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });

  async function handleExport(path, filename) {
    setExportError("");
    try {
      await downloadExport(path, filename);
    } catch (err) {
      setExportError(err.response?.data?.error || "Export failed");
    }
  }

  const weeks = weeksQuery.data || [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Week Management</h2>
          {weeksQuery.isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-2">
              {weeks.map((w) => (
                <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 transition-standard">
                  <span className="text-sm text-slate-700">{w.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        w.status === "open" ? "bg-green-100 text-green-700" : w.status === "closed" ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {w.status === "open" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                      {w.status}
                    </span>
                    {w.status === "upcoming" && (
                      <button onClick={() => openMutation.mutate(w.id)} className="text-xs font-medium text-nav hover:text-accent transition-standard">Open</button>
                    )}
                    {w.status === "open" && (
                      <button onClick={() => closeMutation.mutate(w.id)} className="text-xs font-medium text-red-600 hover:text-red-700 transition-standard">Close</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <RosterManager />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Export Data</h2>
        {exportError && <ErrorBanner message={exportError} />}
        <div className="flex flex-wrap gap-3 mt-2">
          {weeks.filter((w) => w.status !== "upcoming").map((w) => (
            <button
              key={w.id}
              onClick={() => handleExport(`/export/scores/${w.id}`, `${w.label}_scores.xlsx`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-standard"
            >
              <DownloadIcon />
              Export {w.label} (.xlsx)
            </button>
          ))}
          <button
            onClick={() => handleExport("/export/scores/combined", "combined_score_sheet.xlsx")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-standard"
          >
            <DownloadIcon />
            Export Combined Score Sheet (.xlsx)
          </button>
        </div>
      </Card>

      <RawDataBrowser />
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v9.5M6 9l4 4 4-4" />
      <path d="M3.5 15v1a1.5 1.5 0 001.5 1.5h10a1.5 1.5 0 001.5-1.5v-1" />
    </svg>
  );
}
