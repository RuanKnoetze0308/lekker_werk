import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

// PostgreSQL 18 ships uuidv7(): time-ordered ids keep b-tree inserts sequential on big tables.
export const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
