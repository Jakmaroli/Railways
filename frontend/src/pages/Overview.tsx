import { useEffect, useState } from "react";
import client from "../api/client";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { LiveNetworkMap, MOCK_TRAINS } from "../components/LiveNetworkMap";
import { TrainDetailDrawer, type TrainData } from "../components/TrainDetailDrawer";
import { DefectDetailDrawer } from "../components/DefectDetailDrawer";
import type { Corridor, KpiSummary, ScheduleBlock, Defect, MlInsights } from "../types";
import {
  Train,
  Clock,
  ShieldCheck,
  Activity,
  TrendingDown,
  Cpu,
  Radio,
  AlertOctagon,
  RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// Simulated 24-hour delay progression trend
const DELAY_TREND_DATA = [
  { time: "00:00", avgDelay: 4.2, trains: 12 },
  { time: "03:00", avgDelay: 3.1, trains: 8 },
  { time: "06:00", avgDelay: 6.8, trains: 22 },
  { time: "09:00", avgDelay: 14.5, trains: 38 },
  { time: "12:00", avgDelay: 11.2, trains: 34 },
  { time: "15:00", avgDelay: 9.4, trains: 30 },
  { time: "18:00", avgDelay: 16.8, trains: 42 },
  { time: "21:00", avgDelay: 12.3, trains: 28 },
];

export default function Overview() {
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [mlInsights, setMlInsights] = useState<MlInsights | null>(null);
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const [k, c, s, d, m] = await Promise.all([
        client.get("/dashboard/summary"),
        client.get("/corridors"),
        client.get("/schedule"),
        client.get("/defects"),
        client.get("/dashboard/ml-insights").catch(() => ({ data: null })),
      ]);
      setKpi(k.data);
      setCorridors(c.data);
      setBlocks(s.data);
      setDefects(d.data);
      if (m.data) setMlInsights(m.data);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Compute live operational metrics
  const activeTrainsCount = MOCK_TRAINS.length;
  const delayedTrains = MOCK_TRAINS.filter((t) => t.current_delay > 0);
  const totalDelayMinutes = delayedTrains.reduce((acc, t) => acc + t.current_delay, 0);
  const avgDelayMinutes = activeTrainsCount > 0 ? (totalDelayMinutes / activeTrainsCount).toFixed(1) : "0";
  const criticalDefects = defects.filter((d) => d.severity >= 4 && d.status === "open");
  const onTimePct = kpi?.punctuality_protection_pct ?? 94.2;

  return (
    <Layout
      title="Network Operations Command Center"
      subtitle="Real-Time Section Telemetry, Train Synchronization & Asset Health"
      fullWidth
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-[#1E2D49] bg-[#0E172A] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            Refresh Telemetry
          </button>
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-mono font-semibold text-emerald-400 border border-emerald-500/20">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            LIVE RADAR
          </div>
        </div>
      }
    >
      {/* Top Operational KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active Trains */}
        <Card className="relative overflow-hidden border-[#1E2D49] bg-[#0D1527]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Trains Active
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Train className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold tracking-tight text-white">
              {activeTrainsCount}
            </span>
            <span className="font-mono text-xs text-slate-400">rakes in section</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Activity className="h-3 w-3" />
            <span>100% automated track circuit tracking</span>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 w-full bg-blue-500/50" />
        </Card>

        {/* On-Time Percentage */}
        <Card className="relative overflow-hidden border-[#1E2D49] bg-[#0D1527]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              On-Time Percentage
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold tracking-tight text-emerald-400">
              {onTimePct.toFixed(1)}%
            </span>
            <span className="font-mono text-xs text-emerald-400/80">target &gt; 92%</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="text-emerald-400 font-semibold">+1.8%</span>
            <span>vs previous 24h operational cycle</span>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 w-full bg-emerald-500/50" />
        </Card>

        {/* Active Delays */}
        <Card className="relative overflow-hidden border-[#1E2D49] bg-[#0D1527]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Active Delays
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold tracking-tight text-amber-400">
              {delayedTrains.length}
            </span>
            <span className="font-mono text-xs text-slate-400">
              avg +{avgDelayMinutes}m delay
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400/90">
            <TrendingDown className="h-3 w-3" />
            <span>2 rakes recovering under priority routing</span>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 w-full bg-amber-500/50" />
        </Card>

        {/* Critical Alerts */}
        <Card className="relative overflow-hidden border-[#1E2D49] bg-[#0D1527]/90 p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Critical Alerts
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
              <AlertOctagon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-['Outfit',sans-serif] text-3xl font-bold tracking-tight text-red-400">
              {criticalDefects.length}
            </span>
            <span className="font-mono text-xs text-slate-400">
              {kpi?.open_defects ?? 0} total open defects
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping"></span>
            <span>Requires possession window allocation</span>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 w-full bg-red-500/50" />
        </Card>
      </div>

      {/* Main Command Center Grid: Network Map (Left/Center) + Network Status (Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Left/Center 8 cols: Large Interactive Railway Map */}
        <div className="lg:col-span-8">
          <Card className="border-[#1E2D49] bg-[#0A1122] overflow-hidden shadow-2xl">
            <CardHeader className="border-b border-[#1E2D49] px-5 py-3.5 bg-[#0D1527]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <CardTitle className="text-sm font-semibold tracking-wide text-white">
                    LIVE RAILWAY NETWORK TOPOLOGY
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="sm">
                    Zone: Northern
                  </Badge>
                  <Badge variant="info" size="sm">
                    Quad-Track Trunk
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <LiveNetworkMap
                defects={defects}
                corridors={corridors}
                blocks={blocks}
                onSelectTrain={(train: TrainData) => setSelectedTrain(train)}
                onSelectDefect={(defect: Defect) => setSelectedDefect(defect)}
                selectedTrainId={selectedTrain?.id}
                selectedDefectId={selectedDefect?.task_id}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right 4 cols: Network Status Panel */}
        <div className="lg:col-span-4 space-y-4">
          {/* Corridor Capacity & Density Status */}
          <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl">
            <CardHeader className="border-b border-[#1E2D49] pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Corridor Density & Punctuality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {corridors.slice(0, 4).map((c) => (
                <div
                  key={c.corridor_id}
                  className="rounded-lg border border-[#1E2D49]/70 bg-[#0A1122] p-3 transition-colors hover:border-blue-500/40"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className="font-mono text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                      {c.corridor_id}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Daily load: {c.avg_daily_trains} trains</span>
                    <Badge variant={c.is_high_density ? "warning" : "success"} size="sm">
                      {c.is_high_density ? "High Density" : "Normal"}
                    </Badge>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        c.is_high_density ? "bg-amber-400" : "bg-emerald-400"
                      }`}
                      style={{
                        width: `${Math.min(100, (c.avg_daily_trains / 80) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Active Maintenance Blocks */}
          <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl">
            <CardHeader className="border-b border-[#1E2D49] pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Possession Windows
                </CardTitle>
                <span className="font-mono text-[11px] text-blue-400">
                  {blocks.length} Scheduled
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-3">
              {blocks.length > 0 ? (
                blocks.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-start justify-between rounded-lg border border-[#1E2D49]/70 bg-[#0A1122] p-2.5 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-amber-400">
                          {b.possession_number || `BLK-#${b.id}`}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {b.corridor_id}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        Slot: {b.slot_start} – {b.slot_end} ({b.date})
                      </div>
                    </div>
                    <Badge variant={b.status === "completed" ? "success" : "warning"} size="sm">
                      {b.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-xs text-slate-400">
                  No possession blocks active in current shift.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Section: Delay Trend, Active Operational Alerts & AI Insights */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
        {/* Left 5 cols: 24h Delay Trend Chart */}
        <div className="lg:col-span-5">
          <Card className="h-full border-[#1E2D49] bg-[#0D1527] shadow-xl">
            <CardHeader className="border-b border-[#1E2D49] pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Network Delay Trend (24h)
                  </CardTitle>
                  <p className="text-[11px] text-slate-400">
                    Average delay in minutes across quad-track sections
                  </p>
                </div>
                <Badge variant="neutral" size="sm">
                  Recharts Analytics
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={DELAY_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="delayColor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2D49" vertical={false} />
                    <XAxis
                      dataKey="time"
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#1E2D49" }}
                    />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `${val}m`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0A1122",
                        borderColor: "#1E2D49",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "#F8FAFC",
                      }}
                      formatter={(val: any) => [`${val} min`, "Avg Delay"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="avgDelay"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#delayColor)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center 4 cols: Active Operational Alerts */}
        <div className="lg:col-span-4">
          <Card className="h-full border-[#1E2D49] bg-[#0D1527] shadow-xl">
            <CardHeader className="border-b border-[#1E2D49] pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Active Alerts & Speed Restrictions
                </CardTitle>
                <span className="font-mono text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                  3 ACTIONABLE
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-red-400">TSR 45 km/h Caution Order</span>
                  <span className="font-mono text-[10px] text-red-300">10:14 IST</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  Km 124/2 UP Line near Fatehpur: Ultrasonic rail flaw detected by TDMS.
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Affects: 12618 Mangala Exp</span>
                  <span className="text-red-400 font-semibold">Priority: 8.4</span>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-amber-400">Quad-Track Signal Dwell</span>
                  <span className="font-mono text-[10px] text-amber-300">09:50 IST</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  Ghaziabad Outer: Freight rake 58BOXN held on loop to clear Vande Bharat 22436.
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>Corridor: COR-01</span>
                  <span className="text-amber-400 font-semibold">Dwell: 14 min</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 3 cols: AI Operational Insights */}
        <div className="lg:col-span-3">
          <Card className="h-full border-[#1E2D49] bg-[#0D1527] shadow-xl">
            <CardHeader className="border-b border-[#1E2D49] pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-400" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  AI Risk Engine
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-blue-400">Scoring Engine</span>
                  <Badge variant="success" size="sm">
                    {mlInsights?.engine?.loaded ? "Generalization" : "Rule-Based"}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-slate-300 leading-relaxed">
                  Dual-objective priority model balances safety criticality against passenger train punctuality protection.
                </p>
              </div>

              <div className="space-y-1.5 rounded-lg border border-[#1E2D49] bg-[#0A1122] p-3 text-xs">
                <div className="text-[11px] font-semibold text-slate-300">Operational Suggestion:</div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Merge Task #{defects[0]?.task_id || "101"} with planned night possession on COR-01 to avoid a 32-minute corridor bottleneck.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Slide-over Inspection Drawers */}
      <TrainDetailDrawer
        train={selectedTrain}
        isOpen={!!selectedTrain}
        onClose={() => setSelectedTrain(null)}
      />

      <DefectDetailDrawer
        defect={selectedDefect}
        isOpen={!!selectedDefect}
        onClose={() => setSelectedDefect(null)}
        onRefresh={loadData}
      />
    </Layout>
  );
}
