import { Player } from "../types/football";
import {
  calculateStatsFromEvents,
  classifyPitchZone,
  EventLocation,
  MatchEvent,
  MatchEventOutcome,
  MatchEventType,
  PitchZone,
  PlayerMatchSummary,
  TeamMatchStatistics,
} from "./eventsAndStats";
import {
  adaptPlayerForEngine,
  EnginePlayer,
  EnginePlayerAttributes,
  resolveValidLineup,
} from "./playerAdapter";
import {
  createSeededRng,
  createStatefulRng,
  normalizeSeed,
  SeededRng,
} from "./rng";
import {
  applyHalfTimeRecovery,
  computeTacticalModifiers,
  DEFAULT_TACTICS,
  evaluateTeamStrength,
  getFatigueMultiplier,
  PressingIntensity,
  resolveTactics,
  TacticalMentality,
  TacticalModifiers,
  TacticalSettings,
  TeamSide,
  TeamStrengthSnapshot,
  updateMinuteFatigue,
} from "./tactics";

export {
  adaptPlayerForEngine,
  calculateStatsFromEvents,
  classifyPitchZone,
  computeTacticalModifiers,
  createSeededRng,
  createStatefulRng,
  DEFAULT_TACTICS,
  evaluateTeamStrength,
  getFatigueMultiplier,
  normalizeSeed,
  resolveTactics,
  resolveValidLineup,
};

export type {
  EnginePlayer,
  EnginePlayerAttributes,
  EventLocation,
  MatchEvent,
  MatchEventOutcome,
  MatchEventType,
  PitchZone,
  PlayerMatchSummary,
  PressingIntensity,
  SeededRng,
  TacticalMentality,
  TacticalModifiers,
  TacticalSettings,
  TeamMatchStatistics,
  TeamSide,
  TeamStrengthSnapshot,
};

export interface MatchTeamInput {
  name: string;
  shortName: string;
  abbreviation: string;
  primaryColor?: string;
  formation: string;
  tactics?: Partial<TacticalSettings>;
  availablePlayers: Player[];
  startingLineup?: Player[];
}

export interface MatchSimulationInput {
  homeTeam: MatchTeamInput;
  awayTeam: MatchTeamInput;
  seed: number | string;
  competition?: string;
  venue?: string;
}

export interface MatchEngineConfig {
  /** Configurable stoppage time in minutes for Half 1 (if omitted, computed dynamically in [1, 4]) */
  firstHalfStoppageMinutes?: number;
  /** Configurable stoppage time in minutes for Half 2 (if omitted, computed dynamically in [2, 6]) */
  secondHalfStoppageMinutes?: number;
  /** Simulation tick resolution in seconds (default 15s = 4 ticks per minute) */
  tickSeconds?: number;
}

export type MatchPhase =
  | "pre_match"
  | "first_half"
  | "half_time"
  | "second_half"
  | "paused"
  | "full_time";

export type PendingRestartType =
  | "none"
  | "kickoff_home"
  | "kickoff_away"
  | "goal_kick"
  | "corner"
  | "throw_in"
  | "free_kick";

export interface MatchTeamRuntimeState {
  name: string;
  shortName: string;
  abbreviation: string;
  primaryColor?: string;
  formation: string;
  tactics: TacticalSettings;
  players: EnginePlayer[];
  score: number;
}

export interface MatchState {
  seed: string;
  numericSeed: number;
  rngState: number;
  competition: string;
  venue: string;
  phase: MatchPhase;
  /** Phase prior to pausing, used by resumeMatch */
  phaseBeforePause?: Exclude<MatchPhase, "paused">;
  half: 1 | 2;
  /** Elapsed regulation + stoppage seconds within the current half */
  halfElapsedSeconds: number;
  /** Total elapsed match seconds across both halves */
  totalElapsedSeconds: number;
  /** Display minute (1..45 in H1, 46..90 in H2) */
  currentMinute: number;
  /** Stoppage time offset when beyond 45:00 in H1 or 90:00 in H2 */
  addedMinute: number;
  firstHalfStoppageMinutes: number;
  secondHalfStoppageMinutes: number;
  tickSeconds: number;
  homeTeam: MatchTeamRuntimeState;
  awayTeam: MatchTeamRuntimeState;
  possessionTeam: TeamSide;
  ballCarrierId: string;
  lastPasserId?: string;
  ballLocation: { x: number; z: number };
  consecutivePasses: number;
  pendingRestart: PendingRestartType;
  possessionSeconds: { home: number; away: number };
  lastFatigueMinuteProcessed: number;
  nextEventSeq: number;
  events: MatchEvent[];
  warnings: string[];
}

export interface MatchStepResult {
  state: MatchState;
  newEvents: MatchEvent[];
  isHalfTime: boolean;
  isFinished: boolean;
}

export interface MatchSimulationResult {
  seed: string;
  numericSeed: number;
  status: "Full Time";
  competition: string;
  venue: string;
  stoppageTime: {
    firstHalfMinutes: number;
    secondHalfMinutes: number;
  };
  homeTeam: {
    name: string;
    shortName: string;
    abbreviation: string;
    formation: string;
    tactics: TacticalSettings;
    score: number;
    players: PlayerMatchSummary[];
  };
  awayTeam: {
    name: string;
    shortName: string;
    abbreviation: string;
    formation: string;
    tactics: TacticalSettings;
    score: number;
    players: PlayerMatchSummary[];
  };
  events: MatchEvent[];
  stats: {
    home: TeamMatchStatistics;
    away: TeamMatchStatistics;
    totalPossessionChanges: number;
  };
  warnings: string[];
}

const HALF_REGULATION_SECONDS = 45 * 60; // 2700s

function clampCoord(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(val.toFixed(2))));
}

function getTeamRuntime(
  state: MatchState,
  side: TeamSide
): MatchTeamRuntimeState {
  return side === "home" ? state.homeTeam : state.awayTeam;
}

function findPlayerById(
  team: MatchTeamRuntimeState,
  id?: string
): EnginePlayer | undefined {
  if (!id) return undefined;
  return team.players.find((p) => p.id === id);
}

