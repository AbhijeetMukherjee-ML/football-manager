"use client";

import { useMemo, useState } from "react";
import {
  MatchEvent,
  MatchEventType,
  MatchSimulationResult,
} from "@/engine/matchEngine";
import { MatchViewer } from "@/components/match-viewer/MatchViewer";

interface MatchCentreProps {
  result: MatchSimulationResult;
  simulationCount: number;
  onSimulateAgain: () => void;
  onReturnToDashboard: () => void;
  recentMatches?: MatchSimulationResult[];
  onSelectMatch?: (match: MatchSimulationResult) => void;
}

type CommentaryFilter = "all" | "highlights" | "goals";

function getEventBadgeStyle(type: MatchEventType): {
  label: string;
  className: string;
} {
  switch (type) {
    case "goal":
      return {
        label: "GOAL",
        className:
          "bg-emerald-500 text-slate-950 font-black ring-2 ring-emerald-400/50",
      };
    case "save":
      return {
        label: "SAVE",
        className:
          "bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold",
      };
    case "shot":
    case "shot_on_target":
      return {
        label: "SHOT",
        className:
          "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold",
      };
    case "corner":
      return {
        label: "CORNER",
        className:
          "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold",
      };
    case "attack":
      return {
        label: "ATTACK",
        className:
          "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold",
      };
    case "pass":
      return {
        label: "PASS",
        className:
          "bg-slate-800/80 text-slate-300 border border-slate-700 font-medium",
      };
    case "interception":
      return {
        label: "INTERCEPT",
        className:
          "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold",
      };
    case "turnover":
      return {
        label: "TACKLE",
        className:
          "bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold",
      };
    case "foul":
      return {
        label: "FOUL",
        className:
          "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-bold",
      };
    case "free_kick":
      return {
        label: "FREE KICK",
        className:
          "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold",
      };
    case "offside":
      return {
        label: "OFFSIDE",
        className:
          "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 font-bold",
      };
    case "throw_in":
      return {
        label: "THROW-IN",
        className:
          "bg-slate-800 text-slate-400 border border-slate-700 font-medium",
      };
    case "goal_kick":
      return {
        label: "GOAL KICK",
        className:
          "bg-slate-800 text-slate-400 border border-slate-700 font-medium",
      };
    case "possession_change":
      return {
        label: "POSSESSION",
        className:
          "bg-slate-800 text-slate-300 border border-slate-700 font-medium",
      };
    case "kickoff":
    case "goal_restart":
      return {
        label: "KICK-OFF",
        className:
          "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-bold",
      };
    case "half_time":
      return {
        label: "HALF-TIME",
        className:
          "bg-amber-400 text-slate-950 font-black",
      };
    case "full_time":
      return {
        label: "FULL-TIME",
        className:
          "bg-white text-slate-950 font-black",
      };
  }
}

interface StatBarRowProps {
  label: string;
  homeValue: number;
  awayValue: number;
  unit?: string;
}

function StatBarRow({
  label,
  homeValue,
  awayValue,
  unit = "",
}: StatBarRowProps) {
  const total = homeValue + awayValue;
  const homePct = total === 0 ? 50 : Math.round((homeValue / total) * 100);
  const awayPct = 100 - homePct;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="font-mono text-sm font-bold text-emerald-300">
          {homeValue}
          {unit}
        </span>
        <span className="tracking-wider text-slate-300 uppercase">{label}</span>
        <span className="font-mono text-sm font-bold text-amber-300">
          {awayValue}
          {unit}
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800 p-0.5">
        <div
          className="h-full rounded-l-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="h-full rounded-r-full bg-amber-500 transition-all duration-300"
          style={{ width: `${awayPct}%` }}
        />
      </div>
    </div>
  );
}

