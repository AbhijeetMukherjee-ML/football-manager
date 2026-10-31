"use client";

import dynamic from "next/dynamic";
import React, { Component, type ReactNode, useCallback, useState } from "react";
import type { MatchEvent, MatchEventType } from "@/engine/matchEngine";
import {
  INITIAL_AWAY_PLAYERS_4231,
  INITIAL_BALL_STATE,
  INITIAL_HOME_PLAYERS_433,
  INITIAL_PITCH_PLAYERS,
} from "./formationData";
import {
  type LiveMatchSnapshot,
  MatchPlaybackController,
  type PlaybackSpeed,
  type ViewerSimulationMode,
} from "./matchVisualizer";
import type { DemoPhaseInfo } from "./movementSystem";
import type {
  CameraPreset,
  EngineMatchControlCommand,
} from "./PitchScene3D";

const PitchScene3D = dynamic(() => import("./PitchScene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#060d1b] p-6 text-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      <p className="mt-3 font-mono text-xs font-semibold tracking-wider text-emerald-300 uppercase">
        Initializing 3D WebGL Match Scene...
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Loading 105m × 68m pitch, 22 players, ball physics &amp; match engine
      </p>
    </div>
  ),
});

interface WebGLErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
}

class WebGLErrorBoundary extends Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  constructor(props: WebGLErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function detectWebGLSupport(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export interface MatchViewerProps {
  homeClubName?: string;
  homeAbbreviation?: string;
  awayClubName?: string;
  awayAbbreviation?: string;
  venue?: string;
  competition?: string;
  initialSeed?: string | number;
  defaultMode?: ViewerSimulationMode;
  onReturnToDashboard?: () => void;
  onOpenTextSimulation?: () => void;
}

const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: "tactical", label: "Tactical Broadcast (Default)" },
  { id: "overhead", label: "Top-Down Overhead" },
  { id: "home-end", label: "Home Goal End" },
  { id: "away-end", label: "Away Goal End" },
];

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [1, 2, 4];

const INITIAL_DEMO_PHASE: DemoPhaseInfo = {
  stepIndex: 1,
  totalSteps: 6,
  title: "Ready at Kickoff • 4-3-3 vs 4-2-3-1",
  description:
    'Click "Play Movement Demo" to watch a coordinated 6-phase passing build-up and tactical repositioning sequence.',
  ballCarrierLabel: "Centre Spot (0, 0) • Ready",
};

function createInitialSnapshot(seed: string | number): LiveMatchSnapshot {
  const temp = new MatchPlaybackController();
  temp.restart(seed);
  return temp.getSnapshot();
}

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
        className: "bg-amber-400 text-slate-950 font-black",
      };
    case "full_time":
      return {
        label: "FULL-TIME",
        className: "bg-white text-slate-950 font-black",
      };
  }
}

