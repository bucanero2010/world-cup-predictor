// GET /api/matches/[id]/robustness — compute the Monte Carlo robustness for a single
// match on demand (when its detail view is expanded). Kept off the bulk refresh path
// because it's ~200x the work of a single recommendation.

import { NextResponse } from "next/server";
import { getAllMatches } from "@/lib/db.js";
import { robustness } from "@/lib/robustness.js";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const { id } = params;
  try {
    const matches = await getAllMatches();
    const match = matches.find((m) => m.eventId === id);
    const inputs = match?.recommendation?.inputs;
    if (!inputs) {
      return NextResponse.json({ error: "No odds stored for this match." }, { status: 404 });
    }
    const r = robustness({
      oneXtwo: inputs.oneXtwo,
      totalLine: inputs.totalLine,
      overUnder: inputs.overUnder ?? undefined,
    });
    return NextResponse.json({ robustness: r });
  } catch {
    return NextResponse.json({ error: "Could not compute robustness." }, { status: 500 });
  }
}