function pickInitialBallCarrier(team: MatchTeamRuntimeState): EnginePlayer {
  return (
    team.players.find((p) => p.position === "ST") ??
    team.players.find((p) => p.positionGroup === "MID") ??
    team.players[team.players.length - 1]
  );
}

function appendMatchEvent(
  state: MatchState,
  newEventsBuffer: MatchEvent[],
  params: {
    type: MatchEventType;
    team: TeamSide | "neutral";
    teamName: string;
    player?: EnginePlayer;
    secondaryPlayer?: EnginePlayer;
    location?: { x: number; z: number };
    outcome: MatchEventOutcome;
    shotQuality?: number;
    description: string;
  }
): MatchEvent {
  const locX = clampCoord(
    params.location?.x ?? state.ballLocation.x,
    -52.5,
    52.5
  );
  const locZ = clampCoord(
    params.location?.z ?? state.ballLocation.z,
    -34.0,
    34.0
  );
  const zone = classifyPitchZone(locX, params.team);

  const evt: MatchEvent = {
    id: `evt-${state.numericSeed}-${state.nextEventSeq++}`,
    minute: state.currentMinute,
    addedMinute: state.addedMinute > 0 ? state.addedMinute : undefined,
    second: state.totalElapsedSeconds,
    half: state.half,
    type: params.type,
    team: params.team,
    teamName: params.teamName,
    playerId: params.player?.id,
    player: params.player?.name,
    secondaryPlayerId: params.secondaryPlayer?.id,
    secondaryPlayer: params.secondaryPlayer?.name,
    location: {
      x: locX,
      z: locZ,
      zone,
    },
    outcome: params.outcome,
    shotQuality:
      typeof params.shotQuality === "number"
        ? Number(params.shotQuality.toFixed(3))
        : undefined,
    description: params.description,
    scoreAfter: {
      home: state.homeTeam.score,
      away: state.awayTeam.score,
    },
  };

  state.events.push(evt);
  newEventsBuffer.push(evt);
  return evt;
}

/**
 * 1. CREATE MATCH
 * Initializes a pure, serializable MatchState from team inputs and a seed.
 */
export function createMatch(
  input: MatchSimulationInput,
  config?: MatchEngineConfig
): MatchState {
  const numericSeed = normalizeSeed(input.seed);
  const rng = createStatefulRng(numericSeed);

  const homeTactics = resolveTactics(input.homeTeam?.tactics);
  const awayTactics = resolveTactics(input.awayTeam?.tactics);

  const homeResolved = resolveValidLineup(
    input.homeTeam?.name || "Home Club",
    input.homeTeam?.availablePlayers,
    input.homeTeam?.startingLineup,
    "home"
  );
  const awayResolved = resolveValidLineup(
    input.awayTeam?.name || "Away Club",
    input.awayTeam?.availablePlayers,
    input.awayTeam?.startingLineup,
    "away"
  );

  const firstHalfStoppage =
    typeof config?.firstHalfStoppageMinutes === "number"
      ? Math.max(0, Math.min(10, Math.round(config.firstHalfStoppageMinutes)))
      : rng.nextInt(1, 3);

  const secondHalfStoppage =
    typeof config?.secondHalfStoppageMinutes === "number"
      ? Math.max(0, Math.min(12, Math.round(config.secondHalfStoppageMinutes)))
      : rng.nextInt(2, 5);

  const tickSeconds = Math.max(5, Math.min(60, config?.tickSeconds ?? 15));

  const homeRuntime: MatchTeamRuntimeState = {
    name: input.homeTeam?.name || "Home Club",
    shortName: input.homeTeam?.shortName || input.homeTeam?.name || "Home",
    abbreviation: input.homeTeam?.abbreviation || "HOM",
    primaryColor: input.homeTeam?.primaryColor,
    formation: input.homeTeam?.formation || "4-3-3",
    tactics: homeTactics,
    players: homeResolved.starters,
    score: 0,
  };

  const awayRuntime: MatchTeamRuntimeState = {
    name: input.awayTeam?.name || "Away Club",
    shortName: input.awayTeam?.shortName || input.awayTeam?.name || "Away",
    abbreviation: input.awayTeam?.abbreviation || "AWY",
    primaryColor: input.awayTeam?.primaryColor,
    formation: input.awayTeam?.formation || "4-2-3-1",
    tactics: awayTactics,
    players: awayResolved.starters,
    score: 0,
  };

  const initialCarrier = pickInitialBallCarrier(homeRuntime);

  return {
    seed: String(input.seed ?? "default-fm-seed"),
    numericSeed,
    rngState: rng.getState(),
    competition: input.competition || "Premier Crown Division",
    venue: input.venue || "Ironbridge Park",
    phase: "pre_match",
    half: 1,
    halfElapsedSeconds: 0,
    totalElapsedSeconds: 0,
    currentMinute: 1,
    addedMinute: 0,
    firstHalfStoppageMinutes: firstHalfStoppage,
    secondHalfStoppageMinutes: secondHalfStoppage,
    tickSeconds,
    homeTeam: homeRuntime,
    awayTeam: awayRuntime,
    possessionTeam: "home",
    ballCarrierId: initialCarrier.id,
    lastPasserId: undefined,
    ballLocation: { x: 0, z: 0 },
    consecutivePasses: 0,
    pendingRestart: "none",
    possessionSeconds: { home: 0, away: 0 },
    lastFatigueMinuteProcessed: 0,
    nextEventSeq: 1,
    events: [],
    warnings: [...homeResolved.warnings, ...awayResolved.warnings],
  };
}

/**
 * 2. START MATCH
 * Transitions a pre-match state into the first half and emits the opening kickoff event.
 */
export function startMatch(state: MatchState): MatchStepResult {
  const newEvents: MatchEvent[] = [];
  if (state.phase !== "pre_match") {
    return {
      state,
      newEvents,
      isHalfTime: state.phase === "half_time",
      isFinished: state.phase === "full_time",
    };
  }

  state.phase = "first_half";
  state.half = 1;
  state.halfElapsedSeconds = 0;
  state.totalElapsedSeconds = 0;
  state.currentMinute = 1;
  state.addedMinute = 0;
  state.possessionTeam = "home";
  state.ballLocation = { x: 0, z: 0 };

  const kickoffPlayer = pickInitialBallCarrier(state.homeTeam);
  state.ballCarrierId = kickoffPlayer.id;

  appendMatchEvent(state, newEvents, {
    type: "kickoff",
    team: "home",
    teamName: state.homeTeam.shortName,
    player: kickoffPlayer,
    location: { x: 0, z: 0 },
    outcome: "restart",
    description: `Kick-off at ${state.venue}! ${kickoffPlayer.name} gets the first half underway for ${state.homeTeam.name} (${state.homeTeam.formation}) against ${state.awayTeam.name} (${state.awayTeam.formation}).`,
  });

  return {
    state,
    newEvents,
    isHalfTime: false,
    isFinished: false,
  };
}

