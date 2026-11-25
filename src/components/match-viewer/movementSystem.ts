import {
  INITIAL_BALL_STATE,
  INITIAL_PITCH_PLAYERS,
  MATCH_BALL_RADIUS,
  PITCH_LENGTH,
  PITCH_WIDTH,
  type PitchBallState,
  type PitchPlayerPlacement,
  type PitchVector3,
  type TeamSide,
} from "./formationData";

const HALF_PITCH_X = PITCH_LENGTH / 2; // 52.5m
const HALF_PITCH_Z = PITCH_WIDTH / 2; // 34.0m
const DEFAULT_PITCH_MARGIN = 0.85; // Keep players inside white touchlines/goal lines
const FIXED_TIMESTEP_SEC = 1 / 120; // Deterministic 120Hz physics step
const MAX_FRAME_DELTA_SEC = 0.1; // Prevent large jumps when switching browser tabs

export interface PlayerMovementTarget {
  targetX: number;
  targetZ: number;
  speedMetersPerSec: number;
  delaySec: number;
  arrivalFacingY?: number;
}

export interface PlayerKinematicsState {
  id: string;
  team: TeamSide;
  shirtNumber: number;
  shortName: string;
  tacticalSlot: string;
  homeX: number;
  homeZ: number;
  defaultRotationY: number;
  position3D: PitchVector3;
  velocity: { vx: number; vz: number };
  rotationY: number;
  activeTarget: PlayerMovementTarget | null;
}

export interface BallPassOrder {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  durationSec: number;
  elapsedSec: number;
  arcHeight: number;
  delaySec: number;
  receiverPlayerId?: string;
}

export interface BallKinematicsState {
  id: string;
  position3D: PitchVector3;
  rotation3D: PitchVector3;
  radius: number;
  activePass: BallPassOrder | null;
  carrierPlayerId?: string | null;
}

export interface DemoPhaseInfo {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  ballCarrierLabel: string;
}

export interface PitchMovementController {
  players: Map<string, PlayerKinematicsState>;
  ball: BallKinematicsState;
  accumulatorSec: number;
  demoElapsedSec: number;
  currentDemoStepIndex: number;
  isDemoActive: boolean;
}

/**
 * Clamps any (x, z) coordinate so players and the ball remain strictly inside
 * the 105m x 68m regulation pitch boundaries.
 */
export function clampToPitchBounds(
  x: number,
  z: number,
  margin = DEFAULT_PITCH_MARGIN
): { x: number; z: number } {
  const maxX = HALF_PITCH_X - margin;
  const maxZ = HALF_PITCH_Z - margin;
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    z: Math.max(-maxZ, Math.min(maxZ, z)),
  };
}

/**
 * Shortest-arc angular interpolation in radians.
 */
export function lerpAngleRadians(
  current: number,
  target: number,
  factor: number
): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, Math.max(0, factor));
}

/**
 * Computes the Y-axis rotation angle so a player (whose local forward is +Z)
 * faces from (fromX, fromZ) toward (toX, toZ).
 */
export function computeFacingAngle(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  fallbackAngle = 0
): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  if (Math.hypot(dx, dz) < 0.001) return fallbackAngle;
  return Math.atan2(dx, dz);
}

/**
 * Reusable API: Assigns a smooth target position to a specific player by ID.
 * Compatible with both the demonstration choreographer and a future match engine.
 */
export function setPlayerTarget(
  controller: PitchMovementController,
  playerId: string,
  target: { x: number; z: number },
  options?: {
    speed?: number;
    delaySec?: number;
    arrivalFacingY?: number;
  }
): void {
  const player = controller.players.get(playerId);
  if (!player) return;

  const clamped = clampToPitchBounds(target.x, target.z);
  player.activeTarget = {
    targetX: clamped.x,
    targetZ: clamped.z,
    speedMetersPerSec: options?.speed ?? 6.4,
    delaySec: options?.delaySec ?? 0,
    arrivalFacingY: options?.arrivalFacingY,
  };
}

/**
 * Reusable API: Smoothly returns a player to their default tactical formation slot.
 */
export function returnPlayerToFormation(
  controller: PitchMovementController,
  playerId: string,
  speed = 6.2,
  delaySec = 0
): void {
  const player = controller.players.get(playerId);
  if (!player) return;

  setPlayerTarget(
    controller,
    playerId,
    { x: player.homeX, z: player.homeZ },
    {
      speed,
      delaySec,
      arrivalFacingY: player.defaultRotationY,
    }
  );
}

