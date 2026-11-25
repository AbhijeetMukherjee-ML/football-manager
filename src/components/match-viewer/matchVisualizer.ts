import {
  AWAY_SQUAD_PLAYERS,
  AWAY_TACTICS,
  HOME_TACTICS,
  NEXT_FIXTURE,
  SQUAD_PLAYERS,
} from "../../data/mockClubData";
import {
  advanceMatch,
  calculateStatsFromEvents,
  createMatch,
  finishMatch,
  MatchEngineConfig,
  MatchEvent,
  MatchPhase,
  MatchSimulationInput,
  MatchSimulationResult,
  MatchState,
  pauseMatch,
  resumeMatch,
  startMatch,
  TeamMatchStatistics,
  TeamSide,
} from "../../engine/matchEngine";
import {
  INITIAL_BALL_STATE,
  INITIAL_PITCH_PLAYERS,
  PitchBallState,
  PitchPlayerPlacement,
} from "./formationData";
import {
  clampToPitchBounds,
  computeFacingAngle,
  createPitchMovementController,
  passBall,
  PitchMovementController,
  resetPitchMovementController,
  returnPlayerToFormation,
  setPlayerTarget,
  stepPitchMovementSystem,
} from "./movementSystem";

export type PlaybackSpeed = 1 | 2 | 4;

export type ViewerSimulationMode = "engine_match" | "movement_demo";

/**
 * Real-world seconds per 15-second engine tick at 1× speed.
 * 0.45s per tick => ~90 seconds for a 45-minute half at 1×, ~45s at 2×, ~22s at 4×.
 */
export const BASE_REAL_SECONDS_PER_TICK = 0.45;

export interface LiveMatchSnapshot {
  seed: string;
  phase: MatchPhase;
  phaseLabel: string;
  half: 1 | 2;
  minute: number;
  addedMinute: number;
  clockLabel: string;
  totalElapsedSeconds: number;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  homeScore: number;
  awayScore: number;
  possessionTeam: TeamSide;
  ballLocation: { x: number; z: number };
  ballCarrierId: string;
  latestEvent: MatchEvent | null;
  events: MatchEvent[];
  stats: {
    home: TeamMatchStatistics;
    away: TeamMatchStatistics;
    totalPossessionChanges: number;
  };
}

export interface EngineCoordinate3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Converts a 2D engine coordinate `{ x, z }` (in meters on the 105m x 68m pitch)
 * into a clamped 3D world position `{ x, y, z }` inside the pitch boundary.
 */
export function engineCoordTo3D(
  location: { x: number; z: number } | undefined,
  elevationY = 0
): EngineCoordinate3D {
  if (
    !location ||
    !Number.isFinite(location.x) ||
    !Number.isFinite(location.z)
  ) {
    return { x: 0, y: Math.max(0, elevationY), z: 0 };
  }
  const clamped = clampToPitchBounds(location.x, location.z);
  return {
    x: Number(clamped.x.toFixed(2)),
    y: Math.max(0, elevationY),
    z: Number(clamped.z.toFixed(2)),
  };
}

/**
 * Builds the default MatchSimulationInput from club data so the 3D Match Viewer
 * and Match Centre use the exact same teams, players, IDs, and tactics.
 */
export function createDefaultMatchInput(
  seed: string | number = "stage5-live-match-seed-1"
): MatchSimulationInput {
  const homeStarters = SQUAD_PLAYERS.filter((p) => p.status === "Starting XI");
  const awayStarters = AWAY_SQUAD_PLAYERS.filter(
    (p) => p.status === "Starting XI"
  );

  return {
    homeTeam: {
      name: NEXT_FIXTURE.homeClub.name,
      shortName: NEXT_FIXTURE.homeClub.shortName,
      abbreviation: NEXT_FIXTURE.homeClub.abbreviation,
      primaryColor: NEXT_FIXTURE.homeClub.primaryColor,
      formation: "4-3-3 Gegenpress",
      tactics: HOME_TACTICS,
      availablePlayers: SQUAD_PLAYERS,
      startingLineup: homeStarters,
    },
    awayTeam: {
      name: NEXT_FIXTURE.awayClub.name,
      shortName: NEXT_FIXTURE.awayClub.shortName,
      abbreviation: NEXT_FIXTURE.awayClub.abbreviation,
      primaryColor: NEXT_FIXTURE.awayClub.primaryColor,
      formation: "4-2-3-1 Balanced",
      tactics: AWAY_TACTICS,
      availablePlayers: AWAY_SQUAD_PLAYERS,
      startingLineup: awayStarters,
    },
    seed,
    competition: NEXT_FIXTURE.competition,
    venue: NEXT_FIXTURE.venue,
  };
}

/**
 * Formats the match phase into a clear user-facing badge label.
 */
