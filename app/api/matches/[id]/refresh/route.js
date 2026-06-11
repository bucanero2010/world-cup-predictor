// POST /api/matches/[id]/refresh — refresh a single match via the per-event endpoint.
// Rate-limited per event. On provider failure the client keeps its prior odds.

import { NextResponse } from "next/server";
import { fetchEventOdds } from "@/lib/oddsProvider.js";
import { patchCachedMatch } from "@/lib/cache.js";
import { allowRefresh } from "@/lib/rateLimit.js";
import { buildCard } from "@/lib/card.js";

export const dynamic = "force-dynamic";

export async function POST(_req, { params }) {
  const { id } = params;

  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing odds configuration." },
      { status: 500 }
    );
  }

  const gate = allowRefresh(id);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Refreshed too recently.", retryAfterMs: gate.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
    );
  }

  let normalized;
  try {
    normalized = await fetchEventOdds(id);
  } catch (err) {
    // Provider/network error: client retains previous odds + timestamp.
    return NextResponse.json(
      { error: "Could not refresh odds for this match right now." },
      { status: 502 }
    );
  }

  if (!normalized) {
    return NextResponse.json(
      { error: "No usable odds available for this match yet." },
      { status: 502 }
    );
  }

  const card = buildCard(normalized);

  // Best-effort cache update; if it fails we still return the fresh card now and
  // let the next full-list fetch repair the snapshot.
  try {
    await patchCachedMatch(id, card);
  } catch {
    // swallow — fresh data already in hand
  }

  return NextResponse.json({ match: card });
}
