import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { authApi } from "../api/endpoints.js";
import { NAV } from "../utils/constants.js";

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

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg,#1F3864 0%,#0D2B52 100%)" }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ background: NAV }}>
            <span className="text-white text-xl font-bold">QCI</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Profiling 2027</h1>
          <p className="text-sm text-gray-500 mt-1">Feedback Portal</p>
        </div>

        {!forgotMode ? (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@qci.example"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50"
              style={{ background: NAV }}
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
            <button
              type="button"
              onClick={() => setForgotMode(true)}
              className="w-full text-xs text-gray-500 hover:text-gray-700 hover:underline mt-1"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={handleForgot}>
            <p className="text-sm text-gray-600">Enter your email and we'll send a reset link.</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@qci.example"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {forgotMessage && <p className="text-xs text-gray-600">{forgotMessage}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50"
              style={{ background: NAV }}
            >
              Send Reset Link
            </button>
            <button
              type="button"
              onClick={() => { setForgotMode(false); setForgotMessage(""); }}
              className="w-full text-xs text-gray-500 hover:underline mt-1"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
