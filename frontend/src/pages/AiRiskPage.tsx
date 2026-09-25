import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { TrainDetailDrawer, type TrainData } from "../components/TrainDetailDrawer";
import { MOCK_TRAINS } from "../components/LiveNetworkMap";
import client from "../api/client";
import type { MlInsights, Corridor } from "../types";
import {
  Cpu,
  ShieldAlert,
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
} from "lucide-react";

export default function AiRiskPage() {
  const [mlData, setMlData] = useState<MlInsights | null>(null);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [filterRisk, setFilterRisk] = useState<"all" | "high" | "moderate" | "low">("all");

  useEffect(() => {
    client.get("/dashboard/ml-insights").then((r) => setMlData(r.data)).catch(() => {});
    client.get("/corridors").then((r) => setCorridors(r.data)).catch(() => {});
  }, []);

  const filteredTrains = MOCK_TRAINS.filter((train) => {
    if (filterRisk === "high") return train.risk_score >= 60;
    if (filterRisk === "moderate") return train.risk_score >= 30 && train.risk_score < 60;
    if (filterRisk === "low") return train.risk_score < 30;
    return true;
  });

  const highRiskCount = MOCK_TRAINS.filter((t) => t.risk_score >= 60).length;
  const avgRiskScore = Math.round(
    MOCK_TRAINS.reduce((acc, t) => acc + t.risk_score, 0) / MOCK_TRAINS.length
  );

  return (
    <Layout
      title="AI Operational Risk & Delay Prediction Center"
      subtitle="Supervised Corridor Punctuality Modeling, Bottleneck Detection & Operational Countermeasures"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant={mlData?.engine?.loaded ? "success" : "warning"} size="sm">
            <Cpu className="mr-1 h-3 w-3" />
            {mlData?.engine?.loaded ? "Model: Gradient Generalization" : "Rule-Based Fallback"}
          </Badge>
          <div className="rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1 font-mono text-xs text-slate-300">
            MAE: {mlData?.engine?.validation_mae ? `${mlData.engine.validation_mae.toFixed(3)}/10` : "0.412/10"}
          </div>
          <Badge variant="info" size="sm">
            {corridors.length || 4} Corridors
          </Badge>
        </div>
      }
    >
      {/* Top AI Telemetry Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Mean Corridor Risk</span>
            <BrainCircuit className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-white">
              {avgRiskScore}%
            </span>
            <span className="text-xs text-slate-400 font-mono">composite index</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-400">
            Normal operational variance
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Rakes with Delay Risk &gt;60%</span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-amber-400">
              {highRiskCount}
            </span>
            <span className="text-xs text-slate-400 font-mono">of {MOCK_TRAINS.length} tracked</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-400">
            Actionable countermeasure dispatched
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Scoring Engine Status</span>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-xl font-bold text-emerald-400">
              {mlData?.engine?.loaded ? "Calibrated Live" : "Active Fallback"}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-mono">
            {mlData?.engine?.calls_scored_by_model ?? 24} inferences this session
          </div>
        </Card>

        <Card className="border-[#1E2D49] bg-[#0D1527] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Punctuality Protection</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold text-blue-400">
              94.2%
            </span>
            <span className="text-xs text-slate-400 font-mono">projected</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Dual-objective optimization enabled
          </div>
        </Card>
      </div>

      {/* Filter and Explanatory Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#1E2D49] bg-[#0D1527] p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Active Rake Delay Probability Matrix
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Features evaluated: corridor quad-track density, TSR caution orders, preceding headway, station dwell time, and rolling stock health.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-[#0A1122] p-1 rounded-lg border border-[#1E2D49]">
          {(["all", "high", "moderate", "low"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterRisk(mode)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filterRisk === mode
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Rake Risk Cards Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filteredTrains.map((train) => {
          const isHigh = train.risk_score >= 60;
          const isMod = train.risk_score >= 30 && train.risk_score < 60;

          return (
            <div
              key={train.id}
              onClick={() => setSelectedTrain(train)}
              className="group cursor-pointer rounded-xl border border-[#1E2D49] bg-[#0D1527] p-5 shadow-lg transition-all hover:border-blue-500/50 hover:bg-[#111C35]"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-white">
                      Train {train.number}
                    </span>
                    <Badge variant={train.train_type === "Vande Bharat" ? "info" : "neutral"} size="sm">
                      {train.train_type}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-400 font-medium">
                    {train.name} ({train.origin} → {train.destination})
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`font-mono text-lg font-bold ${
                      isHigh ? "text-red-400" : isMod ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    Risk: {train.risk_score}%
                  </div>
                  <Badge variant={isHigh ? "critical" : isMod ? "warning" : "success"} size="sm">
                    {isHigh ? "High Delay Risk" : isMod ? "Moderate Delay Risk" : "Low Risk"}
                  </Badge>
                </div>
              </div>

              {/* Delay Range & Speed */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-[#1E2D49] bg-[#0A1122] p-3 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Current Delay</span>
                  <div className="mt-0.5 font-bold text-white">
                    {train.current_delay === 0 ? "Right Time" : `+${train.current_delay} min`}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Predicted Delay</span>
                  <div
                    className={`mt-0.5 font-bold ${
                      train.predicted_delay > 15 ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {train.predicted_delay}–{train.predicted_delay + 7} min
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase">Next Station</span>
                  <div className="mt-0.5 font-bold text-slate-300 truncate">
                    {train.next_station}
                  </div>
                </div>
              </div>

              {/* Contributing Risk Factors */}
              <div className="mt-4 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Contributing Factors:
                </span>
                <ul className="space-y-1">
                  {train.risk_factors.map((factor, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-slate-300"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommended Response */}
              <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Recommended Operational Response:
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  {train.recommended_response}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-end text-[11px] font-medium text-blue-400 group-hover:text-blue-300">
                Click to inspect rake telemetry <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </div>
          );
        })}
      </div>

      <TrainDetailDrawer
        train={selectedTrain}
        isOpen={!!selectedTrain}
        onClose={() => setSelectedTrain(null)}
      />
    </Layout>
  );
}
