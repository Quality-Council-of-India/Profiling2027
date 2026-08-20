import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "./ui.jsx";
import { ROLE_LABELS, FIELDS } from "../utils/constants.js";

const ROLE_OPTIONS = Object.keys(ROLE_LABELS);

function RichTextToolbar({ onCommand }) {
  const buttons = [
    { cmd: "bold", label: "B", title: "Bold", className: "font-bold" },
    { cmd: "italic", label: "I", title: "Italic", className: "italic" },
    { cmd: "insertUnorderedList", label: "•—", title: "Bulleted list", className: "" },
    { cmd: "link", label: "🔗", title: "Insert link", className: "" },
  ];
  return (
    <div className="flex items-center gap-1 mb-1.5 border border-slate-200 rounded-t-md bg-slate-50 px-2 py-1">
      {buttons.map((b) => (
        <button
          key={b.cmd}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus/selection in the editor
            onCommand(b.cmd);
          }}
          title={b.title}
          className={`w-7 h-7 rounded text-xs text-slate-600 hover:bg-slate-200 transition-standard ${b.className}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Admin "send an email on any topic" — free-form broadcast to all active
 * users, one role, one field, or a hand-picked list. See
 * POST /api/admin/broadcast-email, which sends and logs a sent-history
 * row (recipient_summary, counts) in the same request.
 */
export default function BroadcastEmail() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["adminUsers"], queryFn: adminApi.listUsers });
  const historyQuery = useQuery({ queryKey: ["emailBroadcasts"], queryFn: adminApi.listEmailBroadcasts });

  const editorRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [scope, setScope] = useState("all");
  const [role, setRole] = useState(ROLE_OPTIONS[0]);
  const [field, setField] = useState(FIELDS[0]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [resultMessage, setResultMessage] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const sendMutation = useMutation({
    mutationFn: (payload) => adminApi.sendBroadcastEmail(payload),
    onSuccess: (data) => {
      setResultMessage({ type: "success", text: `Sent to ${data.sent} of ${data.total} recipient(s).` });
      setSubject("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      setSelectedUserIds([]);
      queryClient.invalidateQueries({ queryKey: ["emailBroadcasts"] });
    },
    onError: (err) => setResultMessage({ type: "error", text: err.response?.data?.error || "Failed to send" }),
  });

  function runCommand(cmd) {
    if (cmd === "link") {
      const url = window.prompt("Link URL:");
      if (url) document.execCommand("createLink", false, url);
    } else {
      document.execCommand(cmd);
    }
    editorRef.current?.focus();
  }

  function toggleUser(id) {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function recipientDescription() {
    if (scope === "all") return "everyone active in the portal";
    if (scope === "role") return `everyone with the role "${ROLE_LABELS[role]}"`;
    if (scope === "field") return `everyone in the "${field}" field`;
    return `${selectedUserIds.length} hand-picked user(s)`;
  }

  function handleSend() {
    const bodyHtml = editorRef.current?.innerHTML?.trim() || "";
    if (!subject.trim() || !bodyHtml) {
      setResultMessage({ type: "error", text: "Subject and message body can't be empty" });
      return;
    }
    if (scope === "users" && selectedUserIds.length === 0) {
      setResultMessage({ type: "error", text: "Pick at least one recipient" });
      return;
    }
    if (!window.confirm(`Send this email to ${recipientDescription()}?`)) return;

    setResultMessage(null);
    sendMutation.mutate({
      subject: subject.trim(),
      body_html: bodyHtml,
      recipients:
        scope === "role"
          ? { scope, role }
          : scope === "field"
          ? { scope, field }
          : scope === "users"
          ? { scope, userIds: selectedUserIds }
          : { scope: "all" },
    });
  }

  const filteredUsers = (usersQuery.data || []).filter(
    (u) =>
      u.is_active &&
      (u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-800 mb-1">Send an Email</h2>
      <p className="text-xs text-slate-500 mb-4">
        Send a message on any topic to everyone, a specific role, a specific field, or a hand-picked list — separate
        from the automatic week/reminder/ticket emails the portal sends on its own.
      </p>

      <div className="space-y-3">
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
        />

        <div>
          <RichTextToolbar onCommand={runCommand} />
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            data-placeholder="Write your message…"
            className="min-h-[120px] px-3 py-2 border border-t-0 border-slate-300 rounded-b-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">Send to:</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
          >
            <option value="all">Everyone</option>
            <option value="role">A specific role</option>
            <option value="field">A specific field</option>
            <option value="users">Specific people</option>
          </select>
          {scope === "role" && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          )}
          {scope === "field" && (
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="text-xs border border-slate-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
            >
              {FIELDS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>

        {scope === "users" && (
          <div className="border border-slate-200 rounded-md p-2">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full mb-2 px-2 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
            />
            <div className="max-h-40 overflow-y-auto space-y-1">
              {usersQuery.isLoading ? (
                <Spinner />
              ) : (
                filteredUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-xs text-slate-700 px-1 py-0.5 hover:bg-slate-50 rounded">
                    <input type="checkbox" checked={selectedUserIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                    {u.name} <span className="text-slate-400">({u.email})</span>
                  </label>
                ))
              )}
            </div>
            {selectedUserIds.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">{selectedUserIds.length} selected</p>
            )}
          </div>
        )}

        {resultMessage && (
          <p className={`text-xs ${resultMessage.type === "success" ? "text-green-700" : "text-red-600"}`}>
            {resultMessage.text}
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sendMutation.isPending}
          className="px-4 py-2 rounded-md text-white text-sm font-medium bg-nav hover:bg-nav-deep disabled:opacity-50 transition-standard"
        >
          {sendMutation.isPending ? "Sending…" : "Send Email"}
        </button>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <h3 className="text-xs font-semibold text-slate-600 uppercase mb-2">Sent History</h3>
        {historyQuery.isLoading ? (
          <Spinner />
        ) : historyQuery.isError ? (
          <ErrorBanner message="Failed to load sent history" />
        ) : (historyQuery.data || []).length === 0 ? (
          <p className="text-xs text-slate-400">Nothing sent yet.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {historyQuery.data.map((b) => (
              <div key={b.id} className="border border-slate-200 rounded-md">
                <button
                  onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-standard"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{b.subject}</p>
                    <p className="text-[11px] text-slate-400">
                      {b.recipient_summary} · {b.sent_count}/{b.recipient_count} sent · by {b.sender?.name || "—"} ·{" "}
                      {new Date(b.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-slate-400 text-xs flex-shrink-0">{expandedId === b.id ? "▲" : "▼"}</span>
                </button>
                {expandedId === b.id && (
                  <div className="px-3 pb-3 text-xs text-slate-600 prose-sm" dangerouslySetInnerHTML={{ __html: b.body_html }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
