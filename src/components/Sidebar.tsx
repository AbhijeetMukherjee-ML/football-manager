"use client";

import { NavigationSection } from "@/types/football";

interface SidebarProps {
  activeSection: NavigationSection;
  onSelectSection: (section: NavigationSection) => void;
  squadCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: NavigationSection;
  label: string;
  badge?: string;
  isPlaceholder?: boolean;
  icon: React.ReactNode;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  squadCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: NavItem[] = [
    {
      id: "overview",
      label: "Overview",
      badge: "Live",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: "squad",
      label: "Squad",
      badge: String(squadCount),
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: "tactics",
      label: "Tactics",
      badge: "Preview",
      isPlaceholder: true,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      id: "fixtures",
      label: "Fixtures",
      badge: "Soon",
      isPlaceholder: true,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: "transfers",
      label: "Transfers",
      badge: "Soon",
      isPlaceholder: true,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      id: "training",
      label: "Training",
      badge: "Soon",
      isPlaceholder: true,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: "settings",
      label: "Club Settings",
      badge: "Soon",
      isPlaceholder: true,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  const handleNavClick = (section: NavigationSection) => {
    onSelectSection(section);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/75 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Club Navigation"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-800/80 bg-[#080f1e] transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand / Crest Bar */}
        <div className="flex h-20 items-center justify-between border-b border-slate-800/80 px-6">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-950/60 ring-1 ring-emerald-400/40">
              <span className="font-mono text-sm font-black tracking-tighter text-slate-950">
                NBA
              </span>
              <span
                className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-2 border-[#080f1e] bg-emerald-400"
                title="Active Career Save"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
                  FM 2026
                </span>
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  v0.1
                </span>
              </div>
              <p className="text-sm font-bold tracking-tight text-white">
                Touchline Command
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <p className="mb-3 px-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Club Management
          </p>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-all ${
                    isActive
                      ? "bg-emerald-500/15 text-emerald-300 shadow-xs ring-1 ring-emerald-500/35"
                      : "text-slate-300 hover:bg-slate-800/65 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`transition-colors ${
                        isActive
                          ? "text-emerald-400"
                          : "text-slate-400 group-hover:text-emerald-300"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </span>

                  {item.badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isActive
                          ? "bg-emerald-500 text-slate-950"
                          : item.isPlaceholder
                            ? "border border-slate-700 bg-slate-900/90 text-slate-400"
                            : "bg-slate-800 text-emerald-300"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Tactical Pitch Accent Box */}
          <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/40 to-slate-900/90 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-emerald-300 uppercase">
                Active Philosophy
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
            <p className="mt-1.5 text-sm font-bold text-white">
              4-3-3 High Press
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              High defensive line • Counter-press on possession loss • Wide overloads
            </p>

            {/* Mini SVG Pitch Lines */}
            <div className="mt-3 flex h-16 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-950/50 px-3">
              <div className="flex w-full items-center justify-between text-[11px] font-mono text-emerald-300">
                <span>DEF: High</span>
                <span className="text-emerald-500">•</span>
                <span>TEMPO: Fast</span>
                <span className="text-emerald-500">•</span>
                <span>WIDTH: Wide</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Save Status */}
        <div className="border-t border-slate-800/80 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Season 2026/27</span>
            <span className="font-mono text-emerald-400">Fictional Save</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Database & persistence: Placeholder (Local In-Memory Data)
          </p>
        </div>
      </aside>
    </>
  );
}