/**
 * Transitions from half-time to the second half, emitting the second-half kickoff.
 */
export function startSecondHalf(state: MatchState): MatchStepResult {
  const newEvents: MatchEvent[] = [];
  if (state.phase !== "half_time") {
    return {
      state,
      newEvents,
      isHalfTime: false,
      isFinished: state.phase === "full_time",
    };
  }

  state.phase = "second_half";
  state.half = 2;
  state.halfElapsedSeconds = 0;
  state.currentMinute = 46;
  state.addedMinute = 0;
  state.possessionTeam = "away";
  state.ballLocation = { x: 0, z: 0 };
  state.consecutivePasses = 0;
  state.pendingRestart = "none";

  const kickoffPlayer = pickInitialBallCarrier(state.awayTeam);
  state.ballCarrierId = kickoffPlayer.id;
  state.lastPasserId = undefined;

  appendMatchEvent(state, newEvents, {
    type: "kickoff",
    team: "away",
    teamName: state.awayTeam.shortName,
    player: kickoffPlayer,
    location: { x: 0, z: 0 },
    outcome: "restart",
    description: `Second half begins! ${kickoffPlayer.name} kicks off for ${state.awayTeam.name} as the second 45 gets underway.`,
  });

  return {
    state,
    newEvents,
    isHalfTime: false,
    isFinished: false,
  };
}

/**
 * 3. PAUSE & RESUME MATCH
 */
export function pauseMatch(state: MatchState): MatchState {
  if (state.phase !== "paused" && state.phase !== "full_time") {
    state.phaseBeforePause = state.phase;
    state.phase = "paused";
  }
  return state;
}

export function resumeMatch(state: MatchState): MatchState {
  if (state.phase === "paused") {
    state.phase = state.phaseBeforePause ?? "first_half";
    state.phaseBeforePause = undefined;
  }
  return state;
}

/**
 * Simulates one discrete tick (default 15 seconds) of football play.
 */
