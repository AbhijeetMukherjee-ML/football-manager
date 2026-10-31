import {
  ConflictError,
  PersistedClubAndSeasonState,
  PlayerPatchItem,
  SaveMatchOutcome,
  SaveMatchSubmission,
  UpdateClubAndSquadInput,
  ValidationError,
} from "./repository";

export type DatabaseDriver = "postgres" | "sqlite";

export interface ClubRepository {
  readonly driver: DatabaseDriver;
  applyMigrations(): Promise<{ version: string; applied: boolean }>;
  seedInitialData(forceReset?: boolean): Promise<{ seeded: boolean }>;
  loadClubState(): Promise<PersistedClubAndSeasonState>;
  updateClubTacticsAndSquad(
    input: UpdateClubAndSquadInput
  ): Promise<PersistedClubAndSeasonState>;
  saveMatchResult(
    submission: SaveMatchSubmission
  ): Promise<SaveMatchOutcome>;
  close?(): Promise<void> | void;
}

export {
  ConflictError,
  ValidationError,
};

export type {
  PersistedClubAndSeasonState,
  PlayerPatchItem,
  SaveMatchOutcome,
  SaveMatchSubmission,
  UpdateClubAndSquadInput,
};
