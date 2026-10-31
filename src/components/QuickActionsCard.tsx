"use client";

import { NavigationSection, PositionGroup } from "@/types/football";

interface QuickActionsCardProps {
  onNavigate: (section: NavigationSection) => void;
  onQuickFilterPosition: (group: PositionGroup) => void;
}

export function QuickActionsCard({
  onNavigate,
  onQuickFilterPosition,
}: QuickActionsCardProps) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-slate-900/75 p-6 shadow-xl">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div>
            <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
              Touchline Desk
            </span>
            <h2 className="mt-0.5 text-base font-bold text-white">
              Manager Quick Actions
            </h2>
          </div>
          <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-semibold text-emerald-300">
            Interactive
          </span>
        </div>

        {/* Primary Working Actions */}
        <div className="mt-4 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onQuickFilterPosition("ALL");
              onNavigate("squad");
            }}
            className="group flex w-full items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-left transition-all hover:bg-emerald-500/25"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-bold">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-emerald-200">
                  Manage Squad & Lineup
                </p>
                <p className="text-xs text-slate-300">
                  Inspect all 14 players, filter positions & search roster
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-bold text-emerald-300">
              Open →
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("tactics")}
            className="group flex w-full items-center justify-between rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-3 text-left transition-all hover:border-emerald-500/40 hover:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-emerald-300">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-bold text-white group-hover:text-emerald-300">
                  View Tactics & 4-3-3 Shape
                </p>
                <p className="text-xs text-slate-400">
                  Preview formation pitch board & tactical instructions
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-300 group-hover:text-emerald-300">
              View →
            </span>
          </button>
        </div>

        {/* Position Shortcut Pills */}
        <div className="mt-5">
          <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            Quick Squad Position Jump
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {(["GK", "DEF", "MID", "FWD"] as const).map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => {
                  onQuickFilterPosition(group);
                  onNavigate("squad");
                }}
                className="rounded-lg border border-slate-800 bg-slate-950/70 py-1.5 text-center font-mono text-xs font-bold text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                {group}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clearly Labeled Placeholder Actions */}
      <div className="mt-5 border-t border-slate-800/80 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Upcoming Modules (Placeholders)
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
            Not Implemented Yet
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled
            className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-950/50 px-3 py-2 text-left text-xs text-slate-500 cursor-not-allowed"
          >
            <span>Scout Castlemere</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
              Placeholder
            </span>
          </button>
          <button
            type="button"
            disabled
            className="flex items-center justify-between rounded-lg border border-slate-800/90 bg-slate-950/50 px-3 py-2 text-left text-xs text-slate-500 cursor-not-allowed"
          >
            <span>Contract Renewals</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
              Placeholder
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