export function formatMatchPhaseLabel(
  phase: MatchPhase,
  isPlaying: boolean
): string {
  switch (phase) {
    case "pre_match":
      return "Pre-Match • Ready for Kick-Off";
    case "first_half":
      return isPlaying ? "1st Half • Live" : "1st Half • Paused";
    case "half_time":
      return "Half-Time Interval";
    case "second_half":
      return isPlaying ? "2nd Half • Live" : "2nd Half • Paused";
    case "paused":
      return "Match Paused";
    case "full_time":
      return "Full-Time";
  }
}

/**
 * Formats the current match minute and stoppage time into a broadcast clock string.
 */
export function formatMatchClock(state: MatchState): string {
  if (state.phase === "pre_match") {
    return "00:00";
  }
  const regMinutes = Math.floor(state.totalElapsedSeconds / 60);
  const regSeconds = Math.floor(state.totalElapsedSeconds % 60);
  const mm = String(Math.min(99, regMinutes)).padStart(2, "0");
  const ss = String(regSeconds).padStart(2, "0");

  if (state.addedMinute > 0) {
    const baseMinute = state.half === 1 ? 45 : 90;
    return `${baseMinute}+${state.addedMinute}' (${mm}:${ss})`;
  }
  return `${state.currentMinute}' (${mm}:${ss})`;
}

/**
 * Computes a synchronized movement speed so an active player covers the required
 * distance within the compressed playback window (~0.32s at 1×) smoothly.
 */
function computeSynchronizedSpeed(
  controller: PitchMovementController,
  playerId: string,
  targetX: number,
  targetZ: number,
  windowSec: number,
  speedScale: number
): number {
  const p = controller.players.get(playerId);
  if (!p) return 18 * speedScale;
  const dist = Math.hypot(
    targetX - p.position3D.x,
    targetZ - p.position3D.z
  );
  const baseSpeed = dist / Math.max(0.12, windowSec);
  return Math.max(14, baseSpeed) * speedScale;
}

/**
 * Places a player at a set-piece restart spot (or blends an open-play actor close
 * to the action origin) and sets their facing direction toward the target play.
 */
function positionActorForAction(
  controller: PitchMovementController,
  playerId: string | undefined,
  spot: { x: number; z: number },
  lookAt: { x: number; z: number },
  snapDirectly: boolean,
  speedScale: number
): void {
  if (!playerId) return;
  const p = controller.players.get(playerId);
  if (!p) return;

  const clampedSpot = clampToPitchBounds(spot.x, spot.z);
  const facingY = computeFacingAngle(
    clampedSpot.x,
    clampedSpot.z,
    lookAt.x,
    lookAt.z,
    p.defaultRotationY
  );

  const dist = Math.hypot(
    clampedSpot.x - p.position3D.x,
    clampedSpot.z - p.position3D.z
  );

  if (snapDirectly) {
    p.position3D.x = clampedSpot.x;
    p.position3D.z = clampedSpot.z;
    p.rotationY = facingY;
    p.activeTarget = null;
    return;
  }

  setPlayerTarget(
    controller,
    playerId,
    { x: clampedSpot.x, z: clampedSpot.z },
    {
      speed: Math.max(18, dist * 4.5) * speedScale,
      arrivalFacingY: facingY,
    }
  );
}

/**
 * Dynamically shifts the 22 players' tactical support positions in 3D space
 * based on the current ball position and team in possession, while keeping
 * goalkeepers anchored near their goal mouths and all players inside pitch bounds.
 */
export function applyTacticalTeamShapeTo3D(
  controller: PitchMovementController,
  state: MatchState,
  activePlayerIds: Set<string>,
  speedScale = 1
): void {
  const ball3D = engineCoordTo3D(state.ballLocation);
  const possessionSide = state.possessionTeam;

  for (const [playerId, pState] of controller.players.entries()) {
    if (activePlayerIds.has(playerId)) {
      continue;
    }

    const baseX = pState.homeX;
    const baseZ = pState.homeZ;
    const isHome = pState.team === "home";
    const playerSide: TeamSide = isHome ? "home" : "away";
    const attackDir = isHome ? 1 : -1;

    // Goalkeepers stay inside the 6-yard box in front of their goal line and narrow the angle
    const isGoalkeeper = pState.tacticalSlot === "GK" || Math.abs(baseX) > 44;
    if (isGoalkeeper) {
      const distBallToGoal = Math.abs((isHome ? -52.5 : 52.5) - ball3D.x);
      const gkX = isHome
        ? distBallToGoal < 28
          ? -50.2
          : -48.5
        : distBallToGoal < 28
          ? 50.2
          : 48.5;
      // Keep goalkeeper within the 7.32m goal frame laterally [-2.9, 2.9]
      const gkZ = Math.max(-2.9, Math.min(2.9, ball3D.z * 0.14));
      const gkFacingY = computeFacingAngle(
        gkX,
        gkZ,
        ball3D.x,
        ball3D.z,
        pState.defaultRotationY
      );
      setPlayerTarget(
        controller,
        playerId,
        { x: gkX, z: gkZ },
        {
          speed: 12.0 * speedScale,
          arrivalFacingY: gkFacingY,
        }
      );
      continue;
    }

    // Outfield players shift longitudinally and laterally with the ball
    const ballShiftX = ball3D.x * 0.36;
    const possessionPushX =
      playerSide === possessionSide ? attackDir * 6.0 : -attackDir * 3.8;
    const targetX = Math.max(
      -46.5,
      Math.min(46.5, baseX * 0.78 + ballShiftX + possessionPushX)
    );

    const lateralCompression = playerSide === possessionSide ? 0.9 : 0.76;
    const targetZ = Math.max(
      -31.5,
      Math.min(31.5, baseZ * lateralCompression + ball3D.z * 0.24)
    );

    const arrivalFacingY = computeFacingAngle(
      targetX,
      targetZ,
      ball3D.x,
      ball3D.z,
      pState.defaultRotationY
    );

    setPlayerTarget(
      controller,
      playerId,
      { x: targetX, z: targetZ },
      {
        speed: 15.5 * speedScale,
        arrivalFacingY,
      }
    );
  }
}

