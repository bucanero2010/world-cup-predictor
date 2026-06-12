// Postgres access layer — the only module that issues SQL. Backed by Neon Serverless
// Postgres via @neondatabase/serverless (works over HTTP, ideal for Vercel functions).
//
// Connection string comes from the environment. The Vercel-managed Neon integration
// injects DATABASE_URL; we also accept POSTGRES_URL for flexibility.
//
// Persists matches, their odds-derived recommendation, and frozen results. Page loads
// read from here; the provider is only contacted by the action routes which write here.

import { neon } from "@neondatabase/serverless";

let _sql = null;

/** Lazily create the SQL tag so a missing URL fails at call time, not import time. */
function db() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL (or POSTGRES_URL) is not set");
  _sql = neon(url);
  return _sql;
}

/** Create tables if they don't exist. Idempotent; safe to call on boot or via script. */
export async function initSchema() {
  const sql = db();
  await sql`
    CREATE TABLE IF NOT EXISTS matches (
      event_id       TEXT PRIMARY KEY,
      home_team      TEXT NOT NULL,
      away_team      TEXT NOT NULL,
      commence_time  TIMESTAMPTZ NOT NULL,
      group_label    TEXT,
      status         TEXT NOT NULL DEFAULT 'upcoming',
      odds_as_of     TIMESTAMPTZ,
      bookmaker      TEXT,
      recommendation JSONB,
      final_home     INT,
      final_away     INT,
      completed      BOOLEAN NOT NULL DEFAULT FALSE,
      earned_points  REAL,
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TIMESTAMPTZ
    );
  `;
}

/** Map a DB row to the MatchCard shape the UI consumes. */
function rowToCard(r) {
  const card = {
    eventId: r.event_id,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    commenceTimeUtc: new Date(r.commence_time).toISOString(),
    group: r.group_label ?? undefined,
    status: r.status,
    oddsAsOf: r.odds_as_of ? new Date(r.odds_as_of).toISOString() : undefined,
    bookmaker: r.bookmaker ?? undefined,
    recommendation: r.recommendation ?? undefined,
  };
  if (r.completed && r.final_home != null && r.final_away != null) {
    card.result = {
      home: r.final_home,
      away: r.final_away,
      earnedPoints: r.earned_points,
    };
  }
  return card;
}

/** All matches ordered by kickoff. */
export async function getAllMatches() {
  const sql = db();
  const rows = await sql`
    SELECT * FROM matches ORDER BY commence_time ASC;
  `;
  return rows.map(rowToCard);
}

/** @returns {Promise<boolean>} true when no matches are stored yet. */
export async function isEmpty() {
  const sql = db();
  const rows = await sql`SELECT 1 FROM matches LIMIT 1;`;
  return rows.length === 0;
}

/**
 * Insert or update a match's fixture + odds + recommendation.
 * Closed-aware: for a completed match, the frozen recommendation, final score, and
 * earned points are preserved (only volatile fixture fields may change).
 * @param {object} card MatchCard (status "ok"/"pending" from buildCard; mapped here)
 */
export async function upsertMatchOdds(card) {
  const sql = db();
  const rec = card.recommendation ? JSON.stringify(card.recommendation) : null;
  // status from the card is "ok"|"pending"; store "upcoming" for ok (results route
  // promotes to "closed"). Pending stays "pending".
  const status = card.status === "pending" ? "pending" : "upcoming";
  await sql`
    INSERT INTO matches (
      event_id, home_team, away_team, commence_time, group_label,
      status, odds_as_of, bookmaker, recommendation, updated_at
    ) VALUES (
      ${card.eventId}, ${card.homeTeam}, ${card.awayTeam}, ${card.commenceTimeUtc},
      ${card.group ?? null}, ${status}, ${card.oddsAsOf ?? null}, ${card.bookmaker ?? null},
      ${rec}::jsonb, now()
    )
    ON CONFLICT (event_id) DO UPDATE SET
      home_team     = EXCLUDED.home_team,
      away_team     = EXCLUDED.away_team,
      commence_time = EXCLUDED.commence_time,
      group_label   = EXCLUDED.group_label,
      -- never rewrite a frozen (completed) match's odds-derived fields
      status        = CASE WHEN matches.completed THEN matches.status ELSE EXCLUDED.status END,
      odds_as_of    = CASE WHEN matches.completed THEN matches.odds_as_of ELSE EXCLUDED.odds_as_of END,
      bookmaker     = CASE WHEN matches.completed THEN matches.bookmaker ELSE EXCLUDED.bookmaker END,
      recommendation= CASE WHEN matches.completed THEN matches.recommendation ELSE EXCLUDED.recommendation END,
      updated_at    = now();
  `;
}

/** Freeze a finished match's result and the points its stored pick earned. */
export async function freezeResult(eventId, finalHome, finalAway, earnedPoints) {
  const sql = db();
  await sql`
    UPDATE matches SET
      status        = 'closed',
      completed     = TRUE,
      final_home    = ${finalHome},
      final_away    = ${finalAway},
      earned_points = ${earnedPoints},
      updated_at    = now()
    WHERE event_id = ${eventId};
  `;
}

export async function getMeta(key) {
  const sql = db();
  const rows = await sql`SELECT value FROM meta WHERE key = ${key};`;
  return rows[0]?.value ? new Date(rows[0].value).toISOString() : null;
}

export async function setMeta(key, isoTs) {
  const sql = db();
  await sql`
    INSERT INTO meta (key, value) VALUES (${key}, ${isoTs})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `;
}
