import { useEffect, useState, useCallback } from "react";
import { getNavItems } from "../utils/navItems.js";

const PAD = 6; // spotlight breathing room around the target element

function buildSteps(user) {
  const navSteps = getNavItems(user)
    .filter((n) => n.show)
    .map((n) => ({ selector: `[data-tour="nav-${n.to}"]`, title: n.label, body: n.tourText }));

  return [
    {
      selector: '[data-tour="logo"]',
      title: "Welcome to the Feedback Portal",
      body: "This is a quick tour of where everything lives — it takes about a minute, and you can reopen it anytime from the Help icon.",
    },
    ...navSteps,
    {
      selector: '[data-tour="notifications"]',
      title: "Notifications",
      body: "Week openings/closings and updates on any concern you've raised show up here, with a badge for anything unread.",
    },
    {
      selector: '[data-tour="help"]',
      title: "Help, anytime",
      body: "Click this whenever you want to replay this tour.",
    },
    {
      selector: '[data-tour="profile"]',
      title: "Your profile",
      body: "Your name, role, and field live here — click it to see your full profile details.",
    },
  ];
}

function storageKey(userId) {
  return `profiling2027_onboarding_seen_${userId}`;
}

export function hasSeenOnboarding(userId) {
  try {
    return localStorage.getItem(storageKey(userId)) === "true";
  } catch {
    return true; // localStorage unavailable — don't force a tour that can't be dismissed persistently
  }
}

function markOnboardingSeen(userId) {
  try {
    localStorage.setItem(storageKey(userId), "true");
  } catch {
    /* best-effort only */
  }
}

export default function OnboardingTour({ user, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const steps = buildSteps(user);
  const step = steps[stepIndex];

  const measure = useCallback(() => {
    const el = step && document.querySelector(step.selector);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  function finish() {
    markOnboardingSeen(user.id);
    onClose();
  }

  function next() {
    if (stepIndex >= steps.length - 1) finish();
    else setStepIndex((i) => i + 1);
  }

  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  // Tooltip placement: prefer to the right of the sidebar targets (which sit
  // in a fixed-width left rail), below the top-bar targets otherwise —
  // clamped so it never runs off the bottom of the viewport.
  const tooltipStyle = (() => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const isSidebarTarget = rect.left < 260;
    const width = 300;
    if (isSidebarTarget) {
      const top = Math.min(Math.max(rect.top, 16), window.innerHeight - 220);
      return { top, left: rect.right + 16, width };
    }
    const top = rect.bottom + 12;
    const left = Math.min(Math.max(rect.left - width + rect.width, 16), window.innerWidth - width - 16);
    return { top, left, width };
  })();

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Spotlight: a box matching the target's rect, darkening everything
          else via an oversized box-shadow rather than a clip-path mask. */}
      {rect ? (
        <div
          className="fixed rounded-lg transition-all duration-200 pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
            outline: "2px solid #E07B00",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/65" />
      )}

      <div
        className="fixed bg-white rounded-xl shadow-2xl p-5"
        style={{ ...tooltipStyle, position: "fixed" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent mb-1.5">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="font-display text-base font-bold text-slate-900 mb-1.5">{step.title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button onClick={finish} className="text-xs text-slate-400 hover:text-slate-600 transition-standard">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                onClick={back}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-standard"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="px-3 py-1.5 rounded-lg bg-nav hover:bg-nav-deep text-white text-xs font-medium transition-standard"
            >
              {stepIndex >= steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
