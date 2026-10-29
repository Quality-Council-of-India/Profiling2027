import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext.jsx";
import { Card, RefreshButton } from "../components/ui.jsx";
import HallOfRecognition from "../components/HallOfRecognition.jsx";
import { TrophyIcon } from "../components/icons.jsx";
import { AGGREGATE_ROLES } from "../utils/constants.js";

export default function HallOfRecognitionPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Same visibility rule as RankingCard's percentile guide: the mechanics
  // of how Overall Star Performer is computed are for people who can see
  // cross-role standings (Project Lead / CASU Lead / Admin), not for a
  // Profiler/Group Anchor/CASU Anchor looking at their own recognition.
  const canSeeGuide = AGGREGATE_ROLES.includes(user.role);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <TrophyIcon className="text-accent" width="22" height="22" />
            Hall of Recognition
          </h1>
          <p className="text-sm text-slate-500">
            Top Total Peer Score by role each closed week, irrespective of field, plus a role-normalized Overall
            Star Performer — a trailing 3-week window — from the 2nd closed week onward.
          </p>
        </div>
        <RefreshButton
          onClick={() => queryClient.invalidateQueries({ queryKey: ["hallOfRecognition"] })}
          label="Refresh Hall of Recognition"
        />
      </div>

      {canSeeGuide && (
      <div>
        <button onClick={() => setShowGuide((v) => !v)} className="text-xs font-medium text-nav hover:text-accent transition-standard">
          {showGuide ? "Hide guide" : "How is Overall Star Performer calculated?"}
        </button>
        {showGuide && (
          <div className="mt-2 text-xs text-slate-600 bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1.5">
            <p>
              Top Profiler / Top Group Anchor / Top CASU Anchor are unchanged — the single highest raw Total Peer
              Score within that role, for that one week.
            </p>
            <p>
              Overall Star Performer is different: each week, a person's raw score is first converted into a
              <strong> percentile within their own role</strong> (e.g. "top 10% of Profilers this week"), then
              averaged over a <strong>trailing 3-closed-week window</strong> — this week and the 2 before it (or
              fewer, right at the start of the cycle). Converting to a percentile-within-role is what makes it
              comparable across roles that are evaluated by structurally different, more-or-less generous groups of
              peers (see peerMapping.js — CASU Anchors are evaluated only by their own subordinates, everyone else
              by a broader mix), instead of raw scores where that gap alone could decide the winner.
            </p>
            <p>
              This used to average across every closed week since the start of the cycle, which made the title
              effectively permanent once someone built a strong enough lead — checked against real multi-week data
              before switching: the all-time version never changed winner across 9 real weeks, while this 3-week
              window changed it twice in that same span. A recent standout week can now actually show up here,
              instead of being invisible against months of history.
            </p>
            <p>
              A role with fewer than 5 people in a given week (CASU Lead and Project Lead, currently 2 each) is
              compared against the whole team that week instead of its own tiny group, since a percentile from 2
              people can only ever be exactly 0 or 100. You also need at least 2 scored weeks within the window to
              be eligible, so one lucky or unlucky week in isolation can't crown (or rule out) someone.
            </p>
            <p>
              This doesn't cap any role's ceiling — being #1 in your own role for all 3 weeks in the window still
              averages to a perfect 100, for any role. A role with only 9 people does see bigger percentile swings
              from one off-week than a role with 49 people does (losing 1st place costs far more percentile points
              in a small group) — but with only a 3-week memory now, one off-week stops mattering again within a
              few weeks, instead of needing to be out-averaged forever.
            </p>
          </div>
        )}
      </div>
      )}

      <Card className="p-5">
        <HallOfRecognition />
      </Card>
    </div>
  );
}
