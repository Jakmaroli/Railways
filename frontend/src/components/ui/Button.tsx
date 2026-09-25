import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg" | "icon";
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary:
      "bg-(--color-primary) text-white hover:bg-(--color-primary-hover) shadow-xs hover:shadow-blue-500/20 active:translate-y-px",
    secondary:
      "bg-(--color-panel-raised) text-(--color-paper) hover:bg-(--color-panel-highlight) border border-(--color-line)",
    outline:
      "bg-transparent border border-(--color-line) text-(--color-fog) hover:bg-(--color-panel-raised) hover:text-(--color-paper)",
    ghost:
      "bg-transparent text-(--color-fog) hover:bg-(--color-panel-raised) hover:text-(--color-paper)",
    danger:
      "bg-(--color-signal-red) text-white hover:opacity-90 active:translate-y-px",
    success:
      "bg-(--color-signal-green) text-white hover:opacity-90 active:translate-y-px",
  };

  const sizeStyles = {
    sm: "px-2.5 py-1 text-xs rounded-md",
    md: "px-3.5 py-1.5 text-sm rounded-lg",
    lg: "px-5 py-2.5 text-base rounded-xl font-medium",
    icon: "p-2 rounded-lg aspect-square flex items-center justify-center",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 select-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
