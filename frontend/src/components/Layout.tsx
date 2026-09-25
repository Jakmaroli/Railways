import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  fullWidth?: boolean;
}

export default function Layout({
  title,
  subtitle,
  actions,
  children,
  fullWidth = false,
}: LayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080E1C] text-slate-100 font-sans">
      {/* Sidebar Shell */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Unified Command Center Top Bar */}
        <Header />

        {/* Dynamic Content Viewport */}
        <main className="flex-1 overflow-y-auto technical-scrollbar bg-[#080E1C]">
          {title ? (
            <div className={`mx-auto ${fullWidth ? "w-full px-6 py-6" : "max-w-7xl px-8 py-6"} space-y-6`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1E2D49]/60 pb-5">
                <div>
                  <h1 className="font-['Outfit',sans-serif] text-2xl font-bold tracking-tight text-white">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="mt-1 text-xs text-slate-400 font-normal">
                      {subtitle}
                    </p>
                  )}
                </div>
                {actions && <div className="flex items-center gap-3">{actions}</div>}
              </div>
              {children}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
