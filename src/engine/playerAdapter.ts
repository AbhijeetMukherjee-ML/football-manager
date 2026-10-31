import { Player, PositionGroup, SpecificPosition } from "../types/football";

export interface EnginePlayerAttributes {
  attacking: number;
  passing: number;
  vision: number;
  shooting: number;
  composure: number;
  defending: number;
  tackling: number;
  positioning: number;
  marking: number;
  interceptions: number;
  goalkeeping: number;
  pace: number;
  stamina: number;
}

export interface EnginePlayer {
  id: string;
  shirtNumber: number;
  name: string;
  position: SpecificPosition;
  positionGroup: Exclude<PositionGroup, "ALL">;
  overall: number;
  initialFitness: number;
  currentFatigue: number; // 0 (fresh) to 100 (exhausted)
  moraleBonus: number;
  /** Default tactical pitch X in [-52.5, 52.5] (Home < 0, Away > 0) */
  baseX: number;
  /** Default tactical pitch Z in [-34.0, 34.0] */
  baseZ: number;
  attributes: EnginePlayerAttributes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function inferPositionGroup(
  position?: SpecificPosition,
  group?: Exclude<PositionGroup, "ALL">
): Exclude<PositionGroup, "ALL"> {
  if (group === "GK" || group === "DEF" || group === "MID" || group === "FWD") {
    return group;
  }
  switch (position) {
    case "GK":
      return "GK";
    case "LB":
    case "CB":
    case "RB":
      return "DEF";
    case "CDM":
    case "CM":
    case "CAM":
      return "MID";
    case "LW":
    case "RW":
    case "ST":
      return "FWD";
    default:
      return "MID";
  }
}

/**
 * Default tactical base coordinates in the left half (Home, attacking +X).
 * For Away (attacking -X), X and Z are mirrored (-baseX, -baseZ).
 */
function inferDefaultPitchCoords(
  position: SpecificPosition,
  index: number,
  side: "home" | "away"
): { baseX: number; baseZ: number } {
  let x = -22;
  let z = 0;

  switch (position) {
    case "GK":
      x = -48.0;
      z = 0;
      break;
    case "LB":
      x = -34.0;
      z = -21.5;
      break;
    case "RB":
      x = -34.0;
      z = 21.5;
      break;
    case "CB":
      x = -37.0;
      z = index % 2 === 0 ? -7.5 : 7.5;
      break;
    case "CDM":
      x = -24.5;
      z = 0;
      break;
    case "CM":
      x = -18.0;
      z = index % 2 === 0 ? 10.5 : -10.5;
      break;
    case "CAM":
      x = -14.5;
      z = 0;
      break;
    case "LW":
      x = -8.5;
      z = -20.5;
      break;
    case "RW":
      x = -8.5;
      z = 20.5;
      break;
    case "ST":
      x = -5.0;
      z = 0;
      break;
  }

  return side === "home"
    ? { baseX: x, baseZ: z }
    : { baseX: -x, baseZ: -z };
}

/**
 * Deterministically derives simulation attributes from a standard squad Player.
 * Gracefully fills in sensible defaults if any player fields are missing or out of bounds.
 */
export function adaptPlayerForEngine(
  rawPlayer: Partial<Player> | undefined,
  fallbackIndex = 0,
  side: "home" | "away" = "home"
): EnginePlayer {
  const position: SpecificPosition = rawPlayer?.position ?? "CM";
  const positionGroup = inferPositionGroup(position, rawPlayer?.positionGroup);
  const overall = clamp(rawPlayer?.overall ?? 75, 45, 99);
  const potential = clamp(rawPlayer?.potential ?? overall, overall, 99);
  const age = clamp(rawPlayer?.age ?? 24, 16, 42);
  const initialFitness = clamp(rawPlayer?.fitness ?? 95, 50, 100);

  const moraleBonus =
    rawPlayer?.morale === "Superb"
      ? 2.5
      : rawPlayer?.morale === "Good"
        ? 1.0
        : 0;

  const youthDynamicBoost = age <= 22 ? 3 : age >= 31 ? -2 : 1;
  const experienceBoost = age >= 27 ? 3 : 0;
  const ceilingFactor = Math.min(4, Math.max(0, (potential - overall) * 0.35));

  let attacking = overall - 8;
  let passing = overall - 5;
  let vision = overall - 6 + experienceBoost;
  let shooting = overall - 10;
  let defending = overall - 10;
  let tackling = overall - 10;
  let positioning = overall - 4 + experienceBoost;
  let marking = overall - 10;
  let interceptions = overall - 9;
  let goalkeeping = 15;
  let pace = overall - 4 + youthDynamicBoost;
  const composure = overall - 3 + experienceBoost;
  const stamina = clamp(
    (initialFitness + overall) / 2 + youthDynamicBoost,
    60,
    98
  );

  if (positionGroup === "GK") {
    goalkeeping = clamp(overall + 3, 50, 99);
    positioning = clamp(overall + 2 + experienceBoost, 52, 99);
    defending = clamp(overall - 18, 35, 80);
    tackling = clamp(overall - 22, 30, 75);
    marking = clamp(overall - 24, 28, 72);
    interceptions = clamp(overall - 16, 35, 78);
    passing = clamp(overall - 14, 40, 85);
    vision = clamp(overall - 12, 42, 86);
    attacking = 22;
    shooting = 18;
    pace = clamp(overall - 20, 35, 75);
  } else if (positionGroup === "DEF") {
    defending = clamp(overall + 3, 50, 99);
    const isFullback = position === "LB" || position === "RB";
    tackling = clamp(overall + (isFullback ? 2 : 4), 52, 99);
    marking = clamp(overall + (isFullback ? 1 : 4), 50, 99);
    positioning = clamp(overall + (isFullback ? 1 : 3) + experienceBoost, 50, 99);
    interceptions = clamp(overall + 2, 50, 98);
    pace = clamp(overall + (isFullback ? 4 : -2) + youthDynamicBoost, 50, 97);
    passing = clamp(overall + (isFullback ? 0 : -4), 45, 92);
    vision = clamp(overall + (isFullback ? -2 : -6), 42, 88);
    attacking = clamp(overall + (isFullback ? -6 : -14), 35, 86);
    shooting = clamp(overall - 18, 30, 78);
  } else if (positionGroup === "MID") {
    passing = clamp(overall + 4 + ceilingFactor, 55, 99);
    vision = clamp(overall + 3 + ceilingFactor + experienceBoost * 0.5, 55, 99);
    if (position === "CDM") {
      defending = clamp(overall + 2, 55, 95);
      tackling = clamp(overall + 3, 55, 96);
      marking = clamp(overall + 1, 52, 94);
      interceptions = clamp(overall + 4, 56, 97);
      positioning = clamp(overall + 2 + experienceBoost, 54, 96);
      attacking = clamp(overall - 5, 45, 88);
      shooting = clamp(overall - 8, 45, 86);
    } else if (position === "CAM") {
      attacking = clamp(overall + 4, 55, 97);
      vision = clamp(overall + 5 + ceilingFactor, 58, 99);
      shooting = clamp(overall + 1, 50, 94);
      defending = clamp(overall - 14, 35, 78);
      tackling = clamp(overall - 15, 34, 76);
      marking = clamp(overall - 16, 32, 74);
      interceptions = clamp(overall - 10, 38, 80);
    } else {
      // CM
      attacking = clamp(overall + 1, 50, 94);
      defending = clamp(overall - 3, 48, 90);
      tackling = clamp(overall - 2, 48, 90);
      marking = clamp(overall - 4, 46, 88);
      interceptions = clamp(overall, 50, 92);
      shooting = clamp(overall - 2, 48, 90);
    }
  } else {
    // FWD (LW, RW, ST)
    const isWinger = position === "LW" || position === "RW";
    attacking = clamp(overall + 4, 55, 99);
    shooting = clamp(overall + (isWinger ? 1 : 5), 55, 99);
    passing = clamp(overall + (isWinger ? 2 : -3), 48, 94);
    vision = clamp(overall + (isWinger ? 2 : -2), 48, 94);
    positioning = clamp(overall + (isWinger ? 1 : 4) + experienceBoost, 52, 99);
    pace = clamp(overall + (isWinger ? 5 : 2) + youthDynamicBoost, 55, 99);
    defending = clamp(overall - 24, 25, 68);
    tackling = clamp(overall - 25, 24, 65);
    marking = clamp(overall - 26, 22, 64);
    interceptions = clamp(overall - 20, 28, 70);
  }

  const coords = inferDefaultPitchCoords(position, fallbackIndex, side);

  return {
    id: rawPlayer?.id || `fallback-player-${side}-${fallbackIndex + 1}`,
    shirtNumber: rawPlayer?.shirtNumber ?? fallbackIndex + 1,
    name: rawPlayer?.name?.trim() || `Squad Player #${fallbackIndex + 1}`,
    position,
    positionGroup,
    overall,
    initialFitness,
    currentFatigue: clamp(100 - initialFitness, 0, 50),
    moraleBonus,
    baseX: coords.baseX,
    baseZ: coords.baseZ,
    attributes: {
      attacking: clamp(attacking, 20, 99),
      passing: clamp(passing, 20, 99),
      vision: clamp(vision, 20, 99),
      shooting: clamp(shooting, 20, 99),
      composure: clamp(composure, 40, 99),
      defending: clamp(defending, 20, 99),
      tackling: clamp(tackling, 20, 99),
      positioning: clamp(positioning, 25, 99),
      marking: clamp(marking, 20, 99),
      interceptions: clamp(interceptions, 20, 99),
      goalkeeping: clamp(goalkeeping, 15, 99),
      pace: clamp(pace, 30, 99),
      stamina: clamp(stamina, 50, 99),
    },
  };
}

const DEFAULT_FALLBACK_POSITIONS: SpecificPosition[] = [
  "GK",
  "RB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RW",
  "LW",
  "ST",
];

/**
 * Ensures a valid 11-player starting lineup (with at least 1 GK and 10 outfielders)
 * even if the provided startingLineup or availablePlayers array is incomplete or invalid.
 */
export function resolveValidLineup(
  teamName: string,
  availablePlayers: Player[] = [],
  startingLineup?: Player[],
  side: "home" | "away" = "home"
): { starters: EnginePlayer[]; warnings: string[] } {
  const warnings: string[] = [];
  const safeAvailable = Array.isArray(availablePlayers)
    ? availablePlayers.filter(Boolean)
    : [];

  const candidatePool: Player[] = [];
  const seenIds = new Set<string>();

  const initialStarters =
    Array.isArray(startingLineup) && startingLineup.length > 0
      ? startingLineup.filter(Boolean)
      : safeAvailable.filter((p) => p.status === "Starting XI");

  for (const p of initialStarters) {
    if (p && p.id && !seenIds.has(p.id)) {
      seenIds.add(p.id);
      candidatePool.push(p);
    }
  }

  if (candidatePool.length < 11) {
    for (const p of safeAvailable) {
      if (candidatePool.length >= 11) break;
      if (p && p.id && !seenIds.has(p.id)) {
        seenIds.add(p.id);
        candidatePool.push(p);
      }
    }
  }

  const adapted = candidatePool
    .slice(0, 11)
    .map((player, idx) => adaptPlayerForEngine(player, idx, side));

  while (adapted.length < 11) {
    const idx = adapted.length;
    const pos = DEFAULT_FALLBACK_POSITIONS[idx] ?? "CM";
    warnings.push(
      `${teamName}: Added emergency academy starter at ${pos} to complete 11-player lineup.`
    );
    adapted.push(
      adaptPlayerForEngine(
        {
          id: `${teamName.toLowerCase().replace(/\s+/g, "-")}-auto-${idx + 1}`,
          shirtNumber: idx + 20,
          name: `${teamName.split(" ")[0]} Academy #${idx + 1}`,
          position: pos,
          positionGroup: inferPositionGroup(pos),
          age: 19,
          overall: 72,
          potential: 78,
          fitness: 95,
          morale: "Good",
          status: "Starting XI",
        },
        idx,
        side
      )
    );
  }

  // Ensure at least one goalkeeper is designated
  const hasGoalkeeper = adapted.some((p) => p.positionGroup === "GK");
  if (!hasGoalkeeper && adapted.length > 0) {
    warnings.push(
      `${teamName}: No goalkeeper in starting XI; assigned ${adapted[0].name} as emergency GK.`
    );
    const gkCoords = inferDefaultPitchCoords("GK", 0, side);
    adapted[0] = {
      ...adapted[0],
      position: "GK",
      positionGroup: "GK",
      baseX: gkCoords.baseX,
      baseZ: gkCoords.baseZ,
      attributes: {
        ...adapted[0].attributes,
        goalkeeping: Math.max(68, adapted[0].attributes.goalkeeping),
      },
    };
  }

  return { starters: adapted, warnings };
}
