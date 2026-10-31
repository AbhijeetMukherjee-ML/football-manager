"use client";

import { ClubInfo, ManagerProfile, NavigationSection } from "@/types/football";

interface HeaderProps {
  club: ClubInfo;
  manager: ManagerProfile;
  activeSection: NavigationSection;
  onOpenMobileMenu: () => void;
  onSelectSection: (section: NavigationSection) => void;
}

const SECTION_TITLES: Record<NavigationSection, { title: string; subtitle: string }> = {
  overview: {
    title: "Manager Overview",
    subtitle: "Executive club briefing, squad readiness & matchday centre",
  },
  squad: {
    title: "First Team Squad",
    subtitle: "Player ratings, potential, weekly wages & position filtering",
  },
  tactics: {
    title: "Tactical Board",
    subtitle: "Formation setup, team instructions & match roles (Preview)",
  },
  fixtures: {
    title: "Fixtures & Schedule",
    subtitle: "Premier Crown Division calendar & results (Placeholder)",
  },
  transfers: {
    title: "Transfer Centre",
    subtitle: "Scouting shortlist, negotiations & budget allocation (Placeholder)",
  },
  training: {
    title: "Training Ground",
    subtitle: "Weekly schedules & individual player development (Placeholder)",
  },
  settings: {
    title: "Club Settings",
    subtitle: "Board responsibilities, kits & game preferences (Placeholder)",
  },
};

export function Header({
  club,
  manager,
  activeSection,
  onOpenMobileMenu,
  onSelectSection,
}: HeaderProps) {
  const currentMeta = SECTION_TITLES[activeSection];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-[#0a1326]/90 backdrop-blur-md">
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        {/* Left: Mobile Menu Trigger + Club & View Title */}
        <div className="flex items-start gap-3 sm:items-center">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300 lg:hidden"
            aria-label="Open navigation menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {club.name}
              </span>
              <span className="text-xs font-medium text-slate-400">
                {club.division} • {club.leagueStanding}
              </span>
              <span className="hidden text-xs text-slate-500 sm:inline">
                • {club.inGameDate}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
              {currentMeta.title}
            </h1>
            <p className="text-xs text-slate-400 sm:text-sm">
              {currentMeta.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Fictional Manager Profile Card & Quick Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          {/* Quick View Pill Switcher for Overview / Squad */}
          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
            <button
              type="button"
              onClick={() => onSelectSection("overview")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeSection === "overview"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => onSelectSection("squad")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeSection === "squad"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Squad Hub
            </button>
          </div>

          {/* Manager Profile Badge */}
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-3.5 py-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/20 to-teal-500/20 font-mono text-sm font-bold text-emerald-300 ring-1 ring-emerald-500/30">
              MV
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-white">
                  {manager.name}
                </p>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                  {manager.reputation}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {manager.title} •{" "}
                <span className="font-mono text-slate-300">
                  {manager.seasonRecord.won}W-{manager.seasonRecord.drawn}D-{manager.seasonRecord.lost}L
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
