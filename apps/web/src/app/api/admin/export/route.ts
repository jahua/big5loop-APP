/**
 * Admin bulk data export – pilot evaluation data extraction.
 * GET /api/admin/export?limit=200&cursor_before=<ISO timestamp>
 *
 * Returns all sessions with turns, personality states, human ratings, and audit rows.
 * Paginate: repeat with cursor_before=<last session created_at from previous response>.
 *
 * Auth: DATA_API_KEY must be set in env; send as x-api-key or Authorization: Bearer <key>.
 * Route is in PUBLIC_PATHS so middleware does not redirect before auth check.
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDatabase, withDb } from "@/lib/db";
import { exportAllData } from "@/lib/data-export";

export const dynamic = "force-dynamic";

const DATA_API_KEY = process.env.DATA_API_KEY ?? "";

function requireAuth(request: NextRequest): NextResponse | null {
  if (!DATA_API_KEY) {
    return NextResponse.json(
      { error: "Admin export is disabled. Set DATA_API_KEY on the server." },
      { status: 503 }
    );
  }
  const key =
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (key !== DATA_API_KEY) {
    return NextResponse.json(
      { error: "Unauthorized. Provide x-api-key or Authorization: Bearer header." },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = requireAuth(request);
  if (authError) return authError;

  if (!hasDatabase()) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Database not configured. Set DATABASE_URL (or AUDIT_DATABASE_URL) on the server.",
      },
      { status: 501 }
    );
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  const limit = Math.min(Math.max(1, parseInt(rawLimit ?? "200", 10) || 200), 500);
  const cursorBefore = params.get("cursor_before") ?? undefined;

  try {
    const data = await withDb((client) => exportAllData(client, limit, cursorBefore));
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
