export type NavigationSection =
  | "overview"
  | "squad"
  | "tactics"
  | "fixtures"
  | "transfers"
  | "training"
  | "settings";

export type PositionGroup = "ALL" | "GK" | "DEF" | "MID" | "FWD";

export type SpecificPosition =
  | "GK"
  | "LB"
  | "CB"
  | "RB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LW"
  | "RW"
  | "ST";

export type PlayerStatus = "Starting XI" | "Bench" | "Reserve";

export interface Player {
  id: string;
  shirtNumber: number;
  name: string;
  nationality: string;
  position: SpecificPosition;
  positionGroup: Exclude<PositionGroup, "ALL">;
  age: number;
  overall: number;
  potential: number;
  weeklyWage: number;
  fitness: number;
  morale: "Superb" | "Good" | "Content";
  status: PlayerStatus;
  preferredFoot: "Left" | "Right" | "Both";
  appearances?: number;
  goals?: number;
  assists?: number;
  saves?: number;
}

export interface ManagerProfile {
  name: string;
  title: string;
  nationality: string;
  age: number;
  reputation: string;
  preferredFormation: string;
  seasonRecord: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
  };
}

export interface ClubInfo {
  name: string;
  shortName: string;
  nickname: string;
  founded: number;
  stadium: string;
  stadiumCapacity: string;
  division: string;
  leagueStanding: string;
  balance: number;
  transferBudget: number;
  wageBudgetWeekly: number;
  inGameDate: string;
}

export interface ClubOpponent {
  name: string;
  shortName: string;
  abbreviation: string;
  leaguePosition: string;
  recentForm: ("W" | "D" | "L")[];
  primaryColor: string;
  accentColor: string;
}

export interface NextFixture {
  id: string;
  competition: string;
  matchdayLabel: string;
  homeClub: ClubOpponent;
  awayClub: ClubOpponent;
  kickoffTime: string;
  dateLabel: string;
  venue: string;
  weather: string;
  referee: string;
}
