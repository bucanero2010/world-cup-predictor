// POST /api/refresh-odds — on-demand full-list odds fetch. Recomputes recommendations
// and upserts them into Postgres. Closed matches keep their frozen picks.

import { NextResponse } from "next/server";
import { fetchAllOdds } from "@/lib/oddsProvider.js";
import { getLastUsage } from "@/lib/providerFetch.js";
import { upsertMatchOdds, setMeta, setCredit, initSchema } from "@/lib/db.js";
import { buildCard } from "@/lib/card.js";
import { allowAction } from "@/lib/rateLimit.js";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json({ error: "Server is missing odds configuration." }, { status: 500 });
  }

  const gate = allowAction("refresh-odds");
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Refreshed too recently.", retryAfterMs: gate.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
    );
  }

  let normalized;
  try {
    normalized = await fetchAllOdds();
  } catch {
    // Provider error: leave the DB untouched, surface a clear error.
    return NextResponse.json({ error: "Could not fetch odds right now." }, { status: 502 });
  }

  try {
    await initSchema();
    let updated = 0;
    for (const norm of normalized) {
      await upsertMatchOdds(buildCard(norm));
      updated += 1;
    }
    const ts = new Date().toISOString();
    await setMeta("odds_last_refreshed", ts);
    // Record the live credit balance reported by the provider.
    const usage = getLastUsage();
    if (usage) await setCredit(usage.keyIndex, usage.remaining);
    return NextResponse.json({ updated, oddsLastRefreshed: ts });
  } catch (err) {
    return NextResponse.json({ error: "Failed to store odds." }, { status: 500 });
  }
}
