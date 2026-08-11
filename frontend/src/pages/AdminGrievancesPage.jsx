import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState, Badge, RefreshButton } from "../components/ui.jsx";
import { ROLE_LABELS, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from "../utils/constants.js";

const STATUS_FILTERS = [
  { key: undefined, label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

export default function AdminGrievancesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState(undefined);

  const ticketsQuery = useQuery({
    queryKey: ["allTickets", statusFilter],
    queryFn: () => ticketsApi.listAll(statusFilter),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">Grievances</h1>
        <RefreshButton
          onClick={() => queryClient.invalidateQueries({ queryKey: ["allTickets"] })}
          isFetching={ticketsQuery.isFetching}
          label="Refresh"
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-standard ${
                statusFilter === f.key
                  ? "bg-nav text-white border-nav"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        {ticketsQuery.isLoading ? (
          <Spinner />
        ) : ticketsQuery.isError ? (
          <ErrorBanner message="Failed to load concerns" />
        ) : ticketsQuery.data.length === 0 ? (
          <EmptyState icon="🎫" title="No concerns here" message="Nothing matches this filter yet." />
        ) : (
          <div className="space-y-3">
            {ticketsQuery.data.map((t) => <TicketRow key={t.id} ticket={t} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function TicketRow({ ticket }) {
  const queryClient = useQueryClient();
  const [responding, setResponding] = useState(false);
  const [draftResponse, setDraftResponse] = useState(ticket.admin_response || "");
  const [draftStatus, setDraftStatus] = useState(ticket.status);

  const respondMutation = useMutation({
    mutationFn: (payload) => ticketsApi.respond(ticket.id, payload),
    onSuccess: () => {
      setResponding(false);
      queryClient.invalidateQueries({ queryKey: ["allTickets"] });
    },
  });

  return (
    <div className="border border-slate-200 rounded-lg p-3.5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-slate-800">{ticket.subject}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {ticket.user.name} · {ROLE_LABELS[ticket.user.role]}
            {ticket.user.field ? ` · ${ticket.user.field}` : ""} · {TICKET_CATEGORY_LABELS[ticket.category]} ·{" "}
            {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <Badge text={TICKET_STATUS_LABELS[ticket.status]} color={TICKET_STATUS_COLORS[ticket.status]} />
      </div>
      <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{ticket.description}</p>

      {ticket.admin_response && !responding && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-600">Your response:</p>
          <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{ticket.admin_response}</p>
        </div>
      )}

      {responding ? (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
          <select
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value)}
            className="px-2 py-1.5 border border-slate-300 rounded-md text-xs"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <textarea
            value={draftResponse}
            onChange={(e) => setDraftResponse(e.target.value)}
            rows={3}
            placeholder="Response to the user (they'll see this, and get an email if you mark it Resolved)"
            className="w-full px-2 py-1.5 border border-slate-300 rounded-md text-xs resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => respondMutation.mutate({ status: draftStatus, admin_response: draftResponse })}
              disabled={respondMutation.isPending}
              className="px-3 py-1.5 rounded-md text-white text-xs font-medium bg-nav hover:bg-nav-deep disabled:opacity-50 transition-standard"
            >
              {respondMutation.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setResponding(false)}
              className="px-3 py-1.5 rounded-md border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 transition-standard"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setResponding(true)}
          className="mt-3 px-2.5 py-1 rounded-md border border-slate-300 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-standard"
        >
          {ticket.admin_response ? "Update Response" : "Respond"}
        </button>
      )}
    </div>
  );
}
