import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adminApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, Badge } from "./ui.jsx";
import { ROLE_LABELS, ROLE_COLORS } from "../utils/constants.js";
import { useAuth } from "../context/AuthContext.jsx";

function generatePassword() {
  // 12 random URL-safe chars — plenty strong, easy to read/relay verbally.
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 12);
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "not_sent", label: "Not sent yet" },
  { value: "sent_not_logged_in", label: "Sent, not logged in" },
  { value: "logged_in_temp", label: "Logged in, temp password" },
  { value: "changed", label: "Password changed" },
];

/** Where someone stands in the credentials/login lifecycle — not applicable to Admins, who are never bulk-issued credentials. */
function credentialStatus(u) {
  if (u.role === "admin") return { value: "na", label: "—", className: "text-slate-400" };
  if (!u.credentials_sent_at) return { value: "not_sent", label: "Not sent yet", className: "text-slate-500" };
  if (u.password_changed_at) return { value: "changed", label: "Password changed", className: "text-green-700" };
  if (u.last_login_at) return { value: "logged_in_temp", label: "Logged in, temp password", className: "text-amber-600" };
  return { value: "sent_not_logged_in", label: "Sent, not logged in", className: "text-slate-500" };
}

/**
 * Admin password management — the only two things an Admin can ever do
 * with a password: set a brand-new one directly, or trigger the same
 * reset-link email a user would send themselves. Existing passwords are
 * bcrypt hashes and are never readable by anyone, including Admin — there
 * is no "view password" capability anywhere in the system, by design.
 */
