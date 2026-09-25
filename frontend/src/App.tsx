import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import LiveNetworkPage from "./pages/LiveNetworkPage";
import Defects from "./pages/Defects";
import Schedule from "./pages/Schedule";
import TimetablePage from "./pages/TimetablePage";
import CorridorsPage from "./pages/CorridorsPage";
import AiRiskPage from "./pages/AiRiskPage";
import WhatIf from "./pages/WhatIf";
import Submit from "./pages/Submit";
import Insights from "./pages/Insights";
import AlertsPage from "./pages/AlertsPage";
import SettingsPage from "./pages/SettingsPage";
import { Radio } from "lucide-react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080E1C] text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Radio className="h-5 w-5 animate-pulse text-blue-400" />
          </div>
          <div className="font-mono text-xs text-slate-400">
            Restoring RailSync secure session…
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/landing" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      
      {/* COMMAND */}
      <Route path="/" element={<RequireAuth><Overview /></RequireAuth>} />
      <Route path="/network" element={<RequireAuth><LiveNetworkPage /></RequireAuth>} />
      <Route path="/schedule" element={<RequireAuth><Schedule /></RequireAuth>} />

      {/* PLANNING */}
      <Route path="/timetable" element={<RequireAuth><TimetablePage /></RequireAuth>} />
      <Route path="/corridors" element={<RequireAuth><CorridorsPage /></RequireAuth>} />
      <Route path="/submit" element={<RequireAuth><Submit /></RequireAuth>} />

      {/* INTELLIGENCE */}
      <Route path="/ai-risk" element={<RequireAuth><AiRiskPage /></RequireAuth>} />
      <Route path="/whatif" element={<RequireAuth><WhatIf /></RequireAuth>} />
      <Route path="/insights" element={<RequireAuth><Insights /></RequireAuth>} />

      {/* MAINTENANCE */}
      <Route path="/defects" element={<RequireAuth><Defects /></RequireAuth>} />

      {/* SYSTEM */}
      <Route path="/alerts" element={<RequireAuth><AlertsPage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