/**
 * Translates a single Stage 4 MatchEvent into concrete 3D player movements and
 * ball trajectories on the PitchMovementController.
 *
 * Never invents goals, passes, or outcomes — every visual movement reflects the
 * authoritative MatchEvent emitted by the Stage 4 match engine.
 */
export function applyMatchEventTo3D(
  controller: PitchMovementController,
  event: MatchEvent,
  state: MatchState,
  speedScale = 1
): Set<string> {
  const activePlayerIds = new Set<string>();
  const loc3D = engineCoordTo3D(event.location);
  const currentBallPos = {
    x: controller.ball.position3D.x,
    z: controller.ball.position3D.z,
  };

  const registerActive = (id?: string) => {
    if (id && controller.players.has(id)) {
      activePlayerIds.add(id);
    }
  };

  const passDuration = (baseSec: number) =>
    Math.max(0.15, baseSec / Math.max(0.5, speedScale));

  switch (event.type) {
    case "kickoff":
    case "goal_restart": {
      // Return all 22 players toward their starting formation slots and place ball at centre spot (0, 0)
      for (const playerId of controller.players.keys()) {
        returnPlayerToFormation(controller, playerId, 22.0 * speedScale);
      }
      if (event.playerId && controller.players.has(event.playerId)) {
        registerActive(event.playerId);
        const attackX = event.team === "home" ? 10 : -10;
        positionActorForAction(
          controller,
          event.playerId,
          { x: 0, z: 0 },
          { x: attackX, z: 0 },
          true,
          speedScale
        );
      }
      controller.ball.position3D.x = 0;
      controller.ball.position3D.y = controller.ball.radius;
      controller.ball.position3D.z = 0;
      passBall(controller, { x: 0, z: 0 }, passDuration(0.18), {
        fromPosition: { x: 0, z: 0 },
        arcHeight: 0,
      });
      break;
    }

    case "pass":
    case "attack": {
      registerActive(event.playerId);
      registerActive(event.secondaryPlayerId);

      // Identify passer on pitch
      const passer = event.playerId
        ? controller.players.get(event.playerId)
        : undefined;

      // Pass starts from passer's feet if available, or current ball position
      const passOrigin = passer
        ? { x: passer.position3D.x, z: passer.position3D.z }
        : currentBallPos;

      // Orient passer towards the pass target
      if (passer) {
        passer.rotationY = computeFacingAngle(
          passOrigin.x,
          passOrigin.z,
          loc3D.x,
          loc3D.z,
          passer.rotationY
        );
      }

      // Move receiver to the event location to meet the ball in sync
      if (
        event.secondaryPlayerId &&
        controller.players.has(event.secondaryPlayerId)
      ) {
        const goalX = event.team === "home" ? 52.5 : -52.5;
        const recvFacing = computeFacingAngle(
          loc3D.x,
          loc3D.z,
          goalX,
          0
        );
        const recvSpeed = computeSynchronizedSpeed(
          controller,
          event.secondaryPlayerId,
          loc3D.x,
          loc3D.z,
          0.32,
          speedScale
        );
        setPlayerTarget(
          controller,
          event.secondaryPlayerId,
          { x: loc3D.x, z: loc3D.z },
          { speed: recvSpeed, arrivalFacingY: recvFacing }
        );
      }

      const dist = Math.hypot(
        loc3D.x - passOrigin.x,
        loc3D.z - passOrigin.z
      );
      // Scale duration smoothly with distance within the tick window
      const basePassSec = Math.max(0.34, Math.min(0.43, 0.32 + dist * 0.005));
      const dur = passDuration(basePassSec);
      const isLongPass = dist > 22 || event.type === "attack";
      const arcHeight = isLongPass ? Math.min(1.6, dist * 0.04) : 0.14;

      passBall(controller, { x: loc3D.x, z: loc3D.z }, dur, {
        fromPosition: passOrigin,
        arcHeight,
        receiverPlayerId: event.secondaryPlayerId,
      });
      break;
    }

    case "interception":
    case "turnover":
    case "possession_change": {
      registerActive(event.playerId);
      registerActive(event.secondaryPlayerId);

      const attackX = event.team === "home" ? 52.5 : -52.5;

      if (event.playerId && controller.players.has(event.playerId)) {
        const winSpeed = computeSynchronizedSpeed(
          controller,
          event.playerId,
          loc3D.x,
          loc3D.z,
          0.25,
          speedScale
        );
        setPlayerTarget(
          controller,
          event.playerId,
          { x: loc3D.x, z: loc3D.z },
          {
            speed: winSpeed,
            arrivalFacingY: computeFacingAngle(loc3D.x, loc3D.z, attackX, 0),
          }
        );
      }
      if (
        event.secondaryPlayerId &&
        controller.players.has(event.secondaryPlayerId)
      ) {
        const offsetZ = loc3D.z >= 0 ? -1.8 : 1.8;
        const secSpeed = computeSynchronizedSpeed(
          controller,
          event.secondaryPlayerId,
          loc3D.x,
          loc3D.z + offsetZ,
          0.28,
          speedScale
        );
        setPlayerTarget(
          controller,
          event.secondaryPlayerId,
          { x: loc3D.x, z: loc3D.z + offsetZ },
          {
            speed: secSpeed,
            arrivalFacingY: computeFacingAngle(
              loc3D.x,
              loc3D.z + offsetZ,
              loc3D.x,
              loc3D.z
            ),
          }
        );
      }

      passBall(controller, { x: loc3D.x, z: loc3D.z }, passDuration(0.28), {
        fromPosition: currentBallPos,
        arcHeight: 0.2,
        receiverPlayerId: event.playerId,
      });
      break;
    }

    case "shot":
    case "shot_on_target": {
      registerActive(event.playerId);
      registerActive(event.secondaryPlayerId);

      const attackingHome = event.team === "home";
      const goalX = attackingHome ? 52.2 : -52.2;

      if (event.playerId && controller.players.has(event.playerId)) {
        positionActorForAction(
          controller,
          event.playerId,
          loc3D,
          { x: goalX, z: 0 },
          false,
          speedScale
        );
      }

      if (event.outcome === "blocked") {
        const blockX = loc3D.x + (attackingHome ? 3.2 : -3.2);
        const blockZ = loc3D.z * 0.85;
        if (
          event.secondaryPlayerId &&
          controller.players.has(event.secondaryPlayerId)
        ) {
          const blkSpeed = computeSynchronizedSpeed(
            controller,
            event.secondaryPlayerId,
            blockX,
            blockZ,
            0.22,
            speedScale
          );
          setPlayerTarget(
            controller,
            event.secondaryPlayerId,
            { x: blockX, z: blockZ },
            {
              speed: blkSpeed,
              arrivalFacingY: computeFacingAngle(
                blockX,
                blockZ,
                loc3D.x,
                loc3D.z
              ),
            }
          );
        }
        passBall(controller, { x: blockX, z: blockZ }, passDuration(0.24), {
          fromPosition: { x: loc3D.x, z: loc3D.z },
          arcHeight: 0.35,
        });
      } else {
        // Missed shot travels just wide of the goal post
        const missZ = loc3D.z >= 0 ? 5.2 : -5.2;
        passBall(controller, { x: goalX, z: missZ }, passDuration(0.34), {
          fromPosition: { x: loc3D.x, z: loc3D.z },
          arcHeight: 0.95,
        });
      }
      break;
    }

    case "save": {
      // event.playerId = Goalkeeper making the save; event.secondaryPlayerId = Shooter
      registerActive(event.playerId);
      registerActive(event.secondaryPlayerId);

      const gkIsHome = event.team === "home";
      const saveX = gkIsHome ? -50.0 : 50.0;
      const saveZ = Math.max(-2.8, Math.min(2.8, loc3D.z * 0.25));

      if (
        event.secondaryPlayerId &&
        controller.players.has(event.secondaryPlayerId)
      ) {
        positionActorForAction(
          controller,
          event.secondaryPlayerId,
          loc3D,
          { x: saveX, z: saveZ },
          false,
          speedScale
        );
      }

      if (event.playerId && controller.players.has(event.playerId)) {
        const gkSpeed = computeSynchronizedSpeed(
          controller,
          event.playerId,
          saveX,
          saveZ,
          0.24,
          speedScale
        );
        setPlayerTarget(
          controller,
          event.playerId,
          { x: saveX, z: saveZ },
          {
            speed: gkSpeed,
            arrivalFacingY: computeFacingAngle(
              saveX,
              saveZ,
              loc3D.x,
              loc3D.z
            ),
          }
        );
      }

      passBall(controller, { x: saveX, z: saveZ }, passDuration(0.32), {
        fromPosition: { x: loc3D.x, z: loc3D.z },
        arcHeight: 0.65,
        receiverPlayerId: event.playerId,
      });
      break;
    }

    case "goal": {
      // Shooter strikes into the back of the opposing goal net!
      registerActive(event.playerId);
      registerActive(event.secondaryPlayerId);

      const scoringHome = event.team === "home";
      const goalLineX = scoringHome ? 52.1 : -52.1;
      const goalNetZ = Math.max(-2.5, Math.min(2.5, loc3D.z * 0.2));

      if (event.playerId && controller.players.has(event.playerId)) {
        positionActorForAction(
          controller,
          event.playerId,
          loc3D,
          { x: goalLineX, z: goalNetZ },
          false,
          speedScale
        );
      }

      passBall(controller, { x: goalLineX, z: goalNetZ }, passDuration(0.34), {
        fromPosition: { x: loc3D.x, z: loc3D.z },
        arcHeight: 0.7,
      });
      break;
    }

    case "corner": {
      registerActive(event.playerId);
      const targetId = event.secondaryPlayerId ?? state.ballCarrierId;
      registerActive(targetId);

      const attackingHome = event.team === "home";
      const stateBall3D = engineCoordTo3D(state.ballLocation);
      const isStateInBox =
        attackingHome ? stateBall3D.x > 34 : stateBall3D.x < -34;
      const boxTargetX = isStateInBox
        ? stateBall3D.x
        : attackingHome
          ? 44.0
          : -44.0;
      const boxTargetZ = isStateInBox
        ? stateBall3D.z
        : loc3D.z >= 0
          ? 2.5
          : -2.5;

      // Place corner taker directly at the corner arc facing the penalty spot
      if (event.playerId && controller.players.has(event.playerId)) {
        positionActorForAction(
          controller,
          event.playerId,
          loc3D,
          { x: boxTargetX, z: boxTargetZ },
          true,
          speedScale
        );
      }

      if (
        targetId &&
        targetId !== event.playerId &&
        controller.players.has(targetId)
      ) {
        const boxSpeed = computeSynchronizedSpeed(
          controller,
          targetId,
          boxTargetX,
          boxTargetZ,
          0.26,
          speedScale
        );
        setPlayerTarget(
          controller,
          targetId,
          { x: boxTargetX, z: boxTargetZ },
          {
            speed: boxSpeed,
            arrivalFacingY: computeFacingAngle(
              boxTargetX,
              boxTargetZ,
              attackingHome ? 52.5 : -52.5,
              0
            ),
          }
        );
      }

      passBall(
        controller,
        { x: boxTargetX, z: boxTargetZ },
        passDuration(0.38),
        {
          fromPosition: { x: loc3D.x, z: loc3D.z },
          arcHeight: 2.15,
        }
      );
      break;
    }

    case "goal_kick": {
      registerActive(event.playerId);
      const targetId = event.secondaryPlayerId ?? state.ballCarrierId;
      registerActive(targetId);

      const gkHome = event.team === "home";
      const startX = gkHome ? -47.0 : 47.0;
      const targetPos = engineCoordTo3D(state.ballLocation);

      if (event.playerId && controller.players.has(event.playerId)) {
        positionActorForAction(
          controller,
          event.playerId,
          { x: startX, z: 0 },
          targetPos,
          true,
          speedScale
        );
      }
      if (
        targetId &&
        targetId !== event.playerId &&
        controller.players.has(targetId)
      ) {
        const recvSpeed = computeSynchronizedSpeed(
          controller,
          targetId,
          targetPos.x,
          targetPos.z,
          0.3,
          speedScale
        );
        setPlayerTarget(
          controller,
          targetId,
          { x: targetPos.x, z: targetPos.z },
          {
            speed: recvSpeed,
            arrivalFacingY: computeFacingAngle(
              targetPos.x,
              targetPos.z,
              gkHome ? 52.5 : -52.5,
              0
            ),
          }
        );
      }

      passBall(
        controller,
        { x: targetPos.x, z: targetPos.z },
        passDuration(0.36),
        {
          fromPosition: { x: startX, z: 0 },
          arcHeight: 1.5,
        }
      );
      break;
    }

    case "throw_in": {
      registerActive(event.playerId);
      const targetId = event.secondaryPlayerId ?? state.ballCarrierId;
      registerActive(targetId);

      const targetPos = engineCoordTo3D(state.ballLocation);

      if (event.playerId && controller.players.has(event.playerId)) {
        positionActorForAction(
          controller,
          event.playerId,
          loc3D,
          targetPos,
          true,
          speedScale
        );
      }
      if (
        targetId &&
        targetId !== event.playerId &&
        controller.players.has(targetId)
      ) {
        const recvSpeed = computeSynchronizedSpeed(
          controller,
          targetId,
          targetPos.x,
          targetPos.z,
          0.26,
          speedScale
        );
        setPlayerTarget(
          controller,
          targetId,
          { x: targetPos.x, z: targetPos.z },
          {
            speed: recvSpeed,
            arrivalFacingY: computeFacingAngle(
              targetPos.x,
              targetPos.z,
              loc3D.x,
              loc3D.z
            ),
          }
        );
      }

      passBall(
        controller,
        { x: targetPos.x, z: targetPos.z },
        passDuration(0.3),
        {
          fromPosition: { x: loc3D.x, z: loc3D.z },
          arcHeight: 0.75,
        }
      );
      break;
    }

    case "foul":
    case "free_kick":
    case "offside": {
      registerActive(event.playerId);
      const targetId =
        event.type === "free_kick"
          ? (event.secondaryPlayerId ?? state.ballCarrierId)
          : event.secondaryPlayerId;
      registerActive(targetId);

      const targetBall =
        event.type === "free_kick"
          ? engineCoordTo3D(state.ballLocation)
          : loc3D;

      if (event.playerId && controller.players.has(event.playerId)) {
        positionActorForAction(
          controller,
          event.playerId,
          loc3D,
          targetBall,
          event.type === "free_kick",
          speedScale
        );
      }

      if (
        targetId &&
        targetId !== event.playerId &&
        controller.players.has(targetId)
      ) {
        const tgtSpot =
          event.type === "free_kick"
            ? targetBall
            : { x: loc3D.x, z: loc3D.z + (loc3D.z >= 0 ? -1.6 : 1.6) };
        const recvSpeed = computeSynchronizedSpeed(
          controller,
          targetId,
          tgtSpot.x,
          tgtSpot.z,
          0.26,
          speedScale
        );
        setPlayerTarget(
          controller,
          targetId,
          { x: tgtSpot.x, z: tgtSpot.z },
          {
            speed: recvSpeed,
            arrivalFacingY: computeFacingAngle(
              tgtSpot.x,
              tgtSpot.z,
              loc3D.x,
              loc3D.z
            ),
          }
        );
      }

      passBall(
        controller,
        { x: targetBall.x, z: targetBall.z },
        passDuration(0.3),
        {
          fromPosition:
            event.type === "free_kick"
              ? { x: loc3D.x, z: loc3D.z }
              : currentBallPos,
          arcHeight: event.type === "free_kick" ? 0.9 : 0.1,
        }
      );
      break;
    }

    case "half_time":
    case "full_time": {
      for (const playerId of controller.players.keys()) {
        returnPlayerToFormation(controller, playerId, 18.0 * speedScale);
      }
      passBall(controller, { x: 0, z: 0 }, passDuration(0.3), {
        fromPosition: currentBallPos,
        arcHeight: 0,
      });
      break;
    }

    default: {
      // Safe fallback for any unrecognized or minimal event data
      passBall(controller, { x: loc3D.x, z: loc3D.z }, passDuration(0.3), {
        fromPosition: currentBallPos,
        arcHeight: 0.15,
      });
      break;
    }
  }

  return activePlayerIds;
}

