"use client";

import { ClubInfo, NextFixture, Player } from "@/types/football";

interface StatsGridProps {
  club: ClubInfo;
  players: Player[];
  nextFixture: NextFixture;
}

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `£${(amount / 1_000_000).toFixed(2)}M`;
  }
  return `£${amount.toLocaleString("en-GB")}`;
}

export function StatsGrid({ club, players, nextFixture }: StatsGridProps) {
  const squadSize = players.length;
  const startingCount = players.filter((p) => p.status === "Starting XI").length;
  const benchCount = players.filter((p) => p.status !== "Starting XI").length;

  const avgOverall = (
    players.reduce((sum, player) => sum + player.overall, 0) / squadSize
  ).toFixed(1);

  const avgPotential = (
    players.reduce((sum, player) => sum + player.potential, 0) / squadSize
  ).toFixed(1);

  const totalWeeklyWages = players.reduce(
    (sum, player) => sum + player.weeklyWage,
    0
  );

  return (
    <section aria-label="Club Key Statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Club Balance */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Club Balance
            </p>
            <p className="mt-2 font-mono text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {formatCurrency(club.balance)}
            </p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
          <span className="text-slate-400">Transfer Budget</span>
          <span className="font-mono font-semibold text-emerald-400">
            {formatCurrency(club.transferBudget)}
          </span>
        </div>
      </div>

      {/* 2. Squad Size */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Squad Size
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {squadSize}
              </p>
              <span className="text-xs font-medium text-slate-400">
                Registered Players
              </span>
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
          <span className="text-slate-400">
            {startingCount} Starting XI • {benchCount} Bench
          </span>
          <span className="font-mono font-semibold text-slate-300">
            £{(totalWeeklyWages / 1000).toFixed(1)}k/wk
          </span>
        </div>
      </div>

      {/* 3. Average Squad Rating */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Average Squad Rating
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-extrabold tracking-tight text-emerald-400 sm:text-3xl">
                {avgOverall}
              </p>
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                OVR
              </span>
            </div>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
          <span className="text-slate-400">Avg Potential Ceiling</span>
          <span className="font-mono font-semibold text-amber-300">
            {avgPotential} POT
          </span>
        </div>
      </div>

      {/* 4. Next Fixture */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-emerald-950/40 p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-emerald-400 uppercase">
              Next Fixture
            </p>
            <p className="mt-2 truncate text-lg font-bold text-white sm:text-xl">
              vs {nextFixture.awayClub.shortName}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
          <span className="truncate text-slate-300">{nextFixture.dateLabel}</span>
          <span className="font-mono font-semibold text-emerald-300">
            15:00 BST
          </span>
        </div>
      </div>
    </section>
  );
}
