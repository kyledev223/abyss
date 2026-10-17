/**
 * Ledger storage (Neon Postgres via Drizzle). Optional: without DATABASE_URL the ledger falls back
 * to reading recent transactions from the RPC.
 */
import { neon } from "@neondatabase/serverless";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { bigint, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { DecodedEvent } from "./events";

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    signature: text("signature").notNull(),
    eventIndex: integer("event_index").notNull(),
    slot: bigint("slot", { mode: "number" }).notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }),
    name: text("name").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [
    // Idempotency: webhook retries and replays insert the same (signature, event_index) and are ignored.
    uniqueIndex("events_signature_index").on(t.signature, t.eventIndex),
    index("events_name_time").on(t.name, t.blockTime),
  ],
);

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
export const db = sql ? drizzle(sql) : null;

/**
 * Creates the table on first use (idempotent), so a fresh Vercel/Neon database needs no manual
 * migration step. Mirrors the `events` schema above.
 */
let ready: Promise<unknown> | undefined;
function ensureSchema() {
  if (!sql) return Promise.resolve();
  ready ??= sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS events (
      id serial PRIMARY KEY,
      signature text NOT NULL,
      event_index integer NOT NULL,
      slot bigint NOT NULL,
      block_time timestamptz,
      name text NOT NULL,
      data jsonb NOT NULL
    )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS events_signature_index ON events (signature, event_index)`,
    sql`CREATE INDEX IF NOT EXISTS events_name_time ON events (name, block_time)`,
  ]).catch((e) => {
    ready = undefined; // retry on the next call
    throw e;
  });
  return ready;
}

export async function storeEvents(rows: DecodedEvent[]): Promise<number> {
  if (!db || rows.length === 0) return 0;
  await ensureSchema();
  const inserted = await db
    .insert(events)
    .values(
      rows.map((e) => ({
        signature: e.signature,
        eventIndex: e.eventIndex,
        slot: e.slot,
        blockTime: e.blockTime ? new Date(e.blockTime * 1000) : null,
        name: e.name,
        data: e.data,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: events.id });
  return inserted.length;
}

export async function latestEvents(limit: number, name?: string): Promise<DecodedEvent[]> {
  if (!db) return [];
  await ensureSchema();
  const rows = await db
    .select()
    .from(events)
    .where(name ? eq(events.name, name) : undefined)
    .orderBy(desc(events.slot), desc(events.eventIndex))
    .limit(limit);
  return rows.map((r) => ({
    signature: r.signature,
    eventIndex: r.eventIndex,
    slot: r.slot,
    blockTime: r.blockTime ? Math.floor(r.blockTime.getTime() / 1000) : null,
    name: r.name,
    data: r.data as Record<string, unknown>,
  }));
}
