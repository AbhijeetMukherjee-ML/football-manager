import { EnginePlayer } from "./playerAdapter";
import { TeamSide } from "./tactics";

export type PitchZone =
  | "defensive_third"
  | "middle_third"
  | "attacking_third";

export interface EventLocation {
  /** Pitch X in [-52.5, 52.5] meters */
  x: number;
  /** Pitch Z in [-34.0, 34.0] meters */
  z: number;
  zone: PitchZone;
}

export type MatchEventType =
  | "kickoff"
  | "goal_restart"
  | "pass"
  | "interception"
  | "turnover"
  | "possession_change"
  | "attack"
  | "shot"
  | "shot_on_target"
  | "save"
  | "goal"
  | "corner"
  | "throw_in"
  | "goal_kick"
  | "foul"
  | "free_kick"
  | "offside"
  | "half_time"
  | "full_time";

export type MatchEventOutcome =
  | "completed"
  | "intercepted"
  | "out_of_bounds"
  | "dispossessed"
  | "on_target"
  | "missed"
  | "blocked"
  | "saved"
  | "goal"
  | "foul_called"
  | "offside_called"
  | "restart"
  | "milestone";

export interface MatchEvent {
  /** Stable deterministic event ID */
  id: string;
  /** Display match minute (1..90+) */
  minute: number;
  /** Stoppage time minute offset when in added time (e.g. 2 for 45+2' or 90+2') */
  addedMinute?: number;
  /** Exact elapsed match clock in seconds */
  second: number;
  half: 1 | 2;
  type: MatchEventType;
  team: TeamSide | "neutral";
  teamName: string;
  /** Stable ID of the primary involved player */
  playerId?: string;
  /** Display name of the primary involved player */
  player?: string;
  /** Stable ID of the secondary involved player (receiver, tackler, assist, GK) */
  secondaryPlayerId?: string;
  /** Display name of the secondary involved player */
  secondaryPlayer?: string;
  /** Pitch coordinates and tactical zone where the event occurred */
  location: EventLocation;
  /** Structured outcome of the action */
  outcome: MatchEventOutcome;
  /** Expected goal value (xG in [0, 1]) for shot/save/goal events */
  shotQuality?: number;
  description: string;
  scoreAfter: {
    home: number;
    away: number;
  };
}

export interface TeamMatchStatistics {
  goals: number;
  possession: number; // Percentage 0-100
  possessionMinutes: number;
  attacks: number;
  shots: number;
  shotsOnTarget: number;
  shotsOffTarget: number;
  blockedShots: number;
  expectedGoals: number;
  saves: number;
  passesAttempted: number;
  passesCompleted: number;
  passAccuracy: number; // Percentage 0-100
  interceptions: number;
  turnovers: number;
  tacklesWon: number;
  corners: number;
  throwIns: number;
  goalKicks: number;
  foulsCommitted: number;
  freeKicksWon: number;
  offsides: number;
  averageEndFitness: number;
}

export interface PlayerMatchSummary {
  id: string;
  shirtNumber: number;
  name: string;
  position: string;
  overall: number;
  startFitness: number;
  endFitness: number;
  fatigueAccumulated: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passesAttempted: number;
  passesCompleted: number;
  interceptions: number;
  tackles: number;
  fouls: number;
  saves: number;
}

/**
 * Classifies a world X coordinate into a tactical third relative to the acting team.
 * Home attacks toward +X; Away attacks toward -X.
 */
export function classifyPitchZone(
  x: number,
  perspective: TeamSide | "neutral"
): PitchZone {
  const relX = perspective === "away" ? -x : x;
  if (relX < -17.5) return "defensive_third";
  if (relX <= 17.5) return "middle_third";
  return "attacking_third";
}

/**
 * Pure helper that derives final scores, team statistics, and individual player
 * statistics directly from the recorded MatchEvent log and possession durations.
 */