/**
 * Reusable API: Moves/passes the ball smoothly from its current (or specified)
 * position to `toPosition` over `durationSec` seconds.
 * Supports ground passes (arcHeight = 0) and clean low-lofted passes (arcHeight > 0).
 */
export function passBall(
  controller: PitchMovementController,
  toPosition: { x: number; z: number },
  durationSec: number,
  options?: {
    fromPosition?: { x: number; z: number };
    arcHeight?: number;
    delaySec?: number;
  }
): void {
  const fromClamped = options?.fromPosition
    ? clampToPitchBounds(options.fromPosition.x, options.fromPosition.z, 0.3)
    : {
        x: controller.ball.position3D.x,
        z: controller.ball.position3D.z,
      };
  const toClamped = clampToPitchBounds(toPosition.x, toPosition.z, 0.3);

  controller.ball.activePass = {
    fromX: fromClamped.x,
    fromZ: fromClamped.z,
    toX: toClamped.x,
    toZ: toClamped.z,
    durationSec: Math.max(0.15, durationSec),
    elapsedSec: 0,
    arcHeight: Math.max(0, options?.arcHeight ?? 0),
    delaySec: Math.max(0, options?.delaySec ?? 0),
  };
}

/**
 * Advances a single player's position and facing orientation by `dt` seconds.
 */
function stepPlayerKinematics(player: PlayerKinematicsState, dt: number): void {
  const target = player.activeTarget;
  if (!target) {
    player.velocity.vx = 0;
    player.velocity.vz = 0;
    return;
  }

  if (target.delaySec > 0) {
    target.delaySec = Math.max(0, target.delaySec - dt);
    player.velocity.vx = 0;
    player.velocity.vz = 0;
    return;
  }

  const dx = target.targetX - player.position3D.x;
  const dz = target.targetZ - player.position3D.z;
  const distance = Math.hypot(dx, dz);

  // Arrival threshold
  if (distance <= 0.03) {
    player.position3D.x = target.targetX;
    player.position3D.z = target.targetZ;
    player.velocity.vx = 0;
    player.velocity.vz = 0;

    if (typeof target.arrivalFacingY === "number") {
      player.rotationY = lerpAngleRadians(
        player.rotationY,
        target.arrivalFacingY,
        dt * 10
      );
      const angleDiff = Math.abs(
        ((target.arrivalFacingY - player.rotationY + Math.PI) % (Math.PI * 2)) -
          Math.PI
      );
      if (angleDiff < 0.03) {
        player.rotationY = target.arrivalFacingY;
        player.activeTarget = null;
      }
    } else {
      player.activeTarget = null;
    }
    return;
  }

  // Smooth arrival deceleration within 2.2 meters of target
  const slowingRadius = 2.2;
  const speedScale =
    distance < slowingRadius
      ? Math.max(0.22, distance / slowingRadius)
      : 1.0;
  const effectiveSpeed = target.speedMetersPerSec * speedScale;
  const stepDist = Math.min(distance, effectiveSpeed * dt);

  const dirX = dx / distance;
  const dirZ = dz / distance;

  const nextPos = clampToPitchBounds(
    player.position3D.x + dirX * stepDist,
    player.position3D.z + dirZ * stepDist
  );

  player.velocity.vx = (nextPos.x - player.position3D.x) / dt;
  player.velocity.vz = (nextPos.z - player.position3D.z) / dt;
  player.position3D.x = nextPos.x;
  player.position3D.z = nextPos.z;

  // Smoothly turn player toward direction of travel
  const travelAngle = Math.atan2(dirX, dirZ);
  player.rotationY = lerpAngleRadians(player.rotationY, travelAngle, dt * 11.5);
}

/**
 * Advances the ball's position and rolling rotation by `dt` seconds.
 */
