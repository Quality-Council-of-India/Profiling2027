import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "./ui.jsx";

const SECTIONS = [
  { key: "can_manage_weeks", label: "Week Management" },
  { key: "can_manage_passwords", label: "Password Management" },
  { key: "can_manage_roster", label: "Team Roster" },
];

/**
 * Master-Admin-only: grants/revokes each other Admin's edit access to Week
 * Management, Password Management, and Team Roster — the three sections
 * every non-master Admin is otherwise view-only in. Everything else in the
 * Admin Panel (View Portal As, Export Scoresheets, Raw Data Browser) is
 * unrestricted for every Admin already and isn't controlled here.
 */
export default function AdminAccessManager() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["adminUsers"], queryFn: adminApi.listUsers });
  const [drafts, setDrafts] = useState({});
  const [rowMessage, setRowMessage] = useState({});

  const mutation = useMutation({
    mutationFn: ({ id, permissions }) => adminApi.setAdminPermissions(id, permissions),
    onSuccess: (_data, { id }) => {
      setRowMessage((m) => ({ ...m, [id]: { type: "success", text: "Access updated." } }));
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    },
    onError: (err, { id }) => {
      setRowMessage((m) => ({ ...m, [id]: { type: "error", text: err.response?.data?.error || "Failed to update access" } }));
    },
  });

  const otherAdmins = (usersQuery.data || []).filter((u) => u.role === "admin" && !u.is_master_admin);

  function draftFor(u) {
    return (
      drafts[u.id] || {
        can_manage_weeks: u.can_manage_weeks,
        can_manage_passwords: u.can_manage_passwords,
        can_manage_roster: u.can_manage_roster,
      }
    );
  }

  function toggle(u, key) {
    const current = draftFor(u);
    setDrafts((d) => ({ ...d, [u.id]: { ...current, [key]: !current[key] } }));
  }

  function save(u) {
    mutation.mutate({ id: u.id, permissions: draftFor(u) });
  }

  if (usersQuery.isLoading) {
    return (
      <Card className="p-5">
        <Spinner />
      </Card>
    );
  }
  if (usersQuery.isError) {
    return (
      <Card className="p-5">
        <ErrorBanner message="Failed to load Admins" />
      </Card>
    );
  }
  if (otherAdmins.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Manage Admin Access</h2>
      <p className="text-xs text-slate-500 mb-4">
        As Master Admin, grant each other Admin edit access to Week Management, Password Management, and Team
        Roster — any mix, full or partial. Everyone below can already see all three sections and use View Portal
        As, Export Scoresheets, and Raw Data Browser without restriction; these toggles only control who can make
        changes.
      </p>
      <div className="space-y-3">
        {otherAdmins.map((u) => {
          const draft = draftFor(u);
          const dirty = JSON.stringify(draft) !== JSON.stringify({
            can_manage_weeks: u.can_manage_weeks,
            can_manage_passwords: u.can_manage_passwords,
            can_manage_roster: u.can_manage_roster,
          });
          return (
            <div key={u.id} className="flex flex-col gap-2 px-3 py-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
                <button
                  onClick={() => save(u)}
                  disabled={!dirty || (mutation.isPending && mutation.variables?.id === u.id)}
                  className="px-3 py-1 rounded-md text-white text-[11px] font-medium bg-nav hover:bg-nav-deep disabled:opacity-40 transition-standard flex-shrink-0"
                >
                  {mutation.isPending && mutation.variables?.id === u.id ? "Saving…" : "Save"}
                </button>
              </div>
              <div className="flex flex-wrap gap-4">
                {SECTIONS.map((s) => (
                  <label key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={draft[s.key]} onChange={() => toggle(u, s.key)} />
                    {s.label}
                  </label>
                ))}
              </div>
              {rowMessage[u.id] && (
                <p className={`text-[11px] ${rowMessage[u.id].type === "success" ? "text-green-700" : "text-red-600"}`}>
                  {rowMessage[u.id].text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
