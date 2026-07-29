import { createContext, useContext, useEffect, useState } from "react";
import { authApi, usersApi, adminApi } from "../api/endpoints.js";
import { TOKEN_KEY, ADMIN_TOKEN_KEY } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(!!localStorage.getItem(ADMIN_TOKEN_KEY));

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    usersApi
      .me()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user: loggedInUser } = await authApi.login(email, password);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setImpersonating(false);
    setUser(loggedInUser);
    return loggedInUser;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setImpersonating(false);
    setUser(null);
  }

  /** Admin "view portal as <role>" — swaps the active token, stashing the Admin's own for return. */
  async function impersonateRole(role) {
    const { token, user: targetUser } = await adminApi.impersonateRole(role);
    if (!impersonating) {
      const currentToken = localStorage.getItem(TOKEN_KEY);
      if (currentToken) localStorage.setItem(ADMIN_TOKEN_KEY, currentToken);
    }
    localStorage.setItem(TOKEN_KEY, token);
    setImpersonating(true);
    setUser(targetUser);
    return targetUser;
  }

  async function returnToAdmin() {
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!adminToken) return null;
    localStorage.setItem(TOKEN_KEY, adminToken);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setImpersonating(false);
    const adminUser = await usersApi.me();
    setUser(adminUser);
    return adminUser;
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, impersonating, login, logout, impersonateRole, returnToAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
