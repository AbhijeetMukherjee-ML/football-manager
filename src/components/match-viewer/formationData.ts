import {
  AWAY_SQUAD_PLAYERS,
  NEXT_FIXTURE,
  SQUAD_PLAYERS,
} from "../../data/mockClubData";
import { Player, SpecificPosition } from "../../types/football";

// Standard FIFA pitch dimensions in meters (1 unit = 1 meter)
export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

export type TeamSide = "home" | "away";
export type FormationCode = "4-3-3" | "4-2-3-1";

export interface PitchVector3 {
  x: number;
  y: number;
  z: number;
}

export interface TeamKitColors {
  shirtPrimary: string;
  shirtTrim: string;
  shorts: string;
  socks: string;
  numberText: string;
  badgeBackground: string;
  badgeBorder: string;
  ringColor: string;
  gloveColor?: string;
}

export interface PitchPlayerPlacement {
  /** Stable unique player ID for future match-engine state updates */
  id: string;
  team: TeamSide;
  shirtNumber: number;
  name: string;
  shortName: string;
  position: SpecificPosition;
  tacticalSlot: string;
  isGoalkeeper: boolean;
  /** World-space 3D coordinates on the 105m x 68m pitch (y = 0 is turf level) */
  position3D: PitchVector3;
  /** Facing angle in radians around Y axis (Home faces +X goal, Away faces -X goal) */
  rotationY: number;
  kit: TeamKitColors;
}

export interface PitchBallState {
  id: string;
  position3D: PitchVector3;
  rotation3D: PitchVector3;
  radius: number;
}

/**
 * Northbridge Athletic FC (Home) & Castlemere Rovers FC (Away) kit palettes.
 * Uses existing club colors from NEXT_FIXTURE and provides high-contrast
 * goalkeeper kits so GKs are immediately distinguishable from all 20 outfielders.
 */
export const HOME_OUTFIELD_KIT: TeamKitColors = {
  shirtPrimary: NEXT_FIXTURE.homeClub.primaryColor, // #10b981 Emerald Green
  shirtTrim: "#ecfdf5",
  shorts: "#0f172a", // Deep Navy/Slate shorts
  socks: "#10b981",
  numberText: "#ffffff",
  badgeBackground: "#065f46",
  badgeBorder: "#34d399",
  ringColor: "#10b981",
};

export const HOME_GK_KIT: TeamKitColors = {
  shirtPrimary: "#0ea5e9", // High-visibility Sky Cyan GK kit
  shirtTrim: "#e0f2fe",
  shorts: "#0c4a6e",
  socks: "#38bdf8",
  numberText: "#ffffff",
  badgeBackground: "#0369a1",
  badgeBorder: "#7dd3fc",
  ringColor: "#38bdf8",
  gloveColor: "#bef264", // Neon lime-white GK gloves
};

export const AWAY_OUTFIELD_KIT: TeamKitColors = {
  shirtPrimary: NEXT_FIXTURE.awayClub.primaryColor, // #f59e0b Amber Gold
  shirtTrim: "#451a03",
  shorts: "#1e1b4b", // Dark Indigo/Slate shorts
  socks: "#f59e0b",
  numberText: "#0f172a",
  badgeBackground: "#92400e",
  badgeBorder: "#fcd34d",
  ringColor: "#f59e0b",
};

export const AWAY_GK_KIT: TeamKitColors = {
  shirtPrimary: "#a855f7", // Distinct Royal Violet GK kit
  shirtTrim: "#fae8ff",
  shorts: "#3b0764",
  socks: "#c084fc",
  numberText: "#ffffff",
  badgeBackground: "#6b21a8",
  badgeBorder: "#e879f9",
  ringColor: "#c084fc",
  gloveColor: "#fde047", // High-vis yellow GK gloves
};

interface FormationSlotTemplate {
  tacticalSlot: string;
  preferredPosition: SpecificPosition;
  isGoalkeeper: boolean;
  /** X coordinate in meters (negative = left/home half, positive = right/away half) */
  x: number;
  /** Z coordinate in meters (-34 = far touchline, +34 = near touchline) */
  z: number;
}

/**
 * Home Team (Northbridge Athletic FC) — 4-3-3 Formation in Left Half (x < 0),
 * defending Left Goal (x = -52.5) and oriented toward Right Goal (+X).
 * When facing +X: Left flank is -Z, Right flank is +Z.
 */
export const HOME_433_SLOTS: FormationSlotTemplate[] = [
  { tacticalSlot: "GK", preferredPosition: "GK", isGoalkeeper: true, x: -48.0, z: 0.0 },
  { tacticalSlot: "LB", preferredPosition: "LB", isGoalkeeper: false, x: -34.0, z: -21.5 },
  { tacticalSlot: "LCB", preferredPosition: "CB", isGoalkeeper: false, x: -37.0, z: -7.5 },
  { tacticalSlot: "RCB", preferredPosition: "CB", isGoalkeeper: false, x: -37.0, z: 7.5 },
  { tacticalSlot: "RB", preferredPosition: "RB", isGoalkeeper: false, x: -34.0, z: 21.5 },
  { tacticalSlot: "CDM", preferredPosition: "CDM", isGoalkeeper: false, x: -24.5, z: 0.0 },
  { tacticalSlot: "LCM", preferredPosition: "CAM", isGoalkeeper: false, x: -17.5, z: -11.5 },
  { tacticalSlot: "RCM", preferredPosition: "CM", isGoalkeeper: false, x: -17.5, z: 11.5 },
  { tacticalSlot: "LW", preferredPosition: "LW", isGoalkeeper: false, x: -7.5, z: -20.5 },
  { tacticalSlot: "ST", preferredPosition: "ST", isGoalkeeper: false, x: -4.5, z: 0.0 },
  { tacticalSlot: "RW", preferredPosition: "RW", isGoalkeeper: false, x: -7.5, z: 20.5 },
];