export function calculateStatsFromEvents(
  events: readonly MatchEvent[],
  possessionSeconds: { home: number; away: number },
  homePlayers: readonly EnginePlayer[],
  awayPlayers: readonly EnginePlayer[]
): {
  home: TeamMatchStatistics;
  away: TeamMatchStatistics;
  totalPossessionChanges: number;
  playerSummaries: {
    home: PlayerMatchSummary[];
    away: PlayerMatchSummary[];
  };
} {
  const totalPossSec = Math.max(
    1,
    possessionSeconds.home + possessionSeconds.away
  );
  const homePossession = Math.round(
    (possessionSeconds.home / totalPossSec) * 100
  );
  const awayPossession = 100 - homePossession;

  const homePossMinutes = Math.round(possessionSeconds.home / 60);
  const awayPossMinutes = Math.max(0, 90 - homePossMinutes);

  const playerMap = new Map<
    string,
    {
      goals: number;
      assists: number;
      shots: number;
      shotsOnTarget: number;
      passesAttempted: number;
      passesCompleted: number;
      interceptions: number;
      tackles: number;
      fouls: number;
      saves: number;
    }
  >();

  for (const p of [...homePlayers, ...awayPlayers]) {
    playerMap.set(p.id, {
      goals: 0,
      assists: 0,
      shots: 0,
      shotsOnTarget: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      interceptions: 0,
      tackles: 0,
      fouls: 0,
      saves: 0,
    });
  }

  const acc = {
    home: {
      goals: 0,
      attacks: 0,
      shotsOffTarget: 0,
      blockedShots: 0,
      expectedGoals: 0,
      saves: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      interceptions: 0,
      turnovers: 0,
      tacklesWon: 0,
      corners: 0,
      throwIns: 0,
      goalKicks: 0,
      foulsCommitted: 0,
      freeKicksWon: 0,
      offsides: 0,
    },
    away: {
      goals: 0,
      attacks: 0,
      shotsOffTarget: 0,
      blockedShots: 0,
      expectedGoals: 0,
      saves: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      interceptions: 0,
      turnovers: 0,
      tacklesWon: 0,
      corners: 0,
      throwIns: 0,
      goalKicks: 0,
      foulsCommitted: 0,
      freeKicksWon: 0,
      offsides: 0,
    },
  };

  let totalPossessionChanges = 0;

  for (const e of events) {
    if (e.type === "possession_change") {
      totalPossessionChanges += 1;
    }
    if (e.team === "neutral") continue;

    const side = e.team;
    const oppSide: TeamSide = side === "home" ? "away" : "home";
    const tStats = acc[side];
    const pPrimary = e.playerId ? playerMap.get(e.playerId) : undefined;
    const pSecondary = e.secondaryPlayerId
      ? playerMap.get(e.secondaryPlayerId)
      : undefined;

    switch (e.type) {
      case "pass": {
        tStats.passesAttempted += 1;
        if (pPrimary) pPrimary.passesAttempted += 1;
        if (e.outcome === "completed") {
          tStats.passesCompleted += 1;
          if (pPrimary) pPrimary.passesCompleted += 1;
        }
        break;
      }
      case "interception": {
        tStats.interceptions += 1;
        tStats.turnovers += 1;
        if (pPrimary) pPrimary.interceptions += 1;
        break;
      }
      case "turnover": {
        tStats.turnovers += 1;
        tStats.tacklesWon += 1;
        if (pPrimary) pPrimary.tackles += 1;
        break;
      }
      case "attack": {
        tStats.attacks += 1;
        break;
      }
      case "shot": {
        if (e.outcome === "blocked") {
          tStats.blockedShots += 1;
        } else {
          tStats.shotsOffTarget += 1;
        }
        tStats.expectedGoals += e.shotQuality ?? 0.06;
        if (pPrimary) pPrimary.shots += 1;
        break;
      }
      case "save": {
        // A "save" event is attributed to the defending team whose GK made the stop;
        // the secondaryPlayerId is the shooter from the attacking side (`oppSide`).
        tStats.saves += 1;
        if (pPrimary) pPrimary.saves += 1;
        acc[oppSide].expectedGoals += e.shotQuality ?? 0.12;
        if (pSecondary) {
          pSecondary.shots += 1;
          pSecondary.shotsOnTarget += 1;
        }
        break;
      }
      case "goal": {
        tStats.goals += 1;
        tStats.expectedGoals += e.shotQuality ?? 0.25;
        if (pPrimary) {
          pPrimary.goals += 1;
          pPrimary.shots += 1;
          pPrimary.shotsOnTarget += 1;
        }
        if (pSecondary) {
          pSecondary.assists += 1;
        }
        break;
      }
      case "corner": {
        tStats.corners += 1;
        break;
      }
      case "throw_in": {
        tStats.throwIns += 1;
        break;
      }
      case "goal_kick": {
        tStats.goalKicks += 1;
        break;
      }
      case "foul": {
        tStats.foulsCommitted += 1;
        if (pPrimary) pPrimary.fouls += 1;
        break;
      }
      case "free_kick": {
        tStats.freeKicksWon += 1;
        break;
      }
      case "offside": {
        tStats.offsides += 1;
        break;
      }
      default:
        break;
    }
  }

  // Every goal is a shot on target, and every save by the opponent GK came from a shot on target
  const homeShotsOnTarget = acc.home.goals + acc.away.saves;
  const awayShotsOnTarget = acc.away.goals + acc.home.saves;

  const homeShots =
    homeShotsOnTarget + acc.home.shotsOffTarget + acc.home.blockedShots;
  const awayShots =
    awayShotsOnTarget + acc.away.shotsOffTarget + acc.away.blockedShots;

  const avgEndFitness = (list: readonly EnginePlayer[]) => {
    if (list.length === 0) return 80;
    const total = list.reduce(
      (sum, p) => sum + Math.max(5, Math.round(100 - p.currentFatigue)),
      0
    );
    return Math.round(total / list.length);
  };

  const buildTeamStats = (
    side: TeamSide,
    possPct: number,
    possMins: number,
    shots: number,
    shotsOnTarget: number,
    players: readonly EnginePlayer[]
  ): TeamMatchStatistics => {
    const raw = acc[side];
    const passAccuracy =
      raw.passesAttempted > 0
        ? Math.round((raw.passesCompleted / raw.passesAttempted) * 100)
        : 0;
    return {
      goals: raw.goals,
      possession: possPct,
      possessionMinutes: possMins,
      attacks: raw.attacks,
      shots,
      shotsOnTarget,
      shotsOffTarget: raw.shotsOffTarget,
      blockedShots: raw.blockedShots,
      expectedGoals: Number(raw.expectedGoals.toFixed(2)),
      saves: raw.saves,
      passesAttempted: raw.passesAttempted,
      passesCompleted: raw.passesCompleted,
      passAccuracy,
      interceptions: raw.interceptions,
      turnovers: raw.turnovers,
      tacklesWon: raw.tacklesWon,
      corners: raw.corners,
      throwIns: raw.throwIns,
      goalKicks: raw.goalKicks,
      foulsCommitted: raw.foulsCommitted,
      freeKicksWon: raw.freeKicksWon,
      offsides: raw.offsides,
      averageEndFitness: avgEndFitness(players),
    };
  };

  const mapPlayerSummaries = (
    list: readonly EnginePlayer[]
  ): PlayerMatchSummary[] =>
    list.map((p) => {
      const pStats = playerMap.get(p.id) ?? {
        goals: 0,
        assists: 0,
        shots: 0,
        shotsOnTarget: 0,
        passesAttempted: 0,
        passesCompleted: 0,
        interceptions: 0,
        tackles: 0,
        fouls: 0,
        saves: 0,
      };
      const endFitness = Math.max(5, Math.round(100 - p.currentFatigue));
      return {
        id: p.id,
        shirtNumber: p.shirtNumber,
        name: p.name,
        position: p.position,
        overall: p.overall,
        startFitness: p.initialFitness,
        endFitness,
        fatigueAccumulated: Math.max(0, p.initialFitness - endFitness),
        goals: pStats.goals,
        assists: pStats.assists,
        shots: pStats.shots,
        shotsOnTarget: pStats.shotsOnTarget,
        passesAttempted: pStats.passesAttempted,
        passesCompleted: pStats.passesCompleted,
        interceptions: pStats.interceptions,
        tackles: pStats.tackles,
        fouls: pStats.fouls,
        saves: pStats.saves,
      };
    });

  return {
    home: buildTeamStats(
      "home",
      homePossession,
      homePossMinutes,
      homeShots,
      homeShotsOnTarget,
      homePlayers
    ),
    away: buildTeamStats(
      "away",
      awayPossession,
      awayPossMinutes,
      awayShots,
      awayShotsOnTarget,
      awayPlayers
    ),
    totalPossessionChanges,
    playerSummaries: {
      home: mapPlayerSummaries(homePlayers),
      away: mapPlayerSummaries(awayPlayers),
    },
  };
}
