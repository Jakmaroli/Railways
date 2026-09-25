import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  children,
  className,
}: DrawerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside
        className={cn(
          "relative z-10 flex h-full w-full max-w-lg flex-col border-l border-(--color-line) bg-(--color-surface) text-(--color-paper) shadow-2xl transition-transform animate-in slide-in-from-right duration-200",
          className
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-start justify-between border-b border-(--color-line) p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-(family-name:--font-display) text-lg font-semibold tracking-tight text-(--color-paper)">
                {title}
              </h2>
              {badge}
            </div>
            {subtitle && (
              <p className="text-xs text-(--color-steel) font-(family-name:--font-mono)">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-(--color-steel) hover:bg-(--color-panel-raised) hover:text-(--color-paper) transition-colors"
            title="Close Drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {children}
        </div>
      </aside>
    </div>
  );
}
