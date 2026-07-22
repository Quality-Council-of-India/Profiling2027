import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { weeksApi, adminApi, downloadExport } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";

export default function AdminPage() {
  const queryClient = useQueryClient();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const fileInputRef = useRef(null);
  const [rosterResult, setRosterResult] = useState(null);
  const [rosterError, setRosterError] = useState("");
  const [exportError, setExportError] = useState("");

  const openMutation = useMutation({
    mutationFn: adminApi.openWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });
  const closeMutation = useMutation({
    mutationFn: adminApi.closeWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });
  const rosterMutation = useMutation({
    mutationFn: (file) => adminApi.importRoster(file),
    onSuccess: (data) => {
      setRosterResult(data);
      setRosterError("");
      queryClient.invalidateQueries();
    },
    onError: (err) => setRosterError(err.response?.data?.error || "Import failed"),
  });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) rosterMutation.mutate(file);
  }

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
      <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Week Management</h2>
          {weeksQuery.isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-2">
              {weeks.map((w) => (
                <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-700">{w.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        w.status === "open" ? "bg-green-100 text-green-700" : w.status === "closed" ? "bg-gray-100 text-gray-500" : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {w.status}
                    </span>
                    {w.status === "upcoming" && (
                      <button onClick={() => openMutation.mutate(w.id)} className="text-xs text-blue-600 hover:underline">Open</button>
                    )}
                    {w.status === "open" && (
                      <button onClick={() => closeMutation.mutate(w.id)} className="text-xs text-red-600 hover:underline">Close</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Team Roster</h2>
          <p className="text-sm text-gray-500 mb-3">Upload a CSV with columns: name, email, role, field</p>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={rosterMutation.isPending}
            className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            {rosterMutation.isPending ? "Importing…" : "↑ Import Roster (CSV)"}
          </button>
          {rosterError && <ErrorBanner message={rosterError} />}
          {rosterResult && (
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <p>{rosterResult.createdCount} created, {rosterResult.updatedCount} updated, {rosterResult.mappingsCreated} peer mappings regenerated.</p>
              {rosterResult.errors.length > 0 && (
                <p className="text-red-600">{rosterResult.errors.length} row(s) had errors — check line numbers in the CSV.</p>
              )}
              {rosterResult.created.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-blue-600">Temp passwords for new accounts (also emailed)</summary>
                  <ul className="mt-1 space-y-0.5">
                    {rosterResult.created.map((c) => (
                      <li key={c.email}>{c.email}: <code>{c.tempPassword}</code></li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Export Data</h2>
        {exportError && <ErrorBanner message={exportError} />}
        <div className="flex flex-wrap gap-3 mt-2">
          {weeks.filter((w) => w.status !== "upcoming").map((w) => (
            <button
              key={w.id}
              onClick={() => handleExport(`/export/scores/${w.id}`, `${w.label}_scores.xlsx`)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              📊 Export {w.label} (.xlsx)
            </button>
          ))}
          <button
            onClick={() => handleExport("/export/scores/combined", "combined_score_sheet.xlsx")}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            📋 Export Combined Score Sheet (.xlsx)
          </button>
        </div>
      </Card>
    </div>
  );
}
