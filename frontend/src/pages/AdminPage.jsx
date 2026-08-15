import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, adminApi, downloadExport } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState, RefreshButton } from "../components/ui.jsx";
import { ROLE_LABELS } from "../utils/constants.js";
import RosterManager from "../components/RosterManager.jsx";
import PasswordManager from "../components/PasswordManager.jsx";
import RawDataBrowser from "../components/RawDataBrowser.jsx";

const PREVIEWABLE_ROLES = ["profiler", "group_anchor", "casu_anchor", "casu_lead", "project_lead"];

export default function AdminPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { impersonateRole } = useAuth();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const [exportError, setExportError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewingRole, setPreviewingRole] = useState(null);

  const createWeekMutation = useMutation({
    mutationFn: adminApi.createWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });
  const openMutation = useMutation({
    mutationFn: adminApi.openWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });
  const closeMutation = useMutation({
    mutationFn: adminApi.closeWeek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weeks"] }),
  });
  const [unlockAllMessage, setUnlockAllMessage] = useState("");
  const unlockAllMutation = useMutation({
    mutationFn: adminApi.unlockAllForWeek,
    onSuccess: (data, weekId) => {
      queryClient.invalidateQueries({ queryKey: ["rawData"] });
      setUnlockAllMessage(`${data.unlockedCount} evaluation(s) unlocked for ${weeks.find((w) => w.id === weekId)?.label || "this week"}.`);
    },
  });

  async function handleExport(path, filename) {
    setExportError("");
    try {
      await downloadExport(path, filename);
    } catch (err) {
      setExportError(err.response?.data?.error || "Export failed");
    }
  }

  async function handlePreview(role) {
    setPreviewError("");
    setPreviewingRole(role);
    try {
      await impersonateRole(role);
      navigate("/dashboard");
    } catch (err) {
      setPreviewError(err.response?.data?.error || `Couldn't preview as ${ROLE_LABELS[role]}`);
    } finally {
      setPreviewingRole(null);
    }
  }

  function handleRefreshAll() {
    queryClient.invalidateQueries({ queryKey: ["weeks"] });
    queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    queryClient.invalidateQueries({ queryKey: ["rawData"] });
  }

  const weeks = weeksQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
        <RefreshButton onClick={handleRefreshAll} isFetching={weeksQuery.isFetching} label="Refresh Admin Panel" />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">View Portal As…</h2>
        <p className="text-xs text-slate-500 mb-3">
          Preview the portal exactly as a real professional would see it — useful for testing changes to the
          questionnaire or scoring without needing a second account. Picks the first active user of that role.
        </p>
        {previewError && (
          <div className="mb-3">
            <ErrorBanner message={previewError} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {PREVIEWABLE_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => handlePreview(role)}
              disabled={previewingRole !== null}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
            >
              {previewingRole === role ? "Switching…" : `View as ${ROLE_LABELS[role]}`}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Week Management</h2>
            <button
              onClick={() => createWeekMutation.mutate()}
              disabled={createWeekMutation.isPending}
              className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
            >
              {createWeekMutation.isPending ? "Adding…" : "+ Add Week"}
            </button>
          </div>
          {createWeekMutation.isError && (
            <div className="mb-3">
              <ErrorBanner message={createWeekMutation.error?.response?.data?.error || "Failed to create week"} />
            </div>
          )}
          {weeksQuery.isLoading ? (
            <Spinner />
          ) : weeks.length === 0 ? (
            <EmptyState
              icon="○"
              title="No weeks yet"
              message='Click "+ Add Week" to create Week 01 and unlock Evaluate, Team View, Compliance, and Analytics.'
            />
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
                    {w.status === "closed" && (
                      <button
                        onClick={() => openMutation.mutate(w.id)}
                        title="Reopens this week — anyone whose evaluation is still locked stays locked until you unlock them individually in Raw Data Browser."
                        className="text-xs font-medium text-nav hover:text-accent transition-standard"
                      >
                        Reopen
                      </button>
                    )}
                    {(w.status === "closed" || w.status === "open") && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Unlock every submitted evaluation for ${w.label}? Everyone will be able to resubmit, not just specific people.`)) {
                            unlockAllMutation.mutate(w.id);
                          }
                        }}
                        disabled={unlockAllMutation.isPending}
                        title="For a whole-team redo (e.g. turnout was too low) — unlocks everyone at once instead of one row at a time in Raw Data Browser."
                        className="text-xs font-medium text-slate-500 hover:text-accent disabled:opacity-50 transition-standard"
                      >
                        Unlock All
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {unlockAllMessage && <p className="text-xs text-slate-500 mt-3">{unlockAllMessage}</p>}
        </Card>

        <RosterManager />
      </div>

      <PasswordManager />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Export Scoresheets</h2>
        {exportError && <ErrorBanner message={exportError} />}
        <div className="flex flex-wrap gap-3 mt-2">
          {weeks.filter((w) => w.status !== "upcoming").map((w) => (
            <button
              key={w.id}
              onClick={() => handleExport(`/export/scores/${w.id}`, `${w.label}_scores.xlsx`)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-standard"
            >
              <DownloadIcon />
              Export Scores for {w.label} (.xlsx)
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
