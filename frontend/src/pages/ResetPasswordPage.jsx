import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../api/endpoints.js";
import { NAV } from "../utils/constants.js";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await authApi.confirmReset(token, newPassword);
      setMessage(res.message);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(155deg, #1F3864 0%, #12233F 100%)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-nav mb-5">
          <span className="text-white text-sm font-bold font-display">P27</span>
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Set a new password</h1>
        <p className="text-sm text-slate-500 mb-5">Choose a password with at least 8 characters.</p>
        {!token && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
            Missing reset token — use the link from your email.
          </p>
        )}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-standard"
          />
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          {message && <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{message}</p>}
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50 transition-standard hover:bg-nav-deep"
            style={{ background: NAV }}
          >
            {busy ? "Resetting…" : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