/**
 * Pure TypeScript controller that bridges the deterministic Stage 4 MatchEngine
 * and the Stage 3 PitchMovementController.
 *
 * Guarantees:
 * - Single source of truth: all events, scores, clock, and stats come from `MatchState`.
 * - Simulation time vs. render-frame time separation: changing `playbackSpeed` (1×, 2×, 4×)
 *   or pausing/resuming never alters the event sequence or final score for a given seed.
 * - Clean restart with zero stale events or duplicate loops.
 */
export class MatchPlaybackController {
  private input: MatchSimulationInput;
  private config?: MatchEngineConfig;
  public matchState: MatchState;
  public movementController: PitchMovementController;
  public isPlaying: boolean = false;
  public playbackSpeed: PlaybackSpeed = 1;
  private simAccumulatorSec: number = 0;
  private halfTimePauseRemainingSec: number = 0;
  private pendingVisualSubEvents: MatchEvent[] = [];
  private initialPlayers: PitchPlayerPlacement[];
  private initialBall: PitchBallState;

  constructor(
    input: MatchSimulationInput = createDefaultMatchInput(),
    config?: MatchEngineConfig,
    players: PitchPlayerPlacement[] = INITIAL_PITCH_PLAYERS,
    ball: PitchBallState = INITIAL_BALL_STATE
  ) {
    this.input = input;
    this.config = config;
    this.initialPlayers = players;
    this.initialBall = ball;
    this.matchState = createMatch(this.input, this.config);
    this.movementController = createPitchMovementController(
      this.initialPlayers,
      this.initialBall
    );
  }

