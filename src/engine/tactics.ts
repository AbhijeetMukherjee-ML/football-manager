import { EnginePlayer } from "./playerAdapter";

export type TeamSide = "home" | "away";

export type TacticalMentality =
  | "Defensive"
  | "Balanced"
  | "Positive"
  | "Attacking";

export type PressingIntensity = "Low" | "Standard" | "High" | "Gegenpress";

export interface TacticalSettings {
  mentality: TacticalMentality;
  pressingIntensity: PressingIntensity;
  tempo: "Slow" | "Standard" | "Fast";
  passingStyle: "Short" | "Mixed" | "Direct";
}

export const DEFAULT_TACTICS: TacticalSettings = {
  mentality: "Balanced",
  pressingIntensity: "Standard",
  tempo: "Standard",
  passingStyle: "Mixed",
};

export function resolveTactics(
  partial?: Partial<TacticalSettings>
): TacticalSettings {
  return {
    mentality: partial?.mentality ?? DEFAULT_TACTICS.mentality,
    pressingIntensity:
      partial?.pressingIntensity ?? DEFAULT_TACTICS.pressingIntensity,
    tempo: partial?.tempo ?? DEFAULT_TACTICS.tempo,
    passingStyle: partial?.passingStyle ?? DEFAULT_TACTICS.passingStyle,
  };
}

/**
 * Computes effective rating multiplier based on current player fatigue (0-100).
 * Up to ~24% reduction when exhausted, affecting passing, shooting, pace, and defending.
 */
export function getFatigueMultiplier(fatigue: number): number {
  const clamped = Math.max(0, Math.min(100, fatigue));
  if (clamped <= 25) return 1.0;
  return Math.max(0.76, 1.0 - ((clamped - 25) / 75) * 0.24);
}

/**
 * Quantifies tactical trade-offs for a team's active settings:
 * - Mentality shifts attacking commitment vs defensive vulnerability/line height.
 * - Pressing intensity boosts turnover/interception pressure at the cost of stamina and foul risk.
 * - Tempo trades pass composure for faster progression.
 * - Passing style trades short retention vs direct vertical distance & interception risk.
 */
export interface TacticalModifiers {
  attackBonus: number;
  defenseBonus: number;
  pressBonus: number;
  passCompletionMod: number;
  verticalProgressionMeters: number;
  shotTendencyMod: number;
  foulRiskMod: number;
  offsideTrapBonus: number;
  counterVulnerabilityMod: number;
  fatigueDrainPerMinute: number;
}

export function computeTacticalModifiers(
  tactics: TacticalSettings
): TacticalModifiers {
  const mentalityMap: Record<
    TacticalMentality,
    {
      att: number;
      def: number;
      shot: number;
      vuln: number;
    }
  > = {
    Defensive: { att: -3.2, def: 3.8, shot: -0.04, vuln: -0.04 },
    Balanced: { att: 0.0, def: 0.0, shot: 0.0, vuln: 0.0 },
    Positive: { att: 2.2, def: -1.0, shot: 0.025, vuln: 0.025 },
    Attacking: { att: 4.2, def: -2.8, shot: 0.05, vuln: 0.055 },
  };

  const pressMap: Record<
    PressingIntensity,
    {
      press: number;
      foul: number;
      trap: number;
      drain: number;
    }
  > = {
    Low: { press: -2.5, foul: -0.02, trap: -1.5, drain: 0.23 },
    Standard: { press: 0.0, foul: 0.0, trap: 0.0, drain: 0.31 },
    High: { press: 2.4, foul: 0.02, trap: 1.8, drain: 0.39 },
    Gegenpress: { press: 4.2, foul: 0.038, trap: 3.0, drain: 0.48 },
  };

  const tempoMap: Record<
    TacticalSettings["tempo"],
    { passMod: number; prog: number; drain: number }
  > = {
    Slow: { passMod: 0.03, prog: -1.8, drain: 0.04 },
    Standard: { passMod: 0.0, prog: 0.0, drain: 0.08 },
    Fast: { passMod: -0.025, prog: 2.4, drain: 0.13 },
  };

  const styleMap: Record<
    TacticalSettings["passingStyle"],
    { passMod: number; prog: number }
  > = {
    Short: { passMod: 0.035, prog: -2.8 },
    Mixed: { passMod: 0.0, prog: 0.0 },
    Direct: { passMod: -0.04, prog: 4.5 },
  };

  const m = mentalityMap[tactics.mentality];
  const p = pressMap[tactics.pressingIntensity];
  const t = tempoMap[tactics.tempo];
  const s = styleMap[tactics.passingStyle];

  return {
    attackBonus: m.att,
    defenseBonus: m.def,
    pressBonus: p.press,
    passCompletionMod: t.passMod + s.passMod,
    verticalProgressionMeters: 11.5 + t.prog + s.prog,
    shotTendencyMod: m.shot,
    foulRiskMod: p.foul,
    offsideTrapBonus: p.trap,
    counterVulnerabilityMod: m.vuln,
    fatigueDrainPerMinute: p.drain + t.drain,
  };
}

