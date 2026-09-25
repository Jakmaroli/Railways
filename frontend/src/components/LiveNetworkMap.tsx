import { useState, useMemo } from "react";
import { 
  Train,
  Search, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  AlertTriangle, 
  Radio, 
} from "lucide-react";
import { Badge } from "./ui/Badge";
import type { TrainData } from "./TrainDetailDrawer";
import type { Corridor, Defect, ScheduleBlock } from "../types";

// Standard Indian Railways demo trains synchronized with corridor topology
export const MOCK_TRAINS: TrainData[] = [
  {
    id: "TR-22436",
    number: "22436",
    name: "Vande Bharat Express",
    origin: "New Delhi (NDLS)",
    destination: "Varanasi (BSB)",
    corridor_id: "COR-01",
    corridor_name: "Delhi — Kanpur High Density",
    state: "running",
    current_delay: 0,
    predicted_delay: 4,
    risk_score: 18,
    speed_kmh: 130,
    next_station: "Aligarh Jn (ALJN)",
    eta_next: "10:42",
    loco_id: "WAP-7 30452",
    train_type: "Vande Bharat",
    risk_factors: ["Minor track packing at Km 88", "Clear signal aspect ahead"],
    recommended_response: "Maintain priority green wave through Ghaziabad quad-track section.",
    recent_events: [
      { time: "10:15", station: "Ghaziabad (GZB)", event: "Right time throughput (+0m)", status: "normal" },
      { time: "09:55", station: "Anand Vihar (ANVT)", event: "Speed 110 km/h steady", status: "normal" },
      { time: "09:30", station: "New Delhi (NDLS)", event: "Departed PF-1 on schedule", status: "normal" },
    ],
  },
  {
    id: "TR-12618",
    number: "12618",
    name: "Mangala Lakshadweep Express",
    origin: "Hazrat Nizamuddin (NZM)",
    destination: "Ernakulam (ERS)",
    corridor_id: "COR-02",
    corridor_name: "Kanpur — Mughalsarai",
    state: "delayed",
    current_delay: 24,
    predicted_delay: 38,
    risk_score: 82,
    speed_kmh: 54,
    next_station: "Fatehpur (FTP)",
    eta_next: "11:15",
    loco_id: "WAP-4 22541",
    train_type: "Superfast",
    risk_factors: [
      "Corridor congestion due to upstream freight loop siding",
      "Ultrasonic weld flaw detected near Km 124",
      "High ambient track temperature TSR 45 km/h",
    ],
    recommended_response:
      "Loop freight rake at Malwan loop siding to clear main line; deconflict slot with approaching 12002 Shatabdi.",
    recent_events: [
      { time: "10:48", station: "Kanpur Central (CNB)", event: "Dwell extended by 14m for rake inspection", status: "warning" },
      { time: "10:10", station: "Rura (RRH)", event: "Speed restriction 45 km/h observed", status: "warning" },
      { time: "09:20", station: "Etawah Jn (ETW)", event: "Signal held at caution", status: "critical" },
    ],
  },
  {
    id: "TR-12002",
    number: "12002",
    name: "Bhopal Shatabdi Express",
    origin: "New Delhi (NDLS)",
    destination: "Rani Kamalapati (RKMP)",
    corridor_id: "COR-03",
    corridor_name: "Mumbai — Surat High Density",
    state: "running",
    current_delay: 6,
    predicted_delay: 8,
    risk_score: 42,
    speed_kmh: 120,
    next_station: "Mathura Jn (MTJ)",
    eta_next: "10:55",
    loco_id: "WAP-7 37012",
    train_type: "Rajdhani",
    risk_factors: ["Station dwell overstay at Agra Cantt expected", "S&T signal tuning near Palwal"],
    recommended_response: "Authorize speed upgrade to 130 km/h between Kosi Kalan and Mathura.",
    recent_events: [
      { time: "10:20", station: "Faridabad (FDB)", event: "Passed at 120 km/h (+6m delay)", status: "normal" },
      { time: "09:40", station: "Nizamuddin (NZM)", event: "Right time departure", status: "normal" },
    ],
  },
  {
    id: "TR-FRT-904",
    number: "BOXN-904",
    name: "Coal Heavy Rake (E.R.)",
    origin: "Asansol (ASN)",
    destination: "Dadri Thermal (DER)",
    corridor_id: "COR-04",
    corridor_name: "Howrah — Asansol Quad Track",
    state: "dwell",
    current_delay: 15,
    predicted_delay: 20,
    risk_score: 55,
    speed_kmh: 0,
    next_station: "Durgapur (DGR)",
    eta_next: "11:30",
    loco_id: "WAG-9 31244",
    train_type: "Freight Rake",
    risk_factors: ["Precedence given to Vande Bharat rake", "Hot axle detector caution cleared"],
    recommended_response: "Hold in goods loop until Down fast mail express clears block section.",
    recent_events: [
      { time: "10:30", station: "Andal Yard (UDL)", event: "Rake stopped at outer signal", status: "warning" },
      { time: "09:50", station: "Raniganj (RNG)", event: "Cruising 65 km/h", status: "normal" },
    ],
  },
  {
    id: "TR-12952",
    number: "12952",
    name: "Mumbai Rajdhani Express",
    origin: "New Delhi (NDLS)",
    destination: "Mumbai Central (MMCT)",
    corridor_id: "COR-01",
    corridor_name: "Delhi — Kanpur High Density",
    state: "running",
    current_delay: 2,
    predicted_delay: 3,
    risk_score: 22,
    speed_kmh: 128,
    next_station: "Tundla Jn (TDL)",
    eta_next: "11:05",
    loco_id: "WAP-7 30201",
    train_type: "Rajdhani",
    risk_factors: ["Clear block section", "Nominal catenary tension on OHE"],
    recommended_response: "Maintain automatic block signaling throughput.",
    recent_events: [
      { time: "10:10", station: "Aligarh (ALJN)", event: "Through run on Main Line", status: "normal" },
    ],
  }
];

