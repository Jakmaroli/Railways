import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  Bell, 
  Radio, 
  LogOut, 
  Activity,
  Layers,
  ChevronDown
} from "lucide-react";
import { Badge } from "./ui/Badge";

interface HeaderProps {
  onToggleSidebar?: () => void;
  unreadAlertsCount?: number;
}

export function Header({ unreadAlertsCount = 3 }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [timeStr, setTimeStr] = useState<string>("");
  const [dateStr, setDateStr] = useState<string>("");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-IN", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "short",
        })
      );
      setDateStr(
        now.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#1E2D49] bg-[#0A1122]/90 px-6 backdrop-blur-md">
      {/* Left: Branding & Operational Status */}
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/15 border border-blue-500/40 text-blue-400 group-hover:border-blue-400 transition-colors shadow-sm">
            <Radio className="h-5 w-5 animate-pulse text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-['Outfit',sans-serif] text-lg font-bold tracking-tight text-white group-hover:text-blue-300 transition-colors">
                RailSync<span className="text-blue-500">.OPS</span>
              </span>
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                SIH26027
              </span>
            </div>
            <div className="text-[11px] font-medium text-slate-400">
              Railway Operations Command Center
            </div>
          </div>
        </Link>

        {/* Live Network Health Status Pill */}
        <div className="hidden lg:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="font-mono text-[11px] font-semibold tracking-wide">
            CRIS / COA FEED ONLINE
          </span>
          <span className="text-emerald-500/50">·</span>
          <span className="font-mono text-[10px] text-emerald-300/80">LATENCY 42ms</span>
        </div>
      </div>

      {/* Right: Telemetry Clock, Alerts & User Profile */}
      <div className="flex items-center gap-4">
        {/* Synchronized Master Clock */}
        <div className="hidden sm:flex flex-col items-end border-r border-[#1E2D49] pr-4">
          <div className="font-mono text-sm font-semibold tracking-wider text-slate-100">
            {timeStr || "10:30:00 IST"}
          </div>
          <div className="font-mono text-[10px] text-slate-400">
            {dateStr || "25 Sep 2026"} · INDIAN RAILWAYS (NR)
          </div>
        </div>

        {/* Alerts Center Quick Nav */}
        <Link
          to="/alerts"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E2D49] bg-[#0E172A] text-slate-300 hover:border-blue-500/50 hover:bg-[#152342] hover:text-white transition-colors"
          title="Operational Alerts"
        >
          <Bell className="h-4 w-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 font-mono text-[9px] font-bold text-white shadow-sm ring-2 ring-[#0A1122]">
              {unreadAlertsCount}
            </span>
          )}
        </Link>

        {/* User Identity Pill */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2.5 rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 hover:border-slate-600 transition-colors"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600/20 font-mono text-xs font-bold text-blue-400 border border-blue-500/30">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden md:block">
                <div className="text-xs font-semibold text-slate-200 leading-tight">
                  {user.full_name}
                </div>
                <div className="font-mono text-[10px] text-slate-400 leading-tight">
                  {user.department} · {user.role.toUpperCase()}
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {/* Profile Dropdown */}
            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[#1E2D49] bg-[#0D1629] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95">
                <div className="border-b border-[#1E2D49] px-3 py-2">
                  <div className="text-xs font-semibold text-slate-200">{user.full_name}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{user.username}</div>
                  <div className="mt-1">
                    <Badge variant={user.role === "admin" ? "warning" : "info"} size="sm">
                      {user.role === "admin" ? "Section Controller" : `${user.department} Engineer`}
                    </Badge>
                  </div>
                </div>
                <div className="py-1">
                  <Link
                    to="/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-[#152342] hover:text-white"
                  >
                    <Activity className="h-3.5 w-3.5 text-blue-400" />
                    System Diagnostics
                  </Link>
                  <Link
                    to="/landing"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-[#152342] hover:text-white"
                  >
                    <Layers className="h-3.5 w-3.5 text-slate-400" />
                    Public Operations Portal
                  </Link>
                </div>
                <div className="border-t border-[#1E2D49] pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out of Console
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
}
