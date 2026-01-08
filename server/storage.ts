import { 
  type Score, 
  type InsertScore,
  type PlayerAccount,
  type InsertPlayer,
  type Payment,
  type InsertPayment,
  type Referral,
  type WeeklyPrizePool
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Scores
  getScores(): Promise<Score[]>;
  createScore(score: InsertScore): Promise<Score>;
  getTopScores(limit?: number): Promise<Score[]>;
  
  // Players
  getPlayer(walletAddress: string): Promise<PlayerAccount | undefined>;
  createPlayer(player: InsertPlayer): Promise<PlayerAccount>;
  updatePlayerStats(walletAddress: string, spent: number): Promise<void>;
  
  // Referrals
  getReferral(referredAddress: string): Promise<Referral | undefined>;
  getReferralsByReferrer(referrerAddress: string): Promise<Referral[]>;
  createReferral(referrerAddress: string, referredAddress: string): Promise<Referral>;
  addReferralEarning(referrerAddress: string, amount: number): Promise<void>;
  
  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentsByWallet(walletAddress: string): Promise<Payment[]>;
  
  // Prize Pool
  getCurrentWeekPool(): Promise<WeeklyPrizePool>;
  addToPool(amount: number): Promise<void>;
  getPendingReferralEarnings(walletAddress: string): Promise<number>;
}

function getWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(now.getUTCDate() - dayOfWeek);
  startOfWeek.setUTCHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 7);
  
  return {
    start: startOfWeek.toISOString(),
    end: endOfWeek.toISOString(),
  };
}

export class MemStorage implements IStorage {
  private scores: Map<string, Score>;
  private players: Map<string, PlayerAccount>;
  private referrals: Map<string, Referral>;
  private payments: Map<string, Payment>;
  private weeklyPool: WeeklyPrizePool;
  private pendingReferralEarnings: Map<string, number>;

  constructor() {
    this.scores = new Map();
    this.players = new Map();
    this.referrals = new Map();
    this.payments = new Map();
    this.pendingReferralEarnings = new Map();
    
    const { start, end } = getWeekBounds();
    this.weeklyPool = {
      id: randomUUID(),
      weekStart: start,
      weekEnd: end,
      totalPool: 0,
      distributed: false,
      winners: { first: null, second: null, third: null },
    };
  }

  // Scores
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

  // Players
  async getPlayer(walletAddress: string): Promise<PlayerAccount | undefined> {
    return this.players.get(walletAddress.toLowerCase());
  }

  async createPlayer(insertPlayer: InsertPlayer): Promise<PlayerAccount> {
    const id = randomUUID();
    const player: PlayerAccount = {
      id,
      walletAddress: insertPlayer.walletAddress.toLowerCase(),
      referredBy: insertPlayer.referredBy?.toLowerCase() || null,
      totalSpent: 0,
      totalEarnings: 0,
      gamesPlayed: 0,
      createdAt: new Date().toISOString(),
    };
    this.players.set(player.walletAddress, player);
    return player;
  }

  async updatePlayerStats(walletAddress: string, spent: number): Promise<void> {
    const player = await this.getPlayer(walletAddress);
    if (player) {
      player.totalSpent += spent;
      player.gamesPlayed += 1;
      this.players.set(walletAddress.toLowerCase(), player);
    }
  }

  // Referrals
  async getReferral(referredAddress: string): Promise<Referral | undefined> {
    return Array.from(this.referrals.values()).find(
      r => r.referredAddress === referredAddress.toLowerCase()
    );
  }

  async getReferralsByReferrer(referrerAddress: string): Promise<Referral[]> {
    return Array.from(this.referrals.values()).filter(
      r => r.referrerAddress === referrerAddress.toLowerCase()
    );
  }

  async createReferral(referrerAddress: string, referredAddress: string): Promise<Referral> {
    const id = randomUUID();
    const referral: Referral = {
      id,
      referrerAddress: referrerAddress.toLowerCase(),
      referredAddress: referredAddress.toLowerCase(),
      totalEarnings: 0,
      createdAt: new Date().toISOString(),
    };
    this.referrals.set(id, referral);
    return referral;
  }

  async addReferralEarning(referrerAddress: string, amount: number): Promise<void> {
    const current = this.pendingReferralEarnings.get(referrerAddress.toLowerCase()) || 0;
    this.pendingReferralEarnings.set(referrerAddress.toLowerCase(), current + amount);
    
    // Also update the referral record total
    const referrals = await this.getReferralsByReferrer(referrerAddress);
    // Update total earnings on referral records
  }

  async getPendingReferralEarnings(walletAddress: string): Promise<number> {
    return this.pendingReferralEarnings.get(walletAddress.toLowerCase()) || 0;
  }

  // Payments
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const payment: Payment = {
      id,
      ...insertPayment,
      walletAddress: insertPayment.walletAddress.toLowerCase(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPaymentsByWallet(walletAddress: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(
      p => p.walletAddress === walletAddress.toLowerCase()
    );
  }

  // Prize Pool
  async getCurrentWeekPool(): Promise<WeeklyPrizePool> {
    const { start, end } = getWeekBounds();
    
    // Check if we need a new week
    if (this.weeklyPool.weekEnd !== end) {
      this.weeklyPool = {
        id: randomUUID(),
        weekStart: start,
        weekEnd: end,
        totalPool: 0,
        distributed: false,
        winners: { first: null, second: null, third: null },
      };
    }
    
    return this.weeklyPool;
  }

  async addToPool(amount: number): Promise<void> {
    const pool = await this.getCurrentWeekPool();
    pool.totalPool += amount;
  }
}

export const storage = new MemStorage();
