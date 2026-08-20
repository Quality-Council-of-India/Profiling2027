import { api } from "./client.js";

export const authApi = {
  login: (email, password) => api.post("/auth/login", { email, password }).then((r) => r.data),
  requestReset: (email) => api.post("/auth/reset-password", { email }).then((r) => r.data),
  confirmReset: (token, newPassword) =>
    api.post("/auth/reset-password/confirm", { token, newPassword }).then((r) => r.data),
};

export const usersApi = {
  me: () => api.get("/users/me").then((r) => r.data.user),
  myPeers: () => api.get("/users/me/peers").then((r) => r.data),
};

export const ticketsApi = {
  create: (payload) => api.post("/tickets", payload).then((r) => r.data),
  mine: () => api.get("/tickets/mine").then((r) => r.data.tickets),
  listAll: (status) => api.get("/tickets", { params: status ? { status } : {} }).then((r) => r.data.tickets),
  respond: (id, payload) => api.patch(`/tickets/${id}`, payload).then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get("/notifications").then((r) => r.data.notifications),
  unreadCount: () => api.get("/notifications/unread-count").then((r) => r.data.count),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.patch("/notifications/read-all").then((r) => r.data),
};

export const weeksApi = {
  list: () => api.get("/weeks").then((r) => r.data.weeks),
  status: (weekId) => api.get(`/weeks/${weekId}/status`).then((r) => r.data),
};

export const evaluationsApi = {
  submit: (payload) => api.post("/evaluations", payload).then((r) => r.data),
  pending: () => api.get("/evaluations/pending").then((r) => r.data),
};

export const scoresApi = {
  userWeek: (userId, weekId) => api.get(`/scores/${userId}/${weekId}`).then((r) => r.data),
  trend: (userId) => api.get(`/scores/${userId}/trend`).then((r) => r.data),
  team: (weekId) => api.get(`/scores/team/${weekId}`).then((r) => r.data),
};

export const complianceApi = {
  get: (weekId) => api.get(`/compliance/${weekId}`).then((r) => r.data),
  remind: (weekId) => api.post(`/compliance/${weekId}/remind`).then((r) => r.data),
};

export const analyticsApi = {
  heatmap: (weekId) => api.get(`/analytics/heatmap/${weekId}`).then((r) => r.data),
  sapa: (weekId) => api.get(`/analytics/sapa/${weekId}`).then((r) => r.data),
  quadrant: (weekId) => api.get(`/analytics/quadrant/${weekId}`).then((r) => r.data),
  rankings: (weekIds) => api.get(`/analytics/rankings?weeks=${weekIds.join(",")}`).then((r) => r.data),
  fieldStandings: (weekIds) => api.get(`/analytics/field-standings?weeks=${weekIds.join(",")}`).then((r) => r.data),
  fieldMembers: (weekIds, field) =>
    api.get(`/analytics/field-members?weeks=${weekIds.join(",")}&field=${encodeURIComponent(field)}`).then((r) => r.data),
  hallOfRecognition: () => api.get("/analytics/hall-of-recognition").then((r) => r.data),
  peerTrend: (userId) => api.get(`/analytics/peer-trend/${userId}`).then((r) => r.data),
};

export const adminApi = {
  createWeek: () => api.post("/admin/weeks", {}).then((r) => r.data),
  impersonateUser: (userId) => api.post(`/admin/impersonate-user/${userId}`).then((r) => r.data),
  unlockEvaluation: (id) => api.patch(`/admin/evaluations/${id}/unlock`).then((r) => r.data),
  openWeek: (weekId) => api.post(`/admin/weeks/${weekId}/open`).then((r) => r.data),
  closeWeek: (weekId) => api.post(`/admin/weeks/${weekId}/close`).then((r) => r.data),
  unlockAllForWeek: (weekId) => api.post(`/admin/weeks/${weekId}/unlock-all`).then((r) => r.data),
  importRoster: (file) => {
    const form = new FormData();
    form.append("roster", file);
    return api
      .post("/admin/roster/import", form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },
  listUsers: () => api.get("/admin/users").then((r) => r.data.users),
  setUserActive: (userId, is_active) =>
    api.patch(`/admin/users/${userId}/active`, { is_active }).then((r) => r.data),
  setUserField: (userId, field) => api.patch(`/admin/users/${userId}/field`, { field }).then((r) => r.data),
  setUserPassword: (userId, password) =>
    api.patch(`/admin/users/${userId}/password`, { password }).then((r) => r.data),
  uploadUserPhoto: (userId, blob) => {
    const form = new FormData();
    form.append("photo", blob, "photo.jpg");
    return api
      .patch(`/admin/users/${userId}/photo`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },
  sendUserPasswordReset: (userId) => api.post(`/admin/users/${userId}/send-reset`).then((r) => r.data),
  sendLoginCredentialsToAll: () => api.post("/admin/users/send-credentials-all").then((r) => r.data),
  rawTables: () => api.get("/admin/data").then((r) => r.data.tables),
  rawTable: (table, { page = 1, pageSize = 50, weekId, search, locked } = {}) =>
    api
      .get(`/admin/data/${table}`, {
        params: {
          page,
          pageSize,
          ...(weekId ? { weekId } : {}),
          ...(search ? { search } : {}),
          ...(locked !== undefined && locked !== "" ? { locked } : {}),
        },
      })
      .then((r) => r.data),
};

// Export endpoints require the JWT, so a plain <a href> can't be used —
// fetch as a blob (auth header attached by the interceptor) and trigger
// a client-side download.
export async function downloadExport(path, filename) {
  const res = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
