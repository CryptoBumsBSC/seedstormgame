import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScoreSchema, insertPlayerSchema } from "@shared/schema";
import { verifyUSDCPayment } from "./blockchain";
import { sessionManager } from "./sessions";

const ENTRY_FEE = 1;
const REFERRAL_PERCENT = 0.10;
const TREASURY_ADDRESS = "0x1234567890123456789012345678901234567890";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Scores - only from verified sessions
  app.get("/api/scores", async (req, res) => {
    try {
      const scores = await storage.getScores();
      res.json(scores);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scores" });
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
      
      const existing = await storage.getPlayer(validatedData.walletAddress);
      if (existing) {
        return res.json(existing);
      }
      
      const player = await storage.createPlayer(validatedData);
      
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

  // SECURE: Create payment session with blockchain verification
  app.post("/api/sessions/create", async (req, res) => {
    try {
      const { walletAddress, txHash } = req.body;
      
      if (!walletAddress || !txHash) {
        return res.status(400).json({ error: "Missing wallet address or transaction hash" });
      }

      // Check if this transaction was already used
      if (sessionManager.isPaymentUsed(txHash)) {
        return res.status(400).json({ error: "This transaction has already been used" });
      }

      // Create session first (in pending state)
      const session = sessionManager.createSession(walletAddress, txHash);

      // Verify the payment on-chain
      const verification = await verifyUSDCPayment(
        txHash,
        walletAddress,
        TREASURY_ADDRESS,
        ENTRY_FEE
      );

      if (!verification.verified) {
        return res.status(400).json({ 
          error: verification.error || "Payment verification failed",
          sessionId: session.id,
          verified: false
        });
      }

      // Mark session as verified
      sessionManager.verifyPayment(session.id);

      // Update player stats
      await storage.updatePlayerStats(walletAddress, ENTRY_FEE);

      // Handle referral commission
      const player = await storage.getPlayer(walletAddress);
      if (player?.referredBy) {
        const referralAmount = ENTRY_FEE * REFERRAL_PERCENT;
        const poolAmount = ENTRY_FEE - referralAmount;
        await storage.addToPool(poolAmount);
        await storage.addReferralEarning(player.referredBy, referralAmount);
      } else {
        await storage.addToPool(ENTRY_FEE);
      }

      res.status(201).json({ 
        success: true, 
        sessionId: session.id,
        verified: true,
        message: "Payment verified! Ready to play."
      });
    } catch (error) {
      console.error("Session creation error:", error);
      res.status(500).json({ error: "Failed to create game session" });
    }
  });

  // SECURE: Start game with verified session
  app.post("/api/sessions/:sessionId/start", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found or expired" });
      }

      if (!session.paymentVerified) {
        return res.status(403).json({ error: "Payment not verified" });
      }

      if (session.gameStarted) {
        return res.status(400).json({ error: "Game already started" });
      }

      const started = sessionManager.startGame(sessionId);
      if (!started) {
        return res.status(400).json({ error: "Failed to start game" });
      }

      res.json({ success: true, message: "Game started!" });
    } catch (error) {
      res.status(500).json({ error: "Failed to start game" });
    }
  });

  // SECURE: End game and submit score with verified session
  app.post("/api/sessions/:sessionId/end", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { score, wave, playTime, playerName } = req.body;

      if (typeof score !== 'number' || typeof wave !== 'number') {
        return res.status(400).json({ error: "Invalid score data" });
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found or expired" });
      }

      if (!session.gameStarted) {
        return res.status(403).json({ error: "Game was not started" });
      }

      const ended = sessionManager.endGame(sessionId, score, wave);
      if (!ended) {
        return res.status(400).json({ error: "Failed to end game - possible tampering detected" });
      }

      // Get validated score from session
      const validatedScore = sessionManager.getValidatedScore(sessionId);
      if (!validatedScore) {
        return res.status(400).json({ error: "Score validation failed" });
      }

      // Save to database
      const savedScore = await storage.createScore({
        playerName: playerName || session.walletAddress.slice(0, 8),
        score: validatedScore.score,
        wave: validatedScore.wave,
        playTime: playTime || 0,
      });

      res.status(201).json({ 
        success: true, 
        score: savedScore,
        message: "Score recorded securely!"
      });
    } catch (error) {
      console.error("Score submission error:", error);
      res.status(500).json({ error: "Failed to submit score" });
    }
  });

  // Get session status
  app.get("/api/sessions/:sessionId", async (req, res) => {
    try {
      const session = sessionManager.getSession(req.params.sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({
        id: session.id,
        walletAddress: session.walletAddress,
        paymentVerified: session.paymentVerified,
        gameStarted: session.gameStarted,
        gameEnded: session.gameEnded,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
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

  // Legacy endpoint - redirect to new secure flow
  app.post("/api/scores", async (req, res) => {
    return res.status(403).json({ 
      error: "Direct score submission disabled. Use /api/sessions/:id/end" 
    });
  });

  app.post("/api/payments/entry", async (req, res) => {
    return res.status(403).json({ 
      error: "Use /api/sessions/create for secure payments" 
    });
  });

  return httpServer;
}
