import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseUnavailableError,
  normalizeDatabaseError,
} from "@/db/postgres";
import {
  ConflictError,
  getClubRepository,
  UpdateClubAndSquadInput,
  validateClubUpdatePayload,
  ValidationError,
} from "@/db";

function buildErrorResponse(err: unknown): NextResponse {
  if (err instanceof ConflictError) {
    return NextResponse.json(
      { ok: false, code: err.code, error: err.message },
      { status: 409 }
    );
  }
  if (err instanceof ValidationError) {
    return NextResponse.json(
      {
        ok: false,
        code: err.code,
        error: err.message,
      },
      { status: 400 }
    );
  }
  const normalized = normalizeDatabaseError(err);
  if (normalized instanceof DatabaseUnavailableError) {
    return NextResponse.json(
      {
        ok: false,
        code: normalized.code,
        error: normalized.message,
        remediation: normalized.remediation,
      },
      { status: 503 }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      code: "INTERNAL_ERROR",
      error: normalized.message || "Unexpected server error",
    },
    { status: 500 }
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const repo = getClubRepository();
    await repo.applyMigrations();
    const state = await repo.loadClubState();
    return NextResponse.json({
      ok: true,
      data: state,
    });
  } catch (err) {
    return buildErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as UpdateClubAndSquadInput & {
      action?: "reset_season" | "seed";
    };

    const repo = getClubRepository();

    if (body.action === "reset_season") {
      await repo.applyMigrations();
      await repo.seedInitialData(true);
      const resetState = await repo.loadClubState();
      return NextResponse.json({
        ok: true,
        reset: true,
        data: resetState,
      });
    }

    if (body.action === "seed") {
      await repo.applyMigrations();
      const seeded = await repo.seedInitialData(false);
      const state = await repo.loadClubState();
      return NextResponse.json({
        ok: true,
        seeded: seeded.seeded,
        data: state,
      });
    }

    // Validate payload before opening any database connection
    const validatedInput = validateClubUpdatePayload(body);
    await repo.applyMigrations();
    const updated = await repo.updateClubTacticsAndSquad(validatedInput);
    return NextResponse.json({
      ok: true,
      data: updated,
    });
  } catch (err) {
    return buildErrorResponse(err);
  }
}
