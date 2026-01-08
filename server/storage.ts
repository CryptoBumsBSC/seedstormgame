import { 
  scores,
  players,
  referrals,
  payments,
  weeklyPools,
  type Score,
  type InsertScore,
  type PlayerAccount,
  type InsertPlayer,
  type Payment,
  type InsertPayment,
  type Referral,
  type WeeklyPrizePool
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  getScores(): Promise<Score[]>;
  createScore(score: InsertScore): Promise<Score>;
  getTopScores(limit?: number): Promise<Score[]>;
  
  getPlayer(walletAddress: string): Promise<PlayerAccount | undefined>;
  createPlayer(player: InsertPlayer): Promise<PlayerAccount>;
  updatePlayerStats(walletAddress: string, spent: number): Promise<void>;
  
  getReferral(referredAddress: string): Promise<Referral | undefined>;
  getReferralsByReferrer(referrerAddress: string): Promise<Referral[]>;
  createReferral(referrerAddress: string, referredAddress: string): Promise<Referral>;
  addReferralEarning(referrerAddress: string, amount: number): Promise<void>;
  
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByWallet(walletAddress: string): Promise<Payment[]>;
  
  getCurrentWeekPool(): Promise<WeeklyPrizePool>;
  addToPool(amount: number): Promise<void>;
  getPendingReferralEarnings(walletAddress: string): Promise<number>;
}

function getWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - dayOfWeek);
  startOfWeek.setUTCHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);
  
  return { start: startOfWeek, end: endOfWeek };
}

export class DatabaseStorage implements IStorage {
  async getScores(): Promise<Score[]> {
    return await db.select().from(scores).orderBy(desc(scores.score));
  }

  async createScore(insertScore: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values(insertScore).returning();
    return score;
  }

  async getTopScores(limit: number = 10): Promise<Score[]> {
    return await db.select().from(scores).orderBy(desc(scores.score)).limit(limit);
  }

  async getPlayer(walletAddress: string): Promise<PlayerAccount | undefined> {
    const [player] = await db.select().from(players).where(eq(players.walletAddress, walletAddress.toLowerCase()));
    return player || undefined;
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<PlayerAccount> {
    const [player] = await db.insert(players).values({
      walletAddress: insertPlayer.walletAddress.toLowerCase(),
      referredBy: insertPlayer.referredBy?.toLowerCase() || null,
    }).returning();
    return player;
  }

  async updatePlayerStats(walletAddress: string, spent: number): Promise<void> {
    const player = await this.getPlayer(walletAddress);
    if (player) {
      await db.update(players)
        .set({ 
          totalSpent: player.totalSpent + spent,
          gamesPlayed: player.gamesPlayed + 1
        })
        .where(eq(players.walletAddress, walletAddress.toLowerCase()));
    }
  }

  async getReferral(referredAddress: string): Promise<Referral | undefined> {
    const [referral] = await db.select().from(referrals).where(eq(referrals.referredAddress, referredAddress.toLowerCase()));
    return referral || undefined;
  }

  async getReferralsByReferrer(referrerAddress: string): Promise<Referral[]> {
    return await db.select().from(referrals).where(eq(referrals.referrerAddress, referrerAddress.toLowerCase()));
  }

  async createReferral(referrerAddress: string, referredAddress: string): Promise<Referral> {
    const [referral] = await db.insert(referrals).values({
      referrerAddress: referrerAddress.toLowerCase(),
      referredAddress: referredAddress.toLowerCase(),
    }).returning();
    return referral;
  }

  async addReferralEarning(referrerAddress: string, amount: number): Promise<void> {
    const existing = await db.select().from(referrals).where(eq(referrals.referrerAddress, referrerAddress.toLowerCase()));
    if (existing.length > 0) {
      await db.update(referrals)
        .set({ totalEarnings: existing[0].totalEarnings + amount })
        .where(eq(referrals.referrerAddress, referrerAddress.toLowerCase()));
    }
  }

  async getPendingReferralEarnings(walletAddress: string): Promise<number> {
    const refs = await this.getReferralsByReferrer(walletAddress);
    return refs.reduce((sum, r) => sum + r.totalEarnings, 0);
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values({
      ...insertPayment,
      walletAddress: insertPayment.walletAddress.toLowerCase(),
      status: 'confirmed',
    }).returning();
    return payment;
  }

  async getPaymentsByWallet(walletAddress: string): Promise<Payment[]> {
    return await db.select().from(payments).where(eq(payments.walletAddress, walletAddress.toLowerCase()));
  }

  async getCurrentWeekPool(): Promise<WeeklyPrizePool> {
    const { start, end } = getWeekBounds();
    
    const [existing] = await db.select().from(weeklyPools)
      .where(and(
        gte(weeklyPools.weekStart, start),
        lte(weeklyPools.weekEnd, end)
      ));
    
    if (existing) return existing;

    const [pool] = await db.insert(weeklyPools).values({
      weekStart: start,
      weekEnd: end,
    }).returning();
    
    return pool;
  }

  async addToPool(amount: number): Promise<void> {
    const pool = await this.getCurrentWeekPool();
    await db.update(weeklyPools)
      .set({ totalPool: pool.totalPool + amount })
      .where(eq(weeklyPools.id, pool.id));
  }
}

export const storage = new DatabaseStorage();
