import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Map,
  CalendarCheck2,
  CalendarDays,
  GitBranch,
  FilePlus2,
  Cpu,
  SlidersHorizontal,
  BarChart3,
  AlertTriangle,
  Bell,
  Settings,
} from "lucide-react";
import { Badge } from "./ui/Badge";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
  badge?: string;
  badgeVariant?: "success" | "warning" | "critical" | "info" | "neutral";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAVIGATION_SECTIONS: NavSection[] = [
  {
    title: "COMMAND",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/network", label: "Live Network", icon: Map, badge: "LIVE", badgeVariant: "success" },
      { to: "/schedule", label: "Operations", icon: CalendarCheck2 },
    ],
  },
  {
    title: "PLANNING",
    items: [
      { to: "/timetable", label: "Timetable", icon: CalendarDays },
      { to: "/corridors", label: "Corridors", icon: GitBranch },
      { to: "/submit", label: "Submit Demand", icon: FilePlus2 },
    ],
  },
  {
    title: "INTELLIGENCE",
    items: [
      { to: "/ai-risk", label: "AI Risk Center", icon: Cpu, badge: "ML", badgeVariant: "info" },
      { to: "/whatif", label: "What-If Simulator", icon: SlidersHorizontal },
      { to: "/insights", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "MAINTENANCE",
    items: [
      { to: "/defects", label: "Defects Matrix", icon: AlertTriangle },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { to: "/alerts", label: "Alerts Center", icon: Bell, badge: "3", badgeVariant: "critical" },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[#1E2D49] bg-[#0A1122] select-none">
      {/* Network Identification Banner */}
      <div className="border-b border-[#1E2D49] px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-mono text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
              Northern Railway Zone
            </span>
          </div>
          <span className="font-mono text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
            DIV-DLI
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Section: Delhi — Mughalsarai
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 technical-scrollbar">
        {NAVIGATION_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-mono font-bold tracking-wider text-slate-500">
              {section.title}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `group flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm"
                        : "text-slate-400 hover:bg-[#111C35] hover:text-slate-200 border border-transparent"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors ${
                            isActive
                              ? "text-blue-400"
                              : "text-slate-400 group-hover:text-slate-200"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <Badge
                          variant={item.badgeVariant ?? "neutral"}
                          size="sm"
                          pulse={item.badge === "LIVE"}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* Controller Telemetry Footer */}
      <div className="border-t border-[#1E2D49] bg-[#080E1C] p-3">
        <div className="rounded-lg border border-[#1E2D49] bg-[#0E172A] p-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Auto-Sync Pulse</span>
            <span className="font-mono text-emerald-400 font-semibold">100% OK</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-blue-500 rounded-full w-[94%]" />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Punctuality: 94.2%</span>
            <span>Blocks: 14 Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
