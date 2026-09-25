import { useState } from "react";
import { Drawer } from "./ui/Drawer";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import client from "../api/client";
import type { Defect } from "../types";
import { 
  AlertOctagon, 
  MapPin, 
  Cpu, 
  ShieldAlert, 
  CheckCircle2, 
  Layers
} from "lucide-react";

interface DefectDetailDrawerProps {
  defect: Defect | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function DefectDetailDrawer({ defect, isOpen, onClose, onRefresh }: DefectDetailDrawerProps) {
  const [submitting, setSubmitting] = useState(false);
  const [demandCreated, setDemandCreated] = useState(false);

  if (!defect) return null;

  async function handleRequestBlock() {
    if (!defect) return;
    setSubmitting(true);
    try {
      await client.post("/block-requests", {
        defect_id: defect.task_id,
        corridor_id: defect.corridor_id,
        department: defect.source_system,
        requested_date: defect.due_date || new Date().toISOString().slice(0, 10),
        requested_start: "01:30",
        requested_end: "04:30",
        reason: `Urgent maintenance block for ${defect.defect_type} on asset ${defect.asset_id} (Priority: ${defect.priority_score?.toFixed(1) ?? 'N/A'})`,
      });
      setDemandCreated(true);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message || "Failed to create block demand");
    } finally {
      setSubmitting(false);
    }
  }

  const severityLabels: Record<number, { label: string; variant: "critical" | "warning" | "neutral" }> = {
    5: { label: "Critical Hazard (Level 5)", variant: "critical" },
    4: { label: "High Risk (Level 4)", variant: "critical" },
    3: { label: "Moderate (Level 3)", variant: "warning" },
    2: { label: "Low (Level 2)", variant: "neutral" },
    1: { label: "Minor Advisory (Level 1)", variant: "neutral" },
  };

  const sev = severityLabels[defect.severity] || { label: `Severity ${defect.severity}`, variant: "warning" as const };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Task #${defect.task_id} · ${defect.defect_type}`}
      subtitle={`Asset ${defect.asset_id} · ${defect.source_system}`}
      badge={<Badge variant={sev.variant}>{sev.label}</Badge>}
    >
      {/* Location & Corridor */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-(family-name:--font-mono) text-(--color-steel)">
          <div className="flex items-center gap-1.5 text-(--color-paper)">
            <MapPin className="h-4 w-4 text-(--color-primary)" />
            <span>Corridor: {defect.corridor_id}</span>
          </div>
          <span>Marker: {defect.location_marker || "Km 114/2-4"}</span>
        </div>
        <div className="flex items-center justify-between text-xs font-(family-name:--font-mono) text-(--color-steel) border-t border-(--color-line)/60 pt-2">
          <span>Source System: <strong className="text-(--color-paper)">{defect.source_system}</strong></span>
          <span>Recurrence: <strong className="text-(--color-signal-amber)">{defect.recurrence_count}x reported</strong></span>
        </div>
      </div>

      {/* AI Risk & Operational Scoring */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3.5">
          <div className="flex items-center justify-between text-xs text-(--color-steel)">
            <span>AI Priority Score</span>
            <Cpu className="h-3.5 w-3.5 text-(--color-primary)" />
          </div>
          <div className="mt-1 font-(family-name:--font-display) text-2xl font-bold text-(--color-signal-amber)">
            {defect.priority_score?.toFixed(1) ?? "5.0"}
            <span className="text-xs font-normal text-(--color-steel)"> / 10</span>
          </div>
          <div className="mt-0.5 text-[11px] text-(--color-steel)">SIH26027 ML prioritization</div>
        </div>

        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3.5">
          <div className="flex items-center justify-between text-xs text-(--color-steel)">
            <span>Asset Health Index</span>
            <ShieldAlert className="h-3.5 w-3.5 text-(--color-cyan)" />
          </div>
          <div className={`mt-1 font-(family-name:--font-display) text-2xl font-bold ${
            (defect.health_score ?? 100) < 40 ? "text-(--color-signal-red)" : (defect.health_score ?? 100) < 70 ? "text-(--color-signal-amber)" : "text-(--color-signal-green)"
          }`}>
            {defect.health_score?.toFixed(0) ?? "100"}%
          </div>
          <div className="mt-0.5 text-[11px] text-(--color-steel)">Ultrasonic / sensor index</div>
        </div>
      </div>

      {/* Operational Impact Analysis */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-(--color-fog) flex items-center gap-1.5">
          <AlertOctagon className="h-4 w-4 text-(--color-signal-amber)" />
          Predicted Operational Impact
        </h4>
        <div className="space-y-2 text-xs text-(--color-paper)">
          <div className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-signal-red) mt-1.5 shrink-0" />
            <span>
              Estimated block duration needed: <strong className="text-(--color-paper)">{defect.estimated_block_duration} hours</strong>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-signal-amber) mt-1.5 shrink-0" />
            <span>
              Target rectification deadline: <strong className="text-(--color-paper)">{defect.due_date}</strong>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-primary) mt-1.5 shrink-0" />
            <span>
              Safety implication: Track speed restriction (TSR 30 km/h) mandated if unrectified past due date.
            </span>
          </div>
        </div>
      </div>

      {/* Recommended Action & Block Demand Control */}
      <div className="rounded-xl border border-(--color-primary)/30 bg-(--color-signal-blue-dim)/40 p-4 space-y-3">
        <div className="text-xs font-semibold text-(--color-cyan) flex items-center gap-1.5">
          <Layers className="h-4 w-4" />
          Recommended Operational Action
        </div>
        <p className="text-xs text-(--color-paper) leading-relaxed">
          {defect.severity >= 4
            ? "Immediate deconfliction required. Propose nocturnal shadow possession block in COA timetable to bundle with adjacent corridor maintenance."
            : "Schedule routine track machine possession window during lowest traffic density interval."}
        </p>

        {demandCreated ? (
          <div className="rounded-lg bg-(--color-signal-green-dim)/80 border border-(--color-signal-green)/40 p-3 text-xs text-(--color-signal-green) flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>BDMS block demand created and dispatched to Section Controller for possession approval!</span>
          </div>
        ) : (
          <Button
            onClick={handleRequestBlock}
            disabled={submitting}
            variant="primary"
            className="w-full text-xs"
          >
            {submitting ? "Transmitting Block Request…" : "Dispatch Block Demand to Controller"}
          </Button>
        )}
      </div>

      {/* Status & Audit info */}
      <div className="border-t border-(--color-line)/60 pt-3 flex items-center justify-between text-xs font-(family-name:--font-mono) text-(--color-steel)">
        <span>Reported: {defect.date_reported}</span>
        <span>Department: {defect.department}</span>
      </div>
    </Drawer>
  );
}