export default function PasswordManager() {
  const { user: currentUser } = useAuth();
  const canEdit = currentUser?.is_master_admin || currentUser?.can_manage_passwords;
  const usersQuery = useQuery({ queryKey: ["adminUsers"], queryFn: adminApi.listUsers });
  const [openRowId, setOpenRowId] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [rowMessage, setRowMessage] = useState({});
  const [bulkMessage, setBulkMessage] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showGuide, setShowGuide] = useState(false);

  const sendAllMutation = useMutation({
    mutationFn: adminApi.sendLoginCredentialsToAll,
    onSuccess: (data) => {
      setBulkMessage({
        type: data.failed.length ? "error" : "success",
        text:
          data.total === 0
            ? "Everyone already has credentials — nobody was due to be sent any."
            : `Sent to ${data.sent} of ${data.total} user(s) who'd never been sent credentials before.` +
              (data.failed.length ? ` Failed: ${data.failed.join(", ")}` : ""),
      });
    },
    onError: (err) => {
      setBulkMessage({ type: "error", text: err.response?.data?.error || "Failed to send credentials" });
    },
  });

  function startSendAll() {
    if (
      window.confirm(
        "Send login credentials to everyone who's never been sent any? This resets and emails a new password only to active users who've never received credentials before — anyone who's already logged in and set their own password is left untouched."
      )
    ) {
      setBulkMessage(null);
      sendAllMutation.mutate();
    }
  }

  const setPasswordMutation = useMutation({
    mutationFn: ({ id, password }) => adminApi.setUserPassword(id, password),
    onSuccess: (data, { id }) => {
      setRowMessage((m) => ({ ...m, [id]: { type: "success", text: data.message } }));
      setOpenRowId(null);
      setPasswordDraft("");
    },
    onError: (err, { id }) => {
      setRowMessage((m) => ({ ...m, [id]: { type: "error", text: err.response?.data?.error || "Failed to set password" } }));
    },
  });

  const sendResetMutation = useMutation({
    mutationFn: (id) => adminApi.sendUserPasswordReset(id),
    onSuccess: (data, id) => {
      setRowMessage((m) => ({ ...m, [id]: { type: "success", text: data.message } }));
    },
    onError: (err, id) => {
      setRowMessage((m) => ({ ...m, [id]: { type: "error", text: err.response?.data?.error || "Failed to send reset email" } }));
    },
  });

  function startSetPassword(id) {
    setOpenRowId(id);
    setPasswordDraft(generatePassword());
    setRowMessage((m) => ({ ...m, [id]: null }));
  }

  function cancelSetPassword() {
    setOpenRowId(null);
    setPasswordDraft("");
  }

  function confirmSetPassword(id) {
    if (passwordDraft.length < 8) {
      setRowMessage((m) => ({ ...m, [id]: { type: "error", text: "Password must be at least 8 characters" } }));
      return;
    }
    setPasswordMutation.mutate({ id, password: passwordDraft });
  }

  const allUsers = usersQuery.data || [];
  const visibleUsers =
    statusFilter === "all" ? allUsers : allUsers.filter((u) => credentialStatus(u).value === statusFilter);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">Password Management</h2>
          {!canEdit && <Badge text="View only" color="#64748b" />}
        </div>
        <button
          onClick={startSendAll}
          disabled={sendAllMutation.isPending || !canEdit}
          title={canEdit ? undefined : "Ask the Master Admin for Password Management edit access"}
          className="px-3 py-1.5 rounded-md text-white text-[11px] font-medium bg-nav hover:bg-nav-deep disabled:opacity-50 transition-standard flex-shrink-0"
        >
          {sendAllMutation.isPending ? "Sending…" : "Send Login Credentials to New Users"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-1">
        Existing passwords are one-way hashed and can never be viewed by anyone, including Admin — that's a
        deliberate security property, not a missing feature. What Admin <em>can</em> do: set a brand-new password
        directly for someone, send them the same reset-link email they'd get from "Forgot password?" on the login
        page, or email a fresh temporary password to everyone who's never been sent one before — safe to run again
        any time you add new people, since it never touches anyone who's already had credentials sent.
      </p>
      <div className="mb-3">
        <button
          onClick={() => setShowGuide((v) => !v)}
          className="text-xs font-medium text-nav hover:text-accent transition-standard"
        >
          {showGuide ? "Hide guide" : "What do these statuses mean?"}
        </button>
      </div>
      {showGuide && (
        <div className="mb-4 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
          <p className="font-semibold text-slate-700">Each status reflects what's actually happened, in order.</p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li><strong>Not sent yet</strong> — this person has never been sent an account/credentials email at all.</li>
            <li><strong>Sent, not logged in</strong> — credentials were emailed, but they haven't logged in even once yet.</li>
            <li><strong>Logged in, temp password</strong> — they've logged in, but are still using whatever temporary password was last issued to them.</li>
            <li><strong>Password changed</strong> — they've logged in and set their own password (self-service reset, or an Admin set one for them).</li>
          </ol>
          <p className="text-slate-500">
            Note: login and password-change tracking only started recording from when this feature was added — activity
            from before that isn't known retroactively, so someone who actually logged in and changed their password
            long ago may still show "Sent, not logged in" here until they do either again.
          </p>
        </div>
      )}
      {bulkMessage && (
        <p className={`text-xs mb-4 ${bulkMessage.type === "success" ? "text-green-700" : "text-red-600"}`}>
          {bulkMessage.text}
        </p>
      )}

      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-slate-500">Filter by status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {statusFilter !== "all" && (
          <span className="text-xs text-slate-400">
            {visibleUsers.length} of {allUsers.length}
          </span>
        )}
      </div>

      {usersQuery.isLoading ? (
        <Spinner />
      ) : usersQuery.isError ? (
        <ErrorBanner message="Failed to load users" />
      ) : visibleUsers.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No one matches this status filter.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 sticky top-0 bg-white">
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Name</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Email</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Role</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Status</th>
                <th className="text-left px-2 py-1.5 font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u, i) => (
                <Fragment key={u.id}>
                  <tr className={`border-b border-slate-50 ${!u.is_active ? "opacity-50" : ""} ${i % 2 === 0 ? "bg-slate-50/60" : ""}`}>
                    <td className="px-2 py-1.5 font-medium text-slate-800">{u.name}</td>
                    <td className="px-2 py-1.5 text-slate-600">{u.email}</td>
                    <td className="px-2 py-1.5"><Badge text={ROLE_LABELS[u.role]} color={ROLE_COLORS[u.role]} /></td>
                    <td className={`px-2 py-1.5 ${credentialStatus(u).className}`}>{credentialStatus(u).label}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => (openRowId === u.id ? cancelSetPassword() : startSetPassword(u.id))}
                          disabled={!canEdit}
                          title={canEdit ? undefined : "Ask the Master Admin for Password Management edit access"}
                          className="px-2 py-1 rounded-md border border-slate-300 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
                        >
                          {openRowId === u.id ? "Cancel" : "Set Password"}
                        </button>
                        <button
                          onClick={() => sendResetMutation.mutate(u.id)}
                          disabled={!canEdit || (sendResetMutation.isPending && sendResetMutation.variables === u.id)}
                          title={canEdit ? undefined : "Ask the Master Admin for Password Management edit access"}
                          className="px-2 py-1 rounded-md border border-slate-300 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-50 transition-standard"
                        >
                          {sendResetMutation.isPending && sendResetMutation.variables === u.id ? "Sending…" : "Send Reset Email"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {openRowId === u.id && (
                    <tr className={i % 2 === 0 ? "bg-slate-50/60" : ""}>
                      <td colSpan={5} className="px-2 pb-2">
                        <div className="flex items-center gap-2 bg-slate-100/70 rounded-lg p-2.5">
                          <input
                            type="text"
                            value={passwordDraft}
                            onChange={(e) => setPasswordDraft(e.target.value)}
                            className="flex-1 px-2 py-1.5 border border-slate-300 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
                            placeholder="New password (min 8 characters)"
                          />
                          <button
                            onClick={() => setPasswordDraft(generatePassword())}
                            className="px-2 py-1.5 rounded-md border border-slate-300 text-[11px] font-medium text-slate-600 hover:bg-white transition-standard"
                          >
                            Generate
                          </button>
                          <button
                            onClick={() => confirmSetPassword(u.id)}
                            disabled={setPasswordMutation.isPending}
                            className="px-3 py-1.5 rounded-md text-white text-[11px] font-medium bg-nav hover:bg-nav-deep disabled:opacity-50 transition-standard"
                          >
                            {setPasswordMutation.isPending ? "Saving…" : "Save"}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Relay this password to {u.name} yourself (e.g. verbally or via a secure channel) — it
                          won't be shown again after you save it.
                        </p>
                      </td>
                    </tr>
                  )}
                  {rowMessage[u.id] && (
                    <tr className={i % 2 === 0 ? "bg-slate-50/60" : ""}>
                      <td colSpan={5} className="px-2 pb-2">
                        <p className={`text-[11px] ${rowMessage[u.id].type === "success" ? "text-green-700" : "text-red-600"}`}>
                          {rowMessage[u.id].text}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