function stepBallKinematics(
  ball: BallKinematicsState,
  dt: number,
  players?: Map<string, PlayerKinematicsState>
): void {
  const pass = ball.activePass;
  if (!pass) {
    if (ball.carrierPlayerId && players) {
      const carrier = players.get(ball.carrierPlayerId);
      if (carrier) {
        const footDist = 0.45;
        const targetX = carrier.position3D.x + Math.sin(carrier.rotationY) * footDist;
        const targetZ = carrier.position3D.z + Math.cos(carrier.rotationY) * footDist;
        const clamped = clampToPitchBounds(targetX, targetZ, 0.2);

        const moveDx = clamped.x - ball.position3D.x;
        const moveDz = clamped.z - ball.position3D.z;

        ball.position3D.x = clamped.x;
        ball.position3D.y = ball.radius;
        ball.position3D.z = clamped.z;

        const rollFactor = 1 / Math.max(0.15, ball.radius);
        ball.rotation3D.x += moveDz * rollFactor;
        ball.rotation3D.z -= moveDx * rollFactor;
      }
    }
    return;
  }

  if (pass.delaySec > 0) {
    pass.delaySec = Math.max(0, pass.delaySec - dt);
    return;
  }

  pass.elapsedSec = Math.min(pass.durationSec, pass.elapsedSec + dt);
  const rawProgress = pass.elapsedSec / pass.durationSec;

  const p = Math.max(0, Math.min(1, rawProgress));
  const eased = p * (2 - p);

  const nextX = pass.fromX + (pass.toX - pass.fromX) * eased;
  const nextZ = pass.fromZ + (pass.toZ - pass.fromZ) * eased;
  const clamped = clampToPitchBounds(nextX, nextZ, 0.3);

  const moveDx = clamped.x - ball.position3D.x;
  const moveDz = clamped.z - ball.position3D.z;

  ball.position3D.x = clamped.x;
  ball.position3D.z = clamped.z;

  const liftY =
    pass.arcHeight > 0
      ? 4 * pass.arcHeight * p * (1 - p)
      : 0;
  ball.position3D.y = ball.radius + liftY;

  const rollFactor = 1 / Math.max(0.15, ball.radius);
  ball.rotation3D.x += moveDz * rollFactor;
  ball.rotation3D.z -= moveDx * rollFactor;

  if (rawProgress >= 1) {
    ball.position3D.y = ball.radius;
    ball.activePass = null;
    if (pass.receiverPlayerId) {
      ball.carrierPlayerId = pass.receiverPlayerId;
    }
  }
}

/**
 * Deterministic 6-step tactical passing & movement demonstration cycle.
 * Coordinates a deliberate subset of Home (4-3-3) and Away (4-2-3-1) players
 * with short control pauses between passes and a clean return to base formations.
 */
interface DemoChoreographyStep {
  startSec: number;
  durationSec: number;
  title: string;
  description: string;
  ballCarrierLabel: string;
  trigger: (ctrl: PitchMovementController) => void;
}

