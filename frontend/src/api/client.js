import axios from "axios";

export const TOKEN_KEY = "profiling2027_token";
// Stashes the Admin's own token while "viewing as" another role, so the
// portal can restore it on "Return to Admin" without a fresh login.
export const ADMIN_TOKEN_KEY = "profiling2027_admin_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (location.pathname !== "/login") location.href = "/login";
    }
    return Promise.reject(err);
  }
);