function simulateSingleTick(
  state: MatchState,
  rng: SeededRng,
  newEvents: MatchEvent[]
): void {
  const dt = state.tickSeconds;
  state.halfElapsedSeconds += dt;
  state.totalElapsedSeconds += dt;

  // Compute display minute and stoppage time
  const halfMinuteOffset = Math.ceil(state.halfElapsedSeconds / 60);
  if (state.half === 1) {
    if (halfMinuteOffset <= 45) {
      state.currentMinute = Math.max(1, halfMinuteOffset);
      state.addedMinute = 0;
    } else {
      state.currentMinute = 45;
      state.addedMinute = halfMinuteOffset - 45;
    }
  } else {
    if (halfMinuteOffset <= 45) {
      state.currentMinute = 45 + Math.max(1, halfMinuteOffset);
      state.addedMinute = 0;
    } else {
      state.currentMinute = 90;
      state.addedMinute = halfMinuteOffset - 45;
    }
  }

  state.possessionSeconds[state.possessionTeam] += dt;

  const InvolvedIds = new Set<string>();

  // 1. Handle any pending set piece or post-goal restart first
  if (state.pendingRestart !== "none") {
    const restartType = state.pendingRestart;
    state.pendingRestart = "none";

    if (restartType === "kickoff_home" || restartType === "kickoff_away") {
      const side: TeamSide =
        restartType === "kickoff_home" ? "home" : "away";
      const team = getTeamRuntime(state, side);
      const kicker = pickInitialBallCarrier(team);
      state.possessionTeam = side;
      state.ballCarrierId = kicker.id;
      state.lastPasserId = undefined;
      state.ballLocation = { x: 0, z: 0 };
      state.consecutivePasses = 0;
      InvolvedIds.add(kicker.id);

      appendMatchEvent(state, newEvents, {
        type: "goal_restart",
        team: side,
        teamName: team.shortName,
        player: kicker,
        location: { x: 0, z: 0 },
        outcome: "restart",
        description: `${kicker.name} restarts play from the centre circle for ${team.shortName}.`,
      });
      return;
    }

    if (restartType === "goal_kick") {
      const side = state.possessionTeam;
      const team = getTeamRuntime(state, side);
      const gk =
        team.players.find((p) => p.positionGroup === "GK") ?? team.players[0];
      const target = rng.pickWeighted(
        team.players.filter((p) => p.id !== gk.id),
        (p) =>
          team.tactics.passingStyle === "Short"
            ? p.positionGroup === "DEF"
              ? 3.0
              : 1.0
            : p.positionGroup === "MID"
              ? 2.8
              : 1.2
      );
      const gkX = side === "home" ? -47.0 : 47.0;
      state.ballLocation = { x: gkX, z: 0 };
      InvolvedIds.add(gk.id);
      InvolvedIds.add(target.id);

      appendMatchEvent(state, newEvents, {
        type: "goal_kick",
        team: side,
        teamName: team.shortName,
        player: gk,
        secondaryPlayer: target,
        location: { x: gkX, z: 0 },
        outcome: "restart",
        description: `Goal kick taken by ${gk.name} to ${target.name} as ${team.shortName} build from the back.`,
      });

      const dir = side === "home" ? 1 : -1;
      state.ballCarrierId = target.id;
      state.lastPasserId = gk.id;
      state.ballLocation = {
        x: clampCoord(
          gkX +
            dir *
              (team.tactics.passingStyle === "Direct"
                ? rng.nextFloat(28, 42)
                : rng.nextFloat(12, 24)),
          -48,
          48
        ),
        z: clampCoord(target.baseZ + rng.nextFloat(-6, 6), -31, 31),
      };
      state.consecutivePasses = 1;
      return;
    }

    if (restartType === "throw_in") {
      const side = state.possessionTeam;
      const team = getTeamRuntime(state, side);
      const thrower = rng.pickWeighted(team.players, (p) =>
        p.position === "LB" || p.position === "RB"
          ? 4.0
          : p.positionGroup === "MID"
            ? 2.0
            : 0.5
      );
      const receiver = rng.pickWeighted(
        team.players.filter((p) => p.id !== thrower.id),
        (p) => (p.positionGroup === "MID" ? 3.0 : 1.2)
      );
      const touchZ = state.ballLocation.z >= 0 ? 33.5 : -33.5;
      state.ballLocation.z = touchZ;
      InvolvedIds.add(thrower.id);
      InvolvedIds.add(receiver.id);

      appendMatchEvent(state, newEvents, {
        type: "throw_in",
        team: side,
        teamName: team.shortName,
        player: thrower,
        secondaryPlayer: receiver,
        location: { x: state.ballLocation.x, z: touchZ },
        outcome: "restart",
        description: `${thrower.name} takes the throw-in down the line to ${receiver.name} for ${team.shortName}.`,
      });

      state.ballCarrierId = receiver.id;
      state.lastPasserId = thrower.id;
      state.ballLocation = {
        x: clampCoord(state.ballLocation.x + rng.nextFloat(-5, 8), -49, 49),
        z: clampCoord(touchZ * 0.72, -30, 30),
      };
      state.consecutivePasses = 1;
      return;
    }

    if (restartType === "corner") {
      const attSide = state.possessionTeam;
      const defSide: TeamSide = attSide === "home" ? "away" : "home";
      const attTeam = getTeamRuntime(state, attSide);
      const defTeam = getTeamRuntime(state, defSide);

      const taker = rng.pickWeighted(attTeam.players, (p) =>
        p.position === "CAM" || p.position === "LW" || p.position === "RW"
          ? p.attributes.passing * 2.5
          : p.attributes.passing * 0.5
      );
      const cornerX = attSide === "home" ? 52.0 : -52.0;
      const cornerZ = state.ballLocation.z >= 0 ? 33.5 : -33.5;

      appendMatchEvent(state, newEvents, {
        type: "corner",
        team: attSide,
        teamName: attTeam.shortName,
        player: taker,
        location: { x: cornerX, z: cornerZ },
        outcome: "restart",
        description: `Corner kick whipped into the penalty area by ${taker.name} for ${attTeam.shortName}.`,
      });

      const boxX = attSide === "home" ? rng.nextFloat(41, 47) : rng.nextFloat(-47, -41);
      const boxZ = rng.nextFloat(-7, 7);
      state.ballLocation = { x: boxX, z: boxZ };

      // 27% chance the corner produces a header/shot attempt in the box
      if (rng.chance(0.27)) {
        const headerPlayer = rng.pickWeighted(
          attTeam.players.filter((p) => p.id !== taker.id && p.positionGroup !== "GK"),
          (p) =>
            p.position === "ST" || p.position === "CB"
              ? p.attributes.attacking * 1.4 + p.attributes.positioning
              : p.attributes.attacking * 0.6
        );
        state.ballCarrierId = headerPlayer.id;
        state.lastPasserId = taker.id;
        resolveShotAttempt(state, rng, newEvents, headerPlayer, taker, true);
      } else {
        // Defending team clears the corner out toward midfield
        const clearer = rng.pickWeighted(defTeam.players, (p) =>
          p.position === "CB" || p.position === "GK"
            ? p.attributes.defending * 2.0 + p.attributes.positioning
            : p.attributes.defending * 0.6
        );
        state.possessionTeam = defSide;
        state.ballCarrierId = clearer.id;
        state.lastPasserId = undefined;
        state.ballLocation = {
          x: attSide === "home" ? rng.nextFloat(18, 30) : rng.nextFloat(-30, -18),
          z: rng.nextFloat(-18, 18),
        };
        state.consecutivePasses = 0;
      }
      return;
    }

    if (restartType === "free_kick") {
      const attSide = state.possessionTeam;
      const attTeam = getTeamRuntime(state, attSide);
      const taker = rng.pickWeighted(
        attTeam.players.filter((p) => p.positionGroup !== "GK"),
        (p) => p.attributes.passing + p.attributes.shooting
      );

      appendMatchEvent(state, newEvents, {
        type: "free_kick",
        team: attSide,
        teamName: attTeam.shortName,
        player: taker,
        location: { ...state.ballLocation },
        outcome: "restart",
        description: `${taker.name} stands over the free kick for ${attTeam.shortName}.`,
      });

      const relX =
        attSide === "home" ? state.ballLocation.x : -state.ballLocation.x;
      // Direct free-kick shot if close to the penalty box
      if (relX >= 25 && rng.chance(0.42)) {
        state.ballCarrierId = taker.id;
        state.lastPasserId = undefined;
        resolveShotAttempt(state, rng, newEvents, taker, undefined, false);
      } else {
        const target = rng.pickWeighted(
          attTeam.players.filter((p) => p.id !== taker.id && p.positionGroup !== "GK"),
          (p) => p.attributes.passing + p.attributes.attacking
        );
        state.ballCarrierId = target.id;
        state.lastPasserId = taker.id;
        const dir = attSide === "home" ? 1 : -1;
        state.ballLocation = {
          x: clampCoord(state.ballLocation.x + dir * rng.nextFloat(8, 16), -46, 46),
          z: clampCoord(state.ballLocation.z + rng.nextFloat(-10, 10), -30, 30),
        };
        state.consecutivePasses = 1;
      }
      return;
    }
  }

  // 2. Open Play Evaluation
  const attSide = state.possessionTeam;
  const defSide: TeamSide = attSide === "home" ? "away" : "home";
  const attTeam = getTeamRuntime(state, attSide);
  const defTeam = getTeamRuntime(state, defSide);

  const attStrength = evaluateTeamStrength(
    attTeam.players,
    attTeam.tactics,
    attSide === "home"
  );
  const defStrength = evaluateTeamStrength(
    defTeam.players,
    defTeam.tactics,
    defSide === "home"
  );
  const attMods = computeTacticalModifiers(attTeam.tactics);
  const defMods = computeTacticalModifiers(defTeam.tactics);

  const carrier =
    findPlayerById(attTeam, state.ballCarrierId) ??
    pickInitialBallCarrier(attTeam);
  InvolvedIds.add(carrier.id);

  const relX =
    attSide === "home" ? state.ballLocation.x : -state.ballLocation.x;

  // 2A. Check defensive challenge (Foul or Tackle/Turnover)
  const challenger = rng.pickWeighted(
    defTeam.players.filter((p) => p.positionGroup !== "GK"),
    (p) => {
      if (relX > 18) {
        return p.positionGroup === "DEF" || p.position === "CDM"
          ? p.attributes.tackling * 1.8 + p.attributes.marking
          : p.attributes.tackling * 0.5;
      }
      return p.positionGroup === "MID"
        ? p.attributes.tackling * 1.6 + p.attributes.interceptions
        : p.attributes.tackling * 0.8;
    }
  );

  const carrierRetention =
    (carrier.attributes.composure * 0.4 +
      carrier.attributes.pace * 0.3 +
      carrier.attributes.attacking * 0.3) *
    getFatigueMultiplier(carrier.currentFatigue);

  const challengerSkill =
    (challenger.attributes.tackling * 0.45 +
      challenger.attributes.marking * 0.3 +
      challenger.attributes.positioning * 0.25) *
    getFatigueMultiplier(challenger.currentFatigue);

  // Foul probability (~3.6% per tick, modulated by pressing intensity and pace vs tackling)
  const foulProb = Math.max(
    0.018,
    Math.min(
      0.072,
      0.036 +
        defMods.foulRiskMod * 0.75 +
        (carrier.attributes.pace - challenger.attributes.tackling) * 0.0006
    )
  );

  if (rng.chance(foulProb)) {
    InvolvedIds.add(challenger.id);
    appendMatchEvent(state, newEvents, {
      type: "foul",
      team: defSide,
      teamName: defTeam.shortName,
      player: challenger,
      secondaryPlayer: carrier,
      outcome: "foul_called",
      description: `Foul by ${challenger.name} (${defTeam.shortName}) on ${carrier.name}. Free kick awarded to ${attTeam.shortName}.`,
    });
    state.pendingRestart = "free_kick";
    return;
  }

  // Clean tackle / dispossession probability (~9.5% per tick)
  const tackleProb = Math.max(
    0.048,
    Math.min(
      0.155,
      0.092 +
        (challengerSkill - carrierRetention) * 0.0018 +
        defMods.pressBonus * 0.0045
    )
  );

  if (rng.chance(tackleProb)) {
    InvolvedIds.add(challenger.id);

    // If near the touchline, tackle often sends the ball into touch for a throw-in
    if (Math.abs(state.ballLocation.z) > 13 && rng.chance(0.42)) {
      appendMatchEvent(state, newEvents, {
        type: "turnover",
        team: defSide,
        teamName: defTeam.shortName,
        player: challenger,
        secondaryPlayer: carrier,
        outcome: "out_of_bounds",
        description: `${challenger.name} slides in on ${carrier.name}, forcing the ball out over the touchline.`,
      });
      state.pendingRestart = "throw_in";
      return;
    }

    appendMatchEvent(state, newEvents, {
      type: "turnover",
      team: defSide,
      teamName: defTeam.shortName,
      player: challenger,
      secondaryPlayer: carrier,
      outcome: "dispossessed",
      description: `${challenger.name} times his tackle well to dispossess ${carrier.name} and win possession for ${defTeam.shortName}.`,
    });

    state.possessionTeam = defSide;
    state.ballCarrierId = challenger.id;
    state.lastPasserId = undefined;
    state.consecutivePasses = 0;

    if (rng.chance(0.35)) {
      appendMatchEvent(state, newEvents, {
        type: "possession_change",
        team: defSide,
        teamName: defTeam.shortName,
        player: challenger,
        outcome: "completed",
        description: `${defTeam.shortName} transition into possession through ${challenger.name}.`,
      });
    }
    return;
  }

  // 2B. Shot Decision when in Attacking Range (relX >= 24.5m, i.e. within 28m of goal)
  if (relX >= 24.5) {
    const distToGoal = Math.hypot(52.5 - relX, state.ballLocation.z);
    const baseShotDesire =
      distToGoal <= 14.5
        ? 0.52
        : distToGoal <= 21.5
          ? 0.31
          : 0.14;
    const roleShotBonus =
      carrier.position === "ST"
        ? 0.12
        : carrier.position === "LW" ||
            carrier.position === "RW" ||
            carrier.position === "CAM"
          ? 0.06
          : -0.04;
    const antiEndlessPassBonus = Math.min(0.2, state.consecutivePasses * 0.03);

    const shotProb = Math.max(
      0.1,
      Math.min(
        0.78,
        baseShotDesire +
          roleShotBonus +
          attMods.shotTendencyMod +
          antiEndlessPassBonus +
          (attStrength.attack - defStrength.defense) * 0.004
      )
    );

    if (rng.chance(shotProb)) {
      const assister = findPlayerById(attTeam, state.lastPasserId);
      resolveShotAttempt(state, rng, newEvents, carrier, assister, false);
      return;
    }
  }

  // 2C. Passing & Attacking Progression Decision
  const receiverCandidates = attTeam.players.filter(
    (p) => p.id !== carrier.id && p.positionGroup !== "GK"
  );

  const receiver = rng.pickWeighted(receiverCandidates, (p) => {
    const pRelBaseX = attSide === "home" ? p.baseX : -p.baseX;
    // Prefer progressive targets ahead of or level with the ball
    const forwardBonus = pRelBaseX >= relX - 8 ? 2.2 : 0.7;
    const roleWeight =
      relX < 0
        ? p.positionGroup === "MID"
          ? 2.8
          : 1.3
        : p.positionGroup === "FWD" || p.position === "CAM"
          ? 3.0
          : 1.5;
    return (
      (p.attributes.attacking * 0.5 +
        p.attributes.positioning * 0.3 +
        p.attributes.pace * 0.2) *
      forwardBonus *
      roleWeight
    );
  });
  InvolvedIds.add(receiver.id);

  const dir = attSide === "home" ? 1 : -1;
  const forwardAdvance =
    relX > 24
      ? rng.nextFloat(3.5, 11.0)
      : attMods.verticalProgressionMeters + rng.nextFloat(-3.5, 6.5);

  const targetX = clampCoord(
    state.ballLocation.x + dir * forwardAdvance,
    -49.5,
    49.5
  );
  const targetZ = clampCoord(
    receiver.baseZ * 0.65 +
      state.ballLocation.z * 0.35 +
      rng.nextFloat(-7.5, 7.5),
    -32.5,
    32.5
  );

  const passDistance = Math.hypot(
    targetX - state.ballLocation.x,
    targetZ - state.ballLocation.z
  );
  const nextRelX = attSide === "home" ? targetX : -targetX;

  // Offside Check on forward through-balls into the final third
  if (
    relX >= 5 &&
    nextRelX >= 25 &&
    nextRelX > relX + 6 &&
    (receiver.positionGroup === "FWD" || receiver.position === "CAM")
  ) {
    const runnerTiming =
      (receiver.attributes.positioning * 0.55 +
        receiver.attributes.composure * 0.45) *
      getFatigueMultiplier(receiver.currentFatigue);
    const offsideProb = Math.max(
      0.03,
      Math.min(
        0.13,
        0.068 + (defStrength.offsideTrap - runnerTiming) * 0.0022
      )
    );

    if (rng.chance(offsideProb)) {
      appendMatchEvent(state, newEvents, {
        type: "offside",
        team: attSide,
        teamName: attTeam.shortName,
        player: receiver,
        secondaryPlayer: carrier,
        location: { x: targetX, z: targetZ },
        outcome: "offside_called",
        description: `Offside flag raised against ${receiver.name} (${attTeam.shortName}) after ${carrier.name}'s through-ball.`,
      });

      const defFkTaker =
        defTeam.players.find((p) => p.position === "CB") ?? defTeam.players[0];
      state.possessionTeam = defSide;
      state.ballCarrierId = defFkTaker.id;
      state.lastPasserId = undefined;
      state.ballLocation = { x: targetX, z: targetZ };
      state.consecutivePasses = 0;
      return;
    }
  }

  // Pass Completion Probability
  const passerSkill =
    (carrier.attributes.passing * 0.55 +
      carrier.attributes.vision * 0.3 +
      carrier.attributes.composure * 0.15) *
    getFatigueMultiplier(carrier.currentFatigue);

  const distancePenalty = Math.max(0, (passDistance - 12) * 0.0045);
  const finalThirdPressure = nextRelX > 22 ? 0.055 : 0;

  const passSuccessProb = Math.max(
    0.58,
    Math.min(
      0.92,
      0.81 +
        (passerSkill - defStrength.pressing) * 0.0032 +
        attMods.passCompletionMod -
        distancePenalty -
        finalThirdPressure
    )
  );

  if (rng.chance(passSuccessProb)) {
    // Completed Pass!
    const enteredFinalThird = relX <= 17.5 && nextRelX > 17.5;
    state.ballLocation = { x: targetX, z: targetZ };
    state.lastPasserId = carrier.id;
    state.ballCarrierId = receiver.id;
    state.consecutivePasses += 1;

    appendMatchEvent(state, newEvents, {
      type: "pass",
      team: attSide,
      teamName: attTeam.shortName,
      player: carrier,
      secondaryPlayer: receiver,
      location: { x: targetX, z: targetZ },
      outcome: "completed",
      description: `${carrier.name} finds ${receiver.name} (${Math.round(passDistance)}m pass).`,
    });

    if (enteredFinalThird) {
      appendMatchEvent(state, newEvents, {
        type: "attack",
        team: attSide,
        teamName: attTeam.shortName,
        player: carrier,
        secondaryPlayer: receiver,
        location: { x: targetX, z: targetZ },
        outcome: "completed",
        description: `${carrier.name} threads an incisive pass into the final third to ${receiver.name}, launching an attack for ${attTeam.shortName}.`,
      });
    }
  } else {
    // Incomplete Pass: either out of bounds for a Throw-In or Intercepted
    const goesIntoTouch =
      Math.abs(targetZ) > 15 && rng.chance(0.36);

    if (goesIntoTouch) {
      const outZ = targetZ >= 0 ? 33.8 : -33.8;
      appendMatchEvent(state, newEvents, {
        type: "pass",
        team: attSide,
        teamName: attTeam.shortName,
        player: carrier,
        location: { x: targetX, z: outZ },
        outcome: "out_of_bounds",
        description: `${carrier.name}'s pass for ${receiver.name} drifts over the touchline.`,
      });
      state.possessionTeam = defSide;
      state.ballLocation = { x: targetX, z: outZ };
      state.consecutivePasses = 0;
      state.lastPasserId = undefined;
      state.pendingRestart = "throw_in";
    } else {
      const interceptor = rng.pickWeighted(
        defTeam.players.filter((p) => p.positionGroup !== "GK"),
        (p) =>
          p.attributes.interceptions * 0.55 +
          p.attributes.positioning * 0.45
      );
      InvolvedIds.add(interceptor.id);

      appendMatchEvent(state, newEvents, {
        type: "pass",
        team: attSide,
        teamName: attTeam.shortName,
        player: carrier,
        secondaryPlayer: interceptor,
        location: { x: targetX, z: targetZ },
        outcome: "intercepted",
        description: `${carrier.name}'s pass toward ${receiver.name} is cut out.`,
      });

      appendMatchEvent(state, newEvents, {
        type: "interception",
        team: defSide,
        teamName: defTeam.shortName,
        player: interceptor,
        secondaryPlayer: carrier,
        location: { x: targetX, z: targetZ },
        outcome: "intercepted",
        description: `${interceptor.name} reads the passing lane and intercepts ${carrier.name}'s pass for ${defTeam.shortName}.`,
      });

      state.possessionTeam = defSide;
      state.ballCarrierId = interceptor.id;
      state.lastPasserId = undefined;
      state.ballLocation = { x: targetX, z: targetZ };
      state.consecutivePasses = 0;
    }
  }

  // Apply minute-level stamina drain once per match minute
  if (state.currentMinute > state.lastFatigueMinuteProcessed) {
    state.lastFatigueMinuteProcessed = state.currentMinute;
    updateMinuteFatigue(
      state.homeTeam.players,
      state.homeTeam.tactics,
      state.possessionTeam === "home",
      InvolvedIds
    );
    updateMinuteFatigue(
      state.awayTeam.players,
      state.awayTeam.tactics,
      state.possessionTeam === "away",
      InvolvedIds
    );
  }
}

