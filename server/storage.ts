import { 
  scores,
  players,
  referrals,
  payments,
  weeklyPools,
  allTimeScores,
  adClicks,
  telegramPlayers,
  playerInventory,
  starPurchases,
  dailyPrizePools,
  boostUsageLog,
  dailyScores,
  allTimeBoostedScores,
  allTimePureScores,
  type Score,
  type InsertScore,
  type PlayerAccount,
  type InsertPlayer,
  type Payment,
  type InsertPayment,
  type Referral,
  type WeeklyPrizePool,
  type AllTimeScore,
  type InsertAllTimeScore,
  type AdClick,
  type InsertAdClick,
  type TelegramPlayer,
  type InsertTelegramPlayer,
  type PlayerInventory,
  type InsertPlayerInventory,
  type StarPurchase,
  type InsertStarPurchase,
  type DailyPrizePool,
  type DailyScore,
  type InsertDailyScore,
  type AllTimeBoostedScore,
  type AllTimePureScore,
  type BoostType,
  BOOST_PRICES,
  PRIZE_CONFIG,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, sql, count, ne } from "drizzle-orm";

export interface IStorage {
  getScores(): Promise<Score[]>;
  getScoresWithStats(): Promise<(Score & { pointsPerSecond: number })[]>;
  createScore(score: InsertScore): Promise<Score>;
  deleteScore(id: number): Promise<boolean>;
  getTopScores(limit?: number): Promise<Score[]>;
  getDailyScores(): Promise<Score[]>;
  
  getAllTimeScores(): Promise<AllTimeScore[]>;
  updateAllTimeScores(score: InsertAllTimeScore): Promise<void>;
  
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
  
  trackAdClick(placement: string): Promise<AdClick>;
  getAdStats(): Promise<{ titleScreen: number; gameOver: number }>;
  
  // Telegram Stars Methods
  getTelegramPlayer(telegramId: string): Promise<TelegramPlayer | undefined>;
  createOrUpdateTelegramPlayer(player: InsertTelegramPlayer): Promise<TelegramPlayer>;
  getAllTelegramPlayers(): Promise<TelegramPlayer[]>;
  incrementPlayerGames(telegramId: string): Promise<void>;
  banPlayerByUsername(username: string): Promise<{ success: boolean; message: string }>;
  unbanPlayerByUsername(username: string): Promise<{ success: boolean; message: string }>;
  isPlayerBanned(telegramId: string): Promise<boolean>;
  
  getPlayerInventory(telegramId: string): Promise<PlayerInventory[]>;
  addToInventory(telegramId: string, boostType: BoostType, quantity: number): Promise<void>;
  useFromInventory(telegramId: string, boostType: BoostType, quantity: number): Promise<boolean>;
  
  recordStarPurchase(purchase: InsertStarPurchase): Promise<StarPurchase>;
  getPlayerPurchases(telegramId: string): Promise<StarPurchase[]>;
  
  getTodayPrizePool(): Promise<DailyPrizePool>;
  addToDailyPool(starsAmount: number): Promise<void>;
  distributeDailyPrizes(date: string): Promise<void>;
  
  createDailyScore(score: InsertDailyScore): Promise<DailyScore>;
  getDailyScoresByDate(date: string): Promise<DailyScore[]>;
  getPlayersWhoPlayedToday(date: string): Promise<string[]>;
  
  updateAllTimeBoostedScores(telegramId: string, playerName: string, score: number, wave: number, playTime: number): Promise<void>;
  updateAllTimePureScores(telegramId: string, playerName: string, score: number, wave: number, playTime: number): Promise<void>;
  getAllTimeBoostedScores(): Promise<AllTimeBoostedScore[]>;
  getAllTimePureScores(): Promise<AllTimePureScore[]>;
  
