import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { Badge } from "../components/ui/Badge";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/Card";
import { TrainDetailDrawer, type TrainData } from "../components/TrainDetailDrawer";
import { MOCK_TRAINS } from "../components/LiveNetworkMap";
import client from "../api/client";
import type { Corridor } from "../types";
import {
  Clock,
  Search,
  ArrowRight,
} from "lucide-react";

interface TimetableSlot {
  id: string;
  train_number: string;
  train_name: string;
  corridor_id: string;
  origin: string;
  destination: string;
  startHour: number; // 0-24
  durationHours: number;
  train_type: string;
  status: "on-time" | "delayed" | "planned";
  delayMin: number;
}

// 24-hour horizontal train schedule visualization data
const SCHEDULED_SLOTS: TimetableSlot[] = [
  {
    id: "slot-22436",
    train_number: "22436",
    train_name: "Vande Bharat Express",
    corridor_id: "COR-01",
    origin: "NDLS",
    destination: "BSB",
    startHour: 6.0,
    durationHours: 3.5,
    train_type: "Vande Bharat",
    status: "on-time",
    delayMin: 0,
  },
  {
    id: "slot-12004",
    train_number: "12004",
    train_name: "Lucknow Shatabdi",
    corridor_id: "COR-01",
    origin: "NDLS",
    destination: "LKO",
    startHour: 6.5,
    durationHours: 4.0,
    train_type: "Rajdhani",
    status: "on-time",
    delayMin: 2,
  },
  {
    id: "slot-12618",
    train_number: "12618",
    train_name: "Mangala Lakshadweep Express",
    corridor_id: "COR-02",
    origin: "NZM",
    destination: "ERS",
    startHour: 9.0,
    durationHours: 5.5,
    train_type: "Superfast",
    status: "delayed",
    delayMin: 24,
  },
  {
    id: "slot-12424",
    train_number: "12424",
    train_name: "Dibrugarh Rajdhani",
    corridor_id: "COR-01",
    origin: "NDLS",
    destination: "DBRG",
    startHour: 16.0,
    durationHours: 4.5,
    train_type: "Rajdhani",
    status: "on-time",
    delayMin: 0,
  },
  {
    id: "slot-12560",
    train_number: "12560",
    train_name: "Shiv Ganga Express",
    corridor_id: "COR-02",
    origin: "NDLS",
    destination: "BSBS",
    startHour: 19.5,
    durationHours: 4.0,
    train_type: "Superfast",
    status: "on-time",
    delayMin: 0,
  },
  {
    id: "slot-frt-1",
    train_number: "58BOXN",
    train_name: "Coal Bulk Rake",
    corridor_id: "COR-01",
    origin: "GZB",
    destination: "CNB",
    startHour: 1.0,
    durationHours: 4.0,
    train_type: "Freight",
    status: "planned",
    delayMin: 0,
  },
  {
    id: "slot-frt-2",
    train_number: "42BCNHL",
    train_name: "Container Goods Rake",
    corridor_id: "COR-02",
    origin: "CNB",
    destination: "DDU",
    startHour: 13.0,
    durationHours: 3.5,
    train_type: "Freight",
    status: "planned",
    delayMin: 0,
  },
];

