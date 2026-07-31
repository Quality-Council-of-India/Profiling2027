import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import EvaluatePage from "./pages/EvaluatePage.jsx";
import ScoresPage from "./pages/ScoresPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import CompliancePage from "./pages/CompliancePage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import HallOfRecognitionPage from "./pages/HallOfRecognitionPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/evaluate" element={<EvaluatePage />} />
        <Route path="/scores" element={<ScoresPage />} />
        <Route
          path="/team"
          element={
            <ProtectedRoute roles={["group_anchor", "casu_anchor", "casu_lead", "project_lead", "admin"]}>
              <TeamPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compliance"
          element={
            <ProtectedRoute roles={["casu_lead", "project_lead", "admin"]}>
              <CompliancePage />
            </ProtectedRoute>
          }
        />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/hall-of-recognition" element={<HallOfRecognitionPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
