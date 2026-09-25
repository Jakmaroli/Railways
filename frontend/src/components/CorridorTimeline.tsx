import type { Corridor, ScheduleBlock } from "../types";

interface TimetableBusy {
  corridor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

function toPct(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h * 60 + m) / (24 * 60)) * 100;
}

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-(--color-signal-amber)",
  completed: "bg-(--color-signal-green)",
  overrun: "bg-(--color-signal-red)",
};

const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

export default function CorridorTimeline({
  corridors,
  blocks,
  busyWindows,
  date,
  dayOfWeek,
}: {
  corridors: Corridor[];
  blocks: ScheduleBlock[];
  busyWindows: TimetableBusy[];
  date: string;
  dayOfWeek: number;
}) {
  return (
    <div className="border border-(--color-line) bg-(--color-panel)">
      <div className="flex items-center justify-between border-b border-(--color-line) px-4 py-3">
        <div className="font-(family-name:--font-display) text-sm font-semibold text-(--color-paper)">
          Corridor possession chart
        </div>
        <div className="font-(family-name:--font-mono) text-[11px] text-(--color-steel)">{date}</div>
      </div>

      {/* hour ruler */}
      <div className="relative ml-32 mr-4 mt-4 h-4 border-b border-(--color-line)">
        {HOURS.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 font-(family-name:--font-mono) text-[10px] text-(--color-steel)"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
      </div>

      <div className="space-y-3 px-4 pb-5 pt-4">
        {corridors.map((c) => {
          const busy = busyWindows.filter((b) => b.corridor_id === c.corridor_id && b.day_of_week === dayOfWeek);
          const corridorBlocks = blocks.filter((b) => b.corridor_id === c.corridor_id && b.date === date);
          return (
            <div key={c.corridor_id} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-right">
                <div className="truncate text-[13px] text-(--color-fog)" title={c.name}>
                  {c.name}
                </div>
                <div className="font-(family-name:--font-mono) text-[10px] text-(--color-steel)">
                  {c.corridor_id}
                  {c.is_high_density && <span className="ml-1 text-(--color-signal-amber)">HD</span>}
                </div>
              </div>
              <div className="relative h-7 flex-1 rounded-sm bg-(--color-ink)">
                {busy.map((b, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full bg-(--color-line)"
                    style={{ left: `${toPct(b.start_time)}%`, width: `${toPct(b.end_time) - toPct(b.start_time)}%` }}
                    title={`Train movement ${b.start_time}–${b.end_time}`}
                  />
                ))}
                {corridorBlocks.map((b) => (
                  <div
                    key={b.id}
                    className={`group absolute top-0.5 h-6 rounded-sm ${STATUS_COLOR[b.status] ?? "bg-(--color-steel)"} opacity-90 hover:opacity-100`}
                    style={{
                      left: `${toPct(b.slot_start)}%`,
                      width: `max(${toPct(b.slot_end) - toPct(b.slot_start)}%, 4px)`,
                    }}
                  >
                    <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 hidden w-64 rounded-sm border border-(--color-line) bg-(--color-panel-raised) p-2 text-[11px] text-(--color-fog) shadow-lg group-hover:block">
                      <div className="font-(family-name:--font-mono) text-(--color-paper)">
                        Task {b.task_id} · {b.slot_start}–{b.slot_end}
                        {b.merged_with && ` · merged: ${b.merged_with}`}
                      </div>
                      <div className="mt-1">{b.explanation_text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 border-t border-(--color-line) px-4 py-2.5 font-(family-name:--font-mono) text-[10px] text-(--color-steel)">
        <span><span className="mr-1 inline-block h-2 w-2 bg-(--color-line) align-middle" />train movement</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-(--color-signal-amber) align-middle" />planned block</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-(--color-signal-green) align-middle" />completed</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-(--color-signal-red) align-middle" />overrun</span>
      </div>
    </div>
  );
}