const DEMO_CYCLE_STEPS: DemoChoreographyStep[] = [
  {
    startSec: 0.0,
    durationSec: 2.6,
    title: "Phase 1 • Kickoff Layoff to Pivot",
    description:
      "#9 Kovač lays the ball off from the centre spot to #6 Sangaré-Kone (CDM) as #8 Castellano and #10 O'Sullivan push into the half-spaces.",
    ballCarrierLabel: "NBA #9 Kovač → #6 Sangaré-Kone",
    trigger: (ctrl) => {
      // Home #6 CDM steps up to receive kickoff layoff
      setPlayerTarget(ctrl, "p-06", { x: -18.5, z: 0.0 }, {
        speed: 5.8,
        arrivalFacingY: Math.PI / 2,
      });
      // Home #9 ST steps back slightly after kickoff pass
      setPlayerTarget(ctrl, "p-11", { x: -2.0, z: 1.5 }, {
        speed: 4.5,
        delaySec: 0.25,
        arrivalFacingY: Math.PI / 2,
      });
      // Home RCM (#8) and LCM (#10) advance into pockets
      setPlayerTarget(ctrl, "p-07", { x: -11.5, z: 12.5 }, {
        speed: 6.2,
        arrivalFacingY: Math.PI / 2,
      });
      setPlayerTarget(ctrl, "p-08", { x: -12.0, z: -12.0 }, {
        speed: 6.0,
        arrivalFacingY: Math.PI / 2,
      });
      // Home RB (#2) overlaps down the right touchline
      setPlayerTarget(ctrl, "p-02", { x: -22.5, z: 24.5 }, {
        speed: 7.0,
        arrivalFacingY: Math.PI / 2,
      });
      // Away ST (#9) and CAM (#10) step up to press
      setPlayerTarget(ctrl, "cmr-11", { x: -6.5, z: 0.5 }, {
        speed: 6.2,
        arrivalFacingY: -Math.PI / 2,
      });
      setPlayerTarget(ctrl, "cmr-08", { x: 8.5, z: 2.0 }, {
        speed: 5.8,
        arrivalFacingY: -Math.PI / 2,
      });

      // Ground pass from centre spot (0, 0) to #6 CDM (-18.5, 0)
      passBall(ctrl, { x: -17.8, z: 0.0 }, 1.55, {
        fromPosition: { x: 0, z: 0 },
        arcHeight: 0,
        delaySec: 0.15,
        receiverPlayerId: "p-06",
      });
    },
  },
  {
    startSec: 2.6,
    durationSec: 2.8,
    title: "Phase 2 • Wide Switch to Overlapping Right-Back",
    description:
      "After a brief control pause, #6 Sangaré-Kone angles a ground pass wide right to overlapping #2 Al-Mansoor while #7 Moreau darts inside.",
    ballCarrierLabel: "NBA #6 Sangaré-Kone → #2 Al-Mansoor (RB)",
    trigger: (ctrl) => {
      // Home RW (#7) makes an inside channel run
      setPlayerTarget(ctrl, "p-10", { x: 2.5, z: 16.5 }, {
        speed: 6.8,
        arrivalFacingY: computeFacingAngle(2.5, 16.5, -22.5, 24.5),
      });
      // Home RCM (#8) shifts toward right half-space to offer a triangle
      setPlayerTarget(ctrl, "p-07", { x: -8.0, z: 11.5 }, {
        speed: 5.6,
        arrivalFacingY: computeFacingAngle(-8.0, 11.5, -22.5, 24.5),
      });
      // Away LAM (#11) and LB (#3) shift across to cover the right flank
      setPlayerTarget(ctrl, "cmr-09", { x: 6.0, z: 18.5 }, {
        speed: 6.4,
        arrivalFacingY: computeFacingAngle(6.0, 18.5, -22.5, 24.5),
      });
      setPlayerTarget(ctrl, "cmr-05", { x: 27.5, z: 21.0 }, {
        speed: 5.8,
        arrivalFacingY: -Math.PI / 2,
      });

      // Crisp ground pass out wide to #2 RB at (-22.5, 24.0)
      passBall(ctrl, { x: -22.0, z: 23.8 }, 1.65, {
        arcHeight: 0,
        delaySec: 0.35,
        receiverPlayerId: "p-02",
      });
    },
  },
  {
    startSec: 5.4,
    durationSec: 2.8,
    title: "Phase 3 • Line-Breaking Pass into Central Midfield",
    description:
      "#2 Al-Mansoor pauses on the flank and threads an inside pass to #8 Castellano, while #9 Kovač makes a striker run between the centre-backs.",
    ballCarrierLabel: "NBA #2 Al-Mansoor → #8 Castellano (CM)",
    trigger: (ctrl) => {
      // Home ST (#9) makes a forward run into the Away half
      setPlayerTarget(ctrl, "p-11", { x: 9.5, z: 3.0 }, {
        speed: 7.1,
        arrivalFacingY: Math.PI / 2,
      });
      // Home LCM (#10) moves into central-left pocket to receive next
      setPlayerTarget(ctrl, "p-08", { x: -4.5, z: -10.5 }, {
        speed: 6.3,
        arrivalFacingY: computeFacingAngle(-4.5, -10.5, -8.0, 11.5),
      });
      // Home LW (#11) stretches the left wing
      setPlayerTarget(ctrl, "p-09", { x: 8.5, z: -22.5 }, {
        speed: 7.2,
        arrivalFacingY: Math.PI / 2,
      });
      // Away double pivot (#5 CDM & #8 CM) compact centrally
      setPlayerTarget(ctrl, "cmr-06", { x: 18.5, z: -4.5 }, {
        speed: 6.0,
        arrivalFacingY: -Math.PI / 2,
      });
      setPlayerTarget(ctrl, "cmr-07", { x: 16.5, z: 8.5 }, {
        speed: 6.0,
        arrivalFacingY: computeFacingAngle(16.5, 8.5, -8.0, 11.5),
      });

      // Ground pass from RB (-22.0, 23.8) to RCM (-8.0, 11.5)
      passBall(ctrl, { x: -7.8, z: 11.0 }, 1.5, {
        arcHeight: 0,
        delaySec: 0.35,
        receiverPlayerId: "p-07",
      });
    },
  },
  {
    startSec: 8.2,
    durationSec: 2.8,
    title: "Phase 4 • Midfield Combination to Playmaker (#10)",
    description:
      "#8 Castellano connects laterally across the centre circle to #10 O'Sullivan as #3 Lindholm (LB) pushes up the left flank.",
    ballCarrierLabel: "NBA #8 Castellano → #10 O'Sullivan (CAM)",
    trigger: (ctrl) => {
      // Home LB (#3) steps into left midfield support
      setPlayerTarget(ctrl, "p-05", { x: -21.0, z: -23.0 }, {
        speed: 6.5,
        arrivalFacingY: Math.PI / 2,
      });
      // Home CDM (#6) shifts to central support
      setPlayerTarget(ctrl, "p-06", { x: -15.0, z: -2.5 }, {
        speed: 5.2,
        arrivalFacingY: Math.PI / 2,
      });
      // Away RAM (#7) and RB (#2) slide toward the left flank
      setPlayerTarget(ctrl, "cmr-10", { x: 8.0, z: -16.5 }, {
        speed: 6.2,
        arrivalFacingY: computeFacingAngle(8.0, -16.5, -4.5, -10.5),
      });
      setPlayerTarget(ctrl, "cmr-02", { x: 26.5, z: -21.5 }, {
        speed: 6.0,
        arrivalFacingY: -Math.PI / 2,
      });

      // Lateral pass from #8 RCM (-7.8, 11.0) to #10 LCM (-4.5, -10.5)
      passBall(ctrl, { x: -4.2, z: -10.0 }, 1.55, {
        arcHeight: 0,
        delaySec: 0.35,
        receiverPlayerId: "p-08",
      });
    },
  },
  {
    startSec: 11.0,
    durationSec: 3.0,
    title: "Phase 5 • Lofted Pass to Left Winger (#11)",
    description:
      "#10 O'Sullivan chips a clean low-lofted pass out wide to #11 Mendes Silva on the left wing while Castlemere's back four shifts across.",
    ballCarrierLabel: "NBA #10 O'Sullivan → #11 Mendes Silva (LW)",
    trigger: (ctrl) => {
      // Away RCB (#4) and LCB (#6) shift slightly to protect the box
      setPlayerTarget(ctrl, "cmr-03", { x: 33.5, z: -9.5 }, {
        speed: 5.6,
        arrivalFacingY: -Math.PI / 2,
      });
      setPlayerTarget(ctrl, "cmr-04", { x: 34.0, z: 4.5 }, {
        speed: 5.6,
        arrivalFacingY: -Math.PI / 2,
      });
      // Home ST (#9) checks toward the penalty arc
      setPlayerTarget(ctrl, "p-11", { x: 14.0, z: -3.5 }, {
        speed: 6.0,
        arrivalFacingY: Math.PI / 2,
      });

      // Clean low-lofted pass (arcHeight = 1.15m) to #11 LW at (8.5, -22.0)
      passBall(ctrl, { x: 8.2, z: -21.8 }, 1.75, {
        arcHeight: 1.15,
        delaySec: 0.35,
        receiverPlayerId: "p-09",
      });
    },
  },
  {
    startSec: 14.0,
    durationSec: 4.0,
    title: "Phase 6 • Recycle to Centre & Tactical Reset",
    description:
      "#11 Mendes Silva recycles the ball back to the centre spot as all repositioned players return smoothly to their 4-3-3 and 4-2-3-1 starting shapes.",
    ballCarrierLabel: "NBA #11 Mendes Silva → Centre Spot Reset",
    trigger: (ctrl) => {
      for (const playerId of ctrl.players.keys()) {
        returnPlayerToFormation(ctrl, playerId, 6.8, 0.15);
      }

      // Smooth ground pass back to the centre spot (0, 0)
      passBall(ctrl, { x: 0, z: 0 }, 2.2, {
        arcHeight: 0.35,
        delaySec: 0.3,
        receiverPlayerId: "p-11",
      });
    },
  },
];

