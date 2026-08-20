import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, Badge } from "./ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, FIELDS } from "../utils/constants.js";
import { compressImage } from "../utils/imageCompression.js";
import { useAuth } from "../context/AuthContext.jsx";

function fieldsOf(field) {
  return field ? field.split(",").map((f) => f.trim()).filter(Boolean) : [];
}

/** CSV import + per-user active/inactive toggle — handles mid-project
 * roster changes (someone quits) without touching historical data; see
 * PATCH /api/admin/users/:id/active, which regenerates peer_mappings but
 * never rewrites computed_scores. */
export default function RosterManager() {
  const { user } = useAuth();
  const canEdit = user?.is_master_admin || user?.can_manage_roster;
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [rosterResult, setRosterResult] = useState(null);
  const [rosterError, setRosterError] = useState("");
  const [showGuide, setShowGuide] = useState(false);

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
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Team Roster</h2>
          {!canEdit && <Badge text="View only" color="#64748b" />}
        </div>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileChange} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={rosterMutation.isPending || !canEdit}
          title={canEdit ? undefined : "Ask the Master Admin for Team Roster edit access"}
          className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
        >
          {rosterMutation.isPending ? "Importing…" : "↑ Import Roster (.csv / .xlsx)"}
        </button>
      </div>

      <div className="mb-3">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="text-xs font-medium text-nav hover:text-accent transition-standard"
        >
          {showGuide ? "Hide guide" : "Reshuffling fields?"}
        </button>
      </div>

      {showGuide && (
        <div className="mb-4 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
          <p className="font-semibold text-slate-700">Only reshuffle fields between weeks, not during one.</p>
          <p>
            Use the "Change" link next to a person's field below to move them — no need to re-upload the whole
            roster for a one-off change. It takes effect immediately, so if a week is currently open, anyone who
            hasn't submitted yet would suddenly follow the new mapping mid-week. Wait until the week closes first.
          </p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Make sure the current week is closed (or none is open).</li>
            <li>Change the field(s) for whoever moved.</li>
            <li>Peer mappings regenerate automatically, right away.</li>
            <li>The next week you open will route evaluations under the new field(s).</li>
            <li>Every week already closed keeps showing that person under whichever field they were in at the time — nothing gets rewritten.</li>
          </ol>
        </div>
      )}

      {rosterError && <ErrorBanner message={rosterError} />}
      {rosterResult && (
        <div className="mb-3 text-xs text-slate-600 space-y-1 bg-slate-50 rounded-lg p-3">
          <p>{rosterResult.createdCount} created, {rosterResult.updatedCount} updated, {rosterResult.mappingsCreated} peer mappings regenerated.</p>
          {rosterResult.errors.length > 0 && (
            <p className="text-red-600">{rosterResult.errors.length} row(s) had errors — check line numbers in the CSV.</p>
          )}
          {rosterResult.created.length > 0 && (
            <p>
              New accounts don't get emailed automatically — use "Send Login Credentials to All" in Password
              Management when you're ready to notify everyone at once.
            </p>
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
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Emp ID</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Role</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Field</th>
                <th className="text-center px-2 py-1.5 font-medium text-slate-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data.map((u, i) => (
                <tr key={u.id} className={`border-b border-slate-50 ${!u.is_active ? "opacity-50" : ""} ${i % 2 === 0 ? "bg-slate-50/60" : ""}`}>
                  <td className="px-2 py-1.5"><PhotoCell user={u} canEdit={canEdit} /></td>
                  <td className="px-2 py-1.5 font-medium text-slate-800">{u.name}</td>
                  <td className="px-2 py-1.5 text-slate-500">{u.emp_id || "—"}</td>
                  <td className="px-2 py-1.5"><Badge text={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]} /></td>
                  <td className="px-2 py-1.5 text-slate-600 align-top"><FieldCell user={u} canEdit={canEdit} /></td>
                  <td className="px-2 py-1.5 text-center">
                    {u.role === "admin" ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <button
                        onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                        disabled={toggleMutation.isPending || !canEdit}
                        title={canEdit ? undefined : "Ask the Master Admin for Team Roster edit access"}
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-standard disabled:opacity-50 ${
                          u.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                        }`}
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
function PhotoCell({ user, canEdit }) {
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
    <div className="relative inline-block" title={error || (canEdit ? "Click to upload a photo" : "Ask the Master Admin for Team Roster edit access")}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending || !canEdit}
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

/** Inline field editor — lets Admin move one person to a new field (a
 * reshuffle) without re-uploading the whole roster. CASU Anchors can cover
 * more than one field at once, so they get a checkbox list; every other
 * role gets a plain single-select. See PATCH /api/admin/users/:id/field,
 * which regenerates peer_mappings right away — hence the guide above the
 * table about only doing this between weeks. */
function FieldCell({ user, canEdit }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(() => fieldsOf(user.field));
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (field) => adminApi.setUserField(user.id, field),
    onSuccess: () => {
      setError("");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (err) => setError(err.response?.data?.error || "Update failed"),
  });

  if (user.role === "admin") {
    return <span className="text-slate-400">—</span>;
  }

  if (!canEdit) {
    return <span>{user.field || "—"}</span>;
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span>{user.field || "—"}</span>
        <button
          onClick={() => {
            setSelected(fieldsOf(user.field));
            setError("");
            setEditing(true);
          }}
          className="text-[10px] text-nav hover:text-accent transition-standard"
        >
          Change
        </button>
      </div>
    );
  }

  const isMulti = user.role === "casu_anchor";

  function toggle(f) {
    setSelected((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function save() {
    if (selected.length === 0) {
      setError("Pick at least one field");
      return;
    }
    mutation.mutate(selected.join(", "));
  }

  return (
    <div className="w-52 bg-white border border-slate-200 rounded-lg shadow-sm p-2 space-y-1.5">
      {isMulti ? (
        <div className="max-h-32 overflow-y-auto space-y-1">
          {FIELDS.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-[11px] text-slate-700">
              <input type="checkbox" checked={selected.includes(f)} onChange={() => toggle(f)} />
              {f}
            </label>
          ))}
        </div>
      ) : (
        <select
          value={selected[0] || ""}
          onChange={(e) => setSelected([e.target.value])}
          className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
        >
          <option value="" disabled>
            Select a field…
          </option>
          {FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-0.5">
        <button
          onClick={() => {
            setEditing(false);
            setError("");
          }}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={mutation.isPending}
          className="text-[11px] font-medium text-white bg-nav rounded px-2 py-0.5 hover:bg-nav/90 disabled:opacity-50 transition-standard"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
