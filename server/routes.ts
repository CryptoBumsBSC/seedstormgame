import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScoreSchema, insertPlayerSchema, BOOST_PRICES, boostTypes, type BoostType } from "@shared/schema";
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

  // Download all guide images as ZIP
  app.get("/download-guide", (req, res) => {
    const filePath = path.resolve(process.cwd(), "client/public/seed_storm_guide.zip");
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=seed_storm_guide.zip');
    res.sendFile(filePath);
  });

  // Game guide images download page
  app.get("/guide-images", (req, res) => {
    const images = [
      { name: "1-cover", file: "game_guide_cover_page.png", title: "Cover Page" },
      { name: "2-controls", file: "controls_instruction_page.png", title: "Controls" },
      { name: "3-enemies", file: "enemies_guide_page.png", title: "Enemies" },
      { name: "4-hazards", file: "hazards_warning_page.png", title: "Hazards" },
      { name: "5-powerups", file: "power-ups_guide_page.png", title: "Power-Ups" },
      { name: "6-special", file: "special_items_guide_page.png", title: "Special Items" },
      { name: "7-tips", file: "tips_and_strategy_page.png", title: "Tips & Strategy" }
    ];
    
    let html = `<!DOCTYPE html><html><head><title>SEED STORM Guide Images</title>
      <style>
        body { background: #0a0a0f; color: #0f0; font-family: monospace; padding: 20px; text-align: center; }
        h1 { color: #0ff; text-shadow: 0 0 10px #0ff; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .card { background: #1a1a2e; border: 2px solid #ff00ff; border-radius: 10px; padding: 15px; }
        .card img { max-width: 100%; border: 2px solid #0f0; }
        .card h3 { color: #ff0; margin: 10px 0; }
        a.btn { display: inline-block; background: #0f0; color: #000; padding: 10px 20px; text-decoration: none; font-weight: bold; border-radius: 5px; margin-top: 10px; }
        a.btn:hover { background: #0ff; }
      </style>
    </head><body>
      <h1>SEED STORM - Game Guide Images</h1>
      <p>Click each image to download</p>
      <div class="grid">`;
    
    images.forEach(img => {
      const imgPath = path.resolve(process.cwd(), `attached_assets/generated_images/${img.file}`);
      if (fs.existsSync(imgPath)) {
        const imageData = fs.readFileSync(imgPath).toString('base64');
        html += `<div class="card">
          <h3>${img.title}</h3>
          <img src="data:image/png;base64,${imageData}" alt="${img.title}"/>
          <br/><a class="btn" href="data:image/png;base64,${imageData}" download="seed_storm_${img.name}.png">DOWNLOAD</a>
        </div>`;
      }
    });
    
    html += `</div></body></html>`;
    res.send(html);
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
      
      // Also add to daily scores so web players appear on same leaderboard
      const today = new Date().toISOString().split('T')[0];
      await storage.createDailyScore({
        telegramId: "WEB_" + Date.now().toString(),
        playerName: scoreData.playerName,
        score,
        wave,
        playTime: playTime || 0,
        usedBoosts: false,
        date: today,
      });
      
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

  // ============================================
  // TELEGRAM STARS MONETIZATION ENDPOINTS
  // ============================================

  // Get or create Telegram player
  app.post("/api/telegram/player", async (req, res) => {
    try {
      const { telegramId, username, firstName, lastName } = req.body;
      if (!telegramId) {
        return res.status(400).json({ error: "Missing telegramId" });
      }
      const player = await storage.createOrUpdateTelegramPlayer({
        telegramId,
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
      });
      res.json(player);
    } catch (error) {
      console.error("Telegram player error:", error);
      res.status(500).json({ error: "Failed to create/update player" });
    }
  });

  // Check if player is banned
  app.get("/api/telegram/banned/:telegramId", async (req, res) => {
    try {
      const banned = await storage.isPlayerBanned(req.params.telegramId);
      res.json({ banned });
    } catch (error) {
      res.status(500).json({ error: "Failed to check ban status" });
    }
  });

  // Get player inventory
  app.get("/api/telegram/inventory/:telegramId", async (req, res) => {
    try {
      const inventory = await storage.getPlayerInventory(req.params.telegramId);
      // Format as object with boost types as keys - include ALL boost types
      const inventoryMap: Record<string, number> = {
        extra_life: 0,
        shield_boost: 0,
        rapid_fire: 0,
        side_guns: 0,
        machine_gun: 0,
        skip_storm: 0,
      };
      inventory.forEach(item => {
        inventoryMap[item.boostType] = item.quantity;
      });
      res.json(inventoryMap);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });

  // Get boost prices
  app.get("/api/telegram/boost-prices", (req, res) => {
    res.json(BOOST_PRICES);
  });

  // Avatar Routes
  
  // Get player's owned avatars
  app.get("/api/telegram/avatars/:telegramId", async (req, res) => {
    try {
      const avatars = await storage.getPlayerAvatars(req.params.telegramId);
      const selectedAvatar = await storage.getPlayerSelectedAvatar(req.params.telegramId);
      res.json({ avatars: avatars.map(a => a.avatarType), selectedAvatar });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch avatars" });
    }
  });

  // Purchase an avatar
  app.post("/api/telegram/avatar/purchase", async (req, res) => {
    try {
      const { telegramId, avatarType, telegramPaymentId } = req.body;
      
      if (!telegramId || !avatarType || !telegramPaymentId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const { avatarTypes, AVATAR_PRICE } = await import("@shared/schema");
      
      if (!avatarTypes.includes(avatarType)) {
        return res.status(400).json({ error: "Invalid avatar type" });
      }
      
      // Record purchase as a star purchase
      await storage.recordStarPurchase({
        telegramId,
        boostType: `avatar_${avatarType}` as any,
        starsAmount: AVATAR_PRICE,
        quantity: 1,
        telegramPaymentId,
      });
      
      // Add avatar to player's collection
      const result = await storage.purchaseAvatar(telegramId, avatarType);
      
      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }
      
      // Add to daily prize pool
      await storage.addToDailyPool(AVATAR_PRICE);
      
      res.json({ success: true, message: result.message });
    } catch (error) {
      console.error("Avatar purchase error:", error);
      res.status(500).json({ error: "Failed to purchase avatar" });
    }
  });

  // Set selected avatar
  app.post("/api/telegram/avatar/select", async (req, res) => {
    try {
      const { telegramId, avatarType } = req.body;
      
      if (!telegramId) {
        return res.status(400).json({ error: "Missing telegramId" });
      }
      
      const success = await storage.setSelectedAvatar(telegramId, avatarType || null);
      
      if (!success) {
        return res.status(400).json({ error: "You don't own this avatar" });
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to set avatar" });
    }
  });

  // Record Star purchase and add to inventory
  app.post("/api/telegram/purchase", async (req, res) => {
    try {
      const { telegramId, boostType, quantity, telegramPaymentId } = req.body;
      
      if (!telegramId || !boostType || !quantity || !telegramPaymentId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      if (!boostTypes.includes(boostType)) {
        return res.status(400).json({ error: "Invalid boost type" });
      }
      
      const starsAmount = BOOST_PRICES[boostType as BoostType] * quantity;
      
      // Record purchase
      const purchase = await storage.recordStarPurchase({
        telegramId,
        boostType,
        starsAmount,
        quantity,
        telegramPaymentId,
      });
      
      // Add to inventory
      await storage.addToInventory(telegramId, boostType as BoostType, quantity);
      
      // Add to daily prize pool
      await storage.addToDailyPool(starsAmount);
      
      res.json({ success: true, purchase });
    } catch (error) {
      console.error("Purchase error:", error);
      res.status(500).json({ error: "Failed to record purchase" });
    }
  });

  // Use boosts from inventory (before game start)
  app.post("/api/telegram/use-boosts", async (req, res) => {
    try {
      const { telegramId, boosts } = req.body;
      // boosts is an object like { side_guns: 2, machine_gun: 1, skip_storm: 0 }
      
      if (!telegramId || !boosts) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const results: Record<string, boolean> = {};
      
      for (const [boostType, quantity] of Object.entries(boosts)) {
        if (boostTypes.includes(boostType as BoostType) && typeof quantity === 'number' && quantity > 0) {
          const success = await storage.useFromInventory(telegramId, boostType as BoostType, quantity);
          results[boostType] = success;
        }
      }
      
      res.json({ success: true, results });
    } catch (error) {
      res.status(500).json({ error: "Failed to use boosts" });
    }
  });

  // Submit Telegram score (with boost tracking)
  app.post("/api/telegram/score", async (req, res) => {
    try {
      const { telegramId, playerName, score, wave, playTime, usedBoosts } = req.body;
      
      if (!telegramId || typeof score !== 'number' || typeof wave !== 'number') {
        return res.status(400).json({ error: "Invalid score data" });
      }
      
      const today = new Date().toISOString().split('T')[0];
      
      // Create daily score
      const dailyScore = await storage.createDailyScore({
        telegramId,
        playerName: (playerName || 'PLAYER').slice(0, 10).toUpperCase(),
        score,
        wave,
        playTime: playTime || 0,
        usedBoosts: !!usedBoosts,
        date: today,
      });
      
      // Update all-time leaderboards
      if (usedBoosts) {
        await storage.updateAllTimeBoostedScores(telegramId, dailyScore.playerName, score, wave, playTime || 0);
      } else {
        await storage.updateAllTimePureScores(telegramId, dailyScore.playerName, score, wave, playTime || 0);
      }
      
      // Increment games played
      await storage.incrementPlayerGames(telegramId);
      
      res.json({ success: true, score: dailyScore });
    } catch (error) {
      console.error("Score submission error:", error);
      res.status(500).json({ error: "Failed to submit score" });
    }
  });

  // Get daily leaderboard (with boost icons and avatars)
  app.get("/api/telegram/leaderboard/daily", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const scores = await storage.getDailyScoresByDate(today);
      
      // Add avatar data to each score
      const scoresWithAvatars = await Promise.all(
        scores.slice(0, 50).map(async (score) => {
          const avatar = await storage.getPlayerSelectedAvatar(score.telegramId);
          return { ...score, avatar };
        })
      );
      
      res.json(scoresWithAvatars);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch daily leaderboard" });
    }
  });

  // Get all-time boosted leaderboard (BLAZED LEGENDS)
  app.get("/api/telegram/leaderboard/boosted", async (req, res) => {
    try {
      const scores = await storage.getAllTimeBoostedScores();
      
      // Add avatar data to each score
      const scoresWithAvatars = await Promise.all(
        scores.map(async (score) => {
          const avatar = await storage.getPlayerSelectedAvatar(score.telegramId);
          return { ...score, avatar };
        })
      );
      
      res.json(scoresWithAvatars);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch boosted leaderboard" });
    }
  });

  // Get all-time pure leaderboard (MR NATURAL)
  app.get("/api/telegram/leaderboard/pure", async (req, res) => {
    try {
      const scores = await storage.getAllTimePureScores();
      
      // Add avatar data to each score
      const scoresWithAvatars = await Promise.all(
        scores.map(async (score) => {
          const avatar = await storage.getPlayerSelectedAvatar(score.telegramId);
          return { ...score, avatar };
        })
      );
      
      res.json(scoresWithAvatars);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pure leaderboard" });
    }
  });

  // Get today's prize pool info
  app.get("/api/telegram/prize-pool", async (req, res) => {
    try {
      const pool = await storage.getTodayPrizePool();
      res.json(pool);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prize pool" });
    }
  });

  // Admin: Get all Telegram players
  app.get("/api/admin/telegram-players", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const players = await storage.getAllTelegramPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Telegram players" });
    }
  });

  // Admin: Get all Telegram players (alternate path for admin panel)
  app.get("/api/admin/telegram/players", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const players = await storage.getAllTelegramPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Telegram players" });
    }
  });

  // Admin: Get revenue statistics
  app.get("/api/admin/telegram/revenue", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const revenue = await storage.getRevenueStats();
      res.json(revenue);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch revenue stats" });
    }
  });

  // Admin: Get today's prize pool info
  app.get("/api/admin/telegram/prize-pool", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const today = new Date().toISOString().split('T')[0];
      const pool = await storage.getPrizePoolInfo(today);
      res.json(pool);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch prize pool" });
    }
  });

  // Admin: Distribute daily prizes (run at end of day)
  app.post("/api/admin/distribute-prizes", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split('T')[0];
      await storage.distributeDailyPrizes(targetDate);
      res.json({ success: true, message: `Prizes distributed for ${targetDate}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to distribute prizes" });
    }
  });

  // Admin: Distribute daily prizes (alternate path)
  app.post("/api/admin/telegram/distribute-prizes", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const today = new Date().toISOString().split('T')[0];
      await storage.distributeDailyPrizes(today);
      res.json({ success: true, message: `Prizes distributed for ${today}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to distribute prizes" });
    }
  });

  // ============ TELEGRAM STARS PAYMENTS ============

  // Create invoice link for purchasing boosts with Telegram Stars
  app.post("/api/telegram/create-invoice", async (req, res) => {
    try {
      const { telegramId, boostType, quantity } = req.body;
      
      if (!telegramId || !boostType || !quantity || quantity < 1) {
        return res.status(400).json({ error: "Invalid request data" });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const price = BOOST_PRICES[boostType as BoostType];
      if (!price) {
        return res.status(400).json({ error: "Invalid boost type" });
      }

      const totalStars = price * quantity;
      
      const boostNames: Record<BoostType, string> = {
        extra_life: "Extra Life Boost",
        shield_boost: "Shield Boost",
        rapid_fire: "Rapid Fire Boost",
        side_guns: "Side Guns Boost",
        machine_gun: "Machine Gun Boost", 
        skip_storm: "Skip Storm Boost",
      };

      const boostDescriptions: Record<BoostType, string> = {
        extra_life: "Start with an extra life",
        shield_boost: "5 second shield at start of life",
        rapid_fire: "5 second rapid fire at start of life",
        side_guns: "5 second side guns at start of life",
        machine_gun: "5 second machine guns at start of life",
        skip_storm: "No meteor showers (SEED STORM) for that life",
      };

      const url = `https://api.telegram.org/bot${botToken}/createInvoiceLink`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${boostNames[boostType as BoostType]} x${quantity}`,
          description: boostDescriptions[boostType as BoostType],
          payload: JSON.stringify({ 
            telegramId, 
            boostType, 
            quantity,
            timestamp: Date.now()
          }),
          provider_token: '', // Empty for Telegram Stars
          currency: 'XTR', // Telegram Stars
          prices: [{ amount: totalStars, label: `${quantity}x ${boostNames[boostType as BoostType]}` }]
        })
      });

      const data = await response.json();
      
      if (!data.ok) {
        console.error("Telegram invoice error:", data);
        return res.status(500).json({ error: "Failed to create invoice" });
      }

      res.json({ 
        invoiceUrl: data.result,
        totalStars,
        boostType,
        quantity
      });
    } catch (error) {
      console.error("Invoice creation error:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  // Create invoice for avatar purchase with Telegram Stars
  app.post("/api/telegram/create-avatar-invoice", async (req, res) => {
    try {
      const { telegramId, avatarType } = req.body;
      const { avatarTypes, AVATAR_PRICE } = await import("@shared/schema");
      
      if (!telegramId || !avatarType) {
        return res.status(400).json({ error: "Invalid request data" });
      }

      if (!avatarTypes.includes(avatarType)) {
        return res.status(400).json({ error: "Invalid avatar type" });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({ error: "Payment system not configured" });
      }

      const avatarNames: Record<string, string> = {
        leaf: "Cannabis Leaf",
        bud: "Purple Bud",
        joint: "Lit Joint",
        bong: "Blue Bong",
        flame: "Fire Flame",
        smoke: "Smoke Cloud",
        seed: "Cannabis Seed",
        crown: "Golden Crown",
      };

      const url = `https://api.telegram.org/bot${botToken}/createInvoiceLink`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${avatarNames[avatarType] || avatarType} Avatar`,
          description: "Show off your style on the leaderboard!",
          payload: JSON.stringify({ 
            telegramId, 
            avatarType,
            type: 'avatar',
            timestamp: Date.now()
          }),
          provider_token: '',
          currency: 'XTR',
          prices: [{ amount: AVATAR_PRICE, label: avatarNames[avatarType] || avatarType }]
        })
      });

      const data = await response.json();
      
      if (!data.ok) {
        console.error("Telegram avatar invoice error:", data);
        return res.status(500).json({ error: "Failed to create invoice" });
      }

      res.json({ 
        invoiceUrl: data.result,
        totalStars: AVATAR_PRICE,
        avatarType
      });
    } catch (error) {
      console.error("Avatar invoice creation error:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  // Webhook handler for Telegram payment confirmations and bot commands
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      const update = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      
      // Debug logging - log all incoming webhook updates
      console.log("[WEBHOOK] Received update:", JSON.stringify(update, null, 2));
      
      // Handle pre-checkout query (must be answered within 10 seconds)
      if (update.pre_checkout_query) {
        console.log("[WEBHOOK] Pre-checkout query received:", update.pre_checkout_query.id);
        if (!botToken) {
          console.error("[WEBHOOK] Bot token not configured!");
          return res.status(500).json({ error: "Bot not configured" });
        }
        
        // Accept the pre-checkout
        const preCheckoutResult = await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pre_checkout_query_id: update.pre_checkout_query.id,
            ok: true
          })
        });
        console.log("[WEBHOOK] Pre-checkout answer result:", await preCheckoutResult.json());
        
        return res.json({ ok: true });
      }
      
      // Handle successful payment
      if (update.message?.successful_payment) {
        console.log("[WEBHOOK] Successful payment received!");
        const payment = update.message.successful_payment;
        console.log("[WEBHOOK] Payment details:", JSON.stringify(payment, null, 2));
        
        let payload;
        try {
          payload = JSON.parse(payment.invoice_payload);
          console.log("[WEBHOOK] Parsed payload:", payload);
        } catch (parseError) {
          console.error("[WEBHOOK] Failed to parse payload:", payment.invoice_payload, parseError);
          return res.status(400).json({ error: "Invalid payload" });
        }
        
        const { telegramId, boostType, quantity } = payload;
        console.log(`[WEBHOOK] Processing: ${quantity}x ${boostType} for user ${telegramId}`);
        
        // Record the purchase in database
        try {
          const purchase = await storage.recordStarPurchase({
            telegramId,
            boostType,
            quantity,
            starsAmount: payment.total_amount,
            telegramPaymentId: payment.telegram_payment_charge_id,
          });
          console.log("[WEBHOOK] Purchase recorded:", purchase);
          
          // Add boosts to player inventory
          await storage.addToInventory(telegramId, boostType, quantity);
          console.log("[WEBHOOK] Inventory updated");
          
          // Add stars to today's prize pool
          await storage.addToDailyPool(payment.total_amount);
          console.log("[WEBHOOK] Prize pool updated");
          
          console.log(`[WEBHOOK] Payment success: ${quantity}x ${boostType} for user ${telegramId}, ${payment.total_amount} Stars`);
          
          return res.json({ ok: true, purchase });
        } catch (storageError) {
          console.error("[WEBHOOK] Storage error:", storageError);
          return res.status(500).json({ error: "Storage failed" });
        }
      }
      
      // Handle bot commands
      if (update.message?.text && botToken) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const gameUrl = "https://t.me/SeedStormBot/seedstorm";
        
        let replyText = "";
        let replyMarkup = null;
        
        if (text === "/start" || text.startsWith("/start ")) {
          replyText = `🌿 *SEED STORM* 🌿

Welcome to the ultimate cannabis arcade shooter!

Play as Dudley Bud and blast through waves of enemy buds. Collect power-ups, avoid hazards, and compete for the daily prize pool!

🎮 Tap the button below to play!`;
          replyMarkup = {
            inline_keyboard: [[{ text: "🎮 PLAY NOW", url: gameUrl }]]
          };
        } else if (text === "/play") {
          replyText = `🎮 Ready to play SEED STORM?

Tap below to launch the game!`;
          replyMarkup = {
            inline_keyboard: [[{ text: "🎮 LAUNCH GAME", url: gameUrl }]]
          };
        } else if (text === "/shop") {
          replyText = `🛒 *BOOST SHOP*

Buy boosts with Telegram Stars:

❤️ Extra Life - 3⭐
🛡️ Shield (5s) - 3⭐
⚡ Rapid Fire (5s) - 3⭐
🔫 Side Guns (5s) - 5⭐
💥 Machine Gun (5s) - 10⭐
🌀 Skip Storm - 20⭐

Open the game and tap SHOP to purchase!`;
          replyMarkup = {
            inline_keyboard: [[{ text: "🛒 OPEN SHOP", url: gameUrl }]]
          };
        } else if (text === "/leaderboard") {
          // Fetch top 5 from daily leaderboard
          const dailyScores = await storage.getDailyScores();
          const top5 = dailyScores.slice(0, 5);
          
          let lbText = "🏆 *TODAY'S TOP 5*\n\n";
          if (top5.length === 0) {
            lbText += "No scores yet today. Be the first!";
          } else {
            top5.forEach((score, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
              lbText += `${medal} ${score.playerName} - ${score.score} pts\n`;
            });
          }
          replyText = lbText;
          replyMarkup = {
            inline_keyboard: [[{ text: "📊 FULL LEADERBOARD", url: gameUrl }]]
          };
        } else if (text === "/help") {
          replyText = `📖 *HOW TO PLAY*

🎯 *Objective*
Survive waves of enemy buds and get the highest score!

🕹️ *Controls*
• Arrow keys or touch buttons to move
• Space or fire button to shoot

👾 *Enemies*
• Purple (Indica) - 1 hit = 1 pt
• Green (Sativa) - 2 hits = 2 pts  
• Orange (Hybrid) - 3 hits = 3 pts

⚡ *Power-Ups*
Collect dropped items for speed, damage, rapid fire, or extra lives!

🏆 *Daily Prizes*
Top 3 players share 40% of daily Stars spent!

Tap below to start playing!`;
          replyMarkup = {
            inline_keyboard: [[{ text: "🎮 PLAY NOW", url: gameUrl }]]
          };
        } else if (text === "/affiliate") {
          replyText = `💰 *AFFILIATE PROGRAM*

Earn 10% commission on every Telegram Stars purchase made by players you refer!

*How to become an affiliate:*

1️⃣ Open Telegram *Settings*
2️⃣ Go to *My Stars* → *Earn Stars*
3️⃣ Find *@SeedStormBot* in the list
4️⃣ Tap *Join* to get your unique link
5️⃣ Share your link with friends!

When someone clicks your link and buys Stars boosts, you automatically receive 10% of their purchase.

*Example:*
Player buys 10⭐ of boosts → You earn 1⭐

No limits on earnings! The more you share, the more you earn.`;
        } else if (text?.startsWith("/ban ")) {
          const parts = text.split(" ");
          if (parts.length < 3) {
            replyText = "❌ Usage: /ban PASSWORD @username";
          } else {
            const password = parts[1];
            const username = parts[2];
            const adminPassword = process.env.ADMIN_PASSWORD;
            
            if (!adminPassword || password !== adminPassword) {
              replyText = "❌ Invalid admin password";
            } else {
              const result = await storage.banPlayerByUsername(username);
              if (result.success) {
                replyText = `🚫 ${result.message}`;
              } else {
                replyText = `❌ ${result.message}`;
              }
            }
          }
        } else if (text?.startsWith("/unban ")) {
          const parts = text.split(" ");
          if (parts.length < 3) {
            replyText = "❌ Usage: /unban PASSWORD @username";
          } else {
            const password = parts[1];
            const username = parts[2];
            const adminPassword = process.env.ADMIN_PASSWORD;
            
            if (!adminPassword || password !== adminPassword) {
              replyText = "❌ Invalid admin password";
            } else {
              const result = await storage.unbanPlayerByUsername(username);
              if (result.success) {
                replyText = `✅ ${result.message}`;
              } else {
                replyText = `❌ ${result.message}`;
              }
            }
          }
        }
        
        // Send reply if we have one
        if (replyText) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: replyText,
              parse_mode: "Markdown",
              reply_markup: replyMarkup
            })
          });
        }
      }
      
      res.json({ ok: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Setup Telegram webhook (call once after deploying)
  app.post("/api/telegram/setup-webhook", async (req, res) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
      }
      
      // Get the host from the request or use the production URL
      const host = req.headers.host || "galaga-clone--oscarjameshardi.replit.app";
      const webhookUrl = `https://${host}/api/telegram/webhook`;
      
      const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "pre_checkout_query"]
        })
      });
      
      const data = await response.json();
      console.log("Webhook setup result:", data);
      
      if (data.ok) {
        res.json({ success: true, webhookUrl, message: "Webhook registered successfully" });
      } else {
        res.status(500).json({ error: "Failed to set webhook", details: data });
      }
    } catch (error) {
      console.error("Webhook setup error:", error);
      res.status(500).json({ error: "Failed to setup webhook" });
    }
  });

  // Check current webhook status
  app.get("/api/telegram/webhook-info", async (req, res) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
      }
      
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Webhook info error:", error);
      res.status(500).json({ error: "Failed to get webhook info" });
    }
  });

  // Sync inventory after WebApp.openInvoice returns 'paid'
  // NOTE: This endpoint is READ-ONLY - actual inventory updates happen in webhook
  // This just returns the current inventory so client can sync after payment
  app.post("/api/telegram/confirm-payment", async (req, res) => {
    try {
      const { telegramId } = req.body;
      
      if (!telegramId) {
        return res.status(400).json({ error: "Missing telegramId" });
      }
      
      // Only return current inventory - all modifications happen via webhook
      const inventory = await storage.getPlayerInventory(telegramId);
      
      res.json({ 
        success: true, 
        inventory,
        message: "Inventory synced - purchases are processed via Telegram webhook"
      });
    } catch (error) {
      console.error("Payment sync error:", error);
      res.status(500).json({ error: "Failed to sync inventory" });
    }
  });

  // Admin: Manually credit boosts to a player's inventory
  app.post("/api/admin/credit-boosts", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { telegramId, boostType, quantity, username } = req.body;
      
      if (!telegramId || !boostType || typeof quantity !== 'number' || quantity <= 0) {
        return res.status(400).json({ error: "Invalid telegramId, boostType, or quantity" });
      }
      
      const validBoosts = ['extra_life', 'shield_boost', 'rapid_fire', 'side_guns', 'machine_gun', 'skip_storm'];
      if (!validBoosts.includes(boostType)) {
        return res.status(400).json({ error: `Invalid boost type. Valid types: ${validBoosts.join(', ')}` });
      }
      
      // Ensure player exists in the system
      await storage.createOrUpdateTelegramPlayer({
        telegramId,
        username: username || null,
        firstName: username?.toUpperCase() || "Player",
        lastName: null,
      });
      
      // Add boosts to inventory
      await storage.addToInventory(telegramId, boostType as BoostType, quantity);
      
      // Get updated inventory
      const inventory = await storage.getPlayerInventory(telegramId);
      
      console.log(`[ADMIN] Credited ${quantity}x ${boostType} to player ${telegramId} (${username || 'unknown'})`);
      
      res.json({ 
        success: true, 
        message: `Credited ${quantity}x ${boostType} to player ${telegramId}`,
        inventory
      });
    } catch (error) {
      console.error("Credit boosts error:", error);
      res.status(500).json({ error: "Failed to credit boosts" });
    }
  });

  // Admin: Manual payout to specific player
  app.post("/api/admin/manual-payout", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { telegramId, starsAmount } = req.body;
      
      if (!telegramId || typeof starsAmount !== 'number' || starsAmount <= 0) {
        return res.status(400).json({ error: "Invalid telegramId or starsAmount" });
      }
      
      await storage.sendManualPayout(telegramId, starsAmount);
      
      res.json({ 
        success: true, 
        message: `Sent ${starsAmount} Stars to ${telegramId}` 
      });
    } catch (error) {
      console.error("Manual payout error:", error);
      res.status(500).json({ error: "Failed to send payout" });
    }
  });

  // Admin: Trigger prize distribution manually
  app.post("/api/admin/distribute-prizes", async (req, res) => {
    try {
      const adminPassword = req.headers['x-admin-password'];
      if (!process.env.ADMIN_PASSWORD || adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const today = new Date().toISOString().split('T')[0];
      await storage.distributeDailyPrizes(today);
      
      res.json({ 
        success: true, 
        message: `Prizes distributed for ${today}, classic leaderboard cleared` 
      });
    } catch (error) {
      console.error("Prize distribution error:", error);
      res.status(500).json({ error: "Failed to distribute prizes" });
    }
  });

  // Setup midnight cron job for automatic prize distribution
  setupMidnightCron();

  // Demo endpoint - seed test leaderboard data with avatars
  app.post("/api/demo/seed-avatars", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const demoPlayers = [
        { telegramId: "demo_1", name: "BLAZER420", score: 15000, wave: 12, avatar: "leaf", boosts: true },
        { telegramId: "demo_2", name: "BUDMASTER", score: 12500, wave: 10, avatar: "dragon", boosts: true },
        { telegramId: "demo_3", name: "SEEDKING", score: 10000, wave: 8, avatar: "crown", boosts: false },
        { telegramId: "demo_4", name: "PURESTORM", score: 8500, wave: 7, avatar: "skull", boosts: false },
        { telegramId: "demo_5", name: "GREENTHUMB", score: 7000, wave: 6, avatar: "fox", boosts: true },
        { telegramId: "demo_6", name: "HIGHFLYER", score: 5500, wave: 5, avatar: "eagle", boosts: false },
      ];
      
      for (const player of demoPlayers) {
        // First create the player record in telegramPlayers table
        await storage.createOrUpdateTelegramPlayer({
          telegramId: player.telegramId,
          username: player.name.toLowerCase(),
          firstName: player.name,
          lastName: null,
        });
        
        // Purchase and set avatar for player
        await storage.purchaseAvatar(player.telegramId, player.avatar as any);
        await storage.setSelectedAvatar(player.telegramId, player.avatar as any);
        
        // Create daily score
        await storage.createDailyScore({
          telegramId: player.telegramId,
          playerName: player.name,
          score: player.score,
          wave: player.wave,
          playTime: 180,
          usedBoosts: player.boosts,
          date: today,
        });
        
        // Update all-time scores
        if (player.boosts) {
          await storage.updateAllTimeBoostedScores(player.telegramId, player.name, player.score, player.wave, 180);
        } else {
          await storage.updateAllTimePureScores(player.telegramId, player.name, player.score, player.wave, 180);
        }
      }
      
      res.json({ success: true, message: "Demo data seeded with avatars" });
    } catch (error) {
      console.error("Demo seed error:", error);
      res.status(500).json({ error: "Failed to seed demo data" });
    }
  });

  return httpServer;
}

// Midnight cron job - runs at 00:00 UTC daily
function setupMidnightCron() {
  const checkAndDistribute = async () => {
    const now = new Date();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    
    // Run at midnight UTC (00:00)
    if (hours === 0 && minutes === 0) {
      console.log("[CRON] Midnight - triggering automatic prize distribution");
      
      // Distribute yesterday's prizes (since it's now a new day)
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      try {
        await storage.distributeDailyPrizes(yesterdayStr);
        console.log(`[CRON] Prizes distributed for ${yesterdayStr}`);
      } catch (error) {
        console.error("[CRON] Prize distribution failed:", error);
      }
    }
  };
  
  // Check every minute
  setInterval(checkAndDistribute, 60000);
  console.log("[CRON] Midnight prize distribution cron job started");
}
