import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { dataQualityApi, weeksApi } from "../api/endpoints.js";
import { Card, Spinner, ErrorBanner, EmptyState, Badge, RefreshButton } from "../components/ui.jsx";
import { ROLE_LABELS, ROLE_COLORS, PARAM_FIELDS, TRAJECTORY_LABELS } from "../utils/constants.js";
import { FlagIcon } from "../components/icons.jsx";

const SIGNAL_LABELS = {
  floorFlat: "Floor-flat scores",
  contradictoryPair: "Contradictory tags",
  mismatch: "Extreme score + opposite trajectory",
  junkSuggestion: "Non-substantive suggestion",
};

export default function DataQualityPage() {
  const queryClient = useQueryClient();
  const [weekId, setWeekId] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const weeksQuery = useQuery({ queryKey: ["weeks"], queryFn: weeksApi.list });
  const flagsQuery = useQuery({
    queryKey: ["dataQualityFlags", weekId],
    queryFn: () => dataQualityApi.flags(weekId || undefined),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <FlagIcon className="text-accent" width="22" height="22" />
            Data Quality
          </h1>
          <p className="text-sm text-slate-500">
            Peer evaluation submissions with internal signs of being low-effort or self-contradictory — a review
            list, not proof of anything wrong. Nothing here is auto-corrected or excluded from scoring.
          </p>
        </div>
        <RefreshButton
          onClick={() => queryClient.invalidateQueries({ queryKey: ["dataQualityFlags"] })}
          isFetching={flagsQuery.isFetching}
          label="Refresh Data Quality"
        />
      </div>

      <CalcGuide />

      <div className="flex items-center gap-2">
        <label htmlFor="dq-week-filter" className="text-xs font-medium text-slate-600">
          Week:
        </label>
        <select
          id="dq-week-filter"
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
        >
          <option value="">All weeks</option>
          {(weeksQuery.data || [])
            .filter((w) => w.status !== "upcoming")
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
        </select>
      </div>

      <Card className="p-5">
        {flagsQuery.isLoading ? (
          <Spinner />
        ) : flagsQuery.isError ? (
          <ErrorBanner message="Failed to load Data Quality flags" />
        ) : flagsQuery.data.flagged.length === 0 ? (
          <EmptyState
            icon="✓"
            title="Nothing flagged"
            message={`Checked ${flagsQuery.data.totalSubmissionsChecked} peer evaluation${
              flagsQuery.data.totalSubmissionsChecked === 1 ? "" : "s"
            } — none tripped a data-quality signal.`}
          />
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">
              {flagsQuery.data.flagged.length} of {flagsQuery.data.totalSubmissionsChecked} peer evaluations flagged —
              sorted by how many signals fired, most recent first within each.
            </p>
            <div className="space-y-3">
              {flagsQuery.data.flagged.map((f) => (
                <FlagRow key={f.id} f={f} expanded={expandedId === f.id} onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)} />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function PersonBadge({ user }) {
  if (!user) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium text-slate-800">{user.name}</span>
      <Badge text={ROLE_LABELS[user.role] || user.role} color={ROLE_COLORS[user.role] || "#6B7280"} />
      {user.field && <span className="text-[11px] text-slate-400">{user.field}</span>}
    </span>
  );
}

function FlagRow({ f, expanded, onToggle }) {
  const activeSignals = Object.entries(f.signals).filter(([, v]) => v);
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap text-sm">
            <PersonBadge user={f.evaluator} />
            <span className="text-slate-400">→</span>
            <PersonBadge user={f.evaluatee} />
          </div>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {f.week?.label} · Total {f.total}/49 · {TRAJECTORY_LABELS[f.trajectory] || f.trajectory}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {activeSignals.map(([key]) => (
            <span
              key={key}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                key === "junkSuggestion" ? "bg-slate-100 text-slate-500" : "bg-red-50 text-red-700 border border-red-100"
              }`}
            >
              {SIGNAL_LABELS[key]}
              {key === "contradictoryPair" && f.signals.contradictoryPair
                ? `: "${f.signals.contradictoryPair[0]}" vs "${f.signals.contradictoryPair[1]}"`
                : ""}
            </span>
          ))}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
            {PARAM_FIELDS.map((p) => (
              <div key={p.key} className="flex justify-between gap-2">
                <span className="text-slate-400">{p.label}</span>
                <span
                  className={`font-medium tabular-nums ${f.scores[p.key] <= 2 ? "text-red-600" : "text-slate-700"}`}
                >
                  {f.scores[p.key]}
                </span>
              </div>
            ))}
          </div>
          <div>
            <span className="text-slate-400">Strengths: </span>
            {f.strengths_tags.length ? f.strengths_tags.join(", ") : <span className="text-slate-300">none</span>}
          </div>
          <div>
            <span className="text-slate-400">Areas of improvement: </span>
            {f.weakness_tags.length ? f.weakness_tags.join(", ") : <span className="text-slate-300">none</span>}
          </div>
          <div>
            <span className="text-slate-400">Improvement suggestion: </span>
            <span className="italic">"{f.improvement_suggestion || "—"}"</span>
          </div>
          <div className="text-slate-400">Submitted {new Date(f.submitted_at).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}

function CalcGuide() {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button onClick={() => setShow((v) => !v)} className="text-xs font-medium text-nav hover:text-accent transition-standard">
        {show ? "Hide guide" : "How is this calculated?"}
      </button>
      {show && (
        <div className="mt-2 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
          <p>
            A peer evaluation is flagged when at least one of 3 "strong" signals fires: all 7 quantitative
            parameters given the same value AND that value is 1 or 2 (a perfectly flat score at the bottom of the
            scale); a strength tag and a weakness tag selected together that describe the exact same underlying
            thing from opposite directions (e.g. "Manages work efficiently and consistently meets deadlines" and
            "Needs to improve time management and meet deadlines" in the same submission); or an extreme total
            score (≤10 or ≥46 out of 49) paired with a trajectory claim in the opposite direction ("Improved" at
            the floor, or "Declined" at the ceiling).
          </p>
          <p>
            A non-substantive improvement suggestion ("Kk", "Nothing", "-") never triggers a flag on its own — it's
            far too common on its own (roughly 46% of all real submissions) to mean anything by itself, since
            plenty of people genuinely have nothing critical to add. It's only shown as corroborating context once
            one of the 3 strong signals above has already fired.
          </p>
          <p>
            This is a review list, calibrated against this project's real Week 1-5 data to flag about 6.7% of real
            submissions — broad enough to catch genuine cases without being unreviewable. Nothing here is
            auto-corrected, hidden, or excluded from anyone's score.
          </p>
        </div>
      )}
    </div>
  );
}
