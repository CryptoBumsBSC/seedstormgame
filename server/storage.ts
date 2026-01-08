import { type Score, type InsertScore } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getScores(): Promise<Score[]>;
  createScore(score: InsertScore): Promise<Score>;
  getTopScores(limit?: number): Promise<Score[]>;
}

export class MemStorage implements IStorage {
  private scores: Map<string, Score>;

  constructor() {
    this.scores = new Map();
  }

  async getScores(): Promise<Score[]> {
    return Array.from(this.scores.values()).sort((a, b) => b.score - a.score);
  }

  async createScore(insertScore: InsertScore): Promise<Score> {
    const id = randomUUID();
    const score: Score = { 
      ...insertScore, 
      id,
      createdAt: new Date().toISOString()
    };
    this.scores.set(id, score);
    return score;
  }

  async getTopScores(limit: number = 10): Promise<Score[]> {
    const allScores = await this.getScores();
    return allScores.slice(0, limit);
  }
}

export const storage = new MemStorage();