  /**
   * Starts or resumes live match playback.
   */
  public play(): LiveMatchSnapshot {
    if (this.matchState.phase === "full_time") {
      return this.getSnapshot();
    }

    if (this.matchState.phase === "paused") {
      resumeMatch(this.matchState);
    }

    if (this.matchState.phase === "pre_match") {
      const started = startMatch(this.matchState);
      this.applyTickEventsTo3D(started.newEvents, true);
    }

    this.isPlaying = true;
    return this.getSnapshot();
  }

  /**
   * Pauses live match playback without losing engine or 3D kinematics state.
   */
  public pause(): LiveMatchSnapshot {
    this.isPlaying = false;
    if (
      this.matchState.phase !== "pre_match" &&
      this.matchState.phase !== "full_time" &&
      this.matchState.phase !== "paused"
    ) {
      pauseMatch(this.matchState);
    }
    return this.getSnapshot();
  }

  /**
   * Resumes playback from a paused state.
   */
  public resume(): LiveMatchSnapshot {
    return this.play();
  }

  /**
   * Changes the playback speed multiplier (1×, 2×, or 4×).
   * Does not alter engine tick sizes or RNG outcomes.
   */
  public setSpeed(speed: PlaybackSpeed): LiveMatchSnapshot {
    this.playbackSpeed = speed;
    return this.getSnapshot();
  }

