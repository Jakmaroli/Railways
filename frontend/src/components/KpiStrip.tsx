import type { KpiSummary } from "../types";

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "amber" | "red" | "green" }) {
  const toneClass =
    tone === "red"
      ? "text-(--color-signal-red)"
      : tone === "green"
      ? "text-(--color-signal-green)"
      : tone === "amber"
      ? "text-(--color-signal-amber)"
      : "text-(--color-paper)";
  return (
    <div className="border-r border-(--color-line) px-6 py-4 last:border-r-0">
      <div className={`font-(family-name:--font-display) text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[13px] text-(--color-steel)">{label}</div>
    </div>
  );
}

export default function KpiStrip({ kpi }: { kpi: KpiSummary }) {
  return (
    <div className="flex flex-wrap border border-(--color-line) bg-(--color-panel)">
      <Kpi label="Open defects" value={kpi.open_defects} />
      <Kpi label="Overdue" value={kpi.overdue_defects} tone={kpi.overdue_defects > 0 ? "red" : undefined} />
      <Kpi label="Scheduled blocks" value={kpi.scheduled_blocks} />
      <Kpi label="Avg priority" value={kpi.avg_priority_score.toFixed(1)} tone="amber" />
      <Kpi
        label="High-density corridors at risk"
        value={kpi.high_density_corridors_at_risk}
        tone={kpi.high_density_corridors_at_risk > 0 ? "red" : "green"}
      />
      <Kpi label="Punctuality protected" value={`${kpi.punctuality_protection_pct}%`} tone="green" />
    </div>
  );
}
