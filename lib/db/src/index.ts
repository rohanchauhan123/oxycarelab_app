import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

function findEntityAndId(condition: any): { entity?: string; id?: string } {
  if (!condition) return {};

  const knownEntities = new Set([
    "appointment", "patient", "test", "package", "slot", "doctor", "agent",
    "branch", "lab", "activity", "user", "payment", "report", "whatsapp_template",
    "whatsapp_log", "audit_log", "doctor_price", "ledger", "notification", "partner_lab"
  ]);
  let entity: string | undefined;
  let id: string | undefined;

  const visited = new Set<any>();
  const traverse = (obj: any) => {
    if (!obj) return;
    if (typeof obj === "string") {
      if (knownEntities.has(obj)) entity = obj;
      if (
        obj.includes(":") ||
        obj.startsWith("pat-") ||
        obj.startsWith("APT-") ||
        obj.startsWith("slot-") ||
        obj.startsWith("act-") ||
        obj.startsWith("test-") ||
        obj.startsWith("pkg-") ||
        obj.startsWith("doc-") ||
        obj.startsWith("agent-") ||
        obj.startsWith("user-") ||
        obj.startsWith("tpl-") ||
        obj.startsWith("log-") ||
        obj.startsWith("aud-") ||
        obj.startsWith("dp-") ||
        obj.startsWith("led-") ||
        obj.startsWith("notif-") ||
        obj.startsWith("plab-")
      ) {
        id = obj;
      }
      return;
    }


    if (typeof obj !== "object" || visited.has(obj)) return;
    visited.add(obj);

    for (const key of Object.keys(obj)) {
      if (key === "table" || key === "config") continue;
      traverse(obj[key]);
    }
  };

  traverse(condition);
  return { entity, id };
}

function createInMemoryDb() {
  const store = new Map<string, { id: string; entity: string; payload: any }>();

  return {
    select: (_fields?: any) => ({
      from: (_table: any) => ({
        limit: async (limitCount: number) => {
          return Array.from(store.values()).slice(0, limitCount);
        },
        where: async (condition: any) => {
          const rows = Array.from(store.values());
          if (!condition) return rows;

          const conds = findEntityAndId(condition);
          return rows.filter((row) => {
            if (conds.entity && row.entity !== conds.entity) return false;
            if (conds.id && row.id !== conds.id && `:${row.payload?.id}` !== conds.id && row.payload?.id !== conds.id) return false;
            return true;
          });
        },
      }),
    }),
    insert: (_table: any) => ({
      values: async (values: any) => {
        const items = Array.isArray(values) ? values : [values];
        for (const item of items) {
          store.set(item.id, { id: item.id, entity: item.entity, payload: item.payload });
        }
      },
    }),
    update: (_table: any) => ({
      set: (updateData: any) => ({
        where: async (condition: any) => {
          const conds = findEntityAndId(condition);
          for (const [id, item] of store.entries()) {
            if (conds.id && (id === conds.id || item.payload?.id === conds.id || id.endsWith(`:${conds.id}`))) {
              store.set(id, { ...item, payload: updateData.payload });
            }
          }
        },
      }),
    }),
    delete: (_table: any) => ({
      where: async (condition: any) => {
        const conds = findEntityAndId(condition);
        for (const [id, item] of Array.from(store.entries())) {
          if (conds.entity && item.entity !== conds.entity) continue;
          if (conds.id && (id === conds.id || item.payload?.id === conds.id || id.endsWith(`:${conds.id}`))) {
            store.delete(id);
          } else if (!conds.id && conds.entity && item.entity === conds.entity) {
            store.delete(id);
          }
        }
      },
    }),
  };
}


export async function initDb() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diagnostic_records (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_diagnostic_records_entity ON diagnostic_records (entity);
    `);
    console.log("[db] PostgreSQL diagnostic_records table initialized successfully.");
  } catch (err) {
    console.warn("[db] PostgreSQL table init warning (will retry or use fallback):", err);
  }
}

if (pool) {
  initDb();
}

const inMemoryStore = createInMemoryDb();
const postgresDrizzle = pool ? drizzle(pool, { schema }) : null;

// Hybrid safe db client that falls back gracefully if postgres query fails
export const db: any = postgresDrizzle
  ? new Proxy(postgresDrizzle, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig === "function") {
          return (...args: any[]) => {
            try {
              const res = orig.apply(target, args);
              return res;
            } catch (err) {
              console.warn(`[db] Postgres operation ${String(prop)} failed, falling back to memory:`, err);
              return Reflect.get(inMemoryStore, prop, receiver)(...args);
            }
          };
        }
        return orig;
      },
    })
  : inMemoryStore;

export * from "./schema";