  /**
   * Restarts the match cleanly (with the same seed or an optional new seed),
   * clearing all stale events, resetting the accumulator, and returning all 22
   * 3D players and the ball to their kickoff positions.
   */
  public restart(newSeed?: string | number): LiveMatchSnapshot {
    if (newSeed !== undefined) {
      this.input = {
        ...this.input,
        seed: newSeed,
      };
    }
    this.isPlaying = false;
    this.simAccumulatorSec = 0;
    this.halfTimePauseRemainingSec = 0;
    this.pendingVisualSubEvents = [];
    this.matchState = createMatch(this.input, this.config);
    resetPitchMovementController(this.movementController);
    return this.getSnapshot();
  }

  /**
   * Advances the match immediately to the end of the current half (Half-Time or Full-Time)
   * using the exact same `tickSeconds` steps so determinism is 100% preserved.
   */
  public skipToNextMilestone(): LiveMatchSnapshot {
    if (this.matchState.phase === "full_time") {
      this.isPlaying = false;
      return this.getSnapshot();
    }

    this.flushPendingVisualSubEvents();

    if (this.matchState.phase === "paused") {
      resumeMatch(this.matchState);
    }

    if (this.matchState.phase === "pre_match") {
      const started = startMatch(this.matchState);
      this.applyTickEventsTo3D(started.newEvents, true);
    }

    const startPhase = this.matchState.phase;
    let safety = 0;

    while (safety < 600) {
      safety += 1;
      const stepRes = advanceMatch(
        this.matchState,
        this.matchState.tickSeconds
      );
      if (stepRes.newEvents.length > 0) {
        this.applyTickEventsTo3D(stepRes.newEvents, true);
      }
      if (stepRes.isHalfTime && startPhase === "first_half") {
        break;
      }
      if (stepRes.isFinished) {
        this.isPlaying = false;
        break;
      }
    }

    // Step the 3D movement controller so players settle toward the latest event state
    stepPitchMovementSystem(this.movementController, 0.5, false);
    return this.getSnapshot();
  }

