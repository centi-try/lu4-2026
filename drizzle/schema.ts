import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: text("passwordHash"),
  characterName: text("characterName"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["PENDING", "CONFIRMED", "SOLD"]).default("PENDING").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  quantitySoldInCycle: int("quantitySoldInCycle").default(0).notNull(),
  imageUrl: text("imageUrl"),
  mapperId: int("mapperId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const characters = mysqlTable("characters", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  userId: int("userId").notNull(),
  profitPerCycle: decimal("profitPerCycle", { precision: 10, scale: 2 }).default("0").notNull(),
  totalProfit: decimal("totalProfit", { precision: 10, scale: 2 }).default("0").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const itemCharacters = mysqlTable("itemCharacters", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  characterId: int("characterId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const salesCycles = mysqlTable("salesCycles", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate"),
  status: mysqlEnum("status", ["OPEN", "CLOSED"]).default("OPEN").notNull(),
  totalRevenue: decimal("totalRevenue", { precision: 10, scale: 2 }).default("0").notNull(),
  totalProfit: decimal("totalProfit", { precision: 10, scale: 2 }).default("0").notNull(),
  profitByCharacter: json("profitByCharacter").$type<Record<string, number>>(),
  itemsSold: json("itemsSold").$type<Array<{ itemId: number; quantity: number }>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  details: json("details").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;

export type SalesCycle = typeof salesCycles.$inferSelect;
export type InsertSalesCycle = typeof salesCycles.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
