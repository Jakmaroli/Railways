import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import client from "../api/client";
import type { Corridor, Defect } from "../types";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function CorridorsPage() {
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);

  useEffect(() => {
    Promise.all([client.get("/corridors"), client.get("/defects")]).then(([c, d]) => {
      setCorridors(c.data);
      setDefects(d.data);
    });
  }, []);

  return (
    <Layout
      title="Corridor Network & Sectional Topology"
      subtitle="Capacity Utilization, Track Architecture & High-Density Route Telemetry"
      fullWidth
      actions={
        <div className="flex items-center gap-3">
          <Badge variant="info" size="sm">
            {corridors.length} Trunks Monitored
          </Badge>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {corridors.map((c) => {
          const corridorDefects = defects.filter((d) => d.corridor_id === c.corridor_id);
          const criticalDefects = corridorDefects.filter((d) => d.severity >= 4);
          const capacityPct = Math.min(100, Math.round((c.avg_daily_trains / 80) * 100));

          return (
            <Card
              key={c.corridor_id}
              className="border-[#1E2D49] bg-[#0D1527] p-6 shadow-xl transition-all hover:border-blue-500/40"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {c.corridor_id}
                    </span>
                    <Badge variant={c.is_high_density ? "warning" : "success"} size="sm">
                      {c.is_high_density ? "High Density Quad-Track" : "Standard Double-Track"}
                    </Badge>
                  </div>
                  <h2 className="mt-2 font-['Outfit',sans-serif] text-xl font-bold text-white">
                    {c.name}
                  </h2>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <span>Division: {c.division}</span>
                    <span>·</span>
                    <span>Zone: {c.zone}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-400 font-mono">Daily Traffic</div>
                  <div className="font-['Outfit',sans-serif] text-2xl font-bold text-white">
                    {c.avg_daily_trains}
                  </div>
                  <div className="text-[10px] text-slate-400">rakes/day</div>
                </div>
              </div>

              {/* Capacity Bar */}
              <div className="mt-5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Line Capacity Utilization</span>
                  <span className="font-mono font-bold text-slate-200">{capacityPct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#080E1C] border border-[#1E2D49]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      capacityPct > 85 ? "bg-amber-400" : "bg-blue-500"
                    }`}
                    style={{ width: `${capacityPct}%` }}
                  />
                </div>
              </div>

              {/* Corridors Details Matrix */}
              <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg border border-[#1E2D49] bg-[#0A1122] p-3 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Max Permissible Speed</span>
                  <div className="mt-0.5 font-bold text-white">130 km/h</div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Open Defects</span>
                  <div className={`mt-0.5 font-bold ${criticalDefects.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {corridorDefects.length} ({criticalDefects.length} critical)
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Signaling Type</span>
                  <div className="mt-0.5 font-bold text-blue-400">Auto 4-Aspect</div>
                </div>
              </div>

              {/* Route Link and Action */}
              <div className="mt-5 flex items-center justify-between border-t border-[#1E2D49]/60 pt-4 text-xs">
                <span className="text-slate-400">
                  {corridorDefects.length > 0
                    ? `${corridorDefects.length} maintenance tasks queued`
                    : "Track clear, no speed restrictions"}
                </span>
                <Link
                  to="/network"
                  className="flex items-center gap-1 font-semibold text-blue-400 hover:text-blue-300"
                >
                  View on Network Radar <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