const DEMO_TOTAL_DURATION_SEC = 18.0;

/**
 * Creates a fresh movement controller initialized with the 22 starting players
 * and the centre-spot match ball.
 */
export function createPitchMovementController(
  initialPlayers: PitchPlayerPlacement[] = INITIAL_PITCH_PLAYERS,
  initialBall: PitchBallState = INITIAL_BALL_STATE
): PitchMovementController {
  const playersMap = new Map<string, PlayerKinematicsState>();

  for (const p of initialPlayers) {
    playersMap.set(p.id, {
      id: p.id,
      team: p.team,
      shirtNumber: p.shirtNumber,
      shortName: p.shortName,
      tacticalSlot: p.tacticalSlot,
      homeX: p.position3D.x,
      homeZ: p.position3D.z,
      defaultRotationY: p.rotationY,
      position3D: { ...p.position3D },
      velocity: { vx: 0, vz: 0 },
      rotationY: p.rotationY,
      activeTarget: null,
    });
  }

  return {
    players: playersMap,
    ball: {
      id: initialBall.id,
      position3D: { ...initialBall.position3D },
      rotation3D: { ...initialBall.rotation3D },
      radius: initialBall.radius,
      activePass: null,
    },
    accumulatorSec: 0,
    demoElapsedSec: 0,
    currentDemoStepIndex: -1,
    isDemoActive: false,
  };
}

