import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { weeksApi, adminApi, downloadExport } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState, RefreshButton, Modal } from "../components/ui.jsx";
import { ROLE_LABELS } from "../utils/constants.js";
import RosterManager from "../components/RosterManager.jsx";
import PasswordManager from "../components/PasswordManager.jsx";
import RawDataBrowser from "../components/RawDataBrowser.jsx";

const PREVIEWABLE_ROLES = ["profiler", "group_anchor", "casu_anchor", "casu_lead", "project_lead"];

function ButtonSpinner() {
  return (
    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { impersonateUser } = useAuth();
  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const usersQuery = useQuery({ queryKey: ["adminUsers"], queryFn: adminApi.listUsers });
  const [exportError, setExportError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [pickerRole, setPickerRole] = useState(null);
  const [switchingUserId, setSwitchingUserId] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

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

  async function handlePreview(user) {
    setPreviewError("");
    setSwitchingUserId(user.id);
    try {
      await impersonateUser(user.id);
      navigate("/dashboard");
    } catch (err) {
      setPreviewError(err.response?.data?.error || `Couldn't preview as ${user.name}`);
    } finally {
      setSwitchingUserId(null);
      setPickerRole(null);
    }
  }

  function handleOpenWeek(week) {
    if (window.confirm(`Open ${week.label}? Every active professional will be emailed that it's open for submissions.`)) {
      openMutation.mutate(week.id);
    }
  }

  function handleCloseWeek(week) {
    if (window.confirm(`Close ${week.label}? Scores will be computed and finalized, and every active professional will be emailed that it's closed.`)) {
      closeMutation.mutate(week.id);
    }
  }

  function handleReopenWeek(week) {
    if (
      window.confirm(
        `Reopen ${week.label}? Anyone whose evaluation is still locked stays locked until you unlock them individually (or use Unlock All). If another week is currently open, both will show as "open" — see the guide below.`
      )
    ) {
      openMutation.mutate(week.id);
    }
  }

  function handleRefreshAll() {
    queryClient.invalidateQueries({ queryKey: ["weeks"] });
    queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    queryClient.invalidateQueries({ queryKey: ["rawData"] });
  }

  const weeks = weeksQuery.data || [];
  const pickerUsers = (usersQuery.data || []).filter((u) => u.role === pickerRole && u.is_active);
  // Disables every week's action buttons while any one of them is in
  // flight — these calls email the whole roster and recompute scores, so
  // a second click before the first finishes could double-fire either.
  const anyWeekActionPending = openMutation.isPending || closeMutation.isPending;

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
          questionnaire or scoring without needing a second account. Pick the exact person to preview.
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
              onClick={() => setPickerRole(role)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-standard"
            >
              View as {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      </Card>

      {pickerRole && (
        <Modal title={`View as ${ROLE_LABELS[pickerRole]}`} onClose={() => setPickerRole(null)} widthClass="max-w-md">
          {usersQuery.isLoading ? (
            <Spinner />
          ) : pickerUsers.length === 0 ? (
            <p className="text-sm text-slate-400">No active {ROLE_LABELS[pickerRole]} exists yet.</p>
          ) : (
            <div className="space-y-1">
              {pickerUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handlePreview(u)}
                  disabled={switchingUserId !== null}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 text-left text-sm hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-standard"
                >
                  <span className="font-medium text-slate-800">{u.name}</span>
                  <span className="text-xs text-slate-400">
                    {switchingUserId === u.id ? "Switching…" : u.field || "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Week Management</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGuide((v) => !v)}
                className="text-xs font-medium text-nav hover:text-accent transition-standard"
              >
                {showGuide ? "Hide guide" : "Correcting an older week?"}
              </button>
              <button
                onClick={() => createWeekMutation.mutate()}
                disabled={createWeekMutation.isPending}
                className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
              >
                {createWeekMutation.isPending ? "Adding…" : "+ Add Week"}
              </button>
            </div>
          </div>
          {showGuide && (
            <div className="mb-4 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
              <p className="font-semibold text-slate-700">Only one week should be open at a time.</p>
              <p>
                The Evaluate page and Dashboard only surface a single open week at a time, so if you need to reopen an
                older week (e.g. Week 01) while a newer one (e.g. Week 02) is already open:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 pl-1">
                <li>Temporarily <strong>Close</strong> the newer week (Week 02) — this is safe, it just locks it and computes scores, and doesn't erase anything.</li>
                <li><strong>Reopen</strong> the older week (Week 01) and make the needed corrections (unlock specific rows in Raw Data Browser, or Unlock All).</li>
                <li><strong>Close</strong> Week 01 again, then <strong>Reopen</strong> Week 02 to resume where you left off.</li>
              </ol>
              <p className="text-slate-500">
                Note: closing a week (even temporarily) makes its Performance Scorecard downloadable to everyone and emails
                everyone that it's "closed" — that's expected, not a bug, since scores are genuinely computed and correct
                at that point.
              </p>
            </div>
          )}
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
                      <button
                        onClick={() => handleOpenWeek(w)}
                        disabled={anyWeekActionPending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-nav hover:text-accent disabled:opacity-50 transition-standard"
                      >
                        {openMutation.isPending && openMutation.variables === w.id && <ButtonSpinner />}
                        {openMutation.isPending && openMutation.variables === w.id ? "Opening…" : "Open"}
                      </button>
                    )}
                    {w.status === "open" && (
                      <button
                        onClick={() => handleCloseWeek(w)}
                        disabled={anyWeekActionPending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-standard"
                      >
                        {closeMutation.isPending && closeMutation.variables === w.id && <ButtonSpinner />}
                        {closeMutation.isPending && closeMutation.variables === w.id ? "Closing…" : "Close"}
                      </button>
                    )}
                    {w.status === "closed" && (
                      <button
                        onClick={() => handleReopenWeek(w)}
                        disabled={anyWeekActionPending}
                        title="Reopens this week — anyone whose evaluation is still locked stays locked until you unlock them individually in Raw Data Browser."
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-nav hover:text-accent disabled:opacity-50 transition-standard"
                      >
                        {openMutation.isPending && openMutation.variables === w.id && <ButtonSpinner />}
                        {openMutation.isPending && openMutation.variables === w.id ? "Reopening…" : "Reopen"}
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
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-accent disabled:opacity-50 transition-standard"
                      >
                        {unlockAllMutation.isPending && unlockAllMutation.variables === w.id && <ButtonSpinner />}
                        {unlockAllMutation.isPending && unlockAllMutation.variables === w.id ? "Unlocking…" : "Unlock All"}
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
