import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

/**
 * Liveness/readiness probe for the container platform.
 *
 * Touches SQLite rather than returning a bare 200, so a container with an
 * unwritable or missing data volume reports unhealthy instead of silently
 * serving a broken board.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute("SELECT 1 AS ok");
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
