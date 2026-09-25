import { useState } from "react";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  Filter,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router-dom";

interface OperationalAlert {
  id: string;
  title: string;
  affected: string;
  corridor: string;
  time: string;
  severity: "critical" | "high" | "medium" | "info";
  state: "active" | "acknowledged" | "resolved";
  actionText: string;
  actionLink?: string;
  description: string;
}

const INITIAL_ALERTS: OperationalAlert[] = [
  {
    id: "ALT-9041",
    title: "TSR 45 km/h Caution Order Imposed",
    affected: "Train 12618 (Mangala Exp)",
    corridor: "COR-02 (Kanpur-DDU)",
    time: "10:14 IST",
    severity: "critical",
    state: "active",
    actionText: "Inspect Track Defect",
    actionLink: "/defects",
    description: "Ultrasonic weld flaw detected at Km 124/2 UP Line. Speed restriction active to prevent rail fracture escalation.",
  },
  {
    id: "ALT-9038",
    title: "Quad-Track Headway Congestion",
    affected: "Freight Rake 58BOXN",
    corridor: "COR-01 (Delhi-Kanpur)",
    time: "09:50 IST",
    severity: "high",
    state: "active",
    actionText: "View Corridor Radar",
    actionLink: "/network",
    description: "Freight rake held on siding loop at Ghaziabad Outer to establish 12-minute clear headway for Vande Bharat 22436.",
  },
  {
    id: "ALT-9035",
    title: "OHE Substation Power Fluctuation",
    affected: "Traction Substation 4",
    corridor: "COR-01 (Delhi-Kanpur)",
    time: "09:12 IST",
    severity: "medium",
    state: "acknowledged",
    actionText: "View Maintenance Demands",
    actionLink: "/schedule",
    description: "Voltage sag observed during peak rake acceleration. Auxiliary feeder switched online automatically.",
  },
  {
    id: "ALT-9022",
    title: "Daily Master Timetable Feed Synchronized",
    affected: "All Northern Corridors",
    corridor: "Systemwide",
    time: "06:00 IST",
    severity: "info",
    state: "resolved",
    actionText: "View Timetable",
    actionLink: "/timetable",
    description: "COA daily master timetable successfully imported. 142 daily passenger paths confirmed active.",
  },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<OperationalAlert[]>(INITIAL_ALERTS);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const handleAcknowledge = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, state: "acknowledged" } : a))
    );
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity === "all") return true;
    return a.severity === filterSeverity;
  });

  const criticalCount = alerts.filter((a) => a.severity === "critical" && a.state !== "resolved").length;
  const highCount = alerts.filter((a) => a.severity === "high" && a.state !== "resolved").length;

  return (
    <Layout
      title="Operational Alerts & Dispatch Log"
      subtitle="Priority Safety Notices, Speed Restrictions & Signal Interlocking Exceptions"
      fullWidth
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="critical" size="sm" pulse>
            {criticalCount} Critical Active
          </Badge>
          <Badge variant="warning" size="sm">
            {highCount} High Priority
          </Badge>
        </div>
      }
    >
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#1E2D49] bg-[#0D1527] p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-400">Filter by Severity:</span>
          <div className="flex flex-wrap items-center gap-1.5 bg-[#080E1C] p-1 rounded-lg border border-[#1E2D49]">
            {["all", "critical", "high", "medium", "info"].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filterSeverity === sev
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {filteredAlerts.length} of {alerts.length} notifications
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-4">
        {filteredAlerts.map((alert) => {
          const isCritical = alert.severity === "critical";
          const isHigh = alert.severity === "high";
          const isMedium = alert.severity === "medium";

          const borderClass = isCritical
            ? "border-red-500/40 bg-red-500/5 hover:border-red-500/70"
            : isHigh
            ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/70"
            : isMedium
            ? "border-blue-500/40 bg-blue-500/5 hover:border-blue-500/70"
            : "border-[#1E2D49] bg-[#0D1527] hover:border-slate-500";

          return (
            <div
              key={alert.id}
              className={`rounded-xl border p-5 shadow-lg transition-all ${borderClass}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      isCritical
                        ? "bg-red-500/20 text-red-400"
                        : isHigh
                        ? "bg-amber-500/20 text-amber-400"
                        : isMedium
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-slate-700/20 text-slate-400"
                    }`}
                  >
                    {isCritical ? (
                      <AlertOctagon className="h-5 w-5" />
                    ) : isHigh ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : isMedium ? (
                      <ShieldAlert className="h-5 w-5" />
                    ) : (
                      <Info className="h-5 w-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        {alert.id}
                      </span>
                      <h3 className="font-['Outfit',sans-serif] text-base font-bold text-white">
                        {alert.title}
                      </h3>
                      <Badge
                        variant={
                          isCritical
                            ? "critical"
                            : isHigh
                            ? "warning"
                            : isMedium
                            ? "info"
                            : "neutral"
                        }
                        size="sm"
                      >
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <Badge
                        variant={alert.state === "resolved" ? "success" : "neutral"}
                        size="sm"
                      >
                        {alert.state}
                      </Badge>
                    </div>

                    <p className="mt-2 text-xs text-slate-300 leading-relaxed max-w-3xl">
                      {alert.description}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                      <div>
                        Affected: <span className="text-white font-semibold">{alert.affected}</span>
                      </div>
                      <div>·</div>
                      <div>
                        Corridor: <span className="text-slate-300">{alert.corridor}</span>
                      </div>
                      <div>·</div>
                      <div>
                        Time: <span className="text-slate-300">{alert.time}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                  {alert.actionLink && (
                    <Link
                      to={alert.actionLink}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm transition-colors"
                    >
                      {alert.actionText} <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                  {alert.state === "active" && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
