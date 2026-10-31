import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulateMatch } from "../../../engine/matchEngine";
import {
  INITIAL_BALL_STATE,
  INITIAL_PITCH_PLAYERS,
} from "../formationData";
import {
  applyMatchEventTo3D,
  applyTacticalTeamShapeTo3D,
  createDefaultMatchInput,
  engineCoordTo3D,
  MatchPlaybackController,
} from "../matchVisualizer";
import {
  createPitchMovementController,
  getDemoPhaseInfo,
  resetPitchMovementController,
  stepPitchMovementSystem,
} from "../movementSystem";

const MAX_PITCH_X = 52.5;
const MAX_PITCH_Z = 34.0;

describe("Stage 5: Match Engine to 3D Match Viewer Integration", () => {
  it("1. maps all 22 engine player IDs to the 22 3D player models and keeps coordinates within pitch bounds", () => {
    const input = createDefaultMatchInput("stage5-mapping-test");
    const pb = new MatchPlaybackController(
      input,
      undefined,
      INITIAL_PITCH_PLAYERS,
      INITIAL_BALL_STATE
    );

    const enginePlayerIds = [
      ...pb.matchState.homeTeam.players.map((p) => p.id),
      ...pb.matchState.awayTeam.players.map((p) => p.id),
    ];

    assert.equal(enginePlayerIds.length, 22);

    // Every engine player ID must exist in the 3D movement controller with matching team & shirtNumber
    for (const ep of pb.matchState.homeTeam.players) {
      const p3d = pb.movementController.players.get(ep.id);
      assert.ok(p3d, `Missing 3D player for Home ID ${ep.id}`);
      assert.equal(p3d.team, "home");
      assert.equal(p3d.shirtNumber, ep.shirtNumber);
    }
    for (const ep of pb.matchState.awayTeam.players) {
      const p3d = pb.movementController.players.get(ep.id);
      assert.ok(p3d, `Missing 3D player for Away ID ${ep.id}`);
      assert.equal(p3d.team, "away");
      assert.equal(p3d.shirtNumber, ep.shirtNumber);
    }

    // Extreme and undefined coordinates must clamp cleanly within pitch boundaries
    const outOfBounds = engineCoordTo3D({ x: 999, z: -999 });
    assert.ok(Math.abs(outOfBounds.x) <= MAX_PITCH_X);
    assert.ok(Math.abs(outOfBounds.z) <= MAX_PITCH_Z);

    const fallback = engineCoordTo3D(undefined);
    assert.deepEqual(fallback, { x: 0, y: 0, z: 0 });
  });

  it("2. ensures single source of truth: 3D playback final score, events, and stats match standalone engine simulateMatch", () => {
    const seed = "stage5-single-source-of-truth-42";
    const standaloneResult = simulateMatch(createDefaultMatchInput(seed));

    const pb = new MatchPlaybackController(createDefaultMatchInput(seed));
    pb.play();

    // Step frame-by-frame until full-time
    let safetyFrames = 0;
    while (pb.matchState.phase !== "full_time" && safetyFrames < 25000) {
      safetyFrames += 1;
      pb.stepFrame(0.05);
    }

    const snapshot = pb.getSnapshot();
    assert.equal(snapshot.phase, "full_time");
    assert.equal(snapshot.homeScore, standaloneResult.homeTeam.score);
    assert.equal(snapshot.awayScore, standaloneResult.awayTeam.score);
    assert.equal(snapshot.events.length, standaloneResult.events.length);
    assert.deepEqual(
      snapshot.events.map((e) => e.id),
      standaloneResult.events.map((e) => e.id)
    );
    assert.deepEqual(snapshot.stats.home, standaloneResult.stats.home);
    assert.deepEqual(snapshot.stats.away, standaloneResult.stats.away);

    // Every 3D player and ball position must remain inside pitch bounds throughout the match
    for (const pState of pb.movementController.players.values()) {
      assert.ok(Math.abs(pState.position3D.x) <= MAX_PITCH_X);
      assert.ok(Math.abs(pState.position3D.z) <= MAX_PITCH_Z);
    }
    assert.ok(
      Math.abs(pb.movementController.ball.position3D.x) <= MAX_PITCH_X
    );
    assert.ok(
      Math.abs(pb.movementController.ball.position3D.z) <= MAX_PITCH_Z
    );
  });

  it("3. guarantees playback speed (1x, 2x, 4x) and pause/resume invariance for the same seed", () => {
    const seed = "stage5-speed-invariance-seed-99";

    const runAtSpeed = (speed: 1 | 2 | 4, withPauseResume: boolean) => {
      const pb = new MatchPlaybackController(createDefaultMatchInput(seed));
      pb.setSpeed(speed);
      pb.play();

      let frame = 0;
      while (pb.matchState.phase !== "full_time" && frame < 30000) {
        frame += 1;
        if (withPauseResume && frame === 120) {
          pb.pause();
          assert.equal(pb.isPlaying, false);
          assert.equal(pb.matchState.phase, "paused");
          // Stepping while paused must not advance match clock or generate events
          const elapsedBefore = pb.matchState.totalElapsedSeconds;
          const eventsBefore = pb.matchState.events.length;
          pb.stepFrame(0.05);
          pb.stepFrame(0.05);
          assert.equal(pb.matchState.totalElapsedSeconds, elapsedBefore);
          assert.equal(pb.matchState.events.length, eventsBefore);
          pb.resume();
          assert.equal(pb.isPlaying, true);
        }
        pb.stepFrame(0.05);
      }

      return pb.getSnapshot();
    };

    const snap1x = runAtSpeed(1, false);
    const snap2x = runAtSpeed(2, true);
    const snap4x = runAtSpeed(4, false);

    assert.equal(snap2x.homeScore, snap1x.homeScore);
    assert.equal(snap2x.awayScore, snap1x.awayScore);
    assert.deepEqual(
      snap2x.events.map((e) => e.id),
      snap1x.events.map((e) => e.id)
    );

    assert.equal(snap4x.homeScore, snap1x.homeScore);
    assert.equal(snap4x.awayScore, snap1x.awayScore);
    assert.deepEqual(
      snap4x.events.map((e) => e.id),
      snap1x.events.map((e) => e.id)
    );
  });

  it("4. restarts a match cleanly with same seed or new seed without stale events or offset positions", () => {
    const seed = "stage5-restart-verification";
    const pb = new MatchPlaybackController(createDefaultMatchInput(seed));
    pb.setSpeed(4);
    pb.play();

    // Advance partway into the first half
    for (let i = 0; i < 150; i += 1) {
      pb.stepFrame(0.05);
    }

    assert.ok(pb.matchState.events.length > 5);
    assert.ok(pb.matchState.totalElapsedSeconds > 0);

    // Restart with the same seed
    const resetSnap = pb.restart();
    assert.equal(resetSnap.phase, "pre_match");
    assert.equal(resetSnap.isPlaying, false);
    assert.equal(resetSnap.events.length, 0);
    assert.equal(resetSnap.homeScore, 0);
    assert.equal(resetSnap.awayScore, 0);
    assert.equal(resetSnap.totalElapsedSeconds, 0);
    assert.equal(pb.movementController.ball.position3D.x, 0);
    assert.equal(pb.movementController.ball.position3D.z, 0);

    // Playing to full-time after restart produces the exact deterministic result
    pb.skipToNextMilestone(); // -> half_time
    assert.equal(pb.getSnapshot().phase, "half_time");
    pb.skipToNextMilestone(); // -> full_time
    const finalSnap = pb.getSnapshot();
    const expected = simulateMatch(createDefaultMatchInput(seed));

    assert.equal(finalSnap.phase, "full_time");
    assert.equal(finalSnap.homeScore, expected.homeTeam.score);
    assert.equal(finalSnap.awayScore, expected.awayTeam.score);
    assert.equal(finalSnap.events.length, expected.events.length);

    // Restart with a NEW seed and verify it produces the new seed's state
    const newSeed = "stage5-different-seed-777";
    const newResetSnap = pb.restart(newSeed);
    assert.equal(newResetSnap.seed, newSeed);
    assert.equal(newResetSnap.events.length, 0);
    pb.skipToNextMilestone();
    pb.skipToNextMilestone();
    const newFinalSnap = pb.getSnapshot();
    const expectedNew = simulateMatch(createDefaultMatchInput(newSeed));
    assert.equal(newFinalSnap.homeScore, expectedNew.homeTeam.score);
    assert.equal(newFinalSnap.awayScore, expectedNew.awayTeam.score);
    assert.notDeepEqual(
      newFinalSnap.events.map((e) => e.id),
      finalSnap.events.map((e) => e.id)
    );
  });

  it("5. traces a complete possession -> pass -> reception -> goal sequence and two-beat corner -> header goal in 3D", () => {
    const pb = new MatchPlaybackController(
      createDefaultMatchInput("stage5-live-match-seed-1")
    );
    pb.play();

    // Advance tick-by-tick to second 4305 (Minute 70: p-11 Kovač -> p-03 Gallagher pass & attack)
    while (pb.matchState.totalElapsedSeconds < 4305) {
      pb.stepFrame(0.05);
    }
    const passTickEvents = pb.matchState.events.filter(
      (e) => e.second === 4305
    );
    assert.ok(passTickEvents.some((e) => e.type === "pass"));
    assert.equal(pb.movementController.ball.activePass?.toX, 18.57);
    assert.equal(pb.movementController.ball.activePass?.toZ, -6.57);
    const receiverGallagher = pb.movementController.players.get("p-03");
    assert.equal(receiverGallagher?.activeTarget?.targetX, 18.57);
    assert.equal(receiverGallagher?.activeTarget?.targetZ, -6.57);

    // Advance to second 4320 (Minute 70: p-03 Gallagher -> p-11 Kovač pass into box (34.54, 1.7))
    while (pb.matchState.totalElapsedSeconds < 4320) {
      pb.stepFrame(0.05);
    }
    assert.equal(pb.movementController.ball.activePass?.toX, 34.54);
    assert.equal(pb.movementController.ball.activePass?.toZ, 1.7);
    const strikerKovac = pb.movementController.players.get("p-11");
    assert.equal(strikerKovac?.activeTarget?.targetX, 34.54);
    assert.equal(strikerKovac?.activeTarget?.targetZ, 1.7);

    // Advance to second 4335 (Minute 71: p-11 Kovač GOAL! Score becomes 1-1)
    while (pb.matchState.totalElapsedSeconds < 4335) {
      pb.stepFrame(0.05);
    }
    const snapAfterGoal = pb.getSnapshot();
    assert.equal(snapAfterGoal.homeScore, 1);
    assert.equal(snapAfterGoal.awayScore, 1);
    assert.equal(snapAfterGoal.latestEvent?.type, "goal");
    assert.equal(snapAfterGoal.latestEvent?.playerId, "p-11");
    assert.ok((pb.movementController.ball.activePass?.toX ?? 0) > 51.5);

    // Now advance to second 4935 (Minute 81: two-beat Corner by p-11 -> Header Goal by p-04)
    while (pb.matchState.totalElapsedSeconds < 4935) {
      pb.stepFrame(0.05);
    }
    // Immediately at the start of the 4935s tick, the FIRST beat (corner kick delivery from (52, 33.5) to (45.22, -0.69)) is active
    assert.ok(pb.movementController.ball.activePass !== null);
    assert.ok(pb.movementController.ball.activePass.fromX > 51);
    assert.equal(pb.movementController.ball.activePass.toX, 45.22);
    assert.equal(pb.movementController.ball.activePass.toZ, -0.69);

    // Step 0.25s (past half of the 0.45s tick) so the SECOND beat (header goal into net) fires
    for (let i = 0; i < 6; i += 1) {
      pb.stepFrame(0.05);
    }
    assert.ok(pb.movementController.ball.activePass !== null);
    assert.ok(pb.movementController.ball.activePass.toX > 51.5);
    assert.equal(pb.getSnapshot().homeScore, 2);
    assert.equal(pb.getSnapshot().awayScore, 1);
  });

  it("6. verifies goalkeeper positioning, out-of-bounds pass handling, and Stage 3 demo preservation", () => {
    const pb = new MatchPlaybackController(
      createDefaultMatchInput("stage5-gk-and-bounds-test")
    );
    const ctrl = pb.movementController;
    const state = pb.matchState;

    // Out-of-bounds pass (secondaryPlayerId undefined) must NOT send passer to the touchline
    const passerBefore = { ...ctrl.players.get("p-08")!.position3D };
    applyMatchEventTo3D(
      ctrl,
      {
        id: "ev-oob",
        minute: 15,
        second: 900,
        half: 1,
        type: "pass",
        team: "home",
        teamName: "Northbridge",
        playerId: "p-08",
        player: "K. O'Sullivan",
        location: { x: 12, z: 33.8, zone: "middle_third" },
        outcome: "out_of_bounds",
        description: "Pass out of bounds",
        scoreAfter: { home: 0, away: 0 },
      },
      state
    );
    const passerTarget = ctrl.players.get("p-08")!.activeTarget;
    assert.ok(
      !passerTarget || Math.abs(passerTarget.targetZ) < 25,
      `Passer should stay near pass origin (${passerBefore.z}), not run to touchline`
    );

    // Goalkeeper tactical positioning stays inside goal frame laterally (|z| <= 2.9) and faces the ball
    state.ballLocation = { x: -32, z: 24 };
    applyTacticalTeamShapeTo3D(ctrl, state, new Set());
    const homeGkTarget = ctrl.players.get("p-01")!.activeTarget;
    assert.ok(homeGkTarget !== null);
    assert.ok(homeGkTarget.targetX <= -48);
    assert.ok(Math.abs(homeGkTarget.targetZ) <= 2.9);
    assert.ok(typeof homeGkTarget.arrivalFacingY === "number");

    // Stage 3 6-phase movement demo still works without regression
    const demoCtrl = createPitchMovementController(
      INITIAL_PITCH_PLAYERS,
      INITIAL_BALL_STATE
    );
    assert.equal(getDemoPhaseInfo(demoCtrl).stepIndex, 1);
    for (let i = 0; i < 80; i += 1) {
      stepPitchMovementSystem(demoCtrl, 0.05, true);
    }
    assert.ok(getDemoPhaseInfo(demoCtrl).stepIndex > 1);
    resetPitchMovementController(demoCtrl);
    assert.equal(getDemoPhaseInfo(demoCtrl).stepIndex, 1);
  });
});
