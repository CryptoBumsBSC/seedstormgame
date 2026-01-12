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

export const allTimeScores = pgTable("all_time_scores", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  wave: integer("wave").notNull(),
  playTime: integer("play_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adClicks = pgTable("ad_clicks", {
  id: serial("id").primaryKey(),
  placement: text("placement").notNull(), // 'titleScreen' or 'gameOver'
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
});

// Telegram Stars Monetization Tables

export const telegramPlayers = pgTable("telegram_players", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"), // @username (may be null if user has no username)
  firstName: text("first_name"),
  lastName: text("last_name"),
  totalGamesPlayed: integer("total_games_played").default(0).notNull(),
  totalStarsSpent: integer("total_stars_spent").default(0).notNull(),
  totalStarsWon: integer("total_stars_won").default(0).notNull(),
  firstPlayedAt: timestamp("first_played_at").defaultNow().notNull(),
  lastPlayedAt: timestamp("last_played_at").defaultNow().notNull(),
});

export const playerInventory = pgTable("player_inventory", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  boostType: text("boost_type").notNull(), // 'side_guns' | 'machine_gun' | 'skip_storm'
  quantity: integer("quantity").default(0).notNull(),
});

export const starPurchases = pgTable("star_purchases", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  boostType: text("boost_type").notNull(),
  starsAmount: integer("stars_amount").notNull(),
  quantity: integer("quantity").notNull(),
  telegramPaymentId: text("telegram_payment_id").notNull().unique(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
});

export const dailyPrizePools = pgTable("daily_prize_pools", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(), // YYYY-MM-DD format
  totalStars: integer("total_stars").default(0).notNull(),
  ownerShare: integer("owner_share").default(0).notNull(),
  prizePool: integer("prize_pool").default(0).notNull(),
  distributed: boolean("distributed").default(false).notNull(),
  firstPlaceTelegramId: text("first_place_telegram_id"),
  secondPlaceTelegramId: text("second_place_telegram_id"),
  thirdPlaceTelegramId: text("third_place_telegram_id"),
  firstPrize: integer("first_prize").default(0),
  secondPrize: integer("second_prize").default(0),
  thirdPrize: integer("third_prize").default(0),
  randomWinners: text("random_winners"), // JSON array of telegram IDs
  randomPrizeEach: integer("random_prize_each").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const boostUsageLog = pgTable("boost_usage_log", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  boostType: text("boost_type").notNull(),
  gameSessionId: text("game_session_id").notNull(),
  lifeNumber: integer("life_number").notNull(),
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export const dailyScores = pgTable("daily_scores", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  wave: integer("wave").notNull(),
  playTime: integer("play_time").notNull(),
  usedBoosts: boolean("used_boosts").default(false).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const allTimeBoostedScores = pgTable("all_time_boosted_scores", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  wave: integer("wave").notNull(),
  playTime: integer("play_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const allTimePureScores = pgTable("all_time_pure_scores", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  wave: integer("wave").notNull(),
  playTime: integer("play_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod Schemas for validation
export const insertScoreSchema = createInsertSchema(scores).omit({ id: true, createdAt: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

export const insertAllTimeScoreSchema = createInsertSchema(allTimeScores).omit({ id: true, createdAt: true });
export type InsertAllTimeScore = z.infer<typeof insertAllTimeScoreSchema>;
export type AllTimeScore = typeof allTimeScores.$inferSelect;

export const insertAdClickSchema = createInsertSchema(adClicks).omit({ id: true, clickedAt: true });
export type InsertAdClick = z.infer<typeof insertAdClickSchema>;
export type AdClick = typeof adClicks.$inferSelect;

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

// Telegram Stars Types
export const boostTypes = ["extra_life", "shield_boost", "rapid_fire", "side_guns", "machine_gun", "skip_storm"] as const;
export type BoostType = typeof boostTypes[number];

export const insertTelegramPlayerSchema = z.object({
  telegramId: z.string(),
  username: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
});
export type InsertTelegramPlayer = z.infer<typeof insertTelegramPlayerSchema>;
export type TelegramPlayer = typeof telegramPlayers.$inferSelect;

export const insertPlayerInventorySchema = z.object({
  telegramId: z.string(),
  boostType: z.enum(boostTypes),
  quantity: z.number().default(0),
});
export type InsertPlayerInventory = z.infer<typeof insertPlayerInventorySchema>;
export type PlayerInventory = typeof playerInventory.$inferSelect;

export const insertStarPurchaseSchema = z.object({
  telegramId: z.string(),
  boostType: z.enum(boostTypes),
  starsAmount: z.number(),
  quantity: z.number(),
  telegramPaymentId: z.string(),
});
export type InsertStarPurchase = z.infer<typeof insertStarPurchaseSchema>;
export type StarPurchase = typeof starPurchases.$inferSelect;

export type DailyPrizePool = typeof dailyPrizePools.$inferSelect;
export type BoostUsageLog = typeof boostUsageLog.$inferSelect;

export const insertDailyScoreSchema = z.object({
  telegramId: z.string(),
  playerName: z.string(),
  score: z.number(),
  wave: z.number(),
  playTime: z.number(),
  usedBoosts: z.boolean().default(false),
  date: z.string(),
});
export type InsertDailyScore = z.infer<typeof insertDailyScoreSchema>;
export type DailyScore = typeof dailyScores.$inferSelect;

export type AllTimeBoostedScore = typeof allTimeBoostedScores.$inferSelect;
export type AllTimePureScore = typeof allTimePureScores.$inferSelect;

// Boost pricing and metadata
export const BOOST_PRICES = {
  extra_life: 3,      // +1 life instantly
  shield_boost: 3,    // 5 sec shield
  rapid_fire: 3,      // 5 sec rapid fire
  side_guns: 5,       // 5 sec side guns
  machine_gun: 10,    // 5 sec machine gun
  skip_storm: 20,     // Skip meteor storms for life
} as const;

export const BOOST_DURATIONS = {
  extra_life: 0,      // Instant effect
  shield_boost: 5,    // 5 seconds
  rapid_fire: 5,      // 5 seconds
  side_guns: 5,       // 5 seconds
  machine_gun: 5,     // 5 seconds
  skip_storm: 0,      // Lasts entire life
} as const;

export const MAX_BOOSTS_PER_LIFE = 3;

// Prize distribution constants
export const PRIZE_CONFIG = {
  MIN_THRESHOLD: 101, // Minimum stars for prizes to activate
  OWNER_PERCENT: 50,
  FIRST_PLACE_PERCENT: 25,
  SECOND_PLACE_PERCENT: 10,
  THIRD_PLACE_PERCENT: 5,
  RANDOM_PERCENT_EACH: 1,
  MAX_RANDOM_WINNERS: 10,
} as const;

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