interface LiveNetworkMapProps {
  corridors?: Corridor[];
  defects?: Defect[];
  blocks?: ScheduleBlock[];
  onSelectTrain: (train: TrainData) => void;
  onSelectDefect?: (defect: Defect) => void;
  selectedTrainId?: string;
  selectedDefectId?: number;
  className?: string;
  isFullScreen?: boolean;
}

export function LiveNetworkMap({
  corridors = [],
  defects = [],
  blocks = [],
  onSelectTrain,
  onSelectDefect,
  selectedTrainId,
  selectedDefectId,
  className,
  isFullScreen = false,
}: LiveNetworkMapProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showPossessions, setShowPossessions] = useState(true);

  // Filtered trains
  const filteredTrains = useMemo(() => {
    return MOCK_TRAINS.filter((t) => {
      const matchSearch =
        t.number.includes(search) ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.corridor_id.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterType === "delayed") return t.state === "delayed" || t.current_delay > 10;
      if (filterType === "vande_bharat") return t.train_type === "Vande Bharat";
      if (filterType === "freight") return t.train_type === "Freight Rake";
      return true;
    });
  }, [search, filterType]);

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border border-(--color-line) bg-(--color-ink) text-(--color-paper) shadow-md ${
        isFullScreen ? "h-[calc(100vh-140px)]" : "h-[540px]"
      } ${className ?? ""}`}
    >
      {/* Top Map Control Bar */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-(--color-line) bg-(--color-surface)/95 px-4 py-2.5 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-(--color-primary) animate-pulse" />
            <span className="font-(family-name:--font-display) text-sm font-semibold tracking-tight text-(--color-paper)">
              Live Railway Network
            </span>
          </div>
          <Badge variant="info" size="sm" pulse>
            {filteredTrains.length} Feeds · {corridors.length || 2} Corridors
          </Badge>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-steel)" />
            <input
              type="text"
              placeholder="Search train / corridor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 rounded-lg border border-(--color-line) bg-(--color-panel) pl-8 pr-3 text-xs text-(--color-paper) placeholder-(--color-steel) outline-none focus:border-(--color-primary)"
            />
          </div>

          <div className="flex items-center rounded-lg border border-(--color-line) bg-(--color-panel) p-0.5">
            {[
              { id: "all", label: "All" },
              { id: "delayed", label: "Delayed" },
              { id: "vande_bharat", label: "Vande Bharat" },
              { id: "freight", label: "Freight" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  filterType === f.id
                    ? "bg-(--color-primary) text-white"
                    : "text-(--color-steel) hover:text-(--color-paper)"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Toggle Layers */}
          <button
            onClick={() => setShowIncidents((prev) => !prev)}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs transition-colors ${
              showIncidents
                ? "border-(--color-signal-red)/40 bg-(--color-signal-red-dim)/60 text-(--color-signal-red)"
                : "border-(--color-line) text-(--color-steel) hover:bg-(--color-panel)"
            }`}
            title="Toggle Defect & Incident Markers"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Defects</span>
          </button>

          <button
            onClick={() => setShowPossessions((prev) => !prev)}
            className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs transition-colors ${
              showPossessions
                ? "border-blue-500/40 bg-blue-500/20 text-blue-400"
                : "border-(--color-line) text-(--color-steel) hover:bg-(--color-panel)"
            }`}
            title="Toggle Possession Blocks"
          >
            <Radio className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Blocks ({blocks.length})</span>
          </button>

          {/* Zoom controls */}
          <div className="flex items-center rounded-lg border border-(--color-line) bg-(--color-panel)">
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
              className="p-1.5 text-(--color-steel) hover:text-(--color-paper)"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
              className="p-1.5 text-(--color-steel) hover:text-(--color-paper)"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1.5 text-(--color-steel) hover:text-(--color-paper)"
              title="Reset View"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas Map Area */}
      <div className="railway-grid relative flex-1 overflow-auto bg-(--color-ink) p-6">
        <div
          className="relative min-h-[460px] min-w-[850px] transition-transform duration-200"
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top left" }}
        >
          {/* Radar scan ring in top corner */}
          <div className="pointer-events-none absolute right-4 top-4 h-48 w-48 rounded-full border border-(--color-line)/30 overflow-hidden opacity-30">
            <div className="radar-sweep h-full w-full" />
          </div>

          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 920 480">
            {/* Defs for gradients & filters */}
            <defs>
              <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#1E3A8A" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="delayedTrackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#B91C1C" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* TRACK 1: Delhi — Kanpur — Mughalsarai (Main Trunk Route) */}
            <path
              d="M 60 140 L 260 140 L 520 200 L 820 200"
              fill="none"
              stroke="#1E2D4A"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 60 140 L 260 140 L 520 200 L 820 200"
              fill="none"
              stroke="url(#trackGrad)"
              strokeWidth="2.5"
              strokeDasharray="6 4"
            />

            {/* TRACK 2: Mumbai — Surat — Vadodara — Delhi */}
            <path
              d="M 120 420 L 280 340 L 440 280 L 260 140"
              fill="none"
              stroke="#1E2D4A"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 120 420 L 280 340 L 440 280 L 260 140"
              fill="none"
              stroke="#38BDF8"
              strokeWidth="2"
              strokeOpacity="0.7"
            />

            {/* TRACK 3: Howrah — Asansol — Mughalsarai */}
            <path
              d="M 820 200 L 740 320 L 860 400"
              fill="none"
              stroke="#1E2D4A"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M 820 200 L 740 320 L 860 400"
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeOpacity="0.8"
            />

            {/* Active Possession Block Shadow (Delhi-Kanpur Section near Km 114) */}
            {showPossessions && (
              <g>
                <path
                  d="M 330 157 L 430 180"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="8"
                  strokeOpacity="0.5"
                  strokeLinecap="round"
                />
                <text x="350" y="150" fill="#F59E0B" fontSize="10" fontFamily="IBM Plex Mono">
                  [SHADOW BLOCK PN-2026-004]
                </text>
              </g>
            )}

            {/* Station Nodes */}
            {[
              { id: "NDLS", name: "New Delhi", code: "NDLS", x: 60, y: 140, type: "hub" },
              { id: "ALJN", name: "Aligarh Jn", code: "ALJN", x: 260, y: 140, type: "junction" },
              { id: "CNB", name: "Kanpur Central", code: "CNB", x: 520, y: 200, type: "hub" },
              { id: "DDU", name: "Pt Deen Dayal Upadhyaya", code: "DDU", x: 820, y: 200, type: "hub" },
              { id: "BCT", name: "Mumbai Central", code: "MMCT", x: 120, y: 420, type: "hub" },
              { id: "ST", name: "Surat", code: "ST", x: 280, y: 340, type: "junction" },
              { id: "BRC", name: "Vadodara", code: "BRC", x: 440, y: 280, type: "junction" },
              { id: "ASN", name: "Asansol Jn", code: "ASN", x: 740, y: 320, type: "junction" },
              { id: "HWH", name: "Howrah Jn", code: "HWH", x: 860, y: 400, type: "hub" },
            ].map((stn) => (
              <g key={stn.id} className="cursor-pointer group">
                <circle
                  cx={stn.x}
                  cy={stn.y}
                  r={stn.type === "hub" ? 7 : 5}
                  fill={stn.type === "hub" ? "#3B82F6" : "#0F1A30"}
                  stroke="#EDF3FA"
                  strokeWidth="2"
                />
                {stn.type === "hub" && (
                  <circle
                    cx={stn.x}
                    cy={stn.y}
                    r="12"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="1.5"
                    strokeOpacity="0.4"
                    className="animate-ping"
                  />
                )}
                <text
                  x={stn.x}
                  y={stn.y - 12}
                  textAnchor="middle"
                  fill="#EDF3FA"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="Space Grotesk"
                >
                  {stn.code}
                </text>
                <text
                  x={stn.x}
                  y={stn.y + 18}
                  textAnchor="middle"
                  fill="#778CA5"
                  fontSize="9"
                  fontFamily="IBM Plex Sans"
                >
                  {stn.name}
                </text>
              </g>
            ))}

            {/* Defect / Incident Markers on Track */}
            {showIncidents && (
              <g>
                <g
                  className="cursor-pointer"
                  transform="translate(380, 160)"
                  onClick={() => {
                    const d = defects.find((x) => x.task_id === 14) || {
                      task_id: 14,
                      source_system: "TMS",
                      asset_id: "TRK-4471",
                      corridor_id: "COR-01",
                      defect_type: "Rail fracture",
                      severity: 5,
                      date_reported: "2026-09-24",
                      due_date: "2026-09-26",
                      estimated_block_duration: 3,
                      department: "TMS",
                      location_marker: "Km 124/2 UP",
                      recurrence_count: 2,
                      status: "open" as const,
                      priority_score: 9.4,
                      health_score: 28,
                    };
                    if (onSelectDefect) onSelectDefect(d);
                  }}
                >
                  <circle cx="0" cy="0" r={selectedDefectId === 14 ? 14 : 10} fill="#EF4444" fillOpacity="0.25" className="animate-ping" />
                  <circle cx="0" cy="0" r="5" fill="#EF4444" stroke={selectedDefectId === 14 ? "#FBBF24" : "#FFF"} strokeWidth={selectedDefectId === 14 ? 2 : 1} />
                  <text x="12" y="3" fill="#EF4444" fontSize="10" fontFamily="IBM Plex Mono" fontWeight="600">
                    Rail Fracture (#14)
                  </text>
                </g>

                <g
                  className="cursor-pointer"
                  transform="translate(680, 200)"
                  onClick={() => {
                    const d = defects.find((x) => x.task_id === 18) || {
                      task_id: 18,
                      source_system: "TDMS",
                      asset_id: "OHE-9102",
                      corridor_id: "COR-02",
                      defect_type: "OHE Dropper fatigue",
                      severity: 3,
                      date_reported: "2026-09-23",
                      due_date: "2026-09-28",
                      estimated_block_duration: 2,
                      department: "TDMS",
                      location_marker: "Km 340/8",
                      recurrence_count: 1,
                      status: "open" as const,
                      priority_score: 6.8,
                      health_score: 55,
                    };
                    if (onSelectDefect) onSelectDefect(d);
                  }}
                >
                  <circle cx="0" cy="0" r={selectedDefectId === 18 ? 12 : 8} fill="#F59E0B" fillOpacity="0.25" />
                  <circle cx="0" cy="0" r="4" fill="#F59E0B" stroke={selectedDefectId === 18 ? "#FBBF24" : "#FFF"} strokeWidth={selectedDefectId === 18 ? 2 : 1} />
                  <text x="10" y="3" fill="#F59E0B" fontSize="9" fontFamily="IBM Plex Mono">
                    OHE Dropper (#18)
                  </text>
                </g>
              </g>
            )}
          </svg>

          {/* Render Moving Interactive Trains along Coordinates */}
          <div className="absolute inset-0 pointer-events-none">
            {filteredTrains.map((train, idx) => {
              // Deterministic coordinates based on route
              const coords = [
                { x: 190, y: 125 }, // Vande Bharat (NDLS-ALJN)
                { x: 420, y: 165 }, // Mangala Lakshadweep (Delayed near Kanpur)
                { x: 260, y: 325 }, // Shatabdi (Surat segment)
                { x: 740, y: 305 }, // Freight (Asansol yard)
                { x: 300, y: 135 }, // Mumbai Rajdhani
              ][idx % 5];

              const isSelected = selectedTrainId === train.id;

              return (
                <div
                  key={train.id}
                  style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
                  onClick={() => onSelectTrain(train)}
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group transition-transform hover:scale-110 ${
                    isSelected ? "scale-125 z-30" : "z-10"
                  }`}
                >
                  {/* Pulse Ring */}
                  <span
                    className={`absolute -inset-1.5 rounded-full opacity-60 animate-ping ${
                      train.state === "delayed" ? "bg-red-500" : "bg-blue-500"
                    }`}
                  />

                  {/* Train Marker Icon */}
                  <div
                    className={`relative flex items-center gap-1.5 rounded-lg border px-2 py-1 shadow-lg backdrop-blur-md transition-all ${
                      train.state === "delayed"
                        ? "border-(--color-signal-red) bg-(--color-surface)/95 text-(--color-signal-red)"
                        : "border-(--color-primary) bg-(--color-surface)/95 text-(--color-paper)"
                    } ${isSelected ? "ring-2 ring-blue-400" : ""}`}
                  >
                    <Train className={`h-3.5 w-3.5 ${train.state === "delayed" ? "text-(--color-signal-red)" : "text-(--color-cyan)"}`} />
                    <span className="font-(family-name:--font-mono) text-[11px] font-bold">
                      {train.number}
                    </span>
                    {train.current_delay > 0 && (
                      <span className="text-[10px] font-bold text-(--color-signal-red)">
                        +{train.current_delay}m
                      </span>
                    )}
                  </div>

                  {/* Hover Hovercard Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 w-52 rounded-xl border border-(--color-line) bg-(--color-panel-raised) p-3 text-xs shadow-2xl group-hover:block">
                    <div className="font-(family-name:--font-display) font-semibold text-(--color-paper)">
                      {train.name}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-(--color-steel)">
                      <span>Route: {train.corridor_id}</span>
                      <span className="font-bold text-(--color-paper)">{train.speed_kmh} km/h</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between border-t border-(--color-line)/60 pt-1.5 text-[11px]">
                      <span>Delay: <strong className={train.current_delay > 0 ? "text-(--color-signal-red)" : "text-(--color-signal-green)"}>{train.current_delay}m</strong></span>
                      <span>Risk: <strong className={train.risk_score > 60 ? "text-(--color-signal-red)" : "text-(--color-signal-amber)"}>{train.risk_score}%</strong></span>
                    </div>
                    <div className="mt-1 text-[10px] text-(--color-cyan)">Click to inspect live telemetry & AI drawer</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Map Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-(--color-line) bg-(--color-surface) px-4 py-2 text-[11px] font-(family-name:--font-mono) text-(--color-steel)">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-(--color-signal-green)" /> Right Time / Running
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-(--color-signal-red)" /> Delay &gt; 15 min
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-(--color-cyan)" /> Station Dwell
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-xs bg-(--color-signal-amber)" /> Shadow Block Section
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-(--color-signal-red) animate-pulse" /> Track Defect
          </span>
        </div>
        <div>
          <span>Corridor Topology: </span>
          <span className="text-(--color-paper)">Northern & Western Trunk Quad-Tracks</span>
        </div>
      </div>
    </div>
  );
}
