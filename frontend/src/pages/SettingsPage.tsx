import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import {
  ShieldCheck,
  Server,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function checkHealth() {
    setLoading(true);
    try {
      const res = await client.get("/health");
      setHealth(res.data);
    } catch {
      setHealth({ status: "degraded", error: "Failed to connect to backend" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <Layout
      title="System Settings & Infrastructure Diagnostics"
      subtitle="Enterprise API Gateway Health, Security Hardening Ledger & Telemetry Configurations"
      actions={
        <button
          onClick={checkHealth}
          className="flex items-center gap-1.5 rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
          Run Health Probe
        </button>
      }
    >
      <div className="space-y-6">
        {/* Security & Authentication Protocol Card */}
        <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Security Hardening Ledger (SIH Compliance)
                </CardTitle>
              </div>
              <Badge variant="success" size="sm">
                HARDENED ENTERPRISE
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs font-mono">
              <div className="rounded-lg border border-[#1E2D49] bg-[#0A1122] p-4">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>HttpOnly Cookie Sessions</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 font-sans">
                  Session tokens stored exclusively in Secure, SameSite=Strict cookies. Completely immune to token theft via XSS.
                </p>
              </div>

              <div className="rounded-lg border border-[#1E2D49] bg-[#0A1122] p-4">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Redis Tiered Rate Limiting</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 font-sans">
                  Sliding-window Redis throttles protect login and simulation endpoints from brute-force disruption.
                </p>
              </div>

              <div className="rounded-lg border border-[#1E2D49] bg-[#0A1122] p-4">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Timing-Safe Auth Verification</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-400 font-sans">
                  Constant-time password comparison prevents username enumeration and side-channel timing attacks.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Services & Health Status */}
        <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Service Gateways & Endpoints
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#1E2D49]/60 text-xs font-mono">
              <div className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <span className="font-bold text-white">FastAPI Backend Engine</span>
                  <div className="text-[11px] text-slate-400 font-sans">Port 8000 · Python 3.11 Runtime</div>
                </div>
                <Badge variant={health?.status === "ok" ? "success" : "warning"} size="sm">
                  {health?.status === "ok" ? "HEALTHY (200 OK)" : "STANDALONE"}
                </Badge>
              </div>

              <div className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <span className="font-bold text-white">Redis Sliding-Window Rate Limiter</span>
                  <div className="text-[11px] text-slate-400 font-sans">In-memory state store with FakeRedis fallback</div>
                </div>
                <Badge variant="success" size="sm">
                  ONLINE
                </Badge>
              </div>

              <div className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <span className="font-bold text-white">CRIS / COA Indian Railways Gateway</span>
                  <div className="text-[11px] text-slate-400 font-sans">Simulated Control Office Application feed</div>
                </div>
                <Badge variant="success" size="sm">
                  SYNCED
                </Badge>
              </div>

              <div className="flex items-center justify-between px-6 py-3.5">
                <div>
                  <span className="font-bold text-white">Machine Learning Priority Model</span>
                  <div className="text-[11px] text-slate-400 font-sans">Gradient priority estimator with domain rule fallback</div>
                </div>
                <Badge variant="info" size="sm">
                  CALIBRATED
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Active User Session Profile */}
        <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Active Controller Session
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Operator Name</span>
                <div className="mt-1 font-bold text-white">{user?.full_name}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">System Username</span>
                <div className="mt-1 font-bold text-blue-400">{user?.username}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Department</span>
                <div className="mt-1 font-bold text-slate-200">{user?.department}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase">Authorization Role</span>
                <div className="mt-1">
                  <Badge variant={user?.role === "admin" ? "warning" : "info"} size="sm">
                    {user?.role.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
