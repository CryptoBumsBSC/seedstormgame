import { z } from "zod";

export const strainTypes = ["indica", "sativa", "hybrid"] as const;
export type StrainType = typeof strainTypes[number];

export const insertScoreSchema = z.object({
  playerName: z.string().min(1).max(10),
  score: z.number().int().min(0),
  wave: z.number().int().min(1),
  playTime: z.number().int().min(0),
});

export type InsertScore = z.infer<typeof insertScoreSchema>;

export interface Score extends InsertScore {
  id: string;
  createdAt: string;
}

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

export interface PlayerAccount {
  id: string;
  walletAddress: string;
  referredBy: string | null;
  totalSpent: number;
  totalEarnings: number;
  gamesPlayed: number;
  createdAt: string;
}

export interface Referral {
  id: string;
  referrerAddress: string;
  referredAddress: string;
  totalEarnings: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  walletAddress: string;
  amount: number;
  txHash: string;
  type: 'entry_fee' | 'prize' | 'referral';
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: string;
}

export interface WeeklyPrizePool {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalPool: number;
  distributed: boolean;
  winners: {
    first: string | null;
    second: string | null;
    third: string | null;
  };
}

export const insertPlayerSchema = z.object({
  walletAddress: z.string().min(42).max(42),
  referredBy: z.string().nullable(),
});

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export const insertPaymentSchema = z.object({
  walletAddress: z.string(),
  amount: z.number(),
  txHash: z.string(),
  type: z.enum(['entry_fee', 'prize', 'referral']),
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
