import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../api/endpoints.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      const dest = location.state?.from || "/dashboard";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { message } = await authApi.requestReset(email);
      setForgotMessage(message);
    } catch (err) {
      setForgotMessage(err.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard";

  return (
    <div className="min-h-screen flex">
      {/* Brand panel — hidden on small screens, the story behind the form */}
      <div
        className="hidden lg:flex lg:w-[45%] relative flex-col justify-between p-12 overflow-hidden"
        style={{ background: "linear-gradient(155deg, #1F3864 0%, #12233F 100%)" }}
      >
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #E07B00 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 left-0 w-full h-64 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(#A5C9EB 1px, transparent 1px), linear-gradient(90deg, #A5C9EB 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-white/10 ring-1 ring-white/15 mb-8">
            <span className="text-white text-sm font-bold font-display">P27</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white leading-tight mb-3">
            Profiling 2027
            <br />
            Feedback Portal
          </h1>
          <p className="text-sm text-azure/80 max-w-sm leading-relaxed">
            The single home for weekly self and peer evaluations across the Profiling
            Project — scores, standings, and compliance, all in one place.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 lg:bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-nav mb-3">
              <span className="text-white text-sm font-bold font-display">P27</span>
            </div>
            <h1 className="font-display text-lg font-bold text-slate-900">Profiling 2027</h1>
            <p className="text-sm text-slate-500">Feedback Portal</p>
          </div>

          <h2 className="hidden lg:block font-display text-xl font-bold text-slate-900 mb-1">
            {forgotMode ? "Reset your password" : "Welcome back"}
          </h2>
          <p className="hidden lg:block text-sm text-slate-500 mb-6">
            {forgotMode ? "We'll email you a reset link." : "Sign in to continue to your dashboard."}
          </p>

          {!forgotMode ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5">Email</label>
                <div className="relative">
                  <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5">Password</label>
                <div className="relative">
                  <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
              </div>
              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-standard disabled:opacity-50 bg-nav hover:bg-nav-deep flex items-center justify-center gap-2"
              >
                {busy && <Spinner />}
                {busy ? "Signing in…" : "Sign In"}
              </button>
              <button
                type="button"
                onClick={() => setForgotMode(true)}
                className="w-full text-xs text-slate-500 hover:text-accent transition-standard"
              >
                Forgot password?
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleForgot}>
              <div>
                <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide mb-1.5">Email</label>
                <div className="relative">
                  <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>
              </div>
              {forgotMessage && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{forgotMessage}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-standard disabled:opacity-50 bg-nav hover:bg-nav-deep"
              >
                Send Reset Link
              </button>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setForgotMessage(""); }}
                className="w-full text-xs text-slate-500 hover:text-accent transition-standard"
              >
                ← Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function MailIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M3 5.5l7 5.5 7-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path d="M6.5 9V6.5a3.5 3.5 0 017 0V9" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