export interface TeamStrengthSnapshot {
  attack: number;
  midfield: number;
  defense: number;
  pressing: number;
  offsideTrap: number;
  goalkeeping: number;
}

export function evaluateTeamStrength(
  players: EnginePlayer[],
  tactics: TacticalSettings,
  isHome: boolean
): TeamStrengthSnapshot {
  const gk = players.find((p) => p.positionGroup === "GK") ?? players[0];
  const defenders = players.filter((p) => p.positionGroup === "DEF");
  const midfielders = players.filter((p) => p.positionGroup === "MID");
  const forwards = players.filter((p) => p.positionGroup === "FWD");
  const mods = computeTacticalModifiers(tactics);

  const avgAttr = (
    list: EnginePlayer[],
    selector: (p: EnginePlayer) => number,
    fallback: number
  ): number => {
    if (list.length === 0) return fallback;
    const total = list.reduce(
      (sum, p) =>
        sum +
        (selector(p) + p.moraleBonus) * getFatigueMultiplier(p.currentFatigue),
      0
    );
    return total / list.length;
  };

  const homeBoost = isHome ? 1.8 : 0;

  const attack =
    avgAttr(
      forwards.length > 0 ? forwards : players,
      (p) =>
        p.attributes.attacking * 0.4 +
        p.attributes.shooting * 0.35 +
        p.attributes.pace * 0.15 +
        p.attributes.composure * 0.1,
      74
    ) +
    mods.attackBonus +
    homeBoost;

  const midfield =
    avgAttr(
      midfielders.length > 0 ? midfielders : players,
      (p) =>
        p.attributes.passing * 0.38 +
        p.attributes.vision * 0.27 +
        p.attributes.attacking * 0.18 +
        p.attributes.interceptions * 0.17,
      74
    ) +
    mods.pressBonus * 0.5 +
    homeBoost;

  const defense =
    avgAttr(
      defenders.length > 0 ? defenders : players,
      (p) =>
        p.attributes.defending * 0.32 +
        p.attributes.tackling * 0.24 +
        p.attributes.marking * 0.22 +
        p.attributes.positioning * 0.22,
      74
    ) +
    mods.defenseBonus +
    homeBoost;

  const pressing =
    avgAttr(
      players.filter((p) => p.positionGroup !== "GK"),
      (p) =>
        p.attributes.interceptions * 0.35 +
        p.attributes.tackling * 0.35 +
        p.attributes.pace * 0.3,
      73
    ) + mods.pressBonus;

  const offsideTrap =
    avgAttr(
      defenders.length > 0 ? defenders : players,
      (p) => p.attributes.positioning * 0.65 + p.attributes.composure * 0.35,
      74
    ) + mods.offsideTrapBonus;

  const goalkeeping =
    (gk.attributes.goalkeeping * 0.72 +
      gk.attributes.positioning * 0.15 +
      gk.attributes.composure * 0.13 +
      gk.moraleBonus) *
      getFatigueMultiplier(gk.currentFatigue) +
    homeBoost * 0.4;

  return {
    attack,
    midfield,
    defense,
    pressing,
    offsideTrap,
    goalkeeping,
  };
}

export function updateMinuteFatigue(
  players: EnginePlayer[],
  tactics: TacticalSettings,
  inPossession: boolean,
  involvedPlayerIds: Set<string>
): void {
  const mods = computeTacticalModifiers(tactics);

  for (const player of players) {
    const roleFactor = player.positionGroup === "GK" ? 0.22 : 1.0;
    const outOfPossessionWork = inPossession ? 0.86 : 1.14;
    const actionBurst = involvedPlayerIds.has(player.id) ? 0.42 : 0;
    const staminaMitigation = 1.25 - (player.attributes.stamina / 100) * 0.45;

    const delta =
      (mods.fatigueDrainPerMinute * outOfPossessionWork + actionBurst) *
      roleFactor *
      staminaMitigation;

    player.currentFatigue = Math.min(95, player.currentFatigue + delta);
  }
}

export function applyHalfTimeRecovery(players: EnginePlayer[]): void {
  for (const player of players) {
    player.currentFatigue = Math.max(
      100 - player.initialFitness,
      player.currentFatigue - 7.5
    );
  }
}