export default function TimetablePage() {
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [selectedCorridor, setSelectedCorridor] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedTrain, setSelectedTrain] = useState<TrainData | null>(null);
  const [selectedHourWindow, setSelectedHourWindow] = useState<"all" | "morning" | "afternoon" | "evening" | "night">("all");

  useEffect(() => {
    client.get("/corridors").then((r) => setCorridors(r.data)).catch(() => {});
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const filteredSlots = SCHEDULED_SLOTS.filter((slot) => {
    const matchesCorridor = selectedCorridor === "all" || slot.corridor_id === selectedCorridor;
    const matchesSearch =
      search === "" ||
      slot.train_number.includes(search) ||
      slot.train_name.toLowerCase().includes(search.toLowerCase());
    
    let matchesWindow = true;
    if (selectedHourWindow === "morning") matchesWindow = slot.startHour >= 6 && slot.startHour < 12;
    if (selectedHourWindow === "afternoon") matchesWindow = slot.startHour >= 12 && slot.startHour < 17;
    if (selectedHourWindow === "evening") matchesWindow = slot.startHour >= 17 && slot.startHour < 22;
    if (selectedHourWindow === "night") matchesWindow = slot.startHour >= 22 || slot.startHour < 6;

    return matchesCorridor && matchesSearch && matchesWindow;
  });

  const handleSlotClick = (slot: TimetableSlot) => {
    const matched = MOCK_TRAINS.find((t) => t.number === slot.train_number);
    if (matched) {
      setSelectedTrain(matched);
    } else {
      // Fallback object matching TrainData schema
      setSelectedTrain({
        id: slot.id,
        number: slot.train_number,
        name: slot.train_name,
        origin: slot.origin,
        destination: slot.destination,
        corridor_id: slot.corridor_id,
        corridor_name: slot.corridor_id === "COR-01" ? "Delhi — Kanpur High Density" : "Kanpur — Mughalsarai",
        state: slot.status === "delayed" ? "delayed" : "running",
        current_delay: slot.delayMin,
        predicted_delay: slot.delayMin + 4,
        risk_score: slot.delayMin > 0 ? 75 : 12,
        speed_kmh: slot.train_type === "Freight" ? 65 : 110,
        next_station: slot.destination,
        eta_next: "14:30",
        loco_id: "WAP-7 30214",
        train_type: slot.train_type === "Vande Bharat" ? "Vande Bharat" : "Express",
        risk_factors: ["Sectional path cleared", "Quad-track automatic block signaling"],
        recommended_response: "Run on designated path speed envelope.",
        recent_events: [
          { time: `${Math.floor(slot.startHour)}:00`, station: slot.origin, event: "Scheduled departure", status: "normal" },
        ],
      });
    }
  };

  return (
    <Layout
      title="Dynamic Timetable & Corridor Synchronization"
      subtitle="Interactive 24-Hour Time-Space Diagram, Path Reservations & Train Progression"
      fullWidth
      actions={
        <div className="flex items-center gap-3">
          <Badge variant="success" size="sm" pulse>
            IR-COA LIVE SYNC
          </Badge>
        </div>
      }
    >
      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-[#1E2D49] bg-[#0D1527] p-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search train name or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Corridor Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Corridor:</span>
          <select
            value={selectedCorridor}
            onChange={(e) => setSelectedCorridor(e.target.value)}
            className="rounded-lg border border-[#1E2D49] bg-[#080E1C] px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="all">All Corridors</option>
            {corridors.map((c) => (
              <option key={c.corridor_id} value={c.corridor_id}>
                {c.name} ({c.corridor_id})
              </option>
            ))}
          </select>
        </div>

        {/* Time Shift Segment */}
        <div className="flex items-center gap-1 bg-[#080E1C] p-1 rounded-lg border border-[#1E2D49]">
          {(["all", "morning", "afternoon", "evening", "night"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setSelectedHourWindow(w)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                selectedHourWindow === w
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* 24-Hour Horizontal Gantt Timeline Diagram */}
      <Card className="border-[#1E2D49] bg-[#0D1527] shadow-2xl overflow-hidden">
        <CardHeader className="border-b border-[#1E2D49] px-6 py-4 bg-[#0A1122]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                24-Hour Track Occupancy Timeline
              </CardTitle>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Right Time
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Delayed
              </span>
              <span className="flex items-center gap-1.5 text-blue-400">
                <span className="h-2 w-2 rounded-full bg-blue-400" /> Freight Window
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="overflow-x-auto technical-scrollbar pb-4">
            <div className="min-w-[950px]">
              {/* Hour Header Ruler */}
              <div className="grid grid-cols-24 border-b border-[#1E2D49] pb-2 text-[10px] font-mono text-slate-400">
                {hours.map((h) => (
                  <div key={h} className="text-center border-l border-[#1E2D49]/40 first:border-l-0">
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Corridor Track Lines with Train Bars */}
              <div className="mt-4 space-y-6">
                {["COR-01", "COR-02"].map((corridorId) => {
                  const corridorSlots = filteredSlots.filter((s) => s.corridor_id === corridorId);
                  const corridorInfo = corridors.find((c) => c.corridor_id === corridorId);

                  return (
                    <div key={corridorId} className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-blue-400">{corridorId}</span>
                          <span>·</span>
                          <span>{corridorInfo?.name || "Quad-Track Mainline"}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">
                          {corridorSlots.length} paths scheduled
                        </span>
                      </div>

                      {/* Track Strip */}
                      <div className="relative h-16 w-full rounded-lg border border-[#1E2D49] bg-[#080E1C] p-1">
                        {/* Hour vertical guidelines */}
                        <div className="absolute inset-0 grid grid-cols-24 pointer-events-none">
                          {hours.map((h) => (
                            <div
                              key={h}
                              className="border-r border-[#1E2D49]/30 h-full"
                            />
                          ))}
                        </div>

                        {/* Train Movement Horizontal Blocks */}
                        {corridorSlots.map((slot) => {
                          const leftPct = (slot.startHour / 24) * 100;
                          const widthPct = (slot.durationHours / 24) * 100;

                          const colorClass =
                            slot.status === "delayed"
                              ? "bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30"
                              : slot.train_type === "Freight"
                              ? "bg-blue-600/20 border-blue-500/60 text-blue-300 hover:bg-blue-600/30"
                              : "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/30";

                          return (
                            <button
                              key={slot.id}
                              onClick={() => handleSlotClick(slot)}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              className={`absolute top-2 h-11 rounded-md border p-1 text-left text-xs font-mono shadow-sm transition-all z-10 overflow-hidden ${colorClass}`}
                              title={`${slot.train_number} ${slot.train_name} (${slot.origin} -> ${slot.destination})`}
                            >
                              <div className="font-bold truncate text-[11px] leading-tight">
                                {slot.train_number} {slot.train_name.split(" ")[0]}
                              </div>
                              <div className="text-[10px] opacity-80 truncate leading-tight">
                                {slot.origin}→{slot.destination} {slot.delayMin > 0 ? `(+${slot.delayMin}m)` : "RT"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Train Schedule Roster Table */}
      <Card className="border-[#1E2D49] bg-[#0D1527] shadow-xl">
        <CardHeader className="border-b border-[#1E2D49] pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Train Roster & Platform Dispatch List
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto technical-scrollbar">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-[#1E2D49] bg-[#0A1122] text-[11px] text-slate-400">
                <tr>
                  <th className="px-4 py-3">Train #</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Corridor</th>
                  <th className="px-4 py-3">Origin / Destination</th>
                  <th className="px-4 py-3">Scheduled Slot</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2D49]/60">
                {filteredSlots.map((slot) => (
                  <tr
                    key={slot.id}
                    onClick={() => handleSlotClick(slot)}
                    className="cursor-pointer transition-colors hover:bg-[#111C35]"
                  >
                    <td className="px-4 py-3 font-bold text-blue-400">
                      {slot.train_number}
                    </td>
                    <td className="px-4 py-3 font-sans font-semibold text-white">
                      {slot.train_name}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {slot.corridor_id}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {slot.origin} → {slot.destination}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {String(Math.floor(slot.startHour)).padStart(2, "0")}:00 –{" "}
                      {String(Math.floor(slot.startHour + slot.durationHours)).padStart(2, "0")}:00
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral" size="sm">
                        {slot.train_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={slot.status === "delayed" ? "critical" : "success"}
                        size="sm"
                      >
                        {slot.status === "delayed" ? `+${slot.delayMin}m Delay` : "On-Time"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="inline-flex items-center gap-1 font-sans text-blue-400 hover:text-blue-300">
                        Telemetry <ArrowRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TrainDetailDrawer
        train={selectedTrain}
        isOpen={!!selectedTrain}
        onClose={() => setSelectedTrain(null)}
      />
    </Layout>
  );
}
