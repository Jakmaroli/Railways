import { Link } from "react-router-dom";
import {
  Radio,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Activity,
  Layers,
} from "lucide-react";

export default function Landing() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#080E1C] text-slate-100 flex flex-col justify-between select-none">
      {/* Background Technical Railway Grid & Subtle Beam Effects */}
      <div className="absolute inset-0 railway-grid opacity-30 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-blue-600/10 blur-[140px] pointer-events-none rounded-full" />

      {/* Interactive Network Track Overlay (SVG lines with moving train blips) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Trunk Corridor Lines */}
          <path
            d="M -100 200 C 300 200, 500 400, 1000 350 S 1600 500, 2200 450"
            fill="none"
            stroke="#1E2D49"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
          <path
            d="M -100 210 C 300 210, 500 410, 1000 360 S 1600 510, 2200 460"
            fill="none"
            stroke="#2563EB"
            strokeWidth="1.5"
            opacity="0.6"
          />
          <path
            d="M -50 600 C 400 580, 800 250, 1400 300 S 1900 150, 2300 200"
            fill="none"
            stroke="#1E2D49"
            strokeWidth="2"
          />

          {/* Animated Train Indicator Blips */}
          <circle cx="500" cy="370" r="4" fill="#3B82F6" className="animate-ping" />
          <circle cx="500" cy="370" r="4" fill="#60A5FA" />
          <circle cx="1200" cy="400" r="4" fill="#10B981" />
          <circle cx="1600" cy="480" r="4" fill="#F59E0B" />
        </svg>
      </div>

      {/* Top Navbar */}
      <header className="relative z-10 flex h-20 w-full items-center justify-between px-8 md:px-16 border-b border-[#1E2D49]/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Radio className="h-5 w-5 animate-pulse text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-['Outfit',sans-serif] text-xl font-bold tracking-tight text-white">
                RailSync<span className="text-blue-500">.OPS</span>
              </span>
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                SIH26027
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Indian Railways Next-Gen Dispatch Platform
            </div>
          </div>
        </div>

        {/* Live Operational Status Indicator */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-wide">
              SYSTEM OPERATIONAL · CRIS SYNC ACTIVE
            </span>
          </div>

          <Link
            to="/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            Access Console
          </Link>
        </div>
      </header>

      {/* Main Hero Section */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs text-blue-300 mb-6 backdrop-blur-md">
          <Activity className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-mono font-medium">Smart India Hackathon 2026 · Problem Statement SIH26027</span>
        </div>

        <h1 className="font-['Outfit',sans-serif] text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          RAILSYNC
        </h1>
        <p className="mt-3 font-['Outfit',sans-serif] text-xl sm:text-2xl font-medium text-slate-300 max-w-2xl">
          Intelligent Railway Operations & Synchronization
        </p>

        <div className="mt-4 flex items-center justify-center gap-3 text-sm font-mono text-blue-400 tracking-wider">
          <span>MONITOR</span>
          <span>·</span>
          <span>PREDICT</span>
          <span>·</span>
          <span>RESPOND</span>
        </div>

        <p className="mt-6 text-sm text-slate-400 max-w-xl leading-relaxed">
          A unified command-center platform packing cross-department maintenance demands into high-density corridor traffic gaps with supervised machine learning and automated Possession Authority (PN) issuance.
        </p>

        {/* Primary CTA */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/20 hover:bg-blue-500 transition-all group"
          >
            <span>Enter Operations Center</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/login"
            className="rounded-xl border border-[#1E2D49] bg-[#0E172A] px-6 py-3.5 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
          >
            Operator Login
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full text-left">
          <div className="rounded-xl border border-[#1E2D49] bg-[#0D1527]/80 p-5 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-3">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="text-xs font-semibold text-white font-mono">Continuous Generalization</div>
            <p className="mt-1 text-xs text-slate-400 leading-normal">
              Machine learning priority model grounded in Indian Railways safety rules, balancing asset risk against passenger train delay.
            </p>
          </div>

          <div className="rounded-xl border border-[#1E2D49] bg-[#0D1527]/80 p-5 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
              <Layers className="h-4 w-4" />
            </div>
            <div className="text-xs font-semibold text-white font-mono">Multi-Department Merging</div>
            <p className="mt-1 text-xs text-slate-400 leading-normal">
              Eliminates duplicate block requests by co-locating TMS, SMMS, and TDMS work into single possession envelopes.
            </p>
          </div>

          <div className="rounded-xl border border-[#1E2D49] bg-[#0D1527]/80 p-5 backdrop-blur-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="text-xs font-semibold text-white font-mono">Hardened Security Ledger</div>
            <p className="mt-1 text-xs text-slate-400 leading-normal">
              HttpOnly cookie sessions, Redis tiered rate limiting, and tamper-evident audit records protecting sectional commands.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex flex-col sm:flex-row items-center justify-between border-t border-[#1E2D49]/60 px-8 py-5 text-xs text-slate-500">
        <div>Indian Railways Operational Safety & Punctuality System</div>
        <div className="font-mono text-[11px] text-slate-400">
          SIH26027 · RailSync Production Console
        </div>
      </footer>
    </div>
  );
}