  /**
   * Advances both the 3D kinematic interpolation and (when enough scaled playback
   * time has elapsed) the Stage 4 match engine by one discrete tick (`15s`).
   *
   * Returns `true` whenever the engine state or event log changed on this frame
   * so React UI overlays only re-render on actual engine updates (~2–8 times/sec),
   * while Three.js meshes update smoothly at 60–120fps.
   */
  public stepFrame(frameDeltaSeconds: number): boolean {
    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) {
      return false;
    }

    const clampedDelta = Math.min(frameDeltaSeconds, 0.1);
    const scaledDelta = clampedDelta * this.playbackSpeed;

    // Always step smooth 3D player and ball kinematics
    stepPitchMovementSystem(this.movementController, scaledDelta, false);

    if (!this.isPlaying || this.matchState.phase === "full_time") {
      return false;
    }

    // Brief visual breather at Half-Time before kicking off the Second Half
    if (this.halfTimePauseRemainingSec > 0) {
      this.halfTimePauseRemainingSec = Math.max(
        0,
        this.halfTimePauseRemainingSec - scaledDelta
      );
      if (this.halfTimePauseRemainingSec > 0) {
        return false;
      }
    }

    this.simAccumulatorSec += scaledDelta;

    // If a two-beat event (e.g., corner -> header goal) queued its 2nd visual beat,
    // trigger it halfway through the tick so both animations play out visibly!
    if (
      this.pendingVisualSubEvents.length > 0 &&
      this.simAccumulatorSec >= BASE_REAL_SECONDS_PER_TICK * 0.5
    ) {
      this.flushPendingVisualSubEvents();
    }