export function MatchCentre({
  result,
  simulationCount,
  onSimulateAgain,
  onReturnToDashboard,
  recentMatches,
  onSelectMatch,
}: MatchCentreProps) {
  const [commentaryFilter, setCommentaryFilter] =
    useState<CommentaryFilter>("highlights");
  const [show3DPitch, setShow3DPitch] = useState<boolean>(false);

  const homeGoalEvents = useMemo(
    () =>
      result.events.filter((e) => e.type === "goal" && e.team === "home"),
    [result.events]
  );

  const awayGoalEvents = useMemo(
    () =>
      result.events.filter((e) => e.type === "goal" && e.team === "away"),
    [result.events]
  );

  const filteredEvents = useMemo(() => {
    if (commentaryFilter === "goals") {
      return result.events.filter(
        (e) =>
          e.type === "goal" ||
          e.type === "half_time" ||
          e.type === "full_time"
      );
    }
    if (commentaryFilter === "highlights") {
      return result.events.filter(
        (e) =>
          e.type === "kickoff" ||
          e.type === "goal_restart" ||
          e.type === "goal" ||
          e.type === "save" ||
          e.type === "shot" ||
          e.type === "shot_on_target" ||
          e.type === "corner" ||
          e.type === "foul" ||
          e.type === "free_kick" ||
          e.type === "offside" ||
          e.type === "half_time" ||
          e.type === "full_time"
      );
    }
    return result.events;
  }, [result.events, commentaryFilter]);

  return (
    <div className="space-y-6">
      {/* Top Action & Navigation Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800/90 bg-slate-900/80 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-4 py-2 text-xs font-bold text-white transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <span>← Return to Dashboard</span>
          </button>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-slate-300">
              {result.competition} • {result.venue}
            </p>
            <p className="font-mono text-[11px] text-slate-400">
              Seed: <span className="text-emerald-400">{result.seed}</span> (#
              {simulationCount})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {recentMatches && recentMatches.length > 1 && onSelectMatch && (
            <select
              aria-label="Select match from career history"
              value={result.seed}
              onChange={(e) => {
                const match = recentMatches.find(
                  (m) => m.seed === e.target.value
                );
                if (match) onSelectMatch(match);
              }}
              className="rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-1.5 font-mono text-xs font-semibold text-slate-200 hover:border-emerald-500/40 focus:border-emerald-500 focus:outline-none"
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

          <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-300">
            Status: {result.status} (90&apos;)
          </span>
          <button
            type="button"
            onClick={() => setShow3DPitch((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25"
          >
            <span>
              {show3DPitch ? "Hide 3D Pitch" : "Toggle 3D Pitch View"}
            </span>
          </button>
          <button
            type="button"
            onClick={onSimulateAgain}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-950/50 transition-colors hover:bg-emerald-400"
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
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Simulate Next Fixture</span>
          </button>
        </div>
      </div>

      {/* Scoreboard Banner */}
      <section
        aria-label="Match Scoreboard"
        className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-[#0d1d35] via-[#091326] to-[#07241e] p-6 shadow-2xl sm:p-8"
      >
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
          {/* Home Club */}
          <div className="flex flex-col items-center text-center md:items-end md:text-right">
            <div className="flex items-center gap-4">
              <div className="order-2 md:order-1">
                <span className="text-[11px] font-bold tracking-wider text-emerald-400 uppercase">
                  Home • {result.homeTeam.formation}
                </span>
                <h2 className="text-lg font-extrabold text-white sm:text-xl">
                  {result.homeTeam.name}
                </h2>
                <p className="text-xs text-slate-400">
                  {result.homeTeam.tactics.mentality} •{" "}
                  {result.homeTeam.tactics.pressingIntensity}
                </p>
              </div>
              <div className="order-1 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-emerald-400/60 bg-gradient-to-br from-emerald-500 to-emerald-800 font-mono text-lg font-black text-slate-950 shadow-lg md:order-2">
                {result.homeTeam.abbreviation}
              </div>
            </div>

            {/* Home Goalscorers */}
            <div className="mt-3 space-y-1 text-xs text-emerald-300">
              {homeGoalEvents.length === 0 ? (
                <span className="text-slate-500">No goals scored</span>
              ) : (
                homeGoalEvents.map((g) => (
                  <p key={g.id} className="font-medium">
                    ⚽ {g.player} <span className="font-mono">{g.minute}&apos;</span>
                    {g.secondaryPlayer ? (
                      <span className="text-slate-400">
                        {" "}
                        (ast. {g.secondaryPlayer})
                      </span>
                    ) : null}
                  </p>
                ))
              )}
            </div>
          </div>

          {/* Center Final Score & Status */}
          <div className="flex flex-col items-center justify-center">
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-0.5 font-mono text-[11px] font-bold tracking-widest text-emerald-300 uppercase">
              {result.status} • 90 Mins
            </span>
            <div className="mt-3 flex items-center gap-4 rounded-2xl border border-slate-700/80 bg-slate-950/85 px-7 py-4 shadow-inner">
              <span className="font-mono text-4xl font-black text-white sm:text-5xl">
                {result.homeTeam.score}
              </span>
              <span className="font-mono text-2xl font-bold text-slate-500">
                :
              </span>
              <span className="font-mono text-4xl font-black text-white sm:text-5xl">
                {result.awayTeam.score}
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] text-slate-400">
              Possession: {result.stats.home.possession}% –{" "}
              {result.stats.away.possession}%
            </p>
          </div>

          {/* Away Club */}
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-500 to-amber-800 font-mono text-lg font-black text-slate-950 shadow-lg">
                {result.awayTeam.abbreviation}
              </div>
              <div>
                <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">
                  Away • {result.awayTeam.formation}
                </span>
                <h2 className="text-lg font-extrabold text-white sm:text-xl">
                  {result.awayTeam.name}
                </h2>
                <p className="text-xs text-slate-400">
                  {result.awayTeam.tactics.mentality} •{" "}
                  {result.awayTeam.tactics.pressingIntensity}
                </p>
              </div>
            </div>

            {/* Away Goalscorers */}
            <div className="mt-3 space-y-1 text-xs text-amber-300">
              {awayGoalEvents.length === 0 ? (
                <span className="text-slate-500">No goals scored</span>
              ) : (
                awayGoalEvents.map((g) => (
                  <p key={g.id} className="font-medium">
                    ⚽ {g.player} <span className="font-mono">{g.minute}&apos;</span>
                    {g.secondaryPlayer ? (
                      <span className="text-slate-400">
                        {" "}
                        (ast. {g.secondaryPlayer})
                      </span>
                    ) : null}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Optional Embedded 3D Pitch Viewer inside Match Centre */}
      {show3DPitch && (
        <MatchViewer
          key={result.seed}
          homeClubName={result.homeTeam.name}
          homeAbbreviation={result.homeTeam.abbreviation}
          awayClubName={result.awayTeam.name}
          awayAbbreviation={result.awayTeam.abbreviation}
          venue={result.venue}
          competition={result.competition}
          initialSeed={result.seed}
        />
      )}

      {/* Main Match Content: Chronological Commentary Feed + Match Statistics */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left 7 Cols: Chronological Commentary Feed */}
        <section
          aria-labelledby="commentary-feed-heading"
          className="flex flex-col rounded-2xl border border-slate-800/90 bg-slate-900/75 shadow-xl xl:col-span-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 p-5">
            <div>
              <h3
                id="commentary-feed-heading"
                className="text-base font-bold text-white sm:text-lg"
              >
                Chronological Match Commentary
              </h3>
              <p className="text-xs text-slate-400">
                {filteredEvents.length} events shown (derived from 90-minute engine log)
              </p>
            </div>

            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
              {(
                [
                  { id: "all", label: `All (${result.events.length})` },
                  { id: "highlights", label: "Key Highlights" },
                  {
                    id: "goals",
                    label: `Goals (${
                      result.homeTeam.score + result.awayTeam.score
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCommentaryFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    commentaryFilter === tab.id
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[560px] space-y-2.5 overflow-y-auto p-5">
            {filteredEvents.map((event: MatchEvent) => {
              const badge = getEventBadgeStyle(event.type);
              const isGoal = event.type === "goal";
              const isMilestone =
                event.type === "half_time" ||
                event.type === "full_time" ||
                event.type === "kickoff";

              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3.5 rounded-xl border p-3.5 transition-colors ${
                    isGoal
                      ? "border-emerald-500/50 bg-emerald-950/35"
                      : isMilestone
                        ? "border-slate-700 bg-slate-950/85"
                        : "border-slate-800/80 bg-slate-950/45"
                  }`}
                >
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className="font-mono text-sm font-black text-white">
                      {event.minute}
                      {event.addedMinute ? `+${event.addedMinute}` : ""}&apos;
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      H{event.half}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 font-mono text-[10px] ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs font-bold text-slate-300">
                        {event.teamName}
                      </span>
                      {event.player && (
                        <span className="text-xs text-emerald-300">
                          • {event.player}
                        </span>
                      )}
                      <span className="ml-auto font-mono text-xs font-bold text-slate-400">
                        {event.scoreAfter.home} - {event.scoreAfter.away}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-200 sm:text-sm">
                      {event.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right 5 Cols: Match Statistics & Fatigue Summary */}
        <div className="space-y-6 xl:col-span-5">
          <section
            aria-labelledby="match-stats-heading"
            className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div>
                <h3
                  id="match-stats-heading"
                  className="text-base font-bold text-white sm:text-lg"
                >
                  Full-Time Match Statistics
                </h3>
                <p className="text-xs text-slate-400">
                  Calculated directly from simulated match events
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs font-bold">
                <span className="text-emerald-400">
                  {result.homeTeam.abbreviation}
                </span>
                <span className="text-slate-500">vs</span>
                <span className="text-amber-400">
                  {result.awayTeam.abbreviation}
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <StatBarRow
                label="Possession"
                homeValue={result.stats.home.possession}
                awayValue={result.stats.away.possession}
                unit="%"
              />
              <StatBarRow
                label="Expected Goals (xG)"
                homeValue={result.stats.home.expectedGoals}
                awayValue={result.stats.away.expectedGoals}
              />
              <StatBarRow
                label="Total Shots"
                homeValue={result.stats.home.shots}
                awayValue={result.stats.away.shots}
              />
              <StatBarRow
                label="Shots on Target"
                homeValue={result.stats.home.shotsOnTarget}
                awayValue={result.stats.away.shotsOnTarget}
              />
              <StatBarRow
                label="Goalkeeper Saves"
                homeValue={result.stats.home.saves}
                awayValue={result.stats.away.saves}
              />
              <StatBarRow
                label="Pass Accuracy"
                homeValue={result.stats.home.passAccuracy}
                awayValue={result.stats.away.passAccuracy}
                unit="%"
              />
              <StatBarRow
                label="Corners"
                homeValue={result.stats.home.corners}
                awayValue={result.stats.away.corners}
              />
              <StatBarRow
                label="Fouls Committed"
                homeValue={result.stats.home.foulsCommitted}
                awayValue={result.stats.away.foulsCommitted}
              />
              <StatBarRow
                label="Offsides"
                homeValue={result.stats.home.offsides}
                awayValue={result.stats.away.offsides}
              />
              <StatBarRow
                label="Final-Third Attacks"
                homeValue={result.stats.home.attacks}
                awayValue={result.stats.away.attacks}
              />
              <StatBarRow
                label="Turnovers & Interceptions"
                homeValue={result.stats.home.turnovers}
                awayValue={result.stats.away.turnovers}
              />
              <StatBarRow
                label="Avg End-of-Match Fitness"
                homeValue={result.stats.home.averageEndFitness}
                awayValue={result.stats.away.averageEndFitness}
                unit="%"
              />
            </div>
          </section>

          {/* Squad Fatigue & Performance Card */}
          <section
            aria-labelledby="fatigue-report-heading"
            className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-xl sm:p-6"
          >
            <div className="border-b border-slate-800/80 pb-3">
              <h3
                id="fatigue-report-heading"
                className="text-base font-bold text-white"
              >
                {result.homeTeam.shortName} Post-Match Fatigue & Output
              </h3>
              <p className="text-xs text-slate-400">
                Starting XI stamina drain across 90 minutes ({result.homeTeam.tactics.pressingIntensity})
              </p>
            </div>

            <div className="mt-3 max-h-64 divide-y divide-slate-800/60 overflow-y-auto pr-1 text-xs">
              {result.homeTeam.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 font-mono text-[11px] font-bold text-emerald-400">
                      {p.position}
                    </span>
                    <span className="font-semibold text-white">{p.name}</span>
                    {p.goals > 0 && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                        ⚽ {p.goals}
                      </span>
                    )}
                    {p.assists > 0 && (
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-300">
                        🅰️ {p.assists}
                      </span>
                    )}
                    {p.saves > 0 && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                        🧤 {p.saves} sv
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-slate-400">
                      {p.startFitness}% →{" "}
                      <strong className="text-emerald-300">
                        {p.endFitness}%
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
