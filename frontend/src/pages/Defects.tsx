import { useEffect, useState } from "react";
import client from "../api/client";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { DefectDetailDrawer } from "../components/DefectDetailDrawer";
import type { Defect } from "../types";
import {
  AlertTriangle,
  AlertOctagon,
  Search,
  CheckCircle2,
  Clock,
  FilePlus,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Link } from "react-router-dom";

const SEVERITY_INFO: Record<number, { label: string; variant: "critical" | "warning" | "neutral" }> = {
  5: { label: "Critical (5)", variant: "critical" },
  4: { label: "High (4)", variant: "critical" },
  3: { label: "Medium (3)", variant: "warning" },
  2: { label: "Low (2)", variant: "neutral" },
  1: { label: "Minor (1)", variant: "neutral" },
};

export default function Defects() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);

  async function loadDefects() {
    setLoading(true);
    try {
      const res = await client.get("/defects");
      setDefects(
        res.data.sort(
          (a: Defect, b: Defect) => (b.priority_score ?? 0) - (a.priority_score ?? 0)
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDefects();
  }, []);

  // Filter calculation
  const criticalCount = defects.filter((d) => d.severity === 5 && d.status !== "completed").length;
  const highCount = defects.filter((d) => d.severity === 4 && d.status !== "completed").length;
  const mediumCount = defects.filter((d) => d.severity === 3 && d.status !== "completed").length;
  const resolvedCount = defects.filter((d) => d.status === "completed").length;

  const filtered = defects.filter((d) => {
    const matchesFilter = filter === "all" ? true : d.status === filter;
    const matchesSearch =
      search === "" ||
      d.asset_id.toLowerCase().includes(search.toLowerCase()) ||
      d.defect_type.toLowerCase().includes(search.toLowerCase()) ||
      d.corridor_id.toLowerCase().includes(search.toLowerCase()) ||
      String(d.task_id).includes(search);
    return matchesFilter && matchesSearch;
  });

  return (
    <Layout
      title="Asset Defect Management"
      subtitle="Unified TMS, SMMS, TDMS & BDMS Field Hazard Feed with AI Possession Prioritization"
      fullWidth
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={loadDefects}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Feed
          </button>
          <Link
            to="/submit"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
          >
            <FilePlus className="h-3.5 w-3.5" />
            Log New Defect
          </Link>
        </div>
      }
    >
      {/* Top Severity KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Critical (L5)</span>
            <AlertOctagon className="h-4 w-4 text-red-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-red-400">
              {criticalCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">safety stop hazard</span>
          </div>
          <div className="mt-2 text-[11px] text-red-400">
            Immediate block booking required
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">High Risk (L4)</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-amber-400">
              {highCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">TSR imposed</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-400">
            Due within 48h operational window
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Medium (L3)</span>
            <Clock className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-blue-400">
              {mediumCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">candidate for merge</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Scheduled during routine maintenance
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Resolved / Closed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-emerald-400">
              {resolvedCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">blocks completed</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400">
            Audit register verified
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#1E2D49] bg-[#0D1527] p-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Task #, Asset ID, Defect Type, Corridor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[#080E1C] p-1 rounded-lg border border-[#1E2D49]">
          {["all", "open", "scheduled", "completed", "overrun"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table View */}
      <div className="rounded-xl border border-[#1E2D49] bg-[#0D1527] overflow-hidden shadow-xl">
        <div className="overflow-x-auto technical-scrollbar">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#1E2D49] bg-[#0A1122] text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Task ID</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Route / Corridor</th>
                <th className="px-4 py-3">Defect Description</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">AI Priority</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2D49]/60 font-mono">
              {filtered.map((d) => {
                const sev = SEVERITY_INFO[d.severity] ?? { label: `${d.severity}`, variant: "neutral" };
                const isSelected = selectedDefect?.task_id === d.task_id;

                return (
                  <tr
                    key={d.task_id}
                    onClick={() => setSelectedDefect(d)}
                    className={`cursor-pointer transition-colors hover:bg-[#111C35] ${
                      isSelected ? "bg-blue-600/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-bold text-blue-400">
                      #{d.task_id}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-semibold">
                      {d.source_system}
                    </td>
                    <td className="px-4 py-3 text-white font-bold">
                      {d.asset_id}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {d.corridor_id}
                      {d.location_marker && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({d.location_marker})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-sans text-slate-200">
                      {d.defect_type}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={sev.variant} size="sm">
                        {sev.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-400">
                      {d.priority_score?.toFixed(1) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {d.due_date}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          d.status === "completed"
                            ? "success"
                            : d.status === "scheduled"
                            ? "info"
                            : d.status === "overrun"
                            ? "critical"
                            : "warning"
                        }
                        size="sm"
                      >
                        {d.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDefect(d);
                        }}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-sans font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                      >
                        Inspect <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No defects match the selected filters or search criteria.
            </div>
          )}
        </div>
      </div>

      <DefectDetailDrawer
        defect={selectedDefect}
        isOpen={!!selectedDefect}
        onClose={() => setSelectedDefect(null)}
        onRefresh={loadDefects}
      />
    </Layout>
  );
}
