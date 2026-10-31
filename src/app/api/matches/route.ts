import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseUnavailableError,
  normalizeDatabaseError,
} from "@/db/postgres";
import {
  ConflictError,
  getClubRepository,
  SaveMatchSubmission,
  validateMatchSubmissionPayload,
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
      simulationCount: state.simulationCount,
      recentMatches: state.recentMatches,
    });
  } catch (err) {
    return buildErrorResponse(err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as Partial<SaveMatchSubmission>;

    // Validate payload before opening any database connection
    const validatedSubmission = validateMatchSubmissionPayload(body);

    const repo = getClubRepository();
    await repo.applyMigrations();
    const outcome = await repo.saveMatchResult(validatedSubmission);

    return NextResponse.json(
      {
        ok: true,
        duplicate: outcome.duplicate,
        matchId: outcome.matchId,
        submissionKey: outcome.submissionKey,
        data: outcome.state,
      },
      { status: outcome.duplicate ? 200 : 201 }
    );
  } catch (err) {
    return buildErrorResponse(err);
  }
}