    let engineStateUpdated = false;

    while (this.simAccumulatorSec >= BASE_REAL_SECONDS_PER_TICK) {
      this.simAccumulatorSec -= BASE_REAL_SECONDS_PER_TICK;
      this.flushPendingVisualSubEvents();

      const stepRes = advanceMatch(
        this.matchState,
        this.matchState.tickSeconds
      );
      engineStateUpdated = true;

      this.applyTickEventsTo3D(stepRes.newEvents, false);

      if (stepRes.isHalfTime) {
        this.halfTimePauseRemainingSec = 0.9;
        break;
      }

      if (stepRes.isFinished) {
        this.flushPendingVisualSubEvents();
        this.isPlaying = false;
        break;
      }
    }

    return engineStateUpdated;
  }

  private flushPendingVisualSubEvents(): void {
    if (this.pendingVisualSubEvents.length === 0) return;
    const queued = this.pendingVisualSubEvents;
    this.pendingVisualSubEvents = [];
    const activePlayerIds = new Set<string>();
    for (const ev of queued) {
      const ids = applyMatchEventTo3D(
        this.movementController,
        ev,
        this.matchState,
        this.playbackSpeed * 1.4
      );
      for (const id of ids) {
        activePlayerIds.add(id);
      }
    }
    applyTacticalTeamShapeTo3D(
      this.movementController,
      this.matchState,
      activePlayerIds,
      this.playbackSpeed
    );
  }

  private applyTickEventsTo3D(
    events: MatchEvent[],
    immediateAll: boolean
  ): void {
    if (events.length === 0) return;

    // Detect two-beat compound ticks (e.g., corner/free_kick -> shot/save/goal, or play -> half_time/full_time)
    const first = events[0];
    const hasDistinctSecondBeat =
      !immediateAll &&
      events.length > 1 &&
      (first.type === "corner" ||
        first.type === "free_kick" ||
        events[events.length - 1].type === "half_time" ||
        events[events.length - 1].type === "full_time");

    const immediateEvents = hasDistinctSecondBeat ? [first] : events;
    if (hasDistinctSecondBeat) {
      this.pendingVisualSubEvents.push(...events.slice(1));
    }

    const activePlayerIds = new Set<string>();
    for (const ev of immediateEvents) {
      const ids = applyMatchEventTo3D(
        this.movementController,
        ev,
        this.matchState,
        hasDistinctSecondBeat ? this.playbackSpeed * 1.4 : this.playbackSpeed
      );
      for (const id of ids) {
        activePlayerIds.add(id);
      }
    }

    applyTacticalTeamShapeTo3D(
      this.movementController,
      this.matchState,
      activePlayerIds,
      this.playbackSpeed
    );
  }

  /**
   * Produces a synchronized snapshot of the live match state, clock, score,
   * event log, and event-derived statistics for the HUD and Match Centre.
   */
  public getSnapshot(): LiveMatchSnapshot {
    const computedStats = calculateStatsFromEvents(
      this.matchState.events,
      this.matchState.possessionSeconds,
      this.matchState.homeTeam.players,
      this.matchState.awayTeam.players
    );

    const eventsCount = this.matchState.events.length;
    const latestEvent =
      eventsCount > 0 ? this.matchState.events[eventsCount - 1] : null;

    return {
      seed: this.matchState.seed,
      phase: this.matchState.phase,
      phaseLabel: formatMatchPhaseLabel(this.matchState.phase, this.isPlaying),
      half: this.matchState.half,
      minute: this.matchState.currentMinute,
      addedMinute: this.matchState.addedMinute,
      clockLabel: formatMatchClock(this.matchState),
      totalElapsedSeconds: this.matchState.totalElapsedSeconds,
      isPlaying: this.isPlaying,
      playbackSpeed: this.playbackSpeed,
      homeScore: this.matchState.homeTeam.score,
      awayScore: this.matchState.awayTeam.score,
      possessionTeam: this.matchState.possessionTeam,
      ballLocation: { ...this.matchState.ballLocation },
      ballCarrierId: this.matchState.ballCarrierId,
      latestEvent,
      events: [...this.matchState.events],
      stats: {
        home: computedStats.home,
        away: computedStats.away,
        totalPossessionChanges: computedStats.totalPossessionChanges,
      },
    };
  }

  /**
   * Builds a full `MatchSimulationResult` from the current or finished `MatchState`
   * so the dashboard and Match Centre share the exact same result structure.
   */
  public toMatchSimulationResult(): MatchSimulationResult {
    if (this.matchState.phase !== "full_time") {
      const cloned: MatchState = JSON.parse(JSON.stringify(this.matchState));
      return finishMatch(cloned);
    }
    return finishMatch(this.matchState);
  }
}
