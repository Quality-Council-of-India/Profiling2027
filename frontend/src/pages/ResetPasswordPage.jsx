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
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(135deg,#1F3864 0%,#0D2B52 100%)" }}
    >
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4">
        <h1 className="text-lg font-bold text-gray-900 mb-4">Set a new password</h1>
        {!token && <p className="text-sm text-red-600">Missing reset token — use the link from your email.</p>}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          {message && <p className="text-xs text-green-700">{message}</p>}
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-50"
            style={{ background: NAV }}
          >
            Reset Password
          </button>
        </form>
      </div>
    </div>
  );
}
