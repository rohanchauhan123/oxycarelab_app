import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const diagnosticRecordsTable = pgTable("diagnostic_records", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDiagnosticRecordSchema = createInsertSchema(diagnosticRecordsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertDiagnosticRecord = z.infer<typeof insertDiagnosticRecordSchema>;
export type DiagnosticRecord = typeof diagnosticRecordsTable.$inferSelect;