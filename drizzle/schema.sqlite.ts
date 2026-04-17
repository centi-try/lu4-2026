import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").unique(),
  name: text("name"),
  email: text("email").unique(),
  loginMethod: text("loginMethod"),
  passwordHash: text("passwordHash"),
  characterName: text("characterName"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updatedAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSignedIn: text("lastSignedIn").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  status: text("status", { enum: ["PENDING", "CONFIRMED", "SOLD"] }).default("PENDING").notNull(),
  price: real("price").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  quantitySoldInCycle: integer("quantitySoldInCycle").default(0).notNull(),
  imageUrl: text("imageUrl"),
  mapperId: integer("mapperId").notNull(),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updatedAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  userId: integer("userId").notNull(),
  profitPerCycle: real("profitPerCycle").default(0).notNull(),
  totalProfit: real("totalProfit").default(0).notNull(),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updatedAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const itemCharacters = sqliteTable("itemCharacters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("itemId").notNull(),
  characterId: integer("characterId").notNull(),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const salesCycles = sqliteTable("salesCycles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("startDate").notNull(),
  endDate: text("endDate"),
  status: text("status", { enum: ["OPEN", "CLOSED"] }).default("OPEN").notNull(),
  totalRevenue: real("totalRevenue").default(0).notNull(),
  totalProfit: real("totalProfit").default(0).notNull(),
  profitByCharacter: text("profitByCharacter", { mode: 'json' }),
  itemsSold: text("itemsSold", { mode: 'json' }),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: text("updatedAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const auditLogs = sqliteTable("auditLogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  action: text("action").notNull(),
  details: text("details", { mode: 'json' }),
  createdAt: text("createdAt").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
