import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { analyticsApi } from "../api/endpoints.js";
import { NAV, ACCENT } from "../utils/constants.js";

/**
 * Checked once per portal open (fresh page load — React Router's
 * client-side navigation doesn't remount Layout, so this never re-fires
 * just from clicking around) for every non-admin identity, including a
 * "View Portal As" preview — see getRecognitionCelebration for the "most
 * recently closed week only, max 3 shows" rules, and `countTowardCap` for
 * why a preview still shows the real celebration without spending any of
 * the real person's 3 shows. Tracks the last user id checked (not just
 * "ever checked") so an Admin switching View Portal As between several
 * different winners gets a fresh check for each one, in the same session.
 */
export default function RecognitionCelebration({ user }) {
  const [celebration, setCelebration] = useState(null);
  const lastCheckedUserId = useRef(null);

  useEffect(() => {
    if (!user || user.role === "admin" || lastCheckedUserId.current === user.id) return;
    lastCheckedUserId.current = user.id;
    setCelebration(null);
    analyticsApi
      .recognitionCelebration()
      .then((data) => {
        if (!data) return;
        setCelebration(data);
        fireConfetti();
      })
      .catch(() => {});
  }, [user]);

  if (!celebration) return null;

  return (
    <div
      role="status"
      className="fixed top-4 right-4 z-[200] w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-amber-200 p-4"
    >
      <button
        onClick={() => setCelebration(null)}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 text-sm leading-none transition-standard"
      >
        ✕
      </button>
      <p className="text-sm font-display font-bold text-slate-900 mb-1">🎉 Congratulations!</p>
      <p className="text-sm text-slate-600 leading-relaxed pr-4">
        You made it to the Hall of Recognition for <strong>{celebration.week.label}</strong> —{" "}
        <span style={{ color: ACCENT }} className="font-medium">
          {formatAccolades(celebration.accolades)}
        </span>
        .
      </p>
      <Link
        to="/hall-of-recognition"
        onClick={() => setCelebration(null)}
        className="inline-block mt-2.5 text-xs font-medium hover:underline transition-standard"
        style={{ color: NAV }}
      >
        View Hall of Recognition →
      </Link>
    </div>
  );
}

function formatAccolades(accolades) {
  if (accolades.length === 1) return accolades[0];
  return `${accolades.slice(0, -1).join(", ")} & ${accolades[accolades.length - 1]}`;
}

function fireConfetti() {
  const end = Date.now() + 2000;
  const colors = [NAV, ACCENT, "#22C55E"];
  (function frame() {
    confetti({ particleCount: 3, angle: 60, spread: 65, startVelocity: 45, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 3, angle: 120, spread: 65, startVelocity: 45, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