/**
 * Evaluates a shot attempt (xG calculation, block check, on-target check, GK save vs Goal).
 */
function resolveShotAttempt(
  state: MatchState,
  rng: SeededRng,
  newEvents: MatchEvent[],
  shooter: EnginePlayer,
  assister: EnginePlayer | undefined,
  isHeaderFromSetPiece: boolean
): void {
  const attSide = state.possessionTeam;
  const defSide: TeamSide = attSide === "home" ? "away" : "home";
  const attTeam = getTeamRuntime(state, attSide);
  const defTeam = getTeamRuntime(state, defSide);

  const relX =
    attSide === "home" ? state.ballLocation.x : -state.ballLocation.x;
  const distToGoal = Math.max(
    4.5,
    Math.hypot(52.5 - relX, state.ballLocation.z * 0.85)
  );
  const angleFactor = Math.max(
    0.45,
    1.0 - Math.abs(state.ballLocation.z) / 42.0
  );

  const shooterSkill =
    (shooter.attributes.shooting * 0.58 +
      shooter.attributes.composure * 0.27 +
      shooter.attributes.attacking * 0.15) *
    getFatigueMultiplier(shooter.currentFatigue);

  const closestDefender = rng.pickWeighted(
    defTeam.players.filter((p) => p.positionGroup === "DEF" || p.position === "CDM"),
    (p) => p.attributes.marking + p.attributes.positioning
  );
  const defPressure =
    (closestDefender.attributes.marking * 0.5 +
      closestDefender.attributes.positioning * 0.3 +
      closestDefender.attributes.defending * 0.2) *
    getFatigueMultiplier(closestDefender.currentFatigue);

  // Expected Goals (xG / shotQuality) based on distance, angle, shooter composure & defensive pressure
  const rawDistanceXg = 0.36 * Math.exp(-0.092 * (distToGoal - 6));
  const skillModifier = 1.0 + (shooterSkill - defPressure) * 0.006;
  const assistModifier =
    assister && assister.id !== shooter.id
      ? 1.0 + (assister.attributes.vision - 75) * 0.003
      : 1.0;
  const headerModifier = isHeaderFromSetPiece ? 0.82 : 1.0;

  const shotQuality = Math.max(
    0.02,
    Math.min(
      0.52,
      rawDistanceXg * angleFactor * skillModifier * assistModifier * headerModifier
    )
  );

  // 1. Check if shot is blocked by an outfield defender (~22% chance)
  const blockProb = Math.max(
    0.12,
    Math.min(0.32, 0.22 + (defPressure - shooterSkill) * 0.0025)
  );

  if (!isHeaderFromSetPiece && rng.chance(blockProb)) {
    appendMatchEvent(state, newEvents, {
      type: "shot",
      team: attSide,
      teamName: attTeam.shortName,
      player: shooter,
      secondaryPlayer: closestDefender,
      outcome: "blocked",
      shotQuality,
      description: `${shooter.name} unleashes a strike for ${attTeam.shortName}, but ${closestDefender.name} throws himself in the way to block!`,
    });

    if (rng.chance(0.55)) {
      state.pendingRestart = "corner";
    } else {
      state.possessionTeam = defSide;
      state.ballCarrierId = closestDefender.id;
      state.lastPasserId = undefined;
      state.consecutivePasses = 0;
    }
    return;
  }

  // 2. Check if unblocked shot is on target (~44% of unblocked shots -> ~34% of total shots)
  const onTargetProb = Math.max(
    0.28,
    Math.min(
      0.6,
      0.43 +
        (shooterSkill - 76) * 0.005 +
        (shotQuality - 0.1) * 0.32
    )
  );

  if (!rng.chance(onTargetProb)) {
    // Shot missed off-target -> Goal kick for defending side
    appendMatchEvent(state, newEvents, {
      type: "shot",
      team: attSide,
      teamName: attTeam.shortName,
      player: shooter,
      outcome: "missed",
      shotQuality,
      description: `${shooter.name} finds space for ${attTeam.shortName} (${Math.round(distToGoal)}m) and fires an effort just off target.`,
    });

    state.possessionTeam = defSide;
    state.lastPasserId = undefined;
    state.consecutivePasses = 0;
    state.pendingRestart = "goal_kick";
    return;
  }

  // 3. Shot is ON TARGET! Pit shooter against opposing Goalkeeper
  const opposingGk =
    defTeam.players.find((p) => p.positionGroup === "GK") ?? defTeam.players[0];

  const gkSkill =
    (opposingGk.attributes.goalkeeping * 0.72 +
      opposingGk.attributes.positioning * 0.15 +
      opposingGk.attributes.composure * 0.13) *
    getFatigueMultiplier(opposingGk.currentFatigue);

  // Conditional goal probability given shot is on target
  const goalGivenOnTargetProb = Math.max(
    0.1,
    Math.min(
      0.58,
      (shotQuality / Math.max(0.3, onTargetProb * (1 - blockProb))) *
        0.92 *
        (1.0 + (shooterSkill - gkSkill) * 0.008)
    )
  );

  if (rng.chance(goalGivenOnTargetProb)) {
    // GOAL!
    attTeam.score += 1;
    const validAssister =
      assister && assister.id !== shooter.id ? assister : undefined;
    const assistText = validAssister
      ? ` after an incisive assist from ${validAssister.name}`
      : "";

    appendMatchEvent(state, newEvents, {
      type: "goal",
      team: attSide,
      teamName: attTeam.shortName,
      player: shooter,
      secondaryPlayer: validAssister,
      outcome: "goal",
      shotQuality,
      description: `GOAL! ${shooter.name} clinical finish beats ${opposingGk.name}${assistText}! (${state.homeTeam.abbreviation} ${state.homeTeam.score} - ${state.awayTeam.score} ${state.awayTeam.abbreviation})`,
    });

    state.consecutivePasses = 0;
    state.lastPasserId = undefined;
    state.pendingRestart =
      attSide === "home" ? "kickoff_away" : "kickoff_home";
  } else {
    // SAVE by opposing goalkeeper!
    appendMatchEvent(state, newEvents, {
      type: "save",
      team: defSide,
      teamName: defTeam.shortName,
      player: opposingGk,
      secondaryPlayer: shooter,
      outcome: "saved",
      shotQuality,
      description: `SAVE! ${shooter.name} tests the goal with a fierce strike on target, but ${opposingGk.name} makes an agile stop for ${defTeam.shortName}.`,
    });

    if (rng.chance(0.48)) {
      state.pendingRestart = "corner";
    } else {
      state.possessionTeam = defSide;
      state.ballCarrierId = opposingGk.id;
      state.lastPasserId = undefined;
      state.ballLocation = {
        x: defSide === "home" ? -46.0 : 46.0,
        z: 0,
      };
      state.consecutivePasses = 0;
    }
  }
}