/**
 * Away Team (Castlemere Rovers FC) — 4-2-3-1 Formation in Right Half (x > 0),
 * defending Right Goal (x = +52.5) and oriented toward Left Goal (-X).
 * When facing -X: Left flank is +Z, Right flank is -Z.
 */
export const AWAY_4231_SLOTS: FormationSlotTemplate[] = [
  { tacticalSlot: "GK", preferredPosition: "GK", isGoalkeeper: true, x: 48.0, z: 0.0 },
  { tacticalSlot: "RB", preferredPosition: "RB", isGoalkeeper: false, x: 34.5, z: -21.5 },
  { tacticalSlot: "RCB", preferredPosition: "CB", isGoalkeeper: false, x: 37.5, z: -7.5 },
  { tacticalSlot: "LCB", preferredPosition: "CB", isGoalkeeper: false, x: 37.5, z: 7.5 },
  { tacticalSlot: "LB", preferredPosition: "LB", isGoalkeeper: false, x: 34.5, z: 21.5 },
  { tacticalSlot: "RDM", preferredPosition: "CDM", isGoalkeeper: false, x: 24.5, z: -7.0 },
  { tacticalSlot: "LDM", preferredPosition: "CM", isGoalkeeper: false, x: 24.5, z: 7.0 },
  { tacticalSlot: "RAM", preferredPosition: "RW", isGoalkeeper: false, x: 13.5, z: -19.5 },
  { tacticalSlot: "CAM", preferredPosition: "CAM", isGoalkeeper: false, x: 14.5, z: 0.0 },
  { tacticalSlot: "LAM", preferredPosition: "LW", isGoalkeeper: false, x: 13.5, z: 19.5 },
  { tacticalSlot: "ST", preferredPosition: "ST", isGoalkeeper: false, x: 5.5, z: 0.0 },
];

function formatShortPlayerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return parts[parts.length - 1];
}

/**
 * Maps a team's 11 starting players onto a formation's 11 tactical slots,
 * preserving stable player IDs and matching positions accurately.
 */
export function mapLineupToFormationSlots(
  players: Player[],
  team: TeamSide,
  slots: FormationSlotTemplate[]
): PitchPlayerPlacement[] {
  const starters = players.filter((p) => p.status === "Starting XI").slice(0, 11);
  const pool = starters.length === 11 ? [...starters] : [...players.slice(0, 11)];
  const usedIds = new Set<string>();

  // Orientation around Y axis:
  // Player model faces +Z in local coordinates.
  // Rotation +Math.PI / 2 points local +Z toward +X (Right Goal, for Home team).
  // Rotation -Math.PI / 2 points local +Z toward -X (Left Goal, for Away team).
  const rotationY = team === "home" ? Math.PI / 2 : -Math.PI / 2;

  return slots.map((slot, idx) => {
    // 1. Try exact position match first
    let chosen = pool.find(
      (p) => !usedIds.has(p.id) && p.position === slot.preferredPosition
    );

    // 2. Fallback to goalkeeper status match if needed
    if (!chosen) {
      chosen = pool.find(
        (p) => !usedIds.has(p.id) && (p.position === "GK") === slot.isGoalkeeper
      );
    }

    // 3. Fallback to first unused player
    if (!chosen) {
      chosen = pool.find((p) => !usedIds.has(p.id)) ?? pool[idx];
    }

    usedIds.add(chosen.id);

    const isGoalkeeper = slot.isGoalkeeper || chosen.position === "GK";
    const kit =
      team === "home"
        ? isGoalkeeper
          ? HOME_GK_KIT
          : HOME_OUTFIELD_KIT
        : isGoalkeeper
          ? AWAY_GK_KIT
          : AWAY_OUTFIELD_KIT;

    return {
      id: chosen.id,
      team,
      shirtNumber: chosen.shirtNumber,
      name: chosen.name,
      shortName: formatShortPlayerName(chosen.name),
      position: chosen.position,
      tacticalSlot: slot.tacticalSlot,
      isGoalkeeper,
      position3D: {
        x: slot.x,
        y: 0,
        z: slot.z,
      },
      rotationY,
      kit,
    };
  });
}

export const INITIAL_HOME_PLAYERS_433: PitchPlayerPlacement[] =
  mapLineupToFormationSlots(SQUAD_PLAYERS, "home", HOME_433_SLOTS);

export const INITIAL_AWAY_PLAYERS_4231: PitchPlayerPlacement[] =
  mapLineupToFormationSlots(AWAY_SQUAD_PLAYERS, "away", AWAY_4231_SLOTS);

/** All 22 starting players (11 Home 4-3-3 + 11 Away 4-2-3-1) */
export const INITIAL_PITCH_PLAYERS: PitchPlayerPlacement[] = [
  ...INITIAL_HOME_PLAYERS_433,
  ...INITIAL_AWAY_PLAYERS_4231,
];

/**
 * Standard football positioned at the centre spot (0, radius, 0).
 * Slightly scaled radius (0.34m) so the ball is crisp from the tactical camera
 * while remaining realistically proportioned next to the 1.8m player models.
 */
export const MATCH_BALL_RADIUS = 0.34;

export const INITIAL_BALL_STATE: PitchBallState = {
  id: "match-ball-01",
  position3D: { x: 0, y: MATCH_BALL_RADIUS, z: 0 },
  rotation3D: { x: 0.25, y: 0.6, z: 0 },
  radius: MATCH_BALL_RADIUS,
};
