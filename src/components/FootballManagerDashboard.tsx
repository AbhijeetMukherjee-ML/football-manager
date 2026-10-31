"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AWAY_SQUAD_PLAYERS,
  AWAY_TACTICS,
  CLUB_INFO,
  HOME_TACTICS,
  MANAGER_PROFILE,
  NEXT_FIXTURE,
  SQUAD_PLAYERS,
} from "@/data/mockClubData";
import type { PersistedClubAndSeasonState } from "@/db/repository";
import {
  MatchSimulationResult,
  simulateMatch,
  TacticalSettings,
} from "@/engine/matchEngine";
import {
  ClubInfo,
  ManagerProfile,
  NavigationSection,
  NextFixture,
  Player,
  PositionGroup,
} from "@/types/football";
import { Header } from "./Header";
import { MatchCentre } from "./MatchCentre";
import { MatchViewer } from "./match-viewer/MatchViewer";
import { NextMatchCard } from "./NextMatchCard";
import { PlaceholderSection } from "./PlaceholderSection";
import { QuickActionsCard } from "./QuickActionsCard";
import { Sidebar } from "./Sidebar";
import { SquadTable } from "./SquadTable";
import { StatsGrid } from "./StatsGrid";

interface PersistenceBannerState {
  status: "loading" | "connected" | "error";
  code?: string;
  message?: string;
  remediation?: string[];
}

