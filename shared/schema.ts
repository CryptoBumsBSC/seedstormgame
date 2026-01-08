import { z } from "zod";
import { pgTable, text, integer, boolean, timestamp, real, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const strainTypes = ["indica", "sativa", "hybrid"] as const;
export type StrainType = typeof strainTypes[number];

// Database Tables
export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  wave: integer("wave").notNull(),
  playTime: integer("play_time").notNull(),
  walletAddress: text("wallet_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),
  referredBy: text("referred_by"),
  totalSpent: real("total_spent").default(0).notNull(),
  totalEarnings: real("total_earnings").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerAddress: text("referrer_address").notNull(),
  referredAddress: text("referred_address").notNull().unique(),
  totalEarnings: real("total_earnings").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  amount: real("amount").notNull(),
  txHash: text("tx_hash").notNull().unique(),
  type: text("type").notNull(), // 'entry_fee' | 'prize' | 'referral'
  status: text("status").notNull(), // 'pending' | 'confirmed' | 'failed'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const weeklyPools = pgTable("weekly_pools", {
  id: serial("id").primaryKey(),
  weekStart: timestamp("week_start").notNull(),
  weekEnd: timestamp("week_end").notNull(),
  totalPool: real("total_pool").default(0).notNull(),
  distributed: boolean("distributed").default(false).notNull(),
  firstPlace: text("first_place"),
  secondPlace: text("second_place"),
  thirdPlace: text("third_place"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod Schemas for validation
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true, createdAt: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

export const insertPlayerSchema = z.object({
  walletAddress: z.string().min(42).max(42),
  referredBy: z.string().nullable(),
});
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type PlayerAccount = typeof players.$inferSelect;

export const insertPaymentSchema = z.object({
  walletAddress: z.string(),
  amount: z.number(),
  txHash: z.string(),
  type: z.enum(['entry_fee', 'prize', 'referral']),
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export type Referral = typeof referrals.$inferSelect;
export type WeeklyPrizePool = typeof weeklyPools.$inferSelect;

// Game Types (client-side only)
export interface GameState {
  score: number;
  lives: number;
  wave: number;
  gameTime: number;
  isPlaying: boolean;
  isPaused: boolean;
  isGameOver: boolean;
}

export interface PlayerSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  strain: StrainType;
  speed: number;
  shootCooldown: number;
  points: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  isPlayerBullet: boolean;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}
