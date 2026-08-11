import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketsApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState, Badge, RefreshButton } from "../components/ui.jsx";
import { TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS, TICKET_STATUS_COLORS } from "../utils/constants.js";

const CATEGORIES = Object.entries(TICKET_CATEGORY_LABELS);

export default function RaiseConcernPage() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(CATEGORIES[0][0]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState("");

  const ticketsQuery = useQuery({ queryKey: ["myTickets"], queryFn: ticketsApi.mine });

  const createMutation = useMutation({
    mutationFn: ticketsApi.create,
    onSuccess: () => {
      setSubject("");
      setDescription("");
      setSubmitError("");
      queryClient.invalidateQueries({ queryKey: ["myTickets"] });
    },
    onError: (err) => setSubmitError(err.response?.data?.error || "Failed to submit — please try again"),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setSubmitError("Both subject and description are required");
      return;
    }
    createMutation.mutate({ category, subject: subject.trim(), description: description.trim() });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900">Raise Your Concern</h1>
        <RefreshButton
          onClick={() => queryClient.invalidateQueries({ queryKey: ["myTickets"] })}
          isFetching={ticketsQuery.isFetching}
          label="Refresh"
        />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">New Concern</h2>
        <p className="text-xs text-slate-500 mb-4">
          Password/email changes, portal bugs, functionality not working — anything at all. Admin gets notified
          immediately and will respond here.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
            >
              {CATEGORIES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="Brief summary of the issue"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Give as much detail as you can"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard resize-none"
            />
          </div>
          {submitError && <ErrorBanner message={submitError} />}
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-nav hover:bg-nav-deep disabled:opacity-50 transition-standard"
          >
            {createMutation.isPending ? "Submitting…" : "Submit Concern"}
          </button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Your Concerns</h2>
        {ticketsQuery.isLoading ? (
          <Spinner />
        ) : ticketsQuery.isError ? (
          <ErrorBanner message="Failed to load your concerns" />
        ) : ticketsQuery.data.length === 0 ? (
          <EmptyState icon="🎫" title="No concerns raised yet" message="Anything you submit above will show up here with Admin's response." />
        ) : (
          <div className="space-y-3">
            {ticketsQuery.data.map((t) => (
              <div key={t.id} className="border border-slate-200 rounded-lg p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t.subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {TICKET_CATEGORY_LABELS[t.category]} · {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge text={TICKET_STATUS_LABELS[t.status]} color={TICKET_STATUS_COLORS[t.status]} />
                </div>
                <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{t.description}</p>
                {t.admin_response && (
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-600">Admin's response:</p>
                    <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{t.admin_response}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
