"use client";

import { NextFixture } from "@/types/football";
import { MatchSimulationResult } from "@/engine/matchEngine";

interface NextMatchCardProps {
  fixture: NextFixture;
  onSimulateMatch: () => void;
  onOpen3DPitch?: () => void;
  latestResult?: MatchSimulationResult | null;
  onOpenMatchCentre?: () => void;
  recentMatches?: MatchSimulationResult[];
  onSelectMatch?: (match: MatchSimulationResult) => void;
}

function FormBadge({ result }: { result: "W" | "D" | "L" }) {
  const styles =
    result === "W"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : result === "D"
        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
        : "bg-rose-500/20 text-rose-300 border-rose-500/40";

  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded border font-mono text-[10px] font-bold ${styles}`}
    >
      {result}
    </span>
  );
}

export function NextMatchCard({
  fixture,
  onSimulateMatch,
  onOpen3DPitch,
  latestResult,
  onOpenMatchCentre,
  recentMatches,
  onSelectMatch,
}: NextMatchCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-br from-[#0d182e] via-[#0a1326] to-[#081f1c] p-6 shadow-xl">
      {/* Subtle pitch stripe accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl"
      />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-emerald-400 uppercase">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Next Matchday Fixture
          </span>
          <p className="mt-0.5 text-xs text-slate-400">
            {fixture.competition} • {fixture.matchdayLabel}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {latestResult && (
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-300">
              Last Sim: {latestResult.homeTeam.abbreviation}{" "}
              {latestResult.homeTeam.score} - {latestResult.awayTeam.score}{" "}
              {latestResult.awayTeam.abbreviation}
            </span>
          )}
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-300">
            {fixture.kickoffTime}
          </span>
        </div>
      </div>

      {/* Head-to-Head Clubs */}
      <div className="my-6 grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
        {/* Home Club */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-emerald-400/50 bg-gradient-to-br from-emerald-500 to-emerald-800 font-mono text-lg font-black text-slate-950 shadow-lg shadow-emerald-950/60">
            {fixture.homeClub.abbreviation}
          </div>
          <p className="mt-2.5 text-sm font-bold text-white">
            {fixture.homeClub.name}
          </p>
          <span className="mt-0.5 text-xs text-emerald-400">
            Home • {fixture.homeClub.leaguePosition}
          </span>
          <div
            className="mt-2 flex items-center gap-1"
            aria-label="Home club recent form"
          >
            {fixture.homeClub.recentForm.map((res, idx) => (
              <FormBadge key={`home-form-${idx}`} result={res} />
            ))}
          </div>
        </div>

        {/* Center VS & Kickoff Info */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800/90 bg-slate-950/60 px-4 py-3 text-center">
          <span className="font-mono text-xs font-bold tracking-widest text-slate-400 uppercase">
            Kickoff
          </span>
          <span className="mt-1 font-mono text-lg font-black text-emerald-400">
            VS
          </span>
          <p className="mt-1 text-xs font-semibold text-slate-200">
            {fixture.dateLabel}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-amber-300">
            {fixture.kickoffTime}
          </p>
        </div>

        {/* Away Club */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-500 to-amber-800 font-mono text-lg font-black text-slate-950 shadow-lg shadow-amber-950/60">
            {fixture.awayClub.abbreviation}
          </div>
          <p className="mt-2.5 text-sm font-bold text-white">
            {fixture.awayClub.name}
          </p>
          <span className="mt-0.5 text-xs text-amber-400">
            Away • {fixture.awayClub.leaguePosition}
          </span>
          <div
            className="mt-2 flex items-center gap-1"
            aria-label="Away club recent form"
          >
            {fixture.awayClub.recentForm.map((res, idx) => (
              <FormBadge key={`away-form-${idx}`} result={res} />
            ))}
          </div>
        </div>
      </div>

      {/* Matchday Metadata & Working Simulation Action */}
      <div className="flex flex-col justify-between gap-3 border-t border-slate-800/80 pt-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>
            <strong className="font-semibold text-slate-200">Venue:</strong>{" "}
            {fixture.venue}
          </span>
          <span>
            <strong className="font-semibold text-slate-200">
              Conditions:
            </strong>{" "}
            {fixture.weather}
          </span>
          <span>
            <strong className="font-semibold text-slate-200">Referee:</strong>{" "}
            {fixture.referee}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recentMatches && recentMatches.length > 0 && onSelectMatch && (
            <select
              aria-label="Select match from career history"
              value={latestResult?.seed ?? ""}
              onChange={(e) => {
                const match = recentMatches.find(
                  (m) => m.seed === e.target.value
                );
                if (match) onSelectMatch(match);
              }}
              className="rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 font-mono text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 focus:border-emerald-500 focus:outline-none"
            >
              {recentMatches.map((m, idx) => (
                <option key={m.seed} value={m.seed}>
                  Hist #{recentMatches.length - idx}: {m.homeTeam.abbreviation}{" "}
                  {m.homeTeam.score} - {m.awayTeam.score}{" "}
                  {m.awayTeam.abbreviation}
                </option>
              ))}
            </select>
          )}

          {latestResult && onOpenMatchCentre && (
            <button
              type="button"
              onClick={onOpenMatchCentre}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              <span>View Match Centre</span>
            </button>
          )}

          {onOpen3DPitch && (
            <button
              type="button"
              onClick={onOpen3DPitch}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/25"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                />
              </svg>
              <span>Open 3D Pitch Viewer</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSimulateMatch}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-950/60 transition-all hover:bg-emerald-400"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Simulate Match</span>
          </button>
        </div>
      </div>
    </div>
  );
}
