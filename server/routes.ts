import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScoreSchema, insertPlayerSchema } from "@shared/schema";
import { verifyUSDCPayment } from "./blockchain";
import { sessionManager } from "./sessions";
import { validatePlayerName, validateScore, checkRateLimit, getClientIdentifier } from "./profanityFilter";
import path from "path";
import fs from "fs";

const ENTRY_FEE = 1;
const REFERRAL_PERCENT = 0.10;
const TREASURY_ADDRESS = "0x1234567890123456789012345678901234567890";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Serve banner image for Telegram (must be exactly 640x360)
  app.get("/banner.png", (req, res) => {
    const filePath = path.resolve(process.cwd(), "attached_assets/generated_images/seed_storm_telegram_640x360.png");
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  });

  // Community rules page
  app.get("/rules", (req, res) => {
    const filePath = path.resolve(process.cwd(), "public/community-rules.html");
    res.sendFile(filePath);
  });

  // Complete game guide page
  app.get("/game-guide", (req, res) => {
    const filePath = path.resolve(process.cwd(), "client/public/game-guide.html");
    res.sendFile(filePath);
  });

  // Download page for banner (640x360 for Telegram)
  app.get("/download", (req, res) => {
    const filePath = path.resolve(process.cwd(), "attached_assets/generated_images/seed_storm_telegram_640x360.png");
    const imageData = fs.readFileSync(filePath).toString('base64');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Download Banner</title></head>
      <body style="background:#000;color:#fff;text-align:center;padding:20px;font-family:sans-serif;">
        <h1>SEED STORM Banner</h1>
        <p>630 x 350 pixels</p>
        <img src="data:image/png;base64,${imageData}" style="border:2px solid #0f0;margin:20px;"/>
        <br/>
        <a href="data:image/png;base64,${imageData}" download="seed_storm_banner.png" 
           style="display:inline-block;padding:15px 30px;background:#0f0;color:#000;text-decoration:none;font-weight:bold;border-radius:5px;">
           DOWNLOAD IMAGE
        </a>
        <p style="margin-top:20px;">Long-press image or click button to save</p>
      </body>
      </html>
    `);
  });

  // Scores - GET all scores
  app.get("/api/scores", async (req, res) => {
    try {
      const scores = await storage.getScores();
      res.json(scores);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scores" });
    }
  });

  // All-time scores - GET top 3 all-time scores
  app.get("/api/scores/all-time", async (req, res) => {
    try {
      const allTimeScores = await storage.getAllTimeScores();
      res.json(allTimeScores);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch all-time scores" });
    }
  });

  // Scores - POST new score (free to play mode) with security checks
  app.post("/api/scores", async (req, res) => {
    try {
      const { playerName, score, wave, playTime } = req.body;
      
      if (!playerName || typeof score !== "number" || typeof wave !== "number") {
        return res.status(400).json({ error: "Invalid score data" });
      }
      
      // Rate limiting - 1 score per 10 seconds per client
      const clientId = getClientIdentifier(req);
      const rateCheck = checkRateLimit(clientId);
      if (!rateCheck.allowed) {
        return res.status(429).json({ 
          error: `Please wait ${rateCheck.waitTime} seconds before submitting again` 
        });
      }
      
      // Validate player name (profanity filter)
      const nameCheck = validatePlayerName(playerName);
      if (!nameCheck.valid) {
        return res.status(400).json({ error: nameCheck.error });
      }
      
      // Validate score is realistic for play time
      const scoreCheck = validateScore(score, playTime || 0);
      if (!scoreCheck.valid) {
        return res.status(400).json({ error: scoreCheck.error });
      }
      
      const scoreData = {
        playerName: playerName.slice(0, 10).toUpperCase(),
        score,
        wave,
        playTime: playTime || 0,
      };
      
      const newScore = await storage.createScore(scoreData);
      
      // Also update all-time leaderboard if this qualifies
      await storage.updateAllTimeScores(scoreData);
      
      res.status(201).json(newScore);
    } catch (error) {
      console.error("Score submission error:", error);
      res.status(500).json({ error: "Failed to save score" });
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

  // DEMO: Create free demo session for testing (no payment required)
  app.post("/api/sessions/demo", async (req, res) => {
    try {
      const demoWallet = "0xDEMO" + Date.now().toString(16).padStart(36, "0");
      const demoTxHash = "0xdemo" + Date.now().toString(16).padStart(60, "0");
      
      const session = sessionManager.createSession(demoWallet, demoTxHash);
      sessionManager.verifyPayment(session.id);
      
      res.status(201).json({ 
        success: true, 
        sessionId: session.id,
        verified: true,
        message: "Demo mode - Free play!"
      });
    } catch (error) {
      console.error("Demo session error:", error);
      res.status(500).json({ error: "Failed to create demo session" });
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

  app.post("/api/payments/entry", async (req, res) => {
    return res.status(403).json({ 
      error: "Use /api/sessions/create for secure payments" 
    });
  });

  // Ad click tracking
  app.post("/api/ad-click", async (req, res) => {
    try {
      const { placement } = req.body;
      if (!placement || !['titleScreen', 'gameOver'].includes(placement)) {
        return res.status(400).json({ error: "Invalid placement" });
      }
      await storage.trackAdClick(placement);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to track click" });
    }
  });

  // Ad stats (view click counts)
  app.get("/api/ad-stats", async (req, res) => {
    try {
      const stats = await storage.getAdStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ad stats" });
    }
  });

  // Admin: Get all scores with stats (points per second)
  app.get("/api/admin/scores", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const scoresWithStats = await storage.getScoresWithStats();
      res.json(scoresWithStats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scores" });
    }
  });

  // Admin: Delete a score by ID
  app.delete("/api/admin/scores/:id", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid score ID" });
      }
      await storage.deleteScore(id);
      res.json({ success: true, message: "Score deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete score" });
    }
  });

  // Daily scores endpoint
  app.get("/api/scores/daily", async (req, res) => {
    try {
      const dailyScores = await storage.getDailyScores();
      res.json(dailyScores);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch daily scores" });
    }
  });

  return httpServer;
}
