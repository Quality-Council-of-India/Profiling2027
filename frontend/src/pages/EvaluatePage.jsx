import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { evaluationsApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, RefreshButton } from "../components/ui.jsx";
import {
  PARAM_FIELDS,
  STRENGTH_TAGS,
  WEAKNESS_TAGS,
  RATING_SCALE,
  TRAJECTORY_OPTIONS,
  MAX_TAGS_PER_CATEGORY,
  NAV,
  ACCENT,
} from "../utils/constants.js";

const DEFAULT_RATINGS = Object.fromEntries(PARAM_FIELDS.map((p) => [p.key, 4]));

export default function EvaluatePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const pendingQuery = useQuery({ queryKey: ["pending"], queryFn: evaluationsApi.pending, retry: false });

  const [evalType, setEvalType] = useState("self");
  const [selectedPeerId, setSelectedPeerId] = useState(searchParams.get("peer") || "");
  const [showCompletedPeers, setShowCompletedPeers] = useState(false);
  const [ratings, setRatings] = useState(DEFAULT_RATINGS);
  const [selectedStrengths, setSelectedStrengths] = useState([]);
  const [selectedWeaknesses, setSelectedWeaknesses] = useState([]);
  const [improvementSuggestion, setImprovementSuggestion] = useState("");
  const [trajectory, setTrajectory] = useState("");
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
  // reviewing a submission (editable only if an Admin has unlocked it).
  const visiblePeerOptions = showCompletedPeers ? peerOptions : pendingPeerOptions;
  const selectedPeer = useMemo(
    () => peerOptions.find((p) => String(p.id) === String(selectedPeerId)),
    [peerOptions, selectedPeerId]
  );
  const isLocked = evalType === "self" ? !!pending?.selfLocked : !!selectedPeer?.locked;
  // The Trajectory question needs a prior week to compare against — Week 1
  // submissions skip it entirely and send "not_applicable" automatically.
  const needsTrajectory = !!week && week.week_number >= 2;

  const toggleTag = (tag, list, setter) => {
    if (list.includes(tag)) {
      setter(list.filter((t) => t !== tag));
    } else if (list.length < MAX_TAGS_PER_CATEGORY) {
      setter([...list, tag]);
    }
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
    setSelectedStrengths([]);
    setSelectedWeaknesses([]);
    setImprovementSuggestion("");
    setTrajectory("");
  }

  // Every question on this form is mandatory — the 7 ratings always carry a
  // default value so they can never be truly blank, but these subjective
  // questions can, so submission is blocked with a pop-up naming exactly
  // what's still missing rather than letting a partial answer through.
  function getMissingFields() {
    const missing = [];
    if (selectedStrengths.length === 0) missing.push("At least one Strength tag");
    if (selectedWeaknesses.length === 0) missing.push("At least one Area of Improvement tag");
    if (!improvementSuggestion.trim()) missing.push("The improvement suggestion");
    if (needsTrajectory && !trajectory) missing.push("The trajectory question (compared to last week)");
    return missing;
  }

  function handleSubmit() {
    if (!week) return;
    const evaluateeId = evalType === "self" ? user.id : Number(selectedPeerId);
    if (evalType === "peer" && !evaluateeId) return;

    const missing = getMissingFields();
    if (missing.length > 0) {
      window.alert(`Please complete the following before submitting:\n\n${missing.map((m) => `• ${m}`).join("\n")}`);
      return;
    }

    submitMutation.mutate({
      week_id: week.id,
      evaluatee_id: evaluateeId,
      eval_type: evalType,
      ...ratings,
      strengths_tags: selectedStrengths,
      weakness_tags: selectedWeaknesses,
      improvement_suggestion: improvementSuggestion || null,
      trajectory: needsTrajectory ? trajectory : "not_applicable",
    });
  }

  if (pendingQuery.isLoading) return <Spinner />;
  if (pendingQuery.isError) {
    return <ErrorBanner message="No week is currently open for submissions." />;
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Card className="p-8 text-center max-w-md animate-[fadeIn_0.2s_ease]">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5l4 4L16 6" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Evaluation Submitted</h2>
          <p className="text-sm text-slate-500 mb-5">
            Your {evalType === "self" ? "self-evaluation" : "peer evaluation"} for {week.label} has been recorded. Scores have been recomputed.
          </p>
          <button
            onClick={resetForm}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-standard hover:shadow-md"
            style={{ background: NAV }}
          >
            Submit Another
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Weekly Evaluation</h1>
          <p className="text-sm text-slate-500">
            {week.label} · {evalType === "self" ? "Self-Evaluation" : "Peer Evaluation"}
          </p>
        </div>
        <RefreshButton
          onClick={() => queryClient.invalidateQueries({ queryKey: ["pending"] })}
          isFetching={pendingQuery.isFetching}
          label="Refresh pending evaluations"
        />
      </div>

      <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-1">
        <button
          onClick={() => setEvalType("self")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-standard ${
            evalType === "self" ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
          style={evalType === "self" ? { background: NAV } : {}}
        >
          Self-Evaluation {pending.selfLocked ? "🔒" : pending.selfDone ? "✓" : ""}
        </button>
        <button
          onClick={() => setEvalType("peer")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-standard ${
            evalType === "peer" ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
          style={evalType === "peer" ? { background: NAV } : {}}
        >
          Peer Evaluation
        </button>
      </div>

      {evalType === "peer" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">Select Peer</label>
            {peerOptions.length > pendingPeerOptions.length && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
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
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
            >
              <option value="">— Select a peer —</option>
              {visiblePeerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.locked ? "(submitted — locked)" : p.done ? "(unlocked for correction)" : ""}
                </option>
              ))}
            </select>
          )}
        </Card>
      )}

      {isLocked ? (
        <Card className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-2xl">
            🔒
          </div>
          <h2 className="text-sm font-semibold text-slate-800 mb-1">
            {evalType === "self" ? "Your self-evaluation" : `Your evaluation for ${selectedPeer?.name}`} is locked
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            It's already been submitted for {week.label}. Ask an Admin to unlock it from the Raw Data Browser if you need to make a correction.
          </p>
        </Card>
      ) : (
        <>
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Part I — Quantitative Parameters</h2>
        <p className="text-xs text-slate-400 mb-4">Rate each parameter on a scale of 1 to 7. Use the anchor labels to guide your rating.</p>
        <div className="space-y-5">
          {PARAM_FIELDS.map((p) => (
            <div key={p.key}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm font-medium text-slate-800">{p.label}</span>
                <span className="text-lg font-bold" style={{ color: NAV }}>{ratings[p.key]}</span>
              </div>
              <p className="text-xs text-slate-400 mb-2">{p.desc}</p>
              <div className="grid grid-cols-7 gap-1">
                {RATING_SCALE.map(({ value: v, label }) => (
                  <button
                    key={v}
                    onClick={() => setRatings({ ...ratings, [p.key]: v })}
                    className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-sm font-medium border-2 transition-standard ${
                      ratings[p.key] === v
                        ? "text-white border-transparent shadow-sm scale-105"
                        : "text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                    style={ratings[p.key] === v ? { background: NAV, borderColor: NAV } : {}}
                  >
                    <span>{v}</span>
                    <span className={`text-[9px] leading-tight ${ratings[p.key] === v ? "text-white/80" : "text-slate-400"}`}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Part II — Subjective Parameters</h2>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">
            Strengths{" "}
            <span className="text-xs text-slate-400">
              (select 1-{MAX_TAGS_PER_CATEGORY}) · {selectedStrengths.length}/{MAX_TAGS_PER_CATEGORY} selected
            </span>
          </p>
          <p className="text-xs text-slate-400 mb-2">Choose the most distinguishing strengths. Required — select at least one.</p>
          <div className="flex flex-wrap gap-1.5">
            {STRENGTH_TAGS.map((tag) => {
              const selected = selectedStrengths.includes(tag);
              const disabled = !selected && selectedStrengths.length >= MAX_TAGS_PER_CATEGORY;
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag, selectedStrengths, setSelectedStrengths)}
                  disabled={disabled}
                  className={`px-2.5 py-1.5 rounded-md text-xs transition-standard border ${
                    selected
                      ? "bg-green-50 border-green-400 text-green-700 font-medium"
                      : disabled
                      ? "border-slate-100 text-slate-300 cursor-not-allowed"
                      : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {selected ? "✓ " : ""}{tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700 mb-2">
            Areas of Improvement{" "}
            <span className="text-xs text-slate-400">
              (select 1-{MAX_TAGS_PER_CATEGORY}) · {selectedWeaknesses.length}/{MAX_TAGS_PER_CATEGORY} selected
            </span>
          </p>
          <p className="text-xs text-slate-400 mb-2">Choose the most pressing improvement areas. Required — select at least one.</p>
          <div className="flex flex-wrap gap-1.5">
            {WEAKNESS_TAGS.map((tag) => {
              const selected = selectedWeaknesses.includes(tag);
              const disabled = !selected && selectedWeaknesses.length >= MAX_TAGS_PER_CATEGORY;
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag, selectedWeaknesses, setSelectedWeaknesses)}
                  disabled={disabled}
                  className={`px-2.5 py-1.5 rounded-md text-xs transition-standard border ${
                    selected
                      ? "bg-red-50 border-red-300 text-red-700 font-medium"
                      : disabled
                      ? "border-slate-100 text-slate-300 cursor-not-allowed"
                      : "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {selected ? "✓ " : ""}{tag}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-slate-700 mb-2">
            What is the single most impactful action {evalType === "self" ? "you" : "this person"} could take to improve?
          </p>
          <p className="text-xs text-slate-400 mb-2">Required. One concrete, specific suggestion.</p>
          <textarea
            rows={2}
            value={improvementSuggestion}
            onChange={(e) => setImprovementSuggestion(e.target.value)}
            placeholder="Share one concrete, specific suggestion..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard resize-none"
          />
        </div>

        {needsTrajectory && (
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-700 mb-2">
              Compared to last week, has {evalType === "self" ? "your" : "this person's"} overall performance:
            </p>
            <div className="flex flex-wrap gap-2">
              {TRAJECTORY_OPTIONS.map(({ value: v, label }) => (
                <button
                  key={v}
                  onClick={() => setTrajectory(v)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-standard ${
                    trajectory === v
                      ? "text-white border-transparent shadow-sm"
                      : "text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                  style={trajectory === v ? { background: NAV, borderColor: NAV } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {submitMutation.isError && (
        <ErrorBanner message={submitMutation.error?.response?.data?.error || "Submission failed"} />
      )}

      <button
        onClick={handleSubmit}
        disabled={submitMutation.isPending || (evalType === "peer" && !selectedPeerId)}
        className="px-6 py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50 transition-standard hover:shadow-md flex items-center gap-2"
        style={{ background: ACCENT }}
      >
        {submitMutation.isPending && (
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {submitMutation.isPending ? "Submitting…" : "Submit Evaluation"}
      </button>
        </>
      )}
    </div>
  );
}
