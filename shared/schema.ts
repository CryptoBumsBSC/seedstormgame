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

export interface Player {
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
