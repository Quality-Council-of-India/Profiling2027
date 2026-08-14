import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../api/endpoints.js";
import { BellIcon } from "./icons.jsx";
import { Spinner } from "./ui.jsx";

const TYPE_ICON = {
  ticket_created: "🎫",
  ticket_resolved: "✅",
  week_opened: "🟢",
  week_closed: "🔒",
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Bell icon with an unread-count badge and a dropdown feed — polled every
 * 30s rather than pushed, per the "in-app + email" delivery choice (no
 * websocket infra needed; the email copy covers anything time-sensitive). */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const countQuery = useQuery({
    queryKey: ["notificationsUnreadCount"],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 30000,
  });

  const listQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: notificationsApi.list,
    enabled: open,
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationsUnreadCount"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unread = countQuery.data || 0;

  function toggle() {
    setOpen((o) => !o);
  }

  return (
    <div className="relative" data-tour="notifications">
      <button
        onClick={toggle}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-standard"
        aria-label="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
              {unread > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-xs font-medium text-nav hover:text-accent transition-standard"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {listQuery.isLoading ? (
                <Spinner />
              ) : !listQuery.data || listQuery.data.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No notifications yet.</p>
              ) : (
                listQuery.data.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && markReadMutation.mutate(n.id)}
                    className={`px-4 py-3 border-b border-slate-50 flex gap-2.5 ${!n.is_read ? "bg-accent/5 cursor-pointer hover:bg-accent/10" : ""}`}
                  >
                    <span className="text-base flex-shrink-0">{TYPE_ICON[n.type] || "🔔"}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800">{n.title}</p>
                      {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
