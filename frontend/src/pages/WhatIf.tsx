import { useEffect, useState } from "react";
import client from "../api/client";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import type { Defect, ScheduleBlock } from "../types";
import {
  SlidersHorizontal,
  Play,
  Info
} from "lucide-react";

export default function WhatIf() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [severity, setSeverity] = useState(3);
  const [result, setResult] = useState<ScheduleBlock[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    client.get("/defects", { params: { status: "open" } }).then((r) => {
      setDefects(r.data);
      if (r.data.length) {
        setTaskId(r.data[0].task_id);
        setSeverity(r.data[0].severity);
      }
    });
  }, []);

  function selectTask(id: number) {
    setTaskId(id);
    const d = defects.find((x) => x.task_id === id);
    if (d) setSeverity(d.severity);
    setResult(null);
  }

  async function runSimulation() {
    if (taskId == null) return;
    setRunning(true);
    try {
      const res = await client.post("/whatif", {
        override_defect: { task_id: taskId, severity },
      });
      setResult(res.data.schedule);
    } finally {
      setRunning(false);
    }
  }

  const selected = defects.find((d) => d.task_id === taskId);

  return (
    <Layout
      title="What-If Operational Scenario Simulator"
      subtitle="In-Memory Schedule Re-Ranking & Punctuality Delta Modeling Without Altering Committed Plan"
      fullWidth
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="warning" size="sm">
            SANDBOX ENVIRONMENT
          </Badge>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left 4 cols: Parameter Override Controls */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-[#1E2D49] bg-[#0D1527] p-5 shadow-xl">
            <CardHeader className="p-0 pb-4 border-b border-[#1E2D49]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-blue-400" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Simulation Parameters
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Select Defect to Override
                </label>
                <select
                  value={taskId ?? ""}
                  onChange={(e) => selectTask(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-mono"
                >
                  {defects.map((d) => (
                    <option key={d.task_id} value={d.task_id}>
                      #{d.task_id} · {d.asset_id} · {d.defect_type} (Sev: {d.severity})
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="space-y-4 rounded-lg border border-[#1E2D49] bg-[#0A1122] p-3 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Current Baseline Severity:</span>
                    <Badge variant="neutral" size="sm">
                      Level {selected.severity}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Simulated Severity Override:</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        Level {severity}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={severity}
                      onChange={(e) => setSeverity(Number(e.target.value))}
                      className="mt-2 w-full accent-blue-500 cursor-pointer"
                    />
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
                      <span>1 (Minor)</span>
                      <span>3 (Moderate)</span>
                      <span>5 (Critical)</span>
                    </div>
                  </div>

                  <div className="border-t border-[#1E2D49] pt-2 text-[11px] text-slate-400">
                    <div>Corridor: <span className="text-white font-mono">{selected.corridor_id}</span></div>
                    <div>Source: <span className="text-white font-mono">{selected.source_system}</span></div>
                  </div>
                </div>
              )}

              <button
                onClick={runSimulation}
                disabled={running || taskId == null}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-md"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {running ? "Simulating Graph Re-Ranking…" : "Run In-Memory Simulation"}
              </button>

              <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 p-3 text-[11px] text-blue-300 border border-blue-500/20">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  The committed schedule in the production database remains untouched. Changes will only take effect if the section controller regenerates the plan.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 8 cols: Simulated Schedule Results */}
        <div className="lg:col-span-8">
          <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
            <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Simulated Schedule Output
                  </CardTitle>
                  <p className="text-[11px] text-slate-400">
                    Resulting possession queue sorted by new priority scores
                  </p>
                </div>
                {result && (
                  <Badge variant="success" size="sm">
                    {result.length} Slots Computed
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!result ? (
                <div className="p-12 text-center text-xs text-slate-400">
                  Select a defect, adjust its severity level, and run the simulation to inspect the projected corridor possession changes.
                </div>
              ) : (
                <div className="overflow-x-auto technical-scrollbar">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="border-b border-[#1E2D49] bg-[#080E1C] text-[11px] text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Task ID</th>
                        <th className="px-4 py-3">Corridor</th>
                        <th className="px-4 py-3">Allocated Slot</th>
                        <th className="px-4 py-3">Simulated Priority</th>
                        <th className="px-4 py-3">Optimization Rationale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2D49]/60">
                      {result.map((b, i) => {
                        const isSimulatedTarget =
                          String(b.task_id) === String(taskId) ||
                          b.merged_with?.includes(String(taskId));

                        return (
                          <tr
                            key={i}
                            className={`transition-colors hover:bg-[#111C35] ${
                              isSimulatedTarget ? "bg-amber-500/10" : ""
                            }`}
                          >
                            <td className="px-4 py-3 font-bold text-blue-400">
                              {b.merged_with ?? b.task_id}
                              {isSimulatedTarget && (
                                <span className="ml-2 rounded bg-amber-500/20 px-1 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/30 font-sans">
                                  OVERRIDDEN
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {b.corridor_id}
                            </td>
                            <td className="px-4 py-3 text-slate-200">
                              {b.date} ({b.slot_start}–{b.slot_end})
                            </td>
                            <td className="px-4 py-3 font-bold text-amber-400">
                              {b.priority_score.toFixed(1)}
                            </td>
                            <td className="max-w-sm px-4 py-3 font-sans text-[11px] text-slate-400 truncate" title={b.explanation_text}>
                              {b.explanation_text}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
