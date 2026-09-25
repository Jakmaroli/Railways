import { useEffect, useState } from "react";
import client from "../api/client";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { useAuth } from "../context/AuthContext";
import type { Corridor } from "../types";
import {
  FilePlus2,
  CheckCircle2,
  XCircle,
  Send
} from "lucide-react";

export default function Submit() {
  const { user } = useAuth();
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [form, setForm] = useState({
    asset_id: "",
    corridor_id: "",
    defect_type: "",
    severity: 3,
    date_reported: new Date().toISOString().slice(0, 10),
    due_date: "",
    estimated_block_duration: 2,
    location_marker: "",
  });
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  useEffect(() => {
    client.get("/corridors").then((r) => {
      setCorridors(r.data);
      if (r.data.length) setForm((f) => ({ ...f, corridor_id: r.data[0].corridor_id }));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    try {
      await client.post("/defects", {
        ...form,
        source_system: user?.department ?? "TMS",
        department: user?.department ?? "TMS",
      });
      setStatus("done");
      setForm((f) => ({ ...f, asset_id: "", defect_type: "", due_date: "", location_marker: "" }));
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-colors";
  const labelClass = "mb-1.5 block text-xs font-medium text-slate-300";

  return (
    <Layout
      title="Submit Asset Defect & Maintenance Demand"
      subtitle="Ingest Field Hazards Directly into the Multi-Department Scoring Ledger"
    >
      <div className="mx-auto max-w-2xl">
        <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilePlus2 className="h-4 w-4 text-blue-400" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  New Incident / Hazard Record
                </CardTitle>
              </div>
              <Badge variant="info" size="sm">
                Reporting as: {user?.department ?? "TMS"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Asset Identifier</label>
                  <input
                    required
                    value={form.asset_id}
                    onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
                    placeholder="e.g. TRK-4471 or SIG-08B"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Corridor Section</label>
                  <select
                    value={form.corridor_id}
                    onChange={(e) => setForm({ ...form, corridor_id: e.target.value })}
                    className={inputClass}
                  >
                    {corridors.map((c) => (
                      <option key={c.corridor_id} value={c.corridor_id}>
                        {c.name} ({c.corridor_id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Defect Description / Anomaly</label>
                <input
                  required
                  value={form.defect_type}
                  onChange={(e) => setForm({ ...form, defect_type: e.target.value })}
                  placeholder="e.g. Ultrasonic rail flaw, OHE insulator flashover, point machine torque spike"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>
                    Severity Level (1 to 5)
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: Number(e.target.value) })}
                    className={inputClass}
                  >
                    <option value={1}>1 — Minor Advisory (Routine)</option>
                    <option value={2}>2 — Low Priority</option>
                    <option value={3}>3 — Moderate Concern (Scheduled)</option>
                    <option value={4}>4 — High Risk (TSR imposed)</option>
                    <option value={5}>5 — Critical Safety Stop</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Est. Possession Duration (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    value={form.estimated_block_duration}
                    onChange={(e) => setForm({ ...form, estimated_block_duration: Number(e.target.value) })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Target Remediation Due Date</label>
                  <input
                    required
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Track Kilometrage / Marker (Optional)</label>
                  <input
                    value={form.location_marker}
                    onChange={(e) => setForm({ ...form, location_marker: e.target.value })}
                    placeholder="e.g. Km 124/2 UP Line"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={status === "saving"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-md"
                >
                  <Send className="h-3.5 w-3.5" />
                  {status === "saving" ? "Submitting to Audit Queue…" : "Submit Defect to RailSync Engine"}
                </button>
              </div>

              {status === "done" && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Defect successfully recorded and queued for priority scoring.</span>
                </div>
              )}

              {status === "error" && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>Submission failed. Please verify corridor ID and try again.</span>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
