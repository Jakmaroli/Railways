import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export type BadgeVariant =
  | "success"
  | "warning"
  | "critical"
  | "info"
  | "neutral"
  | "outline";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  pulse?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function Badge({
  children,
  variant = "neutral",
  pulse = false,
  className,
  size = "md",
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, { bg: string; dot: string; text: string; border: string }> = {
    success: {
      bg: "bg-(--color-signal-green-dim)/80 text-(--color-signal-green)",
      dot: "bg-(--color-signal-green)",
      text: "text-(--color-signal-green)",
      border: "border-(--color-signal-green)/30",
    },
    warning: {
      bg: "bg-(--color-signal-amber-dim)/80 text-(--color-signal-amber)",
      dot: "bg-(--color-signal-amber)",
      text: "text-(--color-signal-amber)",
      border: "border-(--color-signal-amber)/30",
    },
    critical: {
      bg: "bg-(--color-signal-red-dim)/80 text-(--color-signal-red)",
      dot: "bg-(--color-signal-red)",
      text: "text-(--color-signal-red)",
      border: "border-(--color-signal-red)/30",
    },
    info: {
      bg: "bg-(--color-signal-blue-dim)/80 text-(--color-cyan)",
      dot: "bg-(--color-cyan)",
      text: "text-(--color-cyan)",
      border: "border-(--color-primary)/30",
    },
    neutral: {
      bg: "bg-(--color-panel-raised) text-(--color-fog)",
      dot: "bg-(--color-steel)",
      text: "text-(--color-fog)",
      border: "border-(--color-line)",
    },
    outline: {
      bg: "bg-transparent text-(--color-fog)",
      dot: "bg-(--color-steel)",
      text: "text-(--color-fog)",
      border: "border-(--color-line)",
    },
  };

  const current = variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-(family-name:--font-mono) font-medium tracking-wide uppercase transition-colors",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        current.bg,
        current.border,
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              current.dot
            )}
          />
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", current.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: BadgeVariant; label: string; pulse?: boolean }> = {
    open: { variant: "neutral", label: "Open" },
    scheduled: { variant: "warning", label: "Scheduled" },
    in_progress: { variant: "info", label: "In Progress", pulse: true },
    completed: { variant: "success", label: "Completed" },
    overrun: { variant: "critical", label: "Overrun", pulse: true },
    pending: { variant: "warning", label: "Pending Review" },
    approved: { variant: "success", label: "Approved" },
    merged: { variant: "info", label: "Merged" },
    rejected: { variant: "critical", label: "Rejected" },
    planned: { variant: "warning", label: "Planned" },
    running: { variant: "success", label: "Running", pulse: true },
    delayed: { variant: "critical", label: "Delayed", pulse: true },
    dwell: { variant: "info", label: "Dwell" },
    active: { variant: "success", label: "Active", pulse: true },
  };

  const item = map[status.toLowerCase()] ?? { variant: "neutral" as BadgeVariant, label: status };

  return (
    <Badge variant={item.variant} pulse={item.pulse}>
      {item.label}
    </Badge>
  );
}