/**
 * Resets all 22 players and the ball immediately to their initial kickoff positions.
 */
export function resetPitchMovementController(
  controller: PitchMovementController
): void {
  controller.accumulatorSec = 0;
  controller.demoElapsedSec = 0;
  controller.currentDemoStepIndex = -1;
  controller.ball.position3D = { x: 0, y: MATCH_BALL_RADIUS, z: 0 };
  controller.ball.rotation3D = { x: 0.25, y: 0.6, z: 0 };
  controller.ball.activePass = null;

  for (const player of controller.players.values()) {
    player.position3D.x = player.homeX;
    player.position3D.y = 0;
    player.position3D.z = player.homeZ;
    player.velocity.vx = 0;
    player.velocity.vz = 0;
    player.rotationY = player.defaultRotationY;
    player.activeTarget = null;
  }
}

/**
 * Returns metadata about the currently active demo phase for UI display.
 */
export function getDemoPhaseInfo(
  controller: PitchMovementController
): DemoPhaseInfo {
  const idx = Math.max(0, controller.currentDemoStepIndex);
  const step = DEMO_CYCLE_STEPS[idx] ?? DEMO_CYCLE_STEPS[0];
  return {
    stepIndex: idx + 1,
    totalSteps: DEMO_CYCLE_STEPS.length,
    title: step.title,
    description: step.description,
    ballCarrierLabel: step.ballCarrierLabel,
  };
}

/**
 * Advances the movement system by `frameDeltaSec` using a fixed 120Hz timestep
 * accumulator so movement speed and trajectories are 100% independent of frame rate.
 * Returns `true` if the active demo step index changed during this frame.
 */
export function stepPitchMovementSystem(
  controller: PitchMovementController,
  frameDeltaSec: number,
  enableDemoChoreography = true
): boolean {
  const clampedDelta = Math.min(MAX_FRAME_DELTA_SEC, Math.max(0, frameDeltaSec));
  controller.accumulatorSec += clampedDelta;

  let demoStepChanged = false;

  while (controller.accumulatorSec >= FIXED_TIMESTEP_SEC) {
    controller.accumulatorSec -= FIXED_TIMESTEP_SEC;

    if (enableDemoChoreography) {
      const cycleTime = controller.demoElapsedSec % DEMO_TOTAL_DURATION_SEC;

      // Find which demo step corresponds to `cycleTime`
      let targetStepIdx = 0;
      for (let i = DEMO_CYCLE_STEPS.length - 1; i >= 0; i--) {
        if (cycleTime >= DEMO_CYCLE_STEPS[i].startSec) {
          targetStepIdx = i;
          break;
        }
      }

      if (targetStepIdx !== controller.currentDemoStepIndex) {
        controller.currentDemoStepIndex = targetStepIdx;
        DEMO_CYCLE_STEPS[targetStepIdx].trigger(controller);
        demoStepChanged = true;
      }

      controller.demoElapsedSec += FIXED_TIMESTEP_SEC;
    }

    for (const player of controller.players.values()) {
      stepPlayerKinematics(player, FIXED_TIMESTEP_SEC);
    }

    stepBallKinematics(controller.ball, FIXED_TIMESTEP_SEC, controller.players);
  }

  return demoStepChanged;
}
