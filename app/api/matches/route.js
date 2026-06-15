// GET /api/matches — pure DB read. No provider calls. Returns matches, the tournament
// scorecard, last-updated metadata, live credit balances, and an empty flag.

import { NextResponse } from "next/server";
import { loadAppData } from "@/lib/appData.js";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await loadAppData();
  return NextResponse.json(data);
}
