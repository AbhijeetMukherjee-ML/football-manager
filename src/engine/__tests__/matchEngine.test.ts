import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  MatchSimulationInput,
  pauseMatch,
  resumeMatch,
  simulateMatch,
  startMatch,
  startSecondHalf,
} from "../matchEngine";

function createDefaultFixtureInput(
  seed: string | number = "test-seed-101"
): MatchSimulationInput {
  return {
    homeTeam: {
      name: NEXT_FIXTURE.homeClub.name,
      shortName: NEXT_FIXTURE.homeClub.shortName,
      abbreviation: NEXT_FIXTURE.homeClub.abbreviation,
      primaryColor: NEXT_FIXTURE.homeClub.primaryColor,
      formation: "4-3-3 Gegenpress",
      tactics: HOME_TACTICS,
      availablePlayers: SQUAD_PLAYERS,
      startingLineup: SQUAD_PLAYERS.filter((p) => p.status === "Starting XI"),
    },
    awayTeam: {
      name: NEXT_FIXTURE.awayClub.name,
      shortName: NEXT_FIXTURE.awayClub.shortName,
      abbreviation: NEXT_FIXTURE.awayClub.abbreviation,
      primaryColor: NEXT_FIXTURE.awayClub.primaryColor,
      formation: "4-2-3-1 Balanced",
      tactics: AWAY_TACTICS,
      availablePlayers: AWAY_SQUAD_PLAYERS,
      startingLineup: AWAY_SQUAD_PLAYERS.filter(
        (p) => p.status === "Starting XI"
      ),
    },
    seed,
    competition: NEXT_FIXTURE.competition,
    venue: NEXT_FIXTURE.venue,
  };
}

