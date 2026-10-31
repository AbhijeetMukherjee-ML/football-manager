"use client";

import { useCallback, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Ball3D } from "./Ball3D";
import {
  INITIAL_BALL_STATE,
  INITIAL_PITCH_PLAYERS,
  type PitchBallState,
  type PitchPlayerPlacement,
} from "./formationData";
import {
  type LiveMatchSnapshot,
  MatchPlaybackController,
  type PlaybackSpeed,
  type ViewerSimulationMode,
} from "./matchVisualizer";
import {
  createPitchMovementController,
  getDemoPhaseInfo,
  resetPitchMovementController,
  stepPitchMovementSystem,
  type DemoPhaseInfo,
  type PitchMovementController,
} from "./movementSystem";
import { PITCH_LENGTH, PITCH_WIDTH, PitchGeometry } from "./PitchGeometry";
import { PlayersLayer } from "./PlayerModel3D";

export type CameraPreset = "tactical" | "overhead" | "home-end" | "away-end";

interface CameraRigProps {
  preset: CameraPreset;
  resetTrigger: number;
}

function TacticalCameraRig({ preset, resetTrigger }: CameraRigProps) {
  const { camera, size } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    // Scale distance smoothly on narrow mobile viewports so the full 105x68m pitch and all 22 players fit
    const mobileScale =
      aspect < 1.2 ? Math.min(1.65, 1.25 / Math.max(0.55, aspect)) : 1.0;

    if (preset === "overhead") {
      camera.position.set(0, 96 * mobileScale, 0.01);
    } else if (preset === "home-end") {
      camera.position.set(-76 * mobileScale, 36 * mobileScale, 0);
    } else if (preset === "away-end") {
      camera.position.set(76 * mobileScale, 36 * mobileScale, 0);
    } else {
      // Default top-down 3D tactical broadcast view
      camera.position.set(0, 68 * mobileScale, 58 * mobileScale);
    }

    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [camera, preset, resetTrigger, size.width, size.height]);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={45}
        near={0.5}
        far={500}
        position={[0, 68, 58]}
      />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2 - 0.06}
        minDistance={12}
        maxDistance={185}
      />
    </>
  );
}

export interface EngineMatchControlCommand {
  id: number;
  action: "play" | "pause" | "resume" | "restart" | "skip_milestone";
  seed?: string | number;
}

interface MovementSceneSynchronizerProps {
  players: PitchPlayerPlacement[];
  ball: PitchBallState;
  mode: ViewerSimulationMode;
  // Stage 5 Engine Match Playback props
  matchSeed?: string | number;
  playbackSpeed?: PlaybackSpeed;
  matchCommand?: EngineMatchControlCommand | null;
  onLiveMatchUpdate?: (snapshot: LiveMatchSnapshot) => void;
  // Stage 3 Movement Demo props (preserved)
  isDemoPlaying: boolean;
  demoResetTrigger: number;
  onDemoPhaseChange?: (phase: DemoPhaseInfo) => void;
}

/**
 * Bridges both the Stage 5 MatchPlaybackController and the Stage 3 PitchMovementController
 * to the Three.js scene graph via R3F's frame loop without causing React re-renders on every frame.
 */
