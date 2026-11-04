import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import confetti from "canvas-confetti";
import { analyticsApi } from "../api/endpoints.js";
import { NAV, ACCENT } from "../utils/constants.js";

/**
 * Checked once per app visit for every non-admin role (Admin never scores,
 * so never has a win to celebrate) — see analyticsCardSettings' sibling
 * endpoint getRecognitionCelebration for the "most recently closed week
 * only, max 3 shows" rules. Layout.jsx renders this only while
 * `!impersonating`, so an Admin's "View Portal As" preview never triggers
 * it — that's a second line of defense; the backend also refuses while
 * impersonated regardless of what the frontend sends.
 */
export default function RecognitionCelebration({ user }) {
  const [celebration, setCelebration] = useState(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || !user || user.role === "admin") return;
    checkedRef.current = true;
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