describe("Stage 4 Football Match Simulation Engine", () => {
  it("produces 100% identical event sequences and final results for identical seeds", () => {
    const inputA = createDefaultFixtureInput("repro-seed-alpha-99");
    const inputB = createDefaultFixtureInput("repro-seed-alpha-99");

    const resA = simulateMatch(inputA);
    const resB = simulateMatch(inputB);

    assert.equal(resA.numericSeed, resB.numericSeed);
    assert.equal(resA.homeTeam.score, resB.homeTeam.score);
    assert.equal(resA.awayTeam.score, resB.awayTeam.score);
    assert.equal(resA.events.length, resB.events.length);
    assert.deepEqual(resA.stats, resB.stats);

    for (let i = 0; i < resA.events.length; i++) {
      assert.deepEqual(resA.events[i], resB.events[i]);
    }
  });

  it("produces identical results across different step sizes (15s, 60s, 300s, 900s) and pause/resume cycles", () => {
    const input = createDefaultFixtureInput("step-vs-batch-seed-42");
    const batchResult = simulateMatch(input, {
      firstHalfStoppageMinutes: 2,
      secondHalfStoppageMinutes: 3,
    });

    for (const stepSec of [15, 60, 300, 900]) {
      const state = createMatch(input, {
        firstHalfStoppageMinutes: 2,
        secondHalfStoppageMinutes: 3,
      });
      assert.equal(state.phase, "pre_match");

      startMatch(state);
      assert.equal(state.phase, "first_half");

      let safetyCounter = 0;
      while (state.phase !== "full_time" && safetyCounter < 1000) {
        safetyCounter++;
        if (safetyCounter % 3 === 0) {
          const prevPhase: string = state.phase;
          pauseMatch(state);
          assert.equal(state.phase, "paused");
          const pausedStep = advanceMatch(state, stepSec);
          assert.equal(pausedStep.newEvents.length, 0);
          resumeMatch(state);
          assert.equal(state.phase, prevPhase);
        }
        advanceMatch(state, stepSec);
      }

      assert.equal(state.phase, "full_time");
      const steppedResult = finishMatch(state);

      assert.equal(steppedResult.homeTeam.score, batchResult.homeTeam.score);
      assert.equal(steppedResult.awayTeam.score, batchResult.awayTeam.score);
      assert.equal(steppedResult.events.length, batchResult.events.length);
      assert.deepEqual(steppedResult.stats, batchResult.stats);
      assert.deepEqual(steppedResult.events, batchResult.events);
    }
  });

  it("enforces two 45-minute halves, configurable stoppage time, half-time recovery, and full-time", () => {
    const input = createDefaultFixtureInput("halves-and-stoppage-seed");
    const state = createMatch(input, {
      firstHalfStoppageMinutes: 3,
      secondHalfStoppageMinutes: 4,
    });

    startMatch(state);
    // Advance full first half (45 + 3 = 48 minutes = 2880 seconds)
    const h1Step = advanceMatch(state, 2880);
    assert.equal(h1Step.isHalfTime, true);
    assert.equal(state.phase, "half_time");
    assert.equal(state.half, 1);
    assert.equal(state.currentMinute, 45);
    assert.equal(state.addedMinute, 3);

    const htEvent = state.events[state.events.length - 1];
    assert.equal(htEvent.type, "half_time");
    assert.equal(htEvent.minute, 45);
    assert.equal(htEvent.addedMinute, 3);

    // Transition to second half
    const h2Start = startSecondHalf(state);
    assert.equal(state.phase, "second_half");
    assert.equal(state.half, 2);
    assert.equal(state.currentMinute, 46);
    assert.equal(h2Start.newEvents[0].type, "kickoff");
    assert.equal(h2Start.newEvents[0].team, "away");

    // Advance full second half (45 + 4 = 49 minutes = 2940 seconds)
    const h2Step = advanceMatch(state, 2940);
    assert.equal(h2Step.isFinished, true);
    assert.equal(state.phase, "full_time");
    assert.equal(state.currentMinute, 90);
    assert.equal(state.addedMinute, 4);

    const ftEvent = state.events[state.events.length - 1];
    assert.equal(ftEvent.type, "full_time");
    assert.equal(ftEvent.minute, 90);
    assert.equal(ftEvent.addedMinute, 4);
  });

  it("restarts play at the centre spot (0, 0) by the conceding team after every goal", () => {
    // Run a few seeds until we have a multi-goal match and verify every goal is followed by goal_restart
    let checkedGoals = 0;
    for (let s = 1; s <= 15; s++) {
      const res = simulateMatch(createDefaultFixtureInput(`goal-restart-check-${s}`));
      for (let i = 0; i < res.events.length; i++) {
        const evt = res.events[i];
        if (evt.type === "goal") {
          checkedGoals++;
          const scoringSide = evt.team;
          const expectedRestartSide = scoringSide === "home" ? "away" : "home";
          const nextEvt = res.events[i + 1];
          assert.ok(nextEvt, "Expected an event after goal");
          // Unless half_time or full_time blew immediately on the goal tick, next play event is goal_restart
          if (nextEvt.type !== "half_time" && nextEvt.type !== "full_time") {
            assert.equal(nextEvt.type, "goal_restart");
            assert.equal(nextEvt.team, expectedRestartSide);
            assert.equal(nextEvt.location.x, 0);
            assert.equal(nextEvt.location.z, 0);
          }
        }
      }
    }
    assert.ok(checkedGoals >= 10, `Expected to verify at least 10 goals, checked ${checkedGoals}`);
  });

  it("maintains 100% consistency between recorded events and calculated statistics", () => {
    const res = simulateMatch(createDefaultFixtureInput("stats-consistency-seed-77"));

    const homeGoalsFromEvents = res.events.filter(
      (e) => e.type === "goal" && e.team === "home"
    ).length;
    const awayGoalsFromEvents = res.events.filter(
      (e) => e.type === "goal" && e.team === "away"
    ).length;

    assert.equal(res.homeTeam.score, homeGoalsFromEvents);
    assert.equal(res.awayTeam.score, awayGoalsFromEvents);
    assert.equal(res.stats.home.goals, homeGoalsFromEvents);
    assert.equal(res.stats.away.goals, awayGoalsFromEvents);

    // Shots on target = goals + opposing GK saves
    assert.equal(
      res.stats.home.shotsOnTarget,
      res.stats.home.goals + res.stats.away.saves
    );
    assert.equal(
      res.stats.away.shotsOnTarget,
      res.stats.away.goals + res.stats.home.saves
    );

    // Total shots = shotsOnTarget + shotsOffTarget + blockedShots
    assert.equal(
      res.stats.home.shots,
      res.stats.home.shotsOnTarget +
        res.stats.home.shotsOffTarget +
        res.stats.home.blockedShots
    );
    assert.equal(
      res.stats.away.shots,
      res.stats.away.shotsOnTarget +
        res.stats.away.shotsOffTarget +
        res.stats.away.blockedShots
    );

    // Possession sums to 100%
    assert.equal(
      res.stats.home.possession + res.stats.away.possession,
      100
    );

    // Every event location stays strictly within the 105x68m pitch
    for (const evt of res.events) {
      assert.ok(
        Math.abs(evt.location.x) <= 52.5 && Math.abs(evt.location.z) <= 34.0,
        `Event ${evt.id} out of bounds: (${evt.location.x}, ${evt.location.z})`
      );
    }

    // Re-running calculateStatsFromEvents on the returned events matches stats
    const recomputed = calculateStatsFromEvents(
      res.events,
      {
        home: res.stats.home.possessionMinutes * 60,
        away: res.stats.away.possessionMinutes * 60,
      },
      [],
      []
    );
    assert.equal(recomputed.home.goals, res.stats.home.goals);
    assert.equal(recomputed.away.goals, res.stats.away.goals);
    assert.equal(recomputed.home.shots, res.stats.home.shots);
    assert.equal(recomputed.away.shots, res.stats.away.shots);
    assert.equal(recomputed.home.passesAttempted, res.stats.home.passesAttempted);
    assert.equal(recomputed.home.passesCompleted, res.stats.home.passesCompleted);
  });

  it("reflects tactical trade-offs (Gegenpress stamina drain vs Low press, Short vs Direct passing)", () => {
    let gegenpressEndFitness = 0;
    let lowPressEndFitness = 0;
    let shortPassAcc = 0;
    let directPassAcc = 0;
    const sampleSize = 40;

    for (let i = 1; i <= sampleSize; i++) {
      const highPressInput = createDefaultFixtureInput(`tactics-test-${i}`);
      highPressInput.homeTeam.tactics = {
        mentality: "Attacking",
        pressingIntensity: "Gegenpress",
        tempo: "Fast",
        passingStyle: "Short",
      };
      const resHigh = simulateMatch(highPressInput);
      gegenpressEndFitness += resHigh.stats.home.averageEndFitness;
      shortPassAcc += resHigh.stats.home.passAccuracy;

      const lowPressInput = createDefaultFixtureInput(`tactics-test-${i}`);
      lowPressInput.homeTeam.tactics = {
        mentality: "Defensive",
        pressingIntensity: "Low",
        tempo: "Slow",
        passingStyle: "Direct",
      };
      const resLow = simulateMatch(lowPressInput);
      lowPressEndFitness += resLow.stats.home.averageEndFitness;
      directPassAcc += resLow.stats.home.passAccuracy;
    }

    assert.ok(
      gegenpressEndFitness / sampleSize < lowPressEndFitness / sampleSize,
      "Expected Gegenpress + Fast tempo to drain more stamina than Low press + Slow tempo"
    );
    assert.ok(
      shortPassAcc / sampleSize > directPassAcc / sampleSize,
      "Expected Short passing + Slow tempo to yield higher pass accuracy than Direct passing"
    );
  });

  it("handles missing or incomplete player lineups gracefully with fallback academy players", () => {
    const res = simulateMatch({
      homeTeam: {
        name: "Incomplete FC",
        shortName: "Incomplete",
        abbreviation: "INC",
        formation: "4-3-3",
        availablePlayers: [],
      },
      awayTeam: {
        name: "No Keeper United",
        shortName: "No Keeper",
        abbreviation: "NKU",
        formation: "4-4-2",
        availablePlayers: AWAY_SQUAD_PLAYERS.filter((p) => p.position !== "GK"),
      },
      seed: "edge-case-lineup-seed",
    });

    assert.equal(res.status, "Full Time");
    assert.equal(res.homeTeam.players.length, 11);
    assert.equal(res.awayTeam.players.length, 11);
    assert.ok(res.warnings.length > 0, "Expected lineup warnings to be recorded");
  });

  it("simulates 1,000 full matches quickly and validates realistic football statistical distributions", () => {
    const NUM_MATCHES = 1000;
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let totalGoals = 0;
    let homeGoals = 0;
    let awayGoals = 0;
    let totalShots = 0;
    let totalShotsOnTarget = 0;
    let totalSaves = 0;
    let totalXg = 0;
    let totalPassesAttempted = 0;
    let totalPassesCompleted = 0;
    let totalInterceptions = 0;
    let totalTackles = 0;
    let totalCorners = 0;
    let totalThrowIns = 0;
    let totalGoalKicks = 0;
    let totalFouls = 0;
    let totalOffsides = 0;

    const scoreDistribution = new Map<string, number>();
    const startTime = Date.now();

    for (let i = 1; i <= NUM_MATCHES; i++) {
      const res = simulateMatch(createDefaultFixtureInput(`mc-1000-seed-${i}`));
      const hg = res.homeTeam.score;
      const ag = res.awayTeam.score;

      if (hg > ag) homeWins++;
      else if (hg === ag) draws++;
      else awayWins++;

      homeGoals += hg;
      awayGoals += ag;
      totalGoals += hg + ag;

      const scoreKey = `${hg}-${ag}`;
      scoreDistribution.set(
        scoreKey,
        (scoreDistribution.get(scoreKey) ?? 0) + 1
      );

      totalShots += res.stats.home.shots + res.stats.away.shots;
      totalShotsOnTarget +=
        res.stats.home.shotsOnTarget + res.stats.away.shotsOnTarget;
      totalSaves += res.stats.home.saves + res.stats.away.saves;
      totalXg += res.stats.home.expectedGoals + res.stats.away.expectedGoals;
      totalPassesAttempted +=
        res.stats.home.passesAttempted + res.stats.away.passesAttempted;
      totalPassesCompleted +=
        res.stats.home.passesCompleted + res.stats.away.passesCompleted;
      totalInterceptions +=
        res.stats.home.interceptions + res.stats.away.interceptions;
      totalTackles += res.stats.home.tacklesWon + res.stats.away.tacklesWon;
      totalCorners += res.stats.home.corners + res.stats.away.corners;
      totalThrowIns += res.stats.home.throwIns + res.stats.away.throwIns;
      totalGoalKicks += res.stats.home.goalKicks + res.stats.away.goalKicks;
      totalFouls +=
        res.stats.home.foulsCommitted + res.stats.away.foulsCommitted;
      totalOffsides += res.stats.home.offsides + res.stats.away.offsides;
    }

    const durationMs = Date.now() - startTime;
    const avgGoals = totalGoals / NUM_MATCHES;
    const avgShots = totalShots / NUM_MATCHES;
    const avgSot = totalShotsOnTarget / NUM_MATCHES;
    const drawRate = draws / NUM_MATCHES;
    const passAcc = (totalPassesCompleted / totalPassesAttempted) * 100;

    const topScorelines = [...scoreDistribution.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([score, count]) => `${score} (${((count / NUM_MATCHES) * 100).toFixed(1)}%)`);

    console.log("\n=== 1,000-MATCH SIMULATION REPORT ===");
    console.log(`Execution Time:          ${durationMs} ms (${(durationMs / NUM_MATCHES).toFixed(2)} ms/match)`);
    console.log(`Outcomes:                Home Win ${(homeWins / 10).toFixed(1)}% | Draw ${(draws / 10).toFixed(1)}% | Away Win ${(awayWins / 10).toFixed(1)}%`);
    console.log(`Goals per Match:         ${avgGoals.toFixed(2)} (Home ${(homeGoals / NUM_MATCHES).toFixed(2)} - Away ${(awayGoals / NUM_MATCHES).toFixed(2)})`);
    console.log(`Expected Goals (xG):     ${(totalXg / NUM_MATCHES).toFixed(2)} per match`);
    console.log(`Shots per Match:         ${avgShots.toFixed(2)} (${avgSot.toFixed(2)} on target, ${(totalSaves / NUM_MATCHES).toFixed(2)} saves)`);
    console.log(`Passes per Match:        ${(totalPassesAttempted / NUM_MATCHES).toFixed(1)} attempted (${passAcc.toFixed(1)}% accuracy)`);
    console.log(`Defensive Actions:       ${(totalInterceptions / NUM_MATCHES).toFixed(1)} interceptions, ${(totalTackles / NUM_MATCHES).toFixed(1)} tackles/turnovers`);
    console.log(`Set Pieces & Rulings:    ${(totalCorners / NUM_MATCHES).toFixed(2)} corners, ${(totalThrowIns / NUM_MATCHES).toFixed(2)} throw-ins, ${(totalGoalKicks / NUM_MATCHES).toFixed(2)} goal kicks, ${(totalFouls / NUM_MATCHES).toFixed(2)} fouls, ${(totalOffsides / NUM_MATCHES).toFixed(2)} offsides`);
    console.log(`Top 10 Scorelines:       ${topScorelines.join(", ")}`);
    console.log("=====================================\n");

    // Audit statistical bounds for realism (flagging any suspicious distributions)
    assert.ok(
      avgGoals >= 2.1 && avgGoals <= 3.5,
      `Suspicious goals per match average: ${avgGoals.toFixed(2)}`
    );
    assert.ok(
      drawRate >= 0.17 && drawRate <= 0.32,
      `Suspicious draw rate: ${(drawRate * 100).toFixed(1)}%`
    );
    assert.ok(
      homeWins > awayWins,
      `Expected stronger Home team (${homeWins}) to win more often than Away team (${awayWins})`
    );
    assert.ok(
      awayWins >= 200,
      `Expected underdog Away team to still win a realistic share of matches (${awayWins}/1000)`
    );
    assert.ok(
      avgShots >= 18 && avgShots <= 34,
      `Suspicious shots per match: ${avgShots.toFixed(2)}`
    );
    assert.ok(
      passAcc >= 70 && passAcc <= 88,
      `Suspicious pass accuracy: ${passAcc.toFixed(1)}%`
    );
    assert.ok(
      totalCorners > 0 &&
        totalThrowIns > 0 &&
        totalGoalKicks > 0 &&
        totalFouls > 0 &&
        totalOffsides > 0,
      "Expected all set-piece and rule event types to occur across 1,000 matches"
    );
  });
});
