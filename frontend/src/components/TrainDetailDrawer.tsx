import { Drawer } from "./ui/Drawer";
import { Badge } from "./ui/Badge";
import { 
  MapPin, 
  Clock, 
  Radio, 
  ArrowRight,
  TrendingUp,
  Cpu
} from "lucide-react";

export interface TrainData {
  id: string;
  number: string;
  name: string;
  origin: string;
  destination: string;
  corridor_id: string;
  corridor_name: string;
  state: "running" | "delayed" | "dwell" | "held";
  current_delay: number; // minutes
  predicted_delay: number; // minutes
  risk_score: number; // 0 to 100%
  speed_kmh: number;
  next_station: string;
  eta_next: string;
  loco_id: string;
  train_type: "Vande Bharat" | "Rajdhani" | "Superfast" | "Express" | "Freight Rake";
  risk_factors: string[];
  recommended_response: string;
  recent_events: { time: string; station: string; event: string; status: "normal" | "warning" | "critical" }[];
}

interface TrainDetailDrawerProps {
  train: TrainData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TrainDetailDrawer({ train, isOpen, onClose }: TrainDetailDrawerProps) {
  if (!train) return null;

  const stateVariant =
    train.state === "running"
      ? "success"
      : train.state === "delayed"
      ? "critical"
      : train.state === "dwell"
      ? "info"
      : "warning";

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${train.number} · ${train.name}`}
      subtitle={`${train.train_type} · Loco: ${train.loco_id}`}
      badge={
        <Badge variant={stateVariant} pulse={train.state === "running" || train.state === "delayed"}>
          {train.state}
        </Badge>
      }
    >
      {/* Route Header */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 font-medium text-(--color-paper)">
            <MapPin className="h-4 w-4 text-(--color-primary)" />
            <span>{train.origin}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-(--color-steel)">
            <ArrowRight className="h-3.5 w-3.5 text-(--color-cyan)" />
            <span>{train.corridor_id}</span>
          </div>
          <div className="flex items-center gap-2 font-medium text-(--color-paper)">
            <MapPin className="h-4 w-4 text-(--color-signal-amber)" />
            <span>{train.destination}</span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-(--color-line)/60 pt-2 text-xs font-(family-name:--font-mono) text-(--color-steel)">
          <span>Next: <strong className="text-(--color-paper)">{train.next_station}</strong></span>
          <span>ETA: <strong className="text-(--color-cyan)">{train.eta_next}</strong></span>
          <span>Speed: <strong className="text-(--color-paper)">{train.speed_kmh} km/h</strong></span>
        </div>
      </div>

      {/* Delay & Prediction Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3.5">
          <div className="flex items-center justify-between text-xs text-(--color-steel)">
            <span>Current Delay</span>
            <Clock className="h-3.5 w-3.5" />
          </div>
          <div className={`mt-1 font-(family-name:--font-display) text-xl font-bold ${
            train.current_delay > 15 ? "text-(--color-signal-red)" : train.current_delay > 0 ? "text-(--color-signal-amber)" : "text-(--color-signal-green)"
          }`}>
            {train.current_delay === 0 ? "Right Time" : `+${train.current_delay} min`}
          </div>
          <div className="mt-0.5 text-[11px] text-(--color-steel)">Live COA feed tracking</div>
        </div>

        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3.5">
          <div className="flex items-center justify-between text-xs text-(--color-steel)">
            <span>Predicted Delay</span>
            <Cpu className="h-3.5 w-3.5 text-(--color-primary)" />
          </div>
          <div className="mt-1 font-(family-name:--font-display) text-xl font-bold text-(--color-signal-amber)">
            {train.predicted_delay > 0 ? `+${train.predicted_delay} min` : "On Schedule"}
          </div>
          <div className="mt-0.5 text-[11px] text-(--color-steel)">SIH AI downstream model</div>
        </div>
      </div>

      {/* AI Risk Score & Contributing Factors */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-(--color-primary)" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-fog)">
              Operational Risk Level
            </h4>
          </div>
          <span className={`font-(family-name:--font-mono) text-sm font-bold ${
            train.risk_score >= 70 ? "text-(--color-signal-red)" : train.risk_score >= 40 ? "text-(--color-signal-amber)" : "text-(--color-signal-green)"
          }`}>
            {train.risk_score}% Risk
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full rounded-full bg-(--color-line)">
          <div
            className={`h-2 rounded-full transition-all ${
              train.risk_score >= 70 ? "bg-(--color-signal-red)" : train.risk_score >= 40 ? "bg-(--color-signal-amber)" : "bg-(--color-signal-green)"
            }`}
            style={{ width: `${train.risk_score}%` }}
          />
        </div>

        {/* Factors */}
        <div>
          <div className="text-[11px] font-medium text-(--color-steel) uppercase tracking-wider mb-1.5">
            Key Contributing Factors
          </div>
          <div className="space-y-1">
            {train.risk_factors.map((factor, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-(--color-paper)">
                <span className="h-1.5 w-1.5 rounded-full bg-(--color-signal-amber)" />
                <span>{factor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendation */}
        <div className="rounded-lg border border-(--color-primary)/30 bg-(--color-signal-blue-dim)/40 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-(--color-cyan)">
            <Radio className="h-3.5 w-3.5" />
            <span>Recommended Controller Action</span>
          </div>
          <p className="mt-1 text-xs text-(--color-paper)">
            {train.recommended_response}
          </p>
        </div>
      </div>

      {/* Recent Telemetry & Events */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-steel)">
          Telemetry & Corridor Events
        </h4>
        <div className="space-y-2">
          {train.recent_events.map((event, idx) => (
            <div
              key={idx}
              className="flex items-start justify-between rounded-lg border border-(--color-line)/60 bg-(--color-surface) p-2.5 text-xs"
            >
              <div className="space-y-0.5">
                <div className="font-medium text-(--color-paper)">{event.station}</div>
                <div className="text-[11px] text-(--color-steel)">{event.event}</div>
              </div>
              <div className="font-(family-name:--font-mono) text-[11px] text-(--color-steel)">
                {event.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
