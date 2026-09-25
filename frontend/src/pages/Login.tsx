import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Radio,
  Lock,
  User,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

const DEMO_ACCOUNTS = [
  { username: "controller", label: "Section Controller", role: "admin", dept: "CONTROL" },
  { username: "tms_engineer", label: "Track Engineer", role: "engineer", dept: "TMS" },
  { username: "smms_engineer", label: "Signaling Engineer", role: "engineer", dept: "SMMS" },
  { username: "tdms_engineer", label: "Traction Engineer", role: "engineer", dept: "TDMS" },
  { username: "bdms_officer", label: "Bridge Officer", role: "engineer", dept: "BDMS" },
  { username: "coa_planner", label: "COA Planner", role: "viewer", dept: "COA" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("controller");
  const [password, setPassword] = useState("railsync123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err: any) {
      setError(err?.message || "Incorrect username or password. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  }

  const handleSelectDemo = (u: string) => {
    setUsername(u);
    setPassword("railsync123");
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-[#080E1C] px-4 py-12 select-none">
      {/* Background Technical Grid and Ambient Blue Glow */}
      <div className="absolute inset-0 railway-grid opacity-30 pointer-events-none" />
      <div className="absolute w-[600px] h-[300px] bg-blue-600/10 blur-[130px] rounded-full pointer-events-none" />

      {/* SVG Network Line in Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M -100 400 C 400 400, 700 200, 1200 300 S 1800 600, 2200 400"
            fill="none"
            stroke="#1E2D49"
            strokeWidth="2"
          />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <Link to="/landing" className="inline-flex items-center gap-3 group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 group-hover:border-blue-400 transition-colors shadow-lg">
              <Radio className="h-6 w-6 animate-pulse text-blue-400" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="font-['Outfit',sans-serif] text-2xl font-bold tracking-tight text-white">
                  RailSync<span className="text-blue-500">.OPS</span>
                </span>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                  SIH26027
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Railway Operations Command Center
              </div>
            </div>
          </Link>

          {/* System Status Indicator */}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[11px] font-medium">
              AUTH GATEWAY ONLINE · HTTPS COOKIE SESSION
            </span>
          </div>
        </div>

        {/* Login Form Card */}
        <div className="rounded-2xl border border-[#1E2D49] bg-[#0D1527]/90 p-8 shadow-2xl backdrop-blur-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Operator Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter operator username"
                  className="w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter secret key"
                  className="w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <span>Verifying Operator Identity…</span>
              ) : (
                <>
                  <span>Sign In to Console</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts Selection */}
          <div className="mt-6 border-t border-[#1E2D49] pt-5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2.5">
              <span className="font-semibold uppercase tracking-wider">Demo Accounts</span>
              <span className="font-mono text-[10px]">password: railsync123</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  type="button"
                  key={acc.username}
                  onClick={() => handleSelectDemo(acc.username)}
                  className={`rounded-lg border p-2 text-left transition-all ${
                    username === acc.username
                      ? "border-blue-500/60 bg-blue-600/15 text-blue-300"
                      : "border-[#1E2D49] bg-[#080E1C] text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}
                >
                  <div className="font-mono text-xs font-bold text-white truncate">
                    {acc.username}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {acc.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Compliance Note */}
        <div className="text-center text-xs text-slate-400 font-mono flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>Protected by Tiered Rate Limiting & SameSite HttpOnly Security</span>
        </div>
      </div>
    </div>
  );
}