  // Admin stats
  getRevenueStats(): Promise<{
    totalStarsSpent: number;
    todayStarsSpent: number;
    ownerEarnings: number;
    todayOwnerEarnings: number;
    totalPlayers: number;
    activePlayers: number;
    purchaseBreakdown: { extra_life: number; shield_boost: number; rapid_fire: number; side_guns: number; machine_gun: number; skip_storm: number };
  }>;
  getPrizePoolInfo(date: string): Promise<{
    date: string;
    totalSpent: number;
    prizePool: number;
    ownerShare: number;
    thresholdMet: boolean;
    distributed: boolean;
  }>;
  
  // Classic leaderboard management
  clearClassicLeaderboard(): Promise<void>;
  
  // Manual payout
  sendManualPayout(telegramId: string, starsAmount: number): Promise<void>;
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

  async getScoresWithStats(): Promise<(Score & { pointsPerSecond: number })[]> {
    const allScores = await db.select().from(scores).orderBy(desc(scores.score));
    return allScores.map(s => ({
      ...s,
      pointsPerSecond: s.playTime > 0 ? s.score / (s.playTime / 1000) : 0
    }));
  }

  async createScore(insertScore: InsertScore): Promise<Score> {
    const [score] = await db.insert(scores).values(insertScore).returning();
    return score;
  }

  async deleteScore(id: number): Promise<boolean> {
    const result = await db.delete(scores).where(eq(scores.id, id));
    return true;
  }

  async getTopScores(limit: number = 10): Promise<Score[]> {
    return await db.select().from(scores).orderBy(desc(scores.score)).limit(limit);
  }

  async getDailyScores(): Promise<Score[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return await db.select().from(scores)
      .where(gte(scores.createdAt, today))
      .orderBy(desc(scores.score));
  }

  async getAllTimeScores(): Promise<AllTimeScore[]> {
    return await db.select().from(allTimeScores).orderBy(desc(allTimeScores.score)).limit(3);
  }