function LiveStatBar({
  label,
  homeValue,
  awayValue,
  unit = "",
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  unit?: string;
}) {
  const total = homeValue + awayValue;
  const homePct = total === 0 ? 50 : Math.round((homeValue / total) * 100);
  const awayPct = 100 - homePct;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="font-mono text-xs font-bold text-emerald-300">
          {homeValue}
          {unit}
        </span>
        <span className="text-[11px] tracking-wider text-slate-300 uppercase">
          {label}
        </span>
        <span className="font-mono text-xs font-bold text-amber-300">
          {awayValue}
          {unit}
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800 p-0.5">
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

export function MatchViewer({
  homeClubName = "Northbridge Athletic FC",
  homeAbbreviation = "NBA",
  awayClubName = "Castlemere Rovers FC",
  awayAbbreviation = "CMR",
  venue = "Ironbridge Park",
  competition = "Premier Crown Division",
  initialSeed = "stage5-live-match-seed-1",
  defaultMode = "engine_match",
  onReturnToDashboard,
  onOpenTextSimulation,
}: MatchViewerProps) {
  const [mode, setMode] = useState<ViewerSimulationMode>(defaultMode);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("tactical");
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const [webGLSupported] = useState<boolean>(() => detectWebGLSupport());

  // Stage 5 Live Match Engine Controls & Synchronized State
  const [matchSeed, setMatchSeed] = useState<string | number>(initialSeed);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [matchCommand, setMatchCommand] =
    useState<EngineMatchControlCommand | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveMatchSnapshot>(() =>
    createInitialSnapshot(initialSeed)
  );
  const [commentaryFilter, setCommentaryFilter] = useState<
    "all" | "highlights" | "goals"
  >("all");

  // Stage 3 Movement & Ball Passing Demo Controls (Preserved)
  const [isDemoPlaying, setIsDemoPlaying] = useState<boolean>(false);
  const [demoResetTrigger, setDemoResetTrigger] = useState<number>(0);
  const [demoPhase, setDemoPhase] = useState<DemoPhaseInfo>(INITIAL_DEMO_PHASE);

  const dispatchMatchAction = useCallback(
    (
      action: EngineMatchControlCommand["action"],
      seedOverride?: string | number
    ) => {
      setMatchCommand((prev) => ({
        id: (prev?.id ?? 0) + 1,
        action,
        seed: seedOverride,
      }));
    },
    []
  );

  const handlePlayOrResumeMatch = () => {
    if (liveSnapshot.phase === "paused") {
      dispatchMatchAction("resume");
    } else {
      dispatchMatchAction("play");
    }
  };

  const handlePauseMatch = () => {
    dispatchMatchAction("pause");
  };

  const handleRestartMatch = (useNewSeed = false) => {
    const nextSeed = useNewSeed
      ? `stage5-live-${Math.floor(Math.random() * 900_000 + 100_000)}`
      : matchSeed;
    if (useNewSeed) {
      setMatchSeed(nextSeed);
    }
    dispatchMatchAction("restart", nextSeed);
  };

  const handleSkipMilestone = () => {
    dispatchMatchAction("skip_milestone");
  };

  const handleToggleDemo = () => {
    setIsDemoPlaying((prev) => !prev);
  };

  const handleResetDemo = () => {
    setIsDemoPlaying(false);
    setDemoResetTrigger((n) => n + 1);
    setDemoPhase(INITIAL_DEMO_PHASE);
  };

  const filteredLiveEvents = liveSnapshot.events
    .filter((e) => {
      if (commentaryFilter === "goals") {
        return (
          e.type === "goal" ||
          e.type === "half_time" ||
          e.type === "full_time"
        );
      }
      if (commentaryFilter === "highlights") {
        return (
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
      return true;
    })
    .slice()
    .reverse();

  const webGLFallbackView = (
    <div
      role="alert"
      className="flex h-full w-full flex-col items-center justify-center bg-slate-950 p-6 text-center"
    >
      <div className="max-w-md space-y-3 rounded-2xl border border-amber-500/40 bg-slate-900/90 p-6 shadow-xl">
        <span className="inline-block rounded-full bg-amber-500/20 px-3 py-1 font-mono text-xs font-bold text-amber-300 uppercase">
          WebGL 3D Unavailable • 2D Tactical Fallback Active
        </span>
        <h3 className="text-base font-bold text-white">
          3D Graphics Hardware Acceleration Not Detected
        </h3>
        <p className="text-xs leading-relaxed text-slate-300">
          Your browser or graphics environment does not currently expose a WebGL
          context. The live match scoreboard, commentary feed, and match engine
          remain available below.
        </p>
        {onOpenTextSimulation && (
          <button
            type="button"
            onClick={onOpenTextSimulation}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
          >
            Open Full Match Centre Simulation →
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section
      aria-label="3D Football Match Pitch Viewer"
      className="space-y-4"
    >
      {/* Top Header & Mode / Camera Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-xl sm:p-5 xl:flex-row xl:items-center">
        <div className="flex flex-wrap items-center gap-3">
          {onReturnToDashboard && (
            <button
              type="button"
              onClick={onReturnToDashboard}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              <span>← Return to Dashboard</span>
            </button>
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300 uppercase ring-1 ring-emerald-500/30">
                {mode === "engine_match"
                  ? "3D Match Engine Playback • Stage 5"
                  : "3D Movement & Passing Demo • Stage 3"}
              </span>
              <span className="text-xs text-slate-400">
                {competition} • {venue}
              </span>
            </div>
            <h2 className="mt-1 text-base font-bold text-white sm:text-lg">
              {homeClubName} ({homeAbbreviation} • 4-3-3) vs {awayClubName} (
              {awayAbbreviation} • 4-2-3-1)
            </h2>
          </div>
        </div>

        {/* Mode Switcher + Camera Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher: Live Match Engine vs Stage 3 Movement Demo */}
          <div
            role="group"
            aria-label="Simulation Mode Selector"
            className="inline-flex rounded-xl border border-slate-700 bg-slate-950/90 p-1"
          >
            <button
              type="button"
              onClick={() => {
                setIsDemoPlaying(false);
                setMode("engine_match");
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                mode === "engine_match"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              ⚽ Live Match Simulation
            </button>
            <button
              type="button"
              onClick={() => {
                dispatchMatchAction("pause");
                setMode("movement_demo");
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                mode === "movement_demo"
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🎯 Movement Demo (Stage 3)
            </button>
          </div>

          <div
            role="group"
            aria-label="3D Camera Angle Presets"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/85 p-1"
          >
            {CAMERA_PRESETS.map((preset) => {
              const active = cameraPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setCameraPreset(preset.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-emerald-500 font-bold text-slate-950"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setResetTrigger((n) => n + 1)}
            className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          >
            Reset Camera
          </button>

          {onOpenTextSimulation && (
            <button
              type="button"
              onClick={onOpenTextSimulation}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25"
            >
              Open Match Simulation Log →
            </button>
          )}
        </div>
      </div>

      {/* Live Match Scoreboard & Playback Control Bar (Stage 5) OR Demo Control Bar (Stage 3) */}
      {mode === "engine_match" ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-[#0a172b] via-[#071120] to-[#0a1f1c] p-4 shadow-xl sm:p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            {/* Live Scoreboard & Match Clock */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {/* Home Team */}
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-10 w-12 items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-500 font-mono text-sm font-black text-slate-950 shadow">
                  {homeAbbreviation}
                </span>
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase">
                    Home • 4-3-3
                  </p>
                  <p className="text-sm font-extrabold text-white sm:text-base">
                    {homeClubName}
                  </p>
                </div>
              </div>

              {/* Score Box + Clock + Phase */}
              <div className="flex flex-col items-center rounded-xl border border-slate-700/80 bg-slate-950/90 px-5 py-2 shadow-inner">
                <div className="flex items-center gap-3">
                  <span
                    data-testid="live-home-score"
                    className="font-mono text-2xl font-black text-white sm:text-3xl"
                  >
                    {liveSnapshot.homeScore}
                  </span>
                  <span className="font-mono text-lg font-bold text-slate-500">
                    -
                  </span>
                  <span
                    data-testid="live-away-score"
                    className="font-mono text-2xl font-black text-white sm:text-3xl"
                  >
                    {liveSnapshot.awayScore}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    data-testid="live-match-clock"
                    className="font-mono text-xs font-bold text-emerald-300"
                  >
                    {liveSnapshot.clockLabel}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span
                    data-testid="live-match-phase"
                    className="font-mono text-[11px] font-semibold text-amber-300"
                  >
                    {liveSnapshot.phaseLabel}
                  </span>
                </div>
              </div>

              {/* Away Team */}
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-10 w-12 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-500 font-mono text-sm font-black text-slate-950 shadow">
                  {awayAbbreviation}
                </span>
                <div>
                  <p className="text-xs font-bold text-amber-400 uppercase">
                    Away • 4-2-3-1
                  </p>
                  <p className="text-sm font-extrabold text-white sm:text-base">
                    {awayClubName}
                  </p>
                </div>
              </div>
            </div>

            {/* Playback Controls: Play / Pause / Resume / Restart / Speed (1x, 2x, 4x) */}
            <div className="flex flex-wrap items-center gap-2">
              {liveSnapshot.isPlaying ? (
                <button
                  type="button"
                  onClick={handlePauseMatch}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-lg transition-colors hover:bg-amber-400"
                >
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                  </svg>
                  <span>Pause Match</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={liveSnapshot.phase === "full_time"}
                  onClick={handlePlayOrResumeMatch}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/60 bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-lg transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>
                    {liveSnapshot.phase === "paused" ||
                    liveSnapshot.phase === "half_time"
                      ? "Resume Match"
                      : liveSnapshot.phase === "full_time"
                        ? "Full-Time Reached"
                        : "Play Match"}
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={liveSnapshot.phase === "full_time"}
                onClick={handleSkipMilestone}
                className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-300 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {liveSnapshot.half === 1 &&
                liveSnapshot.phase !== "half_time"
                  ? "Skip to Half-Time ⏭"
                  : "Skip to Full-Time ⏭"}
              </button>

              <button
                type="button"
                onClick={() => handleRestartMatch(false)}
                className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                Restart Match
              </button>

              <button
                type="button"
                onClick={() => handleRestartMatch(true)}
                className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-500/40 hover:bg-slate-800"
              >
                New Match Seed
              </button>

              {/* Speed Controls: 1x, 2x, 4x */}
              <div
                role="group"
                aria-label="Simulation Playback Speed"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/90 p-1"
              >
                <span className="px-2 font-mono text-[10px] font-bold text-slate-400 uppercase">
                  Speed
                </span>
                {PLAYBACK_SPEEDS.map((spd) => {
                  const active = playbackSpeed === spd;
                  return (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setPlaybackSpeed(spd)}
                      className={`rounded-lg px-2.5 py-1 font-mono text-xs font-bold transition-colors ${
                        active
                          ? "bg-emerald-500 text-slate-950"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      {spd}×
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live Ticker Strip: Latest Event + Possession + Seed */}
          <div className="mt-3 flex flex-col justify-between gap-2 border-t border-slate-800/80 pt-3 text-xs sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                LIVE TICKER
              </span>
              <span
                data-testid="live-latest-event"
                className="font-medium text-slate-200"
              >
                {liveSnapshot.latestEvent
                  ? `${liveSnapshot.latestEvent.minute}${
                      liveSnapshot.latestEvent.addedMinute
                        ? `+${liveSnapshot.latestEvent.addedMinute}`
                        : ""
                    }' — ${liveSnapshot.latestEvent.description}`
                  : 'Ready at Centre Spot (0, 0). Click "Play Match" to kick off the 3D match simulation.'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] text-slate-400">
              <span>
                Possession:{" "}
                <strong className="text-emerald-300">
                  {liveSnapshot.stats.home.possession}%
                </strong>{" "}
                –{" "}
                <strong className="text-amber-300">
                  {liveSnapshot.stats.away.possession}%
                </strong>
              </span>
              <span>•</span>
              <span>
                Seed: <strong className="text-slate-200">{liveSnapshot.seed}</strong>
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Stage 3 Movement Demo Controls & Telemetry Strip (Preserved) */
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800/90 bg-slate-950/90 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleDemo}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-extrabold shadow-lg transition-all ${
                isDemoPlaying
                  ? "border border-amber-400/60 bg-amber-500 text-slate-950 hover:bg-amber-400"
                  : "border border-emerald-400/60 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              }`}
            >
              <span>
                {isDemoPlaying ? "Pause Demo" : "Play Movement Demo"}
              </span>
            </button>

            <button
              type="button"
              onClick={handleResetDemo}
              className="rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              Reset Positions
            </button>

            <span className="font-mono text-xs font-bold text-emerald-300">
              {demoPhase.title}
            </span>
            <span className="hidden text-xs text-slate-400 md:inline">•</span>
            <span className="text-xs text-slate-300">
              {demoPhase.description}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
            <span className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-amber-300">
              ⚽ {demoPhase.ballCarrierLabel}
            </span>
          </div>
        </div>
      )}

      {/* 3D Canvas Viewport Container */}
      <div className="relative h-[440px] w-full overflow-hidden rounded-2xl border border-emerald-500/30 bg-[#060d1b] shadow-2xl sm:h-[540px] lg:h-[620px]">
        {/* Top-left Match & Formation HUD Overlay */}
        <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-950/85 px-3.5 py-2 backdrop-blur-xs">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-8 items-center justify-center rounded bg-emerald-500 font-mono text-xs font-black text-slate-950">
              {homeAbbreviation}
            </span>
            <span className="font-mono text-sm font-black text-white">
              {mode === "engine_match" ? liveSnapshot.homeScore : "4-3-3"}
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-slate-400">
            {mode === "engine_match" ? ":" : "VS"}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-black text-white">
              {mode === "engine_match" ? liveSnapshot.awayScore : "4-2-3-1"}
            </span>
            <span className="inline-flex h-6 w-8 items-center justify-center rounded bg-amber-500 font-mono text-xs font-black text-slate-950">
              {awayAbbreviation}
            </span>
          </div>
          <span className="border-l border-slate-800 pl-2.5 font-mono text-[11px] font-bold text-emerald-300">
            {mode === "engine_match"
              ? `${liveSnapshot.clockLabel} • ${liveSnapshot.phaseLabel} (${playbackSpeed}×)`
              : `Step ${demoPhase.stepIndex}/${demoPhase.totalSteps} • ${demoPhase.ballCarrierLabel}`}
          </span>
        </div>

        {/* Top-right Kit & Goalkeeper Legend Overlay */}
        <div className="pointer-events-none absolute top-4 right-4 z-10 hidden items-center gap-3 rounded-xl border border-slate-800/90 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur-xs xl:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>{homeAbbreviation} Outfield (10)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400 ring-1 ring-lime-300" />
            <span>{homeAbbreviation} GK (#1)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>{awayAbbreviation} Outfield (10)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500 ring-1 ring-yellow-300" />
            <span>{awayAbbreviation} GK (#1)</span>
          </span>
        </div>

        {/* Bottom-right Controls Help Overlay */}
        <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/90 bg-slate-950/80 px-3.5 py-2 text-[11px] text-slate-300 backdrop-blur-xs sm:left-auto">
          <span>
            <strong className="text-emerald-400">Controls:</strong> Drag / Touch
            to Orbit • Scroll / Pinch to Zoom • Right-Click to Pan
          </span>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
            {mode === "engine_match"
              ? "Stage 5: Deterministic Engine → 3D Match Playback"
              : "Stage 3: Delta-Time Player Movement & Ball Passing"}
          </span>
        </div>

        {/* Client-Only React Three Fiber Canvas wrapped in WebGL Error Boundary */}
        {webGLSupported ? (
          <WebGLErrorBoundary fallback={webGLFallbackView}>
            <PitchScene3D
              cameraPreset={cameraPreset}
              resetTrigger={resetTrigger}
              players={INITIAL_PITCH_PLAYERS}
              ball={INITIAL_BALL_STATE}
              mode={mode}
              matchSeed={matchSeed}
              playbackSpeed={playbackSpeed}
              matchCommand={matchCommand}
              onLiveMatchUpdate={setLiveSnapshot}
              isDemoPlaying={isDemoPlaying}
              demoResetTrigger={demoResetTrigger}
              onDemoPhaseChange={setDemoPhase}
            />
          </WebGLErrorBoundary>
        ) : (
          webGLFallbackView
        )}
      </div>

      {/* Synchronized Live Commentary & Live Statistics Panels (Stage 5) */}
      {mode === "engine_match" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Live Match Commentary Feed (7 cols) */}
          <div className="flex flex-col rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-xl xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase">
                  Live Synchronized Match Commentary
                </h3>
                <p className="text-xs text-slate-400">
                  Driven directly by the Stage 4 match engine ({liveSnapshot.events.length}{" "}
                  events recorded)
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
                {(
                  [
                    {
                      id: "all",
                      label: `All (${liveSnapshot.events.length})`,
                    },
                    { id: "highlights", label: "Key Highlights" },
                    {
                      id: "goals",
                      label: `Goals (${
                        liveSnapshot.homeScore + liveSnapshot.awayScore
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

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {filteredLiveEvents.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  No match events yet. Click &ldquo;Play Match&rdquo; above to
                  start the 3D match simulation.
                </p>
              ) : (
                filteredLiveEvents.map((event: MatchEvent) => {
                  const badge = getEventBadgeStyle(event.type);
                  const isGoal = event.type === "goal";
                  return (
                    <div
                      key={event.id}
                      className={`flex items-start gap-3 rounded-xl border p-2.5 text-xs ${
                        isGoal
                          ? "border-emerald-500/50 bg-emerald-950/35"
                          : "border-slate-800/80 bg-slate-950/50"
                      }`}
                    >
                      <span className="w-11 shrink-0 font-mono font-bold text-white">
                        {event.minute}
                        {event.addedMinute ? `+${event.addedMinute}` : ""}&apos;
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <span className="font-bold text-slate-300">
                            {event.teamName}
                          </span>
                          {event.player && (
                            <span className="text-emerald-300">
                              • {event.player}
                            </span>
                          )}
                          <span className="ml-auto font-mono text-[11px] font-bold text-slate-400">
                            {event.scoreAfter.home} - {event.scoreAfter.away}
                          </span>
                        </div>
                        <p className="mt-1 text-slate-200">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Live Match Statistics (5 cols) */}
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4 shadow-xl xl:col-span-5">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase">
                  Live Match Statistics
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time aggregation from visualized engine events
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs font-bold">
                <span className="text-emerald-400">{homeAbbreviation}</span>
                <span className="text-slate-500">vs</span>
                <span className="text-amber-400">{awayAbbreviation}</span>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              <LiveStatBar
                label="Possession"
                homeValue={liveSnapshot.stats.home.possession}
                awayValue={liveSnapshot.stats.away.possession}
                unit="%"
              />
              <LiveStatBar
                label="Expected Goals (xG)"
                homeValue={liveSnapshot.stats.home.expectedGoals}
                awayValue={liveSnapshot.stats.away.expectedGoals}
              />
              <LiveStatBar
                label="Total Shots"
                homeValue={liveSnapshot.stats.home.shots}
                awayValue={liveSnapshot.stats.away.shots}
              />
              <LiveStatBar
                label="Shots on Target"
                homeValue={liveSnapshot.stats.home.shotsOnTarget}
                awayValue={liveSnapshot.stats.away.shotsOnTarget}
              />
              <LiveStatBar
                label="Goalkeeper Saves"
                homeValue={liveSnapshot.stats.home.saves}
                awayValue={liveSnapshot.stats.away.saves}
              />
              <LiveStatBar
                label="Pass Accuracy"
                homeValue={liveSnapshot.stats.home.passAccuracy}
                awayValue={liveSnapshot.stats.away.passAccuracy}
                unit="%"
              />
              <LiveStatBar
                label="Corners / Set Pieces"
                homeValue={liveSnapshot.stats.home.corners}
                awayValue={liveSnapshot.stats.away.corners}
              />
              <LiveStatBar
                label="Fouls / Offsides"
                homeValue={
                  liveSnapshot.stats.home.foulsCommitted +
                  liveSnapshot.stats.home.offsides
                }
                awayValue={
                  liveSnapshot.stats.away.foulsCommitted +
                  liveSnapshot.stats.away.offsides
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* Tactical Lineup & Shirt Number Legend Strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Home 4-3-3 Starting XI */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
              <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                {homeClubName} • 4-3-3 Starting XI (Left Half → Attacks Right)
              </h3>
            </div>
            <span className="font-mono text-[11px] text-emerald-400">
              {INITIAL_HOME_PLAYERS_433.length} Players
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {INITIAL_HOME_PLAYERS_433.map((p) => (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                  p.isGoalkeeper
                    ? "border-sky-500/50 bg-sky-950/50 text-sky-200"
                    : "border-emerald-500/30 bg-slate-950/70 text-slate-200"
                }`}
              >
                <strong className="font-mono text-xs text-white">
                  #{p.shirtNumber}
                </strong>
                <span className="font-mono text-[10px] text-emerald-400">
                  {p.tacticalSlot}
                </span>
                <span>{p.shortName}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Away 4-2-3-1 Starting XI */}
        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
              <h3 className="text-xs font-bold tracking-wider text-white uppercase">
                {awayClubName} • 4-2-3-1 Starting XI (Right Half → Attacks Left)
              </h3>
            </div>
            <span className="font-mono text-[11px] text-amber-400">
              {INITIAL_AWAY_PLAYERS_4231.length} Players
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {INITIAL_AWAY_PLAYERS_4231.map((p) => (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
                  p.isGoalkeeper
                    ? "border-purple-500/50 bg-purple-950/50 text-purple-200"
                    : "border-amber-500/30 bg-slate-950/70 text-slate-200"
                }`}
              >
                <strong className="font-mono text-xs text-white">
                  #{p.shirtNumber}
                </strong>
                <span className="font-mono text-[10px] text-amber-400">
                  {p.tacticalSlot}
                </span>
                <span>{p.shortName}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
