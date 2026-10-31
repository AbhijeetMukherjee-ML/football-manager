"use client";

import { useMemo, useState } from "react";
import { Player, PositionGroup } from "@/types/football";

interface SquadTableProps {
  players: Player[];
  selectedPosition: PositionGroup;
  onSelectPosition: (group: PositionGroup) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

type SortField = "shirtNumber" | "overall" | "potential" | "age" | "weeklyWage";

const POSITION_FILTERS: { id: PositionGroup; label: string }[] = [
  { id: "ALL", label: "All Positions" },
  { id: "GK", label: "Goalkeepers (GK)" },
  { id: "DEF", label: "Defenders (DEF)" },
  { id: "MID", label: "Midfielders (MID)" },
  { id: "FWD", label: "Forwards (FWD)" },
];

function getPositionBadgeClass(group: Player["positionGroup"]): string {
  switch (group) {
    case "GK":
      return "bg-amber-500/15 text-amber-300 border-amber-500/35";
    case "DEF":
      return "bg-sky-500/15 text-sky-300 border-sky-500/35";
    case "MID":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/35";
    case "FWD":
      return "bg-rose-500/15 text-rose-300 border-rose-500/35";
  }
}

function getRatingColorClass(rating: number): string {
  if (rating >= 84) return "bg-emerald-500 text-slate-950 font-black";
  if (rating >= 80) return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold";
  return "bg-slate-800 text-slate-200 border border-slate-700 font-bold";
}

export function SquadTable({
  players,
  selectedPosition,
  onSelectPosition,
  searchQuery,
  onSearchChange,
}: SquadTableProps) {
  const [sortBy, setSortBy] = useState<SortField>("overall");
  const [sortDesc, setSortDesc] = useState<boolean>(true);

  const countsByGroup = useMemo(() => {
    return {
      ALL: players.length,
      GK: players.filter((p) => p.positionGroup === "GK").length,
      DEF: players.filter((p) => p.positionGroup === "DEF").length,
      MID: players.filter((p) => p.positionGroup === "MID").length,
      FWD: players.filter((p) => p.positionGroup === "FWD").length,
    };
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return players
      .filter((player) => {
        const matchesPosition =
          selectedPosition === "ALL" ||
          player.positionGroup === selectedPosition ||
          player.position.toLowerCase() === selectedPosition.toLowerCase();

        const matchesName =
          normalizedQuery.length === 0 ||
          player.name.toLowerCase().includes(normalizedQuery) ||
          player.position.toLowerCase().includes(normalizedQuery) ||
          player.nationality.toLowerCase().includes(normalizedQuery);

        return matchesPosition && matchesName;
      })
      .sort((a, b) => {
        const diff = a[sortBy] - b[sortBy];
        return sortDesc ? -diff : diff;
      });
  }, [players, selectedPosition, searchQuery, sortBy, sortDesc]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDesc((prev) => !prev);
    } else {
      setSortBy(field);
      setSortDesc(field !== "shirtNumber" && field !== "age");
    }
  };

  const totalFilteredWages = filteredPlayers.reduce(
    (sum, p) => sum + p.weeklyWage,
    0
  );