function MovementSceneSynchronizer({
  players,
  ball,
  mode,
  matchSeed = "stage5-live-match-seed-1",
  playbackSpeed = 1,
  matchCommand = null,
  onLiveMatchUpdate,
  isDemoPlaying,
  demoResetTrigger,
  onDemoPhaseChange,
}: MovementSceneSynchronizerProps) {
  const demoControllerRef = useRef<PitchMovementController | null>(null);
  const matchPlaybackRef = useRef<MatchPlaybackController | null>(null);
  const lastCommandIdRef = useRef<number>(0);

  const playerGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const ballRootRef = useRef<THREE.Group | null>(null);
  const ballSphereRef = useRef<THREE.Mesh | null>(null);

  const getDemoController = useCallback((): PitchMovementController => {
    if (demoControllerRef.current === null) {
      demoControllerRef.current = createPitchMovementController(players, ball);
    }
    return demoControllerRef.current;
  }, [players, ball]);

  const getMatchPlayback = useCallback((): MatchPlaybackController => {
    if (matchPlaybackRef.current === null) {
      matchPlaybackRef.current = new MatchPlaybackController(
        undefined,
        undefined,
        players,
        ball
      );
      if (matchSeed) {
        matchPlaybackRef.current.restart(matchSeed);
      }
    }
    return matchPlaybackRef.current;
  }, [players, ball, matchSeed]);

  const getActiveMovementController =
    useCallback((): PitchMovementController => {
      if (mode === "engine_match") {
        return getMatchPlayback().movementController;
      }
      return getDemoController();
    }, [mode, getMatchPlayback, getDemoController]);

  const syncSceneObjects = useCallback((ctrl: PitchMovementController) => {
    for (const [id, pState] of ctrl.players.entries()) {
      const grp = playerGroupsRef.current.get(id);
      if (grp) {
        grp.position.set(
          pState.position3D.x,
          pState.position3D.y,
          pState.position3D.z
        );
        grp.rotation.y = pState.rotationY;
      }
    }

    if (ballRootRef.current) {
      ballRootRef.current.position.set(
        ctrl.ball.position3D.x,
        0,
        ctrl.ball.position3D.z
      );
    }

    if (ballSphereRef.current) {
      ballSphereRef.current.position.set(0, ctrl.ball.position3D.y, 0);
      ballSphereRef.current.rotation.set(
        ctrl.ball.rotation3D.x,
        ctrl.ball.rotation3D.y,
        ctrl.ball.rotation3D.z
      );
    }
  }, []);

  const handleRegisterPlayerGroup = useCallback(
    (playerId: string, group: THREE.Group | null) => {
      if (group) {
        playerGroupsRef.current.set(playerId, group);
        const ctrl = getActiveMovementController();
        const pState = ctrl.players.get(playerId);
        if (pState) {
          group.position.set(
            pState.position3D.x,
            pState.position3D.y,
            pState.position3D.z
          );
          group.rotation.y = pState.rotationY;
        }
      } else {
        playerGroupsRef.current.delete(playerId);
      }
    },
    [getActiveMovementController]
  );

  const handleRegisterBallRefs = useCallback(
    (rootGroup: THREE.Group | null, sphereMesh: THREE.Mesh | null) => {
      ballRootRef.current = rootGroup;
      ballSphereRef.current = sphereMesh;
      syncSceneObjects(getActiveMovementController());
    },
    [getActiveMovementController, syncSceneObjects]
  );

  // Sync playback speed changes
  useEffect(() => {
    const mp = getMatchPlayback();
    mp.setSpeed(playbackSpeed);
    if (onLiveMatchUpdate) {
      onLiveMatchUpdate(mp.getSnapshot());
    }
  }, [playbackSpeed, getMatchPlayback, onLiveMatchUpdate]);

  // Sync mode switches
  useEffect(() => {
    const ctrl = getActiveMovementController();
    syncSceneObjects(ctrl);
    if (mode === "engine_match" && onLiveMatchUpdate) {
      onLiveMatchUpdate(getMatchPlayback().getSnapshot());
    } else if (mode === "movement_demo" && onDemoPhaseChange) {
      onDemoPhaseChange(getDemoPhaseInfo(getDemoController()));
    }
  }, [
    mode,
    getActiveMovementController,
    getMatchPlayback,
    getDemoController,
    syncSceneObjects,
    onLiveMatchUpdate,
    onDemoPhaseChange,
  ]);

  // Handle imperative engine match commands (Play, Pause, Resume, Restart, Skip)
  useEffect(() => {
    if (!matchCommand || matchCommand.id === lastCommandIdRef.current) {
      return;
    }
    lastCommandIdRef.current = matchCommand.id;

    const mp = getMatchPlayback();
    let snapshot: LiveMatchSnapshot;

    switch (matchCommand.action) {
      case "play":
        snapshot = mp.play();
        break;
      case "pause":
        snapshot = mp.pause();
        break;
      case "resume":
        snapshot = mp.resume();
        break;
      case "restart":
        snapshot = mp.restart(matchCommand.seed);
        break;
      case "skip_milestone":
        snapshot = mp.skipToNextMilestone();
        break;
    }

    syncSceneObjects(mp.movementController);
    if (onLiveMatchUpdate) {
      onLiveMatchUpdate(snapshot);
    }
  }, [matchCommand, getMatchPlayback, syncSceneObjects, onLiveMatchUpdate]);

  // Handle explicit Stage 3 demo reset to initial formations and centre spot
  useEffect(() => {
    if (demoResetTrigger === 0) return;
    const ctrl = getDemoController();
    resetPitchMovementController(ctrl);
    if (mode === "movement_demo") {
      syncSceneObjects(ctrl);
    }
    if (onDemoPhaseChange) {
      onDemoPhaseChange(getDemoPhaseInfo(ctrl));
    }
  }, [
    demoResetTrigger,
    mode,
    getDemoController,
    syncSceneObjects,
    onDemoPhaseChange,
  ]);

  // Clean up references on unmount
  useEffect(() => {
    const groupsMap = playerGroupsRef.current;
    return () => {
      groupsMap.clear();
      ballRootRef.current = null;
      ballSphereRef.current = null;
    };
  }, []);

  useFrame((_, delta) => {
    if (mode === "engine_match") {
      const mp = getMatchPlayback();
      const stateChanged = mp.stepFrame(delta);
      syncSceneObjects(mp.movementController);

      if (stateChanged && onLiveMatchUpdate) {
        onLiveMatchUpdate(mp.getSnapshot());
      }
      return;
    }

    // Stage 3 Movement Demo mode
    if (!isDemoPlaying) return;

    const ctrl = getDemoController();
    const stepChanged = stepPitchMovementSystem(ctrl, delta, true);
    syncSceneObjects(ctrl);

    if (stepChanged && onDemoPhaseChange) {
      onDemoPhaseChange(getDemoPhaseInfo(ctrl));
    }
  });

  return (
    <>
      {/* 2. 22 Starting Players (11 Home 4-3-3 & 11 Away 4-2-3-1) */}
      <PlayersLayer
        players={players}
        onRegisterPlayerGroup={handleRegisterPlayerGroup}
      />

      {/* 3. Standalone Match Football */}
      <Ball3D ball={ball} onRegisterBallRefs={handleRegisterBallRefs} />
    </>
  );
}

