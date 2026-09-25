import { useEffect, useState } from "react";
import client from "../api/client";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import CorridorTimeline from "../components/CorridorTimeline";
import { useAuth } from "../context/AuthContext";
import type { Corridor, ScheduleBlock, BlockRequest } from "../types";
import {
  Layers,
  FileCheck,
  Clock,
  AlertTriangle,
  Play,
  RefreshCw
} from "lucide-react";

export default function Schedule() {
  const { isAdmin } = useAuth();
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [busy, setBusy] = useState<any[]>([]);
  const [requests, setRequests] = useState<BlockRequest[]>([]);
  const [generating, setGenerating] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [actualHours, setActualHours] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvalNotice, setApprovalNotice] = useState<{ id: number; pn: string } | null>(null);
  const [importingCoa, setImportingCoa] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const dayOfWeek = (new Date().getDay() + 6) % 7;

  async function refresh() {
    setRefreshing(true);
    try {
      const [s, c, t, r] = await Promise.all([
        client.get("/schedule"),
        client.get("/corridors"),
        client.get("/timetable"),
        client.get("/block-requests"),
      ]);
      setBlocks(s.data);
      setCorridors(c.data);
      setBusy(t.data);
      setRequests(r.data);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await client.post("/schedule/generate");
      await refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function handleComplete(id: number) {
    const hours = parseFloat(actualHours);
    if (Number.isNaN(hours)) return;
    await client.patch(`/schedule/${id}/complete`, { actual_duration: hours });
    setCompletingId(null);
    setActualHours("");
    await refresh();
  }

  async function handleApproveRequest(id: number) {
    try {
      const res = await client.patch(`/block-requests/${id}/approve`);
      setApprovalNotice({ id, pn: res.data.possession_number });
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to approve block request");
    }
  }

  async function handleRejectRequest(id: number) {
    if (!rejectReason.trim()) return;
    try {
      await client.patch(`/block-requests/${id}/reject`, { reason: rejectReason.trim() });
      setRejectingId(null);
      setRejectReason("");
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to reject block request");
    }
  }

  async function handleSimulateCoaImport() {
    setImportingCoa(true);
    try {
      await client.post("/timetable/import", [
        {
          corridor_id: corridors[0]?.corridor_id || "COR-01",
          specific_date: today,
          day_of_week: dayOfWeek,
          start_time: "13:00",
          end_time: "15:30",
          train_count: 2,
          is_peak: false,
        },
      ]);
      await refresh();
    } catch (err: any) {
      alert(err.message || "Failed to import COA feed");
    } finally {
      setImportingCoa(false);
    }
  }

  const plannedCount = blocks.filter((b) => b.status === "planned").length;
  const completedCount = blocks.filter((b) => b.status === "completed").length;
  const pendingRequestsCount = requests.filter((r) => r.status === "pending").length;

  return (
    <Layout
      title="Operations & Corridor Possession Management"
      subtitle="Automated Corridor Slot Optimization, Multi-Department Block Merging & Authority Issuance"
      fullWidth
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            Refresh
          </button>
          {isAdmin ? (
            <>
              <button
                onClick={handleSimulateCoaImport}
                disabled={importingCoa}
                className="rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-[#152342] hover:text-white disabled:opacity-50"
              >
                {importingCoa ? "Importing…" : "Simulate Live COA Ingest"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 shadow-sm"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {generating ? "Computing Schedule…" : "Generate AI Possession Plan"}
              </button>
            </>
          ) : (
            <div className="font-mono text-xs text-slate-400">
              Controller authorization required to commit plan
            </div>
          )}
        </div>
      }
    >
      {/* Official Possession Authority Confirmation Banner */}
      {approvalNotice && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-lg animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <FileCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-400">
                  OFFICIAL POSSESSION AUTHORITY ISSUED
                </div>
                <div className="font-mono text-sm font-bold text-white">
                  PN: {approvalNotice.pn}
                </div>
                <div className="text-[11px] text-slate-400">
                  Transmitted to department station registers and logged in safety audit ledger.
                </div>
              </div>
            </div>
            <button
              onClick={() => setApprovalNotice(null)}
              className="rounded px-2.5 py-1 text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Scheduled Blocks</span>
            <Clock className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-white">
              {blocks.length}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ({plannedCount} active · {completedCount} cleared)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-blue-400">
            Fitted into low-traffic headway gaps
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pending Department Demands</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-amber-400">
              {pendingRequestsCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">awaiting review</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-400">
            Requires section controller authorization
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Merged Possession Ratio</span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-emerald-400">
              {blocks.filter((b) => b.merged_with).length} / {blocks.length || 1}
            </span>
            <span className="text-xs text-slate-400 font-mono">co-located tasks</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400">
            Minimizes corridor traffic downtime
          </div>
        </Card>
      </div>

      {/* Corridor Visual Gantt Possession Chart */}
      <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
        <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Corridor Possession Chart & Shadow Traffic Windows
            </CardTitle>
            <span className="font-mono text-xs text-blue-400">Date: {today}</span>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <CorridorTimeline
            corridors={corridors}
            blocks={blocks}
            busyWindows={busy}
            date={today}
            dayOfWeek={dayOfWeek}
          />
        </CardContent>
      </Card>

      {/* Unified Possession Plan Table */}
      <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
        <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Unified Possession Plan
              </CardTitle>
              <p className="text-[11px] text-slate-400">
                Committed track block allocations ranked by risk-weighted priority
              </p>
            </div>
            <Badge variant="neutral" size="sm">
              {blocks.length} Blocks
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto technical-scrollbar">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-[#1E2D49] bg-[#080E1C] text-[11px] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Possession #</th>
                  <th className="px-4 py-3">Task(s)</th>
                  <th className="px-4 py-3">Corridor</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Allocated Slot</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Optimization Rationale</th>
                  <th className="px-4 py-3 text-right">Controller Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D49]/60">
                {blocks.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-[#111C35]">
                    <td className="px-4 py-3 font-bold text-amber-400">
                      {b.possession_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {b.merged_with ?? b.task_id}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {b.corridor_id}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {b.date}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {b.slot_start} – {b.slot_end}
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-400">
                      {b.priority_score.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={b.status === "completed" ? "success" : "warning"}
                        size="sm"
                      >
                        {b.status}
                      </Badge>
                    </td>
                    <td className="max-w-xs px-4 py-3 font-sans text-[11px] text-slate-400 truncate" title={b.explanation_text}>
                      {b.explanation_text}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.status === "planned" &&
                        (completingId === b.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              autoFocus
                              value={actualHours}
                              onChange={(e) => setActualHours(e.target.value)}
                              placeholder="hrs"
                              className="w-16 rounded border border-[#1E2D49] bg-[#080E1C] px-2 py-1 text-xs text-white"
                            />
                            <button
                              onClick={() => handleComplete(b.id)}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => {
                                setCompletingId(null);
                                setActualHours("");
                              }}
                              className="text-xs text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setCompletingId(b.id)}
                            className="font-sans text-xs text-slate-400 hover:text-amber-400 transition-colors"
                          >
                            Mark Complete
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {blocks.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                No blocks planned yet. Run "Generate AI Possession Plan" to pack open defects into corridor slots.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Department Block Demands & Authorization Review */}
      <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
        <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Department Block Demands & Possession Authorizations
              </CardTitle>
              <p className="text-[11px] text-slate-400">
                Direct cross-department submission loop for TMS, SMMS, TDMS, and BDMS
              </p>
            </div>
            <Badge variant="info" size="sm">
              {requests.length} Requests
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto technical-scrollbar">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-[#1E2D49] bg-[#080E1C] text-[11px] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Demand ID</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Corridor</th>
                  <th className="px-4 py-3">Requested Slot</th>
                  <th className="px-4 py-3">Demand Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Possession #</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Controller Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D49]/60">
                {requests.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-[#111C35]">
                    <td className="px-4 py-3 font-bold text-blue-400">#{r.id}</td>
                    <td className="px-4 py-3 font-bold text-white">{r.department}</td>
                    <td className="px-4 py-3 text-slate-300">{r.corridor_id}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {r.requested_date} ({r.requested_start}–{r.requested_end})
                    </td>
                    <td className="max-w-xs px-4 py-3 font-sans text-[11px] text-slate-300 truncate" title={r.reason}>
                      {r.reason || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          r.status === "approved"
                            ? "success"
                            : r.status === "rejected"
                            ? "critical"
                            : "warning"
                        }
                        size="sm"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-400">
                      {r.possession_number ?? "—"}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {r.status === "pending" && (
                          <div className="flex items-center justify-end gap-2">
                            {rejectingId === r.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  autoFocus
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Reason…"
                                  className="w-32 rounded border border-[#1E2D49] bg-[#080E1C] px-2 py-1 text-xs text-white"
                                />
                                <button
                                  onClick={() => handleRejectRequest(r.id)}
                                  className="text-xs text-red-400 hover:underline"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason("");
                                  }}
                                  className="text-xs text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleApproveRequest(r.id)}
                                  className="font-sans text-xs font-semibold text-emerald-400 hover:underline"
                                >
                                  Approve & Issue PN
                                </button>
                                <span className="text-slate-600">|</span>
                                <button
                                  onClick={() => setRejectingId(r.id)}
                                  className="font-sans text-xs text-red-400 hover:underline"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {requests.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                No department block demands submitted.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