  return (
    <section
      aria-labelledby="squad-table-heading"
      className="rounded-2xl border border-slate-800/90 bg-slate-900/75 shadow-xl"
    >
      {/* Top Controls Bar */}
      <div className="border-b border-slate-800/80 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="squad-table-heading"
                className="text-lg font-bold tracking-tight text-white sm:text-xl"
              >
                First Team Squad Roster
              </h2>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                {filteredPlayers.length} / {players.length} Players
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 sm:text-sm">
              Filter by tactical unit or search players by name, specific role (e.g. ST, CB) or nationality.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full lg:w-80">
            <label htmlFor="player-search-input" className="sr-only">
              Search players by name
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              id="player-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search player name (e.g. Viktor, Castellano)..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/90 py-2.5 pr-9 pl-10 text-sm text-white placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white"
                aria-label="Clear search query"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Position Group Filter Pills */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Filter squad by position group"
            className="flex flex-wrap items-center gap-2"
          >
            {POSITION_FILTERS.map((filter) => {
              const active = selectedPosition === filter.id;
              const count = countsByGroup[filter.id];
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => onSelectPosition(filter.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
                    active
                      ? "bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-950"
                      : "border border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                      active
                        ? "bg-slate-950/20 text-slate-950 font-bold"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {(selectedPosition !== "ALL" || searchQuery.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                onSelectPosition("ALL");
                onSearchChange("");
              }}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Responsive Semantic Table Region */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="squad-table-heading"
        className="overflow-x-auto focus:outline-none"
      >
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <caption className="sr-only">
            Northbridge Athletic FC squad players with position, age, overall rating, potential and weekly wage
          </caption>
          <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 text-[11px] font-semibold tracking-wider text-slate-400 uppercase backdrop-blur-xs">
            <tr>
              <th scope="col" className="py-3.5 pr-3 pl-6">
                <button
                  type="button"
                  onClick={() => handleSort("shirtNumber")}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <span>#</span>
                  {sortBy === "shirtNumber" && (
                    <span>{sortDesc ? "↓" : "↑"}</span>
                  )}
                </button>
              </th>
              <th scope="col" className="px-4 py-3.5">
                Player
              </th>
              <th scope="col" className="px-4 py-3.5">
                Position
              </th>
              <th scope="col" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleSort("age")}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <span>Age</span>
                  {sortBy === "age" && <span>{sortDesc ? "↓" : "↑"}</span>}
                </button>
              </th>
              <th scope="col" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleSort("overall")}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                >
                  <span>Overall</span>
                  {sortBy === "overall" && <span>{sortDesc ? "↓" : "↑"}</span>}
                </button>
              </th>
              <th scope="col" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleSort("potential")}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <span>Potential</span>
                  {sortBy === "potential" && (
                    <span>{sortDesc ? "↓" : "↑"}</span>
                  )}
                </button>
              </th>
              <th scope="col" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => handleSort("weeklyWage")}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <span>Weekly Wage</span>
                  {sortBy === "weeklyWage" && (
                    <span>{sortDesc ? "↓" : "↑"}</span>
                  )}
                </button>
              </th>
              <th scope="col" className="py-3.5 pr-6 pl-4 text-right">
                Role & Fitness
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <p className="text-base font-semibold text-white">
                    No players match your current filter
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Try clearing the search query or switching the position filter back to All Positions.
                  </p>
                </td>
              </tr>
            ) : (
              filteredPlayers.map((player) => {
                const growthGap = player.potential - player.overall;
                return (
                  <tr
                    key={player.id}
                    className="group transition-colors hover:bg-slate-800/45"
                  >
                    {/* Shirt # */}
                    <td className="py-3.5 pr-3 pl-6 font-mono text-xs font-bold text-slate-400">
                      {player.shirtNumber}
                    </td>

                    {/* Sticky Row Header: Player Name & Nationality */}
                    <th
                      scope="row"
                      className="px-4 py-3.5 font-normal text-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/90 font-mono text-xs font-bold text-emerald-300">
                          {player.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div>
                          <p className="font-semibold text-white group-hover:text-emerald-300">
                            {player.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {player.nationality} • {player.preferredFoot} Foot
                          </p>
                        </div>
                      </div>
                    </th>

                    {/* Position */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex w-12 items-center justify-center rounded-lg border px-2 py-0.5 font-mono text-xs font-bold ${getPositionBadgeClass(
                            player.positionGroup
                          )}`}
                        >
                          {player.position}
                        </span>
                        <span className="text-xs text-slate-500">
                          {player.positionGroup}
                        </span>
                      </div>
                    </td>

                    {/* Age */}
                    <td className="px-4 py-3.5 font-mono text-sm text-slate-300">
                      {player.age}
                    </td>

                    {/* Overall Rating */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`inline-flex h-7 w-9 items-center justify-center rounded-lg font-mono text-xs ${getRatingColorClass(
                            player.overall
                          )}`}
                        >
                          {player.overall}
                        </span>
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-800 sm:block">
                          <div
                            className="h-full rounded-full bg-emerald-400"
                            style={{ width: `${player.overall}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Potential Rating */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 font-mono text-xs font-bold text-amber-300">
                          {player.potential}
                        </span>
                        {growthGap > 0 ? (
                          <span className="font-mono text-[11px] font-semibold text-emerald-400">
                            +{growthGap}
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-500">
                            Peak
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Weekly Wage */}
                    <td className="px-4 py-3.5 font-mono text-sm font-semibold text-slate-200">
                      £{player.weeklyWage.toLocaleString("en-GB")}
                      <span className="text-xs font-normal text-slate-500">
                        /wk
                      </span>
                    </td>

                    {/* Squad Status & Fitness */}
                    <td className="py-3.5 pr-6 pl-4 text-right">
                      <div className="inline-flex flex-col items-end">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            player.status === "Starting XI"
                              ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {player.status}
                        </span>
                        <span className="mt-1 font-mono text-[11px] text-slate-400">
                          Fit {player.fitness}% • {player.morale}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer Summary */}
      <div className="flex flex-col justify-between gap-2 border-t border-slate-800/80 bg-slate-950/40 px-6 py-3.5 text-xs text-slate-400 sm:flex-row sm:items-center">
        <span>
          Showing <strong className="text-white">{filteredPlayers.length}</strong> of{" "}
          <strong className="text-white">{players.length}</strong> fictional first-team squad members
        </span>
        <span className="font-mono">
          Filtered Weekly Wage Bill:{" "}
          <strong className="text-emerald-400">
            £{totalFilteredWages.toLocaleString("en-GB")}/wk
          </strong>
        </span>
      </div>
    </section>
  );
}
