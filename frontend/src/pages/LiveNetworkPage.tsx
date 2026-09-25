import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { LiveNetworkMap, MOCK_TRAINS } from "../components/LiveNetworkMap";
import { TrainDetailDrawer, type TrainData } from "../components/TrainDetailDrawer";
import { DefectDetailDrawer } from "../components/DefectDetailDrawer";
import type { Defect } from "../types";
import client from "../api/client";
import { Radio } from "lucide-react";

export default function LiveNetworkPage() {
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);

  useEffect(() => {
    client.get("/defects").then((res) => setDefects(res.data)).catch(() => {});
  }, []);

  return (
    <Layout
      title="Live Railway Network Radar"
      subtitle="Sectional Quad-Track Topology, Automatic Train Position & Possession Geofences"
      fullWidth
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs text-slate-300">
            <span className="font-mono text-emerald-400 font-semibold">{MOCK_TRAINS.length}</span>
            <span>Rakes Tracked</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-mono font-semibold text-emerald-400 border border-emerald-500/20">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            REAL-TIME TELEMETRY
          </div>
        </div>
      }
    >
      <div className="relative h-[calc(100vh-180px)] w-full rounded-xl border border-[#1E2D49] bg-[#080E1C] overflow-hidden shadow-2xl">
        <LiveNetworkMap
          defects={defects}
          onSelectTrain={(train: TrainData) => setSelectedTrain(train)}
          onSelectDefect={(defect: Defect) => setSelectedDefect(defect)}
          selectedTrainId={selectedTrain?.id}
          selectedDefectId={selectedDefect?.task_id}
        />
      </div>

      <TrainDetailDrawer
        train={selectedTrain}
        isOpen={!!selectedTrain}
        onClose={() => setSelectedTrain(null)}
      />

      <DefectDetailDrawer
        defect={selectedDefect}
        isOpen={!!selectedDefect}
        onClose={() => setSelectedDefect(null)}
      />
    </Layout>
  );
}
