import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { evaluationsApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner } from "../components/ui.jsx";
import { PARAM_FIELDS, STRENGTH_TAGS, WEAKNESS_TAGS, NAV, ACCENT } from "../utils/constants.js";

const DEFAULT_RATINGS = { sincerity: 4, team_spirit: 4, knowledge: 4, quantity: 3, quality: 4 };

export default function EvaluatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const pendingQuery = useQuery({ queryKey: ["pending"], queryFn: evaluationsApi.pending, retry: false });

  const [evalType, setEvalType] = useState("self");
  const [selectedPeerId, setSelectedPeerId] = useState(searchParams.get("peer") || "");
  const [showCompletedPeers, setShowCompletedPeers] = useState(false);
  const [ratings, setRatings] = useState(DEFAULT_RATINGS);
  const [problemSolving, setProblemSolving] = useState("satisfied");
  const [problemReason, setProblemReason] = useState("");
  const [selectedStrengths, setSelectedStrengths] = useState([]);
  const [selectedWeaknesses, setSelectedWeaknesses] = useState([]);
  const [strengthComment, setStrengthComment] = useState("");
  const [weaknessComment, setWeaknessComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (searchParams.get("peer")) setEvalType("peer");
  }, [searchParams]);

  const pending = pendingQuery.data?.pending;
  const week = pendingQuery.data?.week;
  const peerOptions = useMemo(() => pending?.peers || [], [pending]);
  const pendingPeerOptions = useMemo(() => peerOptions.filter((p) => !p.done), [peerOptions]);
  // Auto-detects who still needs evaluating — the dropdown only offers
  // not-yet-done peers by default, so there's no need to hunt through
  // already-submitted names. "Show completed" is an escape hatch for
  // deliberately revising a submission.
  const visiblePeerOptions = showCompletedPeers ? peerOptions : pendingPeerOptions;

  const toggleTag = (tag, list, setter) => {
    setter(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  };

  const submitMutation = useMutation({
    mutationFn: (payload) => evaluationsApi.submit(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["score"] });
      setSubmitted(true);
    },
  });

  function resetForm() {
    setSubmitted(false);
    setRatings(DEFAULT_RATINGS);
    setProblemSolving("satisfied");
    setProblemReason("");
    setSelectedStrengths([]);
    setSelectedWeaknesses([]);
    setStrengthComment("");
    setWeaknessComment("");
  }

  function handleSubmit() {
    if (!week) return;
    const evaluateeId = evalType === "self" ? user.id : Number(selectedPeerId);
    if (evalType === "peer" && !evaluateeId) return;

    submitMutation.mutate({
      week_id: week.id,
      evaluatee_id: evaluateeId,
      eval_type: evalType,
      ...ratings,
      problem_solving: problemSolving,
      problem_reason: problemSolving === "not_satisfied" ? problemReason : null,
      strengths_tags: selectedStrengths,
      weakness_tags: selectedWeaknesses,
      strength_comment: strengthComment || null,
      weakness_comment: weaknessComment || null,
    });
  }

  if (pendingQuery.isLoading) return <Spinner />;
  if (pendingQuery.isError) {
    return <ErrorBanner message="No week is currently open for submissions." />;
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Card className="p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Evaluation Submitted</h2>
          <p className="text-sm text-gray-500 mb-4">
            Your {evalType === "self" ? "self-evaluation" : "peer evaluation"} for {week.label} has been recorded. Scores have been recomputed.
          </p>
          <button onClick={resetForm} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: NAV }}>
            Submit Another
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Weekly Evaluation</h1>
        <p className="text-sm text-gray-500">
          {week.label} · {evalType === "self" ? "Self-Evaluation" : "Peer Evaluation"}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setEvalType("self")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${evalType === "self" ? "text-white" : "text-gray-600 bg-gray-100 hover:bg-gray-200"}`}
          style={evalType === "self" ? { background: NAV } : {}}
        >
          Self-Evaluation {pending.selfDone && "✓"}
        </button>
        <button
          onClick={() => setEvalType("peer")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${evalType === "peer" ? "text-white" : "text-gray-600 bg-gray-100 hover:bg-gray-200"}`}
          style={evalType === "peer" ? { background: NAV } : {}}
        >
          Peer Evaluation
        </button>
      </div>

      {evalType === "peer" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">Select Peer</label>
            {peerOptions.length > pendingPeerOptions.length && (
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCompletedPeers}
                  onChange={(e) => setShowCompletedPeers(e.target.checked)}
                  className="rounded"
                />
                Show already-evaluated peers
              </label>
            )}
          </div>
          {pendingPeerOptions.length === 0 && !showCompletedPeers ? (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              ✓ You've evaluated everyone mapped to you this week.
            </p>
          ) : (
            <select
              value={selectedPeerId}
              onChange={(e) => setSelectedPeerId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="">— Select a peer —</option>
              {visiblePeerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.done ? "(already submitted — resubmitting overwrites)" : ""}
                </option>
              ))}
            </select>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Part I — Quantitative Parameters</h2>
        <p className="text-xs text-gray-400 mb-4">Rate each parameter on a scale of 1 to 5 (5 = highest)</p>
        <div className="space-y-5">
          {PARAM_FIELDS.map((p) => (
            <div key={p.key}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm font-medium text-gray-800">{p.label}</span>
                <span className="text-lg font-bold" style={{ color: NAV }}>{ratings[p.key]}</span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{p.desc}</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    onClick={() => setRatings({ ...ratings, [p.key]: v })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${ratings[p.key] === v ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:border-gray-400"}`}
                    style={ratings[p.key] === v ? { background: NAV, borderColor: NAV } : {}}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Part II — Subjective Parameters</h2>

        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Problem Solving</p>
          <p className="text-xs text-gray-400 mb-2">
            How effectively do {evalType === "self" ? "you" : "they"} address and resolve doubts or challenges?
          </p>
          <div className="flex gap-2">
            {["satisfied", "not_satisfied"].map((v) => (
              <button
                key={v}
                onClick={() => setProblemSolving(v)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${problemSolving === v ? "text-white border-transparent" : "text-gray-600 border-gray-200"}`}
                style={problemSolving === v ? { background: v === "satisfied" ? "#059669" : "#DC2626", borderColor: v === "satisfied" ? "#059669" : "#DC2626" } : {}}
              >
                {v === "satisfied" ? "✓ Satisfied" : "✗ Not Satisfied"}
              </button>
            ))}
          </div>
          {problemSolving === "not_satisfied" && (
            <textarea
              rows={2}
              value={problemReason}
              onChange={(e) => setProblemReason(e.target.value)}
              placeholder="Provide the reason with a relevant example..."
              className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          )}
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Strengths <span className="text-xs text-gray-400">(select all that apply)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STRENGTH_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag, selectedStrengths, setSelectedStrengths)}
                className={`px-2.5 py-1.5 rounded-md text-xs transition-all border ${selectedStrengths.includes(tag) ? "bg-green-50 border-green-400 text-green-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
              >
                {selectedStrengths.includes(tag) ? "✓ " : ""}{tag}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Areas of Improvement <span className="text-xs text-gray-400">(select all that apply)</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEAKNESS_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag, selectedWeaknesses, setSelectedWeaknesses)}
                className={`px-2.5 py-1.5 rounded-md text-xs transition-all border ${selectedWeaknesses.includes(tag) ? "bg-red-50 border-red-300 text-red-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
              >
                {selectedWeaknesses.includes(tag) ? "✓ " : ""}{tag}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-gray-700 mb-2">Additional Strength Remarks</p>
          <textarea
            rows={2}
            value={strengthComment}
            onChange={(e) => setStrengthComment(e.target.value)}
            placeholder="Share any additional observations highlighting key strengths..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>
        <div className="mt-3">
          <p className="text-sm font-medium text-gray-700 mb-2">Additional Improvement Remarks</p>
          <textarea
            rows={2}
            value={weaknessComment}
            onChange={(e) => setWeaknessComment(e.target.value)}
            placeholder="Share any observations indicating areas of growth..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        </div>
      </Card>

      {submitMutation.isError && (
        <ErrorBanner message={submitMutation.error?.response?.data?.error || "Submission failed"} />
      )}

      <button
        onClick={handleSubmit}
        disabled={submitMutation.isPending || (evalType === "peer" && !selectedPeerId)}
        className="px-6 py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50"
        style={{ background: ACCENT }}
      >
        {submitMutation.isPending ? "Submitting…" : "Submit Evaluation"}
      </button>
    </div>
  );
}