export interface PitchScene3DProps {
  cameraPreset: CameraPreset;
  resetTrigger: number;
  players?: PitchPlayerPlacement[];
  ball?: PitchBallState;
  mode?: ViewerSimulationMode;
  matchSeed?: string | number;
  playbackSpeed?: PlaybackSpeed;
  matchCommand?: EngineMatchControlCommand | null;
  onLiveMatchUpdate?: (snapshot: LiveMatchSnapshot) => void;
  isDemoPlaying?: boolean;
  demoResetTrigger?: number;
  onDemoPhaseChange?: (phase: DemoPhaseInfo) => void;
}

export default function PitchScene3D({
  cameraPreset,
  resetTrigger,
  players = INITIAL_PITCH_PLAYERS,
  ball = INITIAL_BALL_STATE,
  mode = "engine_match",
  matchSeed = "stage5-live-match-seed-1",
  playbackSpeed = 1,
  matchCommand = null,
  onLiveMatchUpdate,
  isDemoPlaying = false,
  demoResetTrigger = 0,
  onDemoPhaseChange,
}: PitchScene3DProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      className="h-full w-full touch-none"
    >
      <color attach="background" args={["#060d1b"]} />
      <fog attach="fog" args={["#060d1b", 135, 270]} />

      {/* Stadium & Daylight Balanced Lighting (No expensive shadow maps) */}
      <ambientLight intensity={0.68} />
      <hemisphereLight
        args={["#bae6fd", "#14532d", 0.55]}
        position={[0, 80, 0]}
      />
      <directionalLight
        position={[60, 90, 50]}
        intensity={1.15}
        color="#fffbeb"
      />
      <directionalLight
        position={[-60, 80, -45]}
        intensity={0.55}
        color="#e0f2fe"
      />

      <TacticalCameraRig preset={cameraPreset} resetTrigger={resetTrigger} />

      {/* 1. Regulation 105m x 68m Pitch & Goals */}
      <PitchGeometry />

      {/* 2 & 3. 22 Players + 1 Ball with Live Engine Playback OR Stage 3 Movement Demo */}
      <MovementSceneSynchronizer
        players={players}
        ball={ball}
        mode={mode}
        matchSeed={matchSeed}
        playbackSpeed={playbackSpeed}
        matchCommand={matchCommand}
        onLiveMatchUpdate={onLiveMatchUpdate}
        isDemoPlaying={isDemoPlaying}
        demoResetTrigger={demoResetTrigger}
        onDemoPhaseChange={onDemoPhaseChange}
      />

      {/* Subtle outer stadium rim boundary */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PITCH_LENGTH + 40, PITCH_WIDTH + 40]} />
        <meshBasicMaterial color="#060d1b" />
      </mesh>
    </Canvas>
  );
}
