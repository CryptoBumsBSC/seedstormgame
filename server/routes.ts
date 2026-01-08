import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScoreSchema, insertPlayerSchema, insertPaymentSchema } from "@shared/schema";

const ENTRY_FEE = 1;
const REFERRAL_PERCENT = 0.10;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Scores
  app.get("/api/scores", async (req, res) => {
    try {
      const scores = await storage.getScores();
      res.json(scores);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scores" });
    }
  });

  app.post("/api/scores", async (req, res) => {
    try {
      const validatedData = insertScoreSchema.parse(req.body);
      const score = await storage.createScore(validatedData);
      res.status(201).json(score);
    } catch (error) {
      res.status(400).json({ error: "Invalid score data" });
    }
  });

  // Players
  app.get("/api/players/:address", async (req, res) => {
    try {
      const player = await storage.getPlayer(req.params.address);
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const validatedData = insertPlayerSchema.parse(req.body);
      
      // Check if player already exists
      const existing = await storage.getPlayer(validatedData.walletAddress);
      if (existing) {
        return res.json(existing);
      }
      
      // Create new player
      const player = await storage.createPlayer(validatedData);
      
      // Create referral relationship if referrer exists
      if (validatedData.referredBy) {
        const referrer = await storage.getPlayer(validatedData.referredBy);
        if (referrer) {
          await storage.createReferral(validatedData.referredBy, validatedData.walletAddress);
        }
      }
      
      res.status(201).json(player);
    } catch (error) {
      res.status(400).json({ error: "Invalid player data" });
    }
  });

  // Payments - Record entry fee payment
  app.post("/api/payments/entry", async (req, res) => {
    try {
      const { walletAddress, txHash } = req.body;
      
      if (!walletAddress || !txHash) {
        return res.status(400).json({ error: "Missing wallet address or transaction hash" });
      }
      
      // Record the payment
      const payment = await storage.createPayment({
        walletAddress,
        amount: ENTRY_FEE,
        txHash,
        type: 'entry_fee',
      });
      
      // Update player stats
      await storage.updatePlayerStats(walletAddress, ENTRY_FEE);
      
      // Add to prize pool (90% goes to pool, 10% to referrer if exists)
      const player = await storage.getPlayer(walletAddress);
      if (player?.referredBy) {
        const referralAmount = ENTRY_FEE * REFERRAL_PERCENT;
        const poolAmount = ENTRY_FEE - referralAmount;
        await storage.addToPool(poolAmount);
        await storage.addReferralEarning(player.referredBy, referralAmount);
      } else {
        await storage.addToPool(ENTRY_FEE);
      }
      
      res.status(201).json({ success: true, payment });
    } catch (error) {
      res.status(500).json({ error: "Failed to record payment" });
    }
  });

  // Get referral stats
  app.get("/api/referrals/:address", async (req, res) => {
    try {
      const referrals = await storage.getReferralsByReferrer(req.params.address);
      const pendingEarnings = await storage.getPendingReferralEarnings(req.params.address);
      
      res.json({
        referralCount: referrals.length,
        referrals,
        pendingEarnings,
        referralLink: `?ref=${req.params.address}`,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch referral stats" });
    }
  });

  // Get prize pool info
  app.get("/api/pool", async (req, res) => {
    try {
      const pool = await storage.getCurrentWeekPool();
      const topScores = await storage.getTopScores(3);
      
      res.json({
        ...pool,
        topPlayers: topScores,
        prizeBreakdown: {
          first: pool.totalPool * 0.30,
          second: pool.totalPool * 0.15,
          third: pool.totalPool * 0.05,
          house: pool.totalPool * 0.40,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pool info" });
    }
  });

  return httpServer;
}
