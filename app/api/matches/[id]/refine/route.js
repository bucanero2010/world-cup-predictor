// POST /api/matches/[id]/refine — sharpen one match's recommendation using the
// alternate-totals ladder (per-event market, ~2 credits). Re-solves lambda against the
// full goals curve instead of a single line, then persists the refined recommendation.

import { NextResponse } from "next/server";
import { fetchEventAltTotals } from "@/lib/oddsProvider.js";
import { getAllMatches, upsertMatchOdds } from "@/lib/db.js";
import { recommendForMatch } from "@/lib/recommend.js";
import { flagFor } from "@/lib/flags.js";
import { allowAction } from "@/lib/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST(_req, { params }) {
  const { id } = params;

  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ error: "Server is missing odds configuration." }, { status: 500 });
  }

  // Rate-limit per event so repeated clicks don't burn credits.
  const gate = allowAction(`refine:${id}`, Date.now(), 60 * 1000);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Refined too recently.", retryAfterMs: gate.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
    );
  }

  try {
    const matches = await getAllMatches();
    const match = matches.find((m) => m.eventId === id);
    const inputs = match?.recommendation?.inputs;
    if (!match || !inputs) {
      return NextResponse.json({ error: "No stored odds for this match." }, { status: 404 });
    }

    let ladder;
    try {
      ladder = await fetchEventAltTotals(id);
    } catch {
      return NextResponse.json({ error: "Could not fetch alternate totals." }, { status: 502 });
    }
    if (!ladder || ladder.length < 2) {
      return NextResponse.json({ error: "No alternate-totals lines available for this match." }, { status: 502 });
    }

    const recommendation = recommendForMatch(
      {
        oneXtwo: inputs.oneXtwo,
        totalLine: inputs.totalLine,
        overUnder: inputs.overUnder ?? undefined,
      },
      { totalsLines: ladder }
    );

    // Persist the refined card (closed-aware upsert leaves frozen matches untouched).
    const card = {
      eventId: match.eventId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeFlag: flagFor(match.homeTeam).emoji,
      awayFlag: flagFor(match.awayTeam).emoji,
      commenceTimeUtc: match.commenceTimeUtc,
      group: match.group,
      status: "ok",
      oddsAsOf: match.oddsAsOf,
      bookmaker: match.bookmaker,
      recommendation,
    };
    try {
      await upsertMatchOdds(card);
    } catch {
      // fall through — still return the refined result even if the write fails
    }

    return NextResponse.json({ recommendation, lines: ladder.length });
  } catch {
    return NextResponse.json({ error: "Could not refine this match." }, { status: 500 });
  }
}