/**
 * 4. ADVANCE MATCH
 * Advances simulation time by `stepSeconds` (default: 1 tick = 15s) and returns
 * the updated state and all newly generated events during that interval.
 */
export function advanceMatch(
  state: MatchState,
  stepSeconds = state.tickSeconds
): MatchStepResult {
  const newEvents: MatchEvent[] = [];

  if (state.phase === "full_time" || state.phase === "paused") {
    return {
      state,
      newEvents,
      isHalfTime: false,
      isFinished: state.phase === "full_time",
    };
  }

  if (state.phase === "pre_match") {
    const started = startMatch(state);
    newEvents.push(...started.newEvents);
  } else if (state.phase === "half_time") {
    const secondStarted = startSecondHalf(state);
    newEvents.push(...secondStarted.newEvents);
  }

  const rng = createStatefulRng(state.rngState, true);
  let remainingSeconds = Math.max(state.tickSeconds, stepSeconds);

  while (remainingSeconds >= state.tickSeconds) {
    if (state.phase !== "first_half" && state.phase !== "second_half") {
      break;
    }

    remainingSeconds -= state.tickSeconds;
    simulateSingleTick(state, rng, newEvents);

    const halfTargetSeconds =
      HALF_REGULATION_SECONDS +
      (state.half === 1
        ? state.firstHalfStoppageMinutes
        : state.secondHalfStoppageMinutes) *
        60;

    if (state.halfElapsedSeconds >= halfTargetSeconds) {
      if (state.half === 1) {
        appendMatchEvent(state, newEvents, {
          type: "half_time",
          team: "neutral",
          teamName: "Match Official",
          location: { x: 0, z: 0 },
          outcome: "milestone",
          description: `HALF-TIME (45+${state.firstHalfStoppageMinutes}'): The referee blows for the interval. ${state.homeTeam.name} ${state.homeTeam.score} - ${state.awayTeam.score} ${state.awayTeam.name}.`,
        });

        applyHalfTimeRecovery(state.homeTeam.players);
        applyHalfTimeRecovery(state.awayTeam.players);
        state.phase = "half_time";
        break;
      } else {
        appendMatchEvent(state, newEvents, {
          type: "full_time",
          team: "neutral",
          teamName: "Match Official",
          location: { x: 0, z: 0 },
          outcome: "milestone",
          description: `FULL-TIME (90+${state.secondHalfStoppageMinutes}'): It ends ${state.homeTeam.name} ${state.homeTeam.score} - ${state.awayTeam.score} ${state.awayTeam.name} at ${state.venue}!`,
        });

        state.phase = "full_time";
        break;
      }
    }
  }

  state.rngState = rng.getState();

  return {
    state,
    newEvents,
    isHalfTime: state.phase === "half_time",
    isFinished: state.phase === "full_time",
  };
}