export function FootballManagerDashboard() {
  const [activeSection, setActiveSection] =
    useState<NavigationSection>("overview");
  const [selectedPosition, setSelectedPosition] =
    useState<PositionGroup>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [matchCentreOpen, setMatchCentreOpen] = useState<boolean>(false);
  const [pitchViewerOpen, setPitchViewerOpen] = useState<boolean>(false);

  // Club, Manager, Squad & Fixture State (hydrated from PostgreSQL when available)
  const [club, setClub] = useState<ClubInfo>(CLUB_INFO);
  const [manager, setManager] = useState<ManagerProfile>(MANAGER_PROFILE);
  const [players, setPlayers] = useState<Player[]>(SQUAD_PLAYERS);
  const [awayPlayers, setAwayPlayers] =
    useState<Player[]>(AWAY_SQUAD_PLAYERS);
  const [homeTactics, setHomeTactics] =
    useState<TacticalSettings>(HOME_TACTICS);
  const [awayTactics, setAwayTactics] =
    useState<TacticalSettings>(AWAY_TACTICS);
  const [nextFixture, setNextFixture] = useState<NextFixture>(NEXT_FIXTURE);
  const [simulationCount, setSimulationCount] = useState<number>(0);
  const [latestMatchResult, setLatestMatchResult] =
    useState<MatchSimulationResult | null>(null);
  const [recentMatches, setRecentMatches] = useState<MatchSimulationResult[]>(
    []
  );

  const [persistenceBanner, setPersistenceBanner] =
    useState<PersistenceBannerState>({
      status: "loading",
    });

  const applyPersistedState = useCallback(
    (data: PersistedClubAndSeasonState) => {
      setClub(data.club);
      setManager(data.manager);
      setPlayers(data.players);
      setAwayPlayers(data.awayPlayers);
      setHomeTactics(data.homeTactics);
      setAwayTactics(data.awayTactics);
      setNextFixture(data.nextFixture);
      setSimulationCount(data.simulationCount);
      setRecentMatches(data.recentMatches);

      if (data.recentMatches.length > 0) {
        let targetMatch = data.recentMatches[0];
        if (typeof window !== "undefined") {
          const savedSeed = sessionStorage.getItem("fm_selected_match_seed");
          if (savedSeed) {
            const found = data.recentMatches.find((m) => m.seed === savedSeed);
            if (found) {
              targetMatch = found;
            }
          }
        }
        setLatestMatchResult(targetMatch);

        // Restore view if the user was viewing Match Centre or 3D Pitch Viewer on refresh
        if (typeof window !== "undefined") {
          const savedView = sessionStorage.getItem("fm_active_view");
          if (savedView === "match_centre") {
            setMatchCentreOpen(true);
            setPitchViewerOpen(false);
          } else if (savedView === "pitch_viewer") {
            setPitchViewerOpen(true);
            setMatchCentreOpen(false);
          }
        }
      } else {
        setLatestMatchResult(null);
      }
    },
    []
  );

  const fetchPersistedClubData = useCallback(async () => {
    setPersistenceBanner({ status: "loading" });
    try {
      const response = await fetch("/api/club", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: PersistedClubAndSeasonState;
        code?: string;
        error?: string;
        remediation?: string[];
      };

      if (!response.ok || !payload.ok || !payload.data) {
        setPersistenceBanner({
          status: "error",
          code: payload.code ?? "DATABASE_UNAVAILABLE",
          message:
            payload.error ??
            "PostgreSQL database is unavailable. Configure DATABASE_URL in .env.local.",
          remediation: payload.remediation,
        });
        return;
      }

      applyPersistedState(payload.data);
      setPersistenceBanner({
        status: "connected",
        message: `PostgreSQL connected • ${payload.data.simulationCount} persisted match(es) • ${payload.data.nextFixture.matchdayLabel}`,
      });
    } catch (err) {
      setPersistenceBanner({
        status: "error",
        code: "NETWORK_OR_DB_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Failed to reach /api/club persistence endpoint.",
      });
    }
  }, [applyPersistedState]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPersistedClubData();
  }, [fetchPersistedClubData]);

  const handleResetPersistedSeason = async () => {
    try {
      const response = await fetch("/api/club", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_season" }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: PersistedClubAndSeasonState;
        code?: string;
        error?: string;
        remediation?: string[];
      };

      if (!response.ok || !payload.ok || !payload.data) {
        setPersistenceBanner({
          status: "error",
          code: payload.code,
          message: payload.error,
          remediation: payload.remediation,
        });
        return;
      }

      applyPersistedState(payload.data);
      setLatestMatchResult(null);
      setRecentMatches([]);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("fm_active_view");
        sessionStorage.removeItem("fm_selected_match_seed");
      }
      setPersistenceBanner({
        status: "connected",
        message:
          "PostgreSQL season reset to Matchday 9 baseline (19 pts, 8 played).",
      });
    } catch (err) {
      setPersistenceBanner({
        status: "error",
        code: "RESET_ERROR",
        message:
          err instanceof Error ? err.message : "Failed to reset season data.",
      });
    }
  };

  const handleReturnToDashboard = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("fm_active_view", "dashboard");
    }
    setMatchCentreOpen(false);
    setPitchViewerOpen(false);
  };

  const handleOpenMatchCentre = (match?: MatchSimulationResult) => {
    const selected = match ?? latestMatchResult;
    if (selected) {
      setLatestMatchResult(selected);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("fm_active_view", "match_centre");
        sessionStorage.setItem("fm_selected_match_seed", selected.seed);
      }
    }
    setPitchViewerOpen(false);
    setMatchCentreOpen(true);
  };

  const handleOpenPitchViewer = (match?: MatchSimulationResult) => {
    const selected = match ?? latestMatchResult;
    if (selected) {
      setLatestMatchResult(selected);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("fm_active_view", "pitch_viewer");
        sessionStorage.setItem("fm_selected_match_seed", selected.seed);
      }
    } else {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("fm_active_view", "pitch_viewer");
      }
    }
    setMatchCentreOpen(false);
    setPitchViewerOpen(true);
  };

  const handleRunSimulation = async () => {
    const nextRunNumber = simulationCount + 1;
    const fixturePrefix = nextFixture.id.replace(/^fix-/, "");
    // Generate a unique, reproducible seed per user click action
    const entropy = Math.floor(Math.random() * 1_000_000)
      .toString(36)
      .padStart(4, "0");
    const seed = `${fixturePrefix}-run-${nextRunNumber}-${entropy}`;

    const homeStarters = players.filter((p) => p.status === "Starting XI");
    const awayStarters = awayPlayers.filter((p) => p.status === "Starting XI");

    const result = simulateMatch({
      homeTeam: {
        name: nextFixture.homeClub.name,
        shortName: nextFixture.homeClub.shortName,
        abbreviation: nextFixture.homeClub.abbreviation,
        primaryColor: nextFixture.homeClub.primaryColor,
        formation: manager.preferredFormation || "4-3-3 Gegenpress",
        tactics: homeTactics,
        availablePlayers: players,
        startingLineup: homeStarters,
      },
      awayTeam: {
        name: nextFixture.awayClub.name,
        shortName: nextFixture.awayClub.shortName,
        abbreviation: nextFixture.awayClub.abbreviation,
        primaryColor: nextFixture.awayClub.primaryColor,
        formation: "4-2-3-1 Balanced",
        tactics: awayTactics,
        availablePlayers: awayPlayers,
        startingLineup: awayStarters,
      },
      seed,
      competition: nextFixture.competition,
      venue: nextFixture.venue,
    });

    setSimulationCount(nextRunNumber);
    setLatestMatchResult(result);
    setPitchViewerOpen(false);
    setMatchCentreOpen(true);

    if (typeof window !== "undefined") {
      sessionStorage.setItem("fm_active_view", "match_centre");
      sessionStorage.setItem("fm_selected_match_seed", seed);
    }

    // Persist completed match transactionally to PostgreSQL via /api/matches
    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result,
          fixtureId: nextFixture.id,
          submissionKey: `${nextFixture.id}:${seed}`,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        duplicate?: boolean;
        data?: PersistedClubAndSeasonState;
        code?: string;
        error?: string;
        remediation?: string[];
      };

      if (!response.ok || !payload.ok || !payload.data) {
        setPersistenceBanner({
          status: "error",
          code: payload.code ?? "DATABASE_UNAVAILABLE",
          message:
            payload.error ??
            "Match simulated locally, but PostgreSQL persistence failed.",
          remediation: payload.remediation,
        });
        return;
      }

      applyPersistedState(payload.data);
      setPersistenceBanner({
        status: "connected",
        message: `Match persisted to PostgreSQL (seed: ${seed}) • ${payload.data.club.leagueStanding}`,
      });
    } catch (err) {
      setPersistenceBanner({
        status: "error",
        code: "MATCH_PERSIST_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Failed to persist match result to /api/matches.",
      });
    }
  };

  const handleSelectSection = (section: NavigationSection) => {
    setMatchCentreOpen(false);
    setPitchViewerOpen(false);
    setActiveSection(section);
  };

  return (
    <div className="flex min-h-dvh bg-[#060d1b] text-slate-100 selection:bg-emerald-500 selection:text-slate-950">
      {/* Sidebar Navigation */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        squadCount={players.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          club={club}
          manager={manager}
          activeSection={activeSection}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSelectSection={handleSelectSection}
        />

        <main className="flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {/* Stage 7 PostgreSQL Persistence Status Strip */}
          {persistenceBanner.status === "error" && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4 text-xs text-amber-200 shadow-lg"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300 uppercase">
                    PostgreSQL Persistence Error ({persistenceBanner.code})
                  </span>
                  <span className="font-semibold text-white">
                    {persistenceBanner.message}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchPersistedClubData()}
                  className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1 font-semibold text-amber-200 transition-colors hover:bg-amber-500/30"
                >
                  Retry Database Connection
                </button>
              </div>
              {persistenceBanner.remediation &&
                persistenceBanner.remediation.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-[11px] text-slate-300">
                    {persistenceBanner.remediation.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                )}
            </div>
          )}

          {persistenceBanner.status === "connected" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-mono text-[11px] font-bold text-emerald-300 uppercase">
                  PostgreSQL Connected
                </span>
                <span className="text-slate-300">
                  {persistenceBanner.message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleResetPersistedSeason()}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                Reset Season to Matchday 9
              </button>
            </div>
          )}

          {pitchViewerOpen ? (
            <MatchViewer
              key={latestMatchResult?.seed ?? "pitch-viewer"}
              homeClubName={
                latestMatchResult?.homeTeam.name ?? nextFixture.homeClub.name
              }
              homeAbbreviation={
                latestMatchResult?.homeTeam.abbreviation ??
                nextFixture.homeClub.abbreviation
              }
              awayClubName={
                latestMatchResult?.awayTeam.name ?? nextFixture.awayClub.name
              }
              awayAbbreviation={
                latestMatchResult?.awayTeam.abbreviation ??
                nextFixture.awayClub.abbreviation
              }
              venue={latestMatchResult?.venue ?? nextFixture.venue}
              competition={
                latestMatchResult?.competition ?? nextFixture.competition
              }
              initialSeed={
                latestMatchResult?.seed ?? "stage5-live-match-seed-1"
              }
              onReturnToDashboard={handleReturnToDashboard}
              onOpenTextSimulation={() => void handleRunSimulation()}
            />
          ) : matchCentreOpen && latestMatchResult ? (
            <MatchCentre
              result={latestMatchResult}
              simulationCount={simulationCount}
              onSimulateAgain={() => void handleRunSimulation()}
              onReturnToDashboard={handleReturnToDashboard}
              recentMatches={recentMatches}
              onSelectMatch={handleOpenMatchCentre}
            />
          ) : (
            <>
              {activeSection === "overview" && (
                <>
                  {/* Key Club Metrics */}
                  <StatsGrid
                    club={club}
                    players={players}
                    nextFixture={nextFixture}
                  />

                  {/* Next Match Card + Quick Actions */}
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <div className="xl:col-span-2">
                      <NextMatchCard
                        fixture={nextFixture}
                        onSimulateMatch={() => void handleRunSimulation()}
                        onOpen3DPitch={() => handleOpenPitchViewer()}
                        latestResult={latestMatchResult}
                        onOpenMatchCentre={() => handleOpenMatchCentre()}
                        recentMatches={recentMatches}
                        onSelectMatch={handleOpenMatchCentre}
                      />
                    </div>
                    <div>
                      <QuickActionsCard
                        onNavigate={handleSelectSection}
                        onQuickFilterPosition={setSelectedPosition}
                      />
                    </div>
                  </div>

                  {/* Squad Table with working position filter & search */}
                  <SquadTable
                    players={players}
                    selectedPosition={selectedPosition}
                    onSelectPosition={setSelectedPosition}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                </>
              )}

              {activeSection === "squad" && (
                <>
                  <StatsGrid
                    club={club}
                    players={players}
                    nextFixture={nextFixture}
                  />
                  <SquadTable
                    players={players}
                    selectedPosition={selectedPosition}
                    onSelectPosition={setSelectedPosition}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                  />
                </>
              )}

              {activeSection !== "overview" && activeSection !== "squad" && (
                <PlaceholderSection
                  section={activeSection}
                  players={players}
                  onNavigate={handleSelectSection}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