  async updateAllTimeScores(newScore: InsertAllTimeScore): Promise<void> {
    const currentTop3 = await this.getAllTimeScores();
    
    // Check if this score qualifies for top 3
    if (currentTop3.length < 3 || newScore.score > currentTop3[currentTop3.length - 1].score) {
      // Add the new score
      await db.insert(allTimeScores).values(newScore);
      
      // If we now have more than 3, remove the lowest
      const updatedTop = await db.select().from(allTimeScores).orderBy(desc(allTimeScores.score));
      if (updatedTop.length > 3) {
        // Delete all scores beyond top 3
        for (let i = 3; i < updatedTop.length; i++) {
          await db.delete(allTimeScores).where(eq(allTimeScores.id, updatedTop[i].id));
        }
      }
    }
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

  async trackAdClick(placement: string): Promise<AdClick> {
    // Normalize placement to ensure consistent storage
    const normalizedPlacement = placement === 'titleScreen' ? 'titleScreen' : 'gameOver';
    const [click] = await db.insert(adClicks).values({ placement: normalizedPlacement }).returning();
    return click;
  }

  async getAdStats(): Promise<{ titleScreen: number; gameOver: number }> {
    // Use SQL aggregation for efficient counting
    const result = await db
      .select({ 
        placement: adClicks.placement, 
        clickCount: count() 
      })
      .from(adClicks)
      .groupBy(adClicks.placement);
    
    // Map results to expected format with defaults
    const stats = { titleScreen: 0, gameOver: 0 };
    for (const row of result) {
      if (row.placement === 'titleScreen') stats.titleScreen = Number(row.clickCount);
      if (row.placement === 'gameOver') stats.gameOver = Number(row.clickCount);
    }
    return stats;
  }

  // Telegram Stars Methods

  async getTelegramPlayer(telegramId: string): Promise<TelegramPlayer | undefined> {
    const [player] = await db.select().from(telegramPlayers).where(eq(telegramPlayers.telegramId, telegramId));
    return player || undefined;
  }

  async createOrUpdateTelegramPlayer(player: InsertTelegramPlayer): Promise<TelegramPlayer> {
    const existing = await this.getTelegramPlayer(player.telegramId);
    if (existing) {
      await db.update(telegramPlayers)
        .set({ 
          username: player.username || existing.username,
          firstName: player.firstName || existing.firstName,
          lastName: player.lastName || existing.lastName,
          lastPlayedAt: new Date()
        })
        .where(eq(telegramPlayers.telegramId, player.telegramId));
      return (await this.getTelegramPlayer(player.telegramId))!;
    }
    const [newPlayer] = await db.insert(telegramPlayers).values({
      telegramId: player.telegramId,
      username: player.username || null,
      firstName: player.firstName || null,
      lastName: player.lastName || null,
    }).returning();
    return newPlayer;
  }

  async getAllTelegramPlayers(): Promise<TelegramPlayer[]> {
    return await db.select().from(telegramPlayers).orderBy(desc(telegramPlayers.lastPlayedAt));
  }

  async incrementPlayerGames(telegramId: string): Promise<void> {
    const player = await this.getTelegramPlayer(telegramId);
    if (player) {
      await db.update(telegramPlayers)
        .set({ 
          totalGamesPlayed: player.totalGamesPlayed + 1,
          lastPlayedAt: new Date()
        })
        .where(eq(telegramPlayers.telegramId, telegramId));
    }
  }

  async getPlayerInventory(telegramId: string): Promise<PlayerInventory[]> {
    return await db.select().from(playerInventory).where(eq(playerInventory.telegramId, telegramId));
  }

  async addToInventory(telegramId: string, boostType: BoostType, quantity: number): Promise<void> {
    const [existing] = await db.select().from(playerInventory)
      .where(and(eq(playerInventory.telegramId, telegramId), eq(playerInventory.boostType, boostType)));
    
    if (existing) {
      await db.update(playerInventory)
        .set({ quantity: existing.quantity + quantity })
        .where(eq(playerInventory.id, existing.id));
    } else {
      await db.insert(playerInventory).values({ telegramId, boostType, quantity });
    }
  }

  async useFromInventory(telegramId: string, boostType: BoostType, quantity: number): Promise<boolean> {
    const [existing] = await db.select().from(playerInventory)
      .where(and(eq(playerInventory.telegramId, telegramId), eq(playerInventory.boostType, boostType)));
    
    if (!existing || existing.quantity < quantity) {
      return false;
    }
    
    await db.update(playerInventory)
      .set({ quantity: existing.quantity - quantity })
      .where(eq(playerInventory.id, existing.id));
    return true;
  }

  async recordStarPurchase(purchase: InsertStarPurchase): Promise<StarPurchase> {
    const [record] = await db.insert(starPurchases).values(purchase).returning();
    
    // Update player stats
    const player = await this.getTelegramPlayer(purchase.telegramId);
    if (player) {
      await db.update(telegramPlayers)
        .set({ totalStarsSpent: player.totalStarsSpent + purchase.starsAmount })
        .where(eq(telegramPlayers.telegramId, purchase.telegramId));
    }
    
    return record;
  }

  async getPlayerPurchases(telegramId: string): Promise<StarPurchase[]> {
    return await db.select().from(starPurchases)
      .where(eq(starPurchases.telegramId, telegramId))
      .orderBy(desc(starPurchases.purchasedAt));
  }

  async getTodayPrizePool(): Promise<DailyPrizePool> {
    const today = new Date().toISOString().split('T')[0];
    const [existing] = await db.select().from(dailyPrizePools).where(eq(dailyPrizePools.date, today));
    
    if (existing) return existing;
    
    const [pool] = await db.insert(dailyPrizePools).values({ date: today }).returning();
    return pool;
  }

  async addToDailyPool(starsAmount: number): Promise<void> {
    const pool = await this.getTodayPrizePool();
    const ownerShare = Math.floor(starsAmount * (PRIZE_CONFIG.OWNER_PERCENT / 100));
    const prizeAmount = starsAmount - ownerShare;
    
    await db.update(dailyPrizePools)
      .set({ 
        totalStars: pool.totalStars + starsAmount,
        ownerShare: pool.ownerShare + ownerShare,
        prizePool: pool.prizePool + prizeAmount
      })
      .where(eq(dailyPrizePools.id, pool.id));
  }

  async distributeDailyPrizes(date: string): Promise<void> {
    const [pool] = await db.select().from(dailyPrizePools).where(eq(dailyPrizePools.date, date));
    if (!pool || pool.distributed) return;
    
    // Check minimum threshold
    if (pool.totalStars < PRIZE_CONFIG.MIN_THRESHOLD) {
      // All goes to owner - mark as distributed
      await db.update(dailyPrizePools)
        .set({ distributed: true })
        .where(eq(dailyPrizePools.id, pool.id));
      return;
    }
    
    // Get top 3 scores for this day
    const topScores = await db.select().from(dailyScores)
      .where(eq(dailyScores.date, date))
      .orderBy(desc(dailyScores.score))
      .limit(3);
    
    const totalPrize = pool.prizePool;
    const firstPrize = Math.floor(totalPrize * (PRIZE_CONFIG.FIRST_PLACE_PERCENT / 50));
    const secondPrize = Math.floor(totalPrize * (PRIZE_CONFIG.SECOND_PLACE_PERCENT / 50));
    const thirdPrize = Math.floor(totalPrize * (PRIZE_CONFIG.THIRD_PLACE_PERCENT / 50));
    
    // Get random players
    const allPlayers = await this.getPlayersWhoPlayedToday(date);
    const topPlayerIds = topScores.map(s => s.telegramId);
    const eligibleForRandom = allPlayers.filter(id => !topPlayerIds.includes(id));
    const randomWinners = eligibleForRandom.sort(() => Math.random() - 0.5).slice(0, PRIZE_CONFIG.MAX_RANDOM_WINNERS);
    const randomPrizeEach = randomWinners.length > 0 ? Math.floor(totalPrize * (PRIZE_CONFIG.RANDOM_PERCENT_EACH / 50)) : 0;
    
    await db.update(dailyPrizePools)
      .set({
        distributed: true,
        firstPlaceTelegramId: topScores[0]?.telegramId || null,
        secondPlaceTelegramId: topScores[1]?.telegramId || null,
        thirdPlaceTelegramId: topScores[2]?.telegramId || null,
        firstPrize: topScores[0] ? firstPrize : 0,
        secondPrize: topScores[1] ? secondPrize : 0,
        thirdPrize: topScores[2] ? thirdPrize : 0,
        randomWinners: JSON.stringify(randomWinners),
        randomPrizeEach,
      })
      .where(eq(dailyPrizePools.id, pool.id));
    
    // Update player earnings
    if (topScores[0]) {
      await this.addPlayerEarnings(topScores[0].telegramId, firstPrize);
    }
    if (topScores[1]) {
      await this.addPlayerEarnings(topScores[1].telegramId, secondPrize);
    }
    if (topScores[2]) {
      await this.addPlayerEarnings(topScores[2].telegramId, thirdPrize);
    }
    for (const winnerId of randomWinners) {
      await this.addPlayerEarnings(winnerId, randomPrizeEach);
    }
    
    // Clear classic leaderboard after distribution
    await this.clearClassicLeaderboard();
    console.log(`[STORAGE] Daily prizes distributed for ${date}, classic leaderboard cleared`);
  }

  private async addPlayerEarnings(telegramId: string, amount: number): Promise<void> {
    const player = await this.getTelegramPlayer(telegramId);
    if (player) {
      await db.update(telegramPlayers)
        .set({ totalStarsWon: player.totalStarsWon + amount })
        .where(eq(telegramPlayers.telegramId, telegramId));
    }
  }

  async createDailyScore(score: InsertDailyScore): Promise<DailyScore> {
    const [newScore] = await db.insert(dailyScores).values(score).returning();
    return newScore;
  }

  async getDailyScoresByDate(date: string): Promise<DailyScore[]> {
    return await db.select().from(dailyScores)
      .where(eq(dailyScores.date, date))
      .orderBy(desc(dailyScores.score));
  }

  async getPlayersWhoPlayedToday(date: string): Promise<string[]> {
    const scores = await db.select({ telegramId: dailyScores.telegramId })
      .from(dailyScores)
      .where(eq(dailyScores.date, date));
    return Array.from(new Set(scores.map(s => s.telegramId)));
  }

  async updateAllTimeBoostedScores(telegramId: string, playerName: string, score: number, wave: number, playTime: number): Promise<void> {
    const currentTop3 = await this.getAllTimeBoostedScores();
    
    if (currentTop3.length < 3 || score > currentTop3[currentTop3.length - 1].score) {
      await db.insert(allTimeBoostedScores).values({ telegramId, playerName, score, wave, playTime });
      
      const updatedTop = await db.select().from(allTimeBoostedScores).orderBy(desc(allTimeBoostedScores.score));
      if (updatedTop.length > 3) {
        for (let i = 3; i < updatedTop.length; i++) {
          await db.delete(allTimeBoostedScores).where(eq(allTimeBoostedScores.id, updatedTop[i].id));
        }
      }
    }
  }

  async updateAllTimePureScores(telegramId: string, playerName: string, score: number, wave: number, playTime: number): Promise<void> {
    const currentTop3 = await this.getAllTimePureScores();
    
    if (currentTop3.length < 3 || score > currentTop3[currentTop3.length - 1].score) {
      await db.insert(allTimePureScores).values({ telegramId, playerName, score, wave, playTime });
      
      const updatedTop = await db.select().from(allTimePureScores).orderBy(desc(allTimePureScores.score));
      if (updatedTop.length > 3) {
        for (let i = 3; i < updatedTop.length; i++) {
          await db.delete(allTimePureScores).where(eq(allTimePureScores.id, updatedTop[i].id));
        }
      }
    }
  }

  async getAllTimeBoostedScores(): Promise<AllTimeBoostedScore[]> {
    return await db.select().from(allTimeBoostedScores).orderBy(desc(allTimeBoostedScores.score)).limit(3);
  }

  async getAllTimePureScores(): Promise<AllTimePureScore[]> {
    return await db.select().from(allTimePureScores).orderBy(desc(allTimePureScores.score)).limit(3);
  }

  async getRevenueStats(): Promise<{
    totalStarsSpent: number;
    todayStarsSpent: number;
    ownerEarnings: number;
    todayOwnerEarnings: number;
    totalPlayers: number;
    activePlayers: number;
    purchaseBreakdown: { extra_life: number; shield_boost: number; rapid_fire: number; side_guns: number; machine_gun: number; skip_storm: number };
  }> {
    const today = new Date().toISOString().split('T')[0];
    
    const allPurchases = await db.select().from(starPurchases);
    const todayPurchases = allPurchases.filter(p => 
      new Date(p.purchasedAt).toISOString().split('T')[0] === today
    );
    
    const totalStarsSpent = allPurchases.reduce((sum, p) => sum + p.starsAmount, 0);
    const todayStarsSpent = todayPurchases.reduce((sum, p) => sum + p.starsAmount, 0);
    
    const allPlayers = await db.select().from(telegramPlayers);
    const activePlayers = allPlayers.filter(p => 
      p.lastPlayedAt && new Date(p.lastPlayedAt).toISOString().split('T')[0] === today
    ).length;
    
    const purchaseBreakdown = {
      extra_life: allPurchases.filter(p => p.boostType === 'extra_life').length,
      shield_boost: allPurchases.filter(p => p.boostType === 'shield_boost').length,
      rapid_fire: allPurchases.filter(p => p.boostType === 'rapid_fire').length,
      side_guns: allPurchases.filter(p => p.boostType === 'side_guns').length,
      machine_gun: allPurchases.filter(p => p.boostType === 'machine_gun').length,
      skip_storm: allPurchases.filter(p => p.boostType === 'skip_storm').length,
    };
    
    return {
      totalStarsSpent,
      todayStarsSpent,
      ownerEarnings: Math.floor(totalStarsSpent * 0.5),
      todayOwnerEarnings: Math.floor(todayStarsSpent * 0.5),
      totalPlayers: allPlayers.length,
      activePlayers,
      purchaseBreakdown,
    };
  }

  async getPrizePoolInfo(date: string): Promise<{
    date: string;
    totalSpent: number;
    prizePool: number;
    ownerShare: number;
    thresholdMet: boolean;
    distributed: boolean;
  }> {
    const pool = await db.select().from(dailyPrizePools).where(eq(dailyPrizePools.date, date));
    
    if (pool.length === 0) {
      return {
        date,
        totalSpent: 0,
        prizePool: 0,
        ownerShare: 0,
        thresholdMet: false,
        distributed: false,
      };
    }
    
    const poolData = pool[0];
    const totalSpent = poolData.totalStars;
    const ownerShare = Math.floor(totalSpent * 0.5);
    const prizePool = totalSpent - ownerShare;
    
    return {
      date,
      totalSpent,
      prizePool,
      ownerShare,
      thresholdMet: totalSpent >= 30,
      distributed: poolData.distributed,
    };
  }

  async clearClassicLeaderboard(): Promise<void> {
    await db.delete(scores);
    console.log("[STORAGE] Classic leaderboard cleared");
  }

  async sendManualPayout(telegramId: string, starsAmount: number): Promise<void> {
    await this.addPlayerEarnings(telegramId, starsAmount);
    console.log(`[STORAGE] Manual payout of ${starsAmount} Stars to ${telegramId}`);
  }

  async banPlayerByUsername(username: string): Promise<{ success: boolean; message: string }> {
    const cleanUsername = username.replace('@', '').toLowerCase();
    const players = await db.select().from(telegramPlayers);
    const player = players.find(p => p.username?.toLowerCase() === cleanUsername);
    
    if (!player) {
      return { success: false, message: `Player @${cleanUsername} not found` };
    }
    
    if (player.banned) {
      return { success: false, message: `Player @${cleanUsername} is already banned` };
    }
    
    await db.update(telegramPlayers)
      .set({ banned: true })
      .where(eq(telegramPlayers.telegramId, player.telegramId));
    
    console.log(`[STORAGE] Banned player @${cleanUsername} (ID: ${player.telegramId})`);
    return { success: true, message: `Player @${cleanUsername} has been banned` };
  }

  async unbanPlayerByUsername(username: string): Promise<{ success: boolean; message: string }> {
    const cleanUsername = username.replace('@', '').toLowerCase();
    const players = await db.select().from(telegramPlayers);
    const player = players.find(p => p.username?.toLowerCase() === cleanUsername);
    
    if (!player) {
      return { success: false, message: `Player @${cleanUsername} not found` };
    }
    
    if (!player.banned) {
      return { success: false, message: `Player @${cleanUsername} is not banned` };
    }
    
    await db.update(telegramPlayers)
      .set({ banned: false })
      .where(eq(telegramPlayers.telegramId, player.telegramId));
    
    console.log(`[STORAGE] Unbanned player @${cleanUsername} (ID: ${player.telegramId})`);
    return { success: true, message: `Player @${cleanUsername} has been unbanned` };
  }

  async isPlayerBanned(telegramId: string): Promise<boolean> {
    const player = await this.getTelegramPlayer(telegramId);
    return player?.banned ?? false;
  }
}

export const storage = new DatabaseStorage();
