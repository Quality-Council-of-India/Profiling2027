import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, Badge } from "./ui.jsx";
import { ROLE_LABELS, ROLE_COLORS } from "../utils/constants.js";
import { compressImage } from "../utils/imageCompression.js";

/** CSV import + per-user active/inactive toggle — handles mid-project
 * roster changes (someone quits) without touching historical data; see
 * PATCH /api/admin/users/:id/active, which regenerates peer_mappings but
 * never rewrites computed_scores. */
export default function RosterManager() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [rosterResult, setRosterResult] = useState(null);
  const [rosterError, setRosterError] = useState("");

  const usersQuery = useQuery({ queryKey: ["adminUsers"], queryFn: adminApi.listUsers });

  const rosterMutation = useMutation({
    mutationFn: (file) => adminApi.importRoster(file),
    onSuccess: (data) => {
      setRosterResult(data);
      setRosterError("");
      queryClient.invalidateQueries();
    },
    onError: (err) => setRosterError(err.response?.data?.error || "Import failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => adminApi.setUserActive(id, is_active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["adminUsers"] }),
  });

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) rosterMutation.mutate(file);
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-800">Team Roster</h2>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileChange} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={rosterMutation.isPending}
          className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
        >
          {rosterMutation.isPending ? "Importing…" : "↑ Import Roster (.csv / .xlsx)"}
        </button>
      </div>

      {rosterError && <ErrorBanner message={rosterError} />}
      {rosterResult && (
        <div className="mb-3 text-xs text-slate-600 space-y-1 bg-slate-50 rounded-lg p-3">
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

      {usersQuery.isLoading ? (
        <Spinner />
      ) : usersQuery.isError ? (
        <ErrorBanner message="Failed to load roster" />
      ) : (
        <div className="max-h-96 overflow-y-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 sticky top-0 bg-white">
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Photo</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Name</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Role</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Field</th>
                <th className="text-center px-2 py-1.5 font-medium text-slate-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map((u, i) => (
                <tr key={u.id} className={`border-b border-slate-50 ${!u.is_active ? "opacity-50" : ""} ${i % 2 === 0 ? "bg-slate-50/60" : ""}`}>
                  <td className="px-2 py-1.5"><PhotoCell user={u} /></td>
                  <td className="px-2 py-1.5 font-medium text-slate-800">{u.name}</td>
                  <td className="px-2 py-1.5"><Badge text={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]} /></td>
                  <td className="px-2 py-1.5 text-slate-600">{u.field || "—"}</td>
                  <td className="px-2 py-1.5 text-center">
                    {u.role === "admin" ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <button
                        onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                        disabled={toggleMutation.isPending}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-standard disabled:opacity-50 ${
                          u.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
                        title={u.is_active ? "Click to deactivate (e.g. they've left the project)" : "Click to reactivate"}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Avatar thumbnail that doubles as an upload button — click it to pick a
 * photo, compressed client-side before it's sent to the server (see
 * PATCH /api/admin/users/:id/photo, stored as a base64 data: URI). */
function PhotoCell({ user }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [error, setError] = useState("");

  const uploadMutation = useMutation({
    mutationFn: (blob) => adminApi.uploadUserPhoto(user.id, blob),
    onSuccess: () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["hallOfRecognition"] });
    },
    onError: (err) => setError(err.response?.data?.error || "Upload failed"),
  });

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const blob = await compressImage(file);
      uploadMutation.mutate(blob);
    } catch {
      setError("Couldn't process that image");
    }
  }

  return (
    <div className="relative inline-block" title={error || "Click to upload a photo"}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="group relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-slate-200 hover:ring-accent transition-standard disabled:opacity-50"
      >
        {user.photo_url ? (
          <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-nav/10 text-nav text-[11px] font-display font-bold flex items-center justify-center">
            {user.name?.charAt(0).toUpperCase() || "?"}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-standard">
          <svg
            className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-standard"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6.5A1.5 1.5 0 014.5 5h2l1-1.5h5L13.5 5h2A1.5 1.5 0 0117 6.5v7A1.5 1.5 0 0115.5 15h-11A1.5 1.5 0 013 13.5v-7z" />
            <circle cx="10" cy="10" r="2.5" />
          </svg>
        </div>
      </button>
      {error && <p className="absolute left-0 top-full mt-0.5 w-24 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