/**
 * 5. FINISH MATCH
 * Advances a match through any remaining halves until full-time and returns the
 * complete MatchSimulationResult with event-derived statistics.
 */
export function finishMatch(state: MatchState): MatchSimulationResult {
  if (state.phase === "paused") {
    resumeMatch(state);
  }
  if (state.phase === "pre_match") {
    startMatch(state);
  }

  // Advance first half to half-time if currently in first_half
  if (state.phase === "first_half") {
    advanceMatch(state, 60 * 60);
  }

  // Transition through half-time and complete second half
  if (state.phase === "half_time") {
    startSecondHalf(state);
  }
  if (state.phase === "second_half") {
    advanceMatch(state, 60 * 60);
  }

  const computed = calculateStatsFromEvents(
    state.events,
    state.possessionSeconds,
    state.homeTeam.players,
    state.awayTeam.players
  );

  return {
    seed: state.seed,
    numericSeed: state.numericSeed,
    status: "Full Time",
    competition: state.competition,
    venue: state.venue,
    stoppageTime: {
      firstHalfMinutes: state.firstHalfStoppageMinutes,
      secondHalfMinutes: state.secondHalfStoppageMinutes,
    },
    homeTeam: {
      name: state.homeTeam.name,
      shortName: state.homeTeam.shortName,
      abbreviation: state.homeTeam.abbreviation,
      formation: state.homeTeam.formation,
      tactics: state.homeTeam.tactics,
      score: computed.home.goals,
      players: computed.playerSummaries.home,
    },
    awayTeam: {
      name: state.awayTeam.name,
      shortName: state.awayTeam.shortName,
      abbreviation: state.awayTeam.abbreviation,
      formation: state.awayTeam.formation,
      tactics: state.awayTeam.tactics,
      score: computed.away.goals,
      players: computed.playerSummaries.away,
    },
    events: state.events,
    stats: {
      home: computed.home,
      away: computed.away,
      totalPossessionChanges: computed.totalPossessionChanges,
    },
    warnings: state.warnings,
  };
}

/**
 * 6. SIMULATE FULL MATCH
 * Convenience entry point that creates, runs, and finishes a full 90-minute match.
 */
export function simulateMatch(
  input: MatchSimulationInput,
  config?: MatchEngineConfig
): MatchSimulationResult {
  const state = createMatch(input, config);
  startMatch(state);
  return finishMatch(state);
}
