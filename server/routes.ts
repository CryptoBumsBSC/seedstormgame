import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScoreSchema, insertPlayerSchema } from "@shared/schema";
import { db } from "./db";
import { desc, gte, sql as drizzleSql } from "drizzle-orm";
import { validatePlayerName, validateScore, checkRateLimit, getClientIdentifier } from "./profanityFilter";
import { isAdmin, requireAdmin, verifyTelegramWebhook, getTelegramWebhookSecret } from "./auth";
import path from "path";
import fs from "fs";

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
      if (!requireAdmin(req, res)) return;
      const scoresWithStats = await storage.getScoresWithStats();
      res.json(scoresWithStats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scores" });
    }
  });

  // Admin: Delete a score by ID
  app.delete("/api/admin/scores/:id", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
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
      console.log(`[TELEGRAM PLAYER] Received: telegramId=${telegramId}, username=${username}, firstName=${firstName}`);
      if (!telegramId) {
        return res.status(400).json({ error: "Missing telegramId" });
      }
      const player = await storage.createOrUpdateTelegramPlayer({
        telegramId,
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
      });
      console.log(`[TELEGRAM PLAYER] Created/Updated player with telegramId=${telegramId}`);
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


  // Award free avatar for daily high score (max 1 per 24h)
  app.post("/api/telegram/avatar/daily-reward", async (req, res) => {
    try {
      const { telegramId } = req.body;
      if (!telegramId) return res.status(400).json({ error: "Missing telegramId" });
      const result = await storage.awardDailyHighScoreAvatar(telegramId.toString().trim());
      res.json(result);
    } catch (error) {
      console.error("Daily avatar reward error:", error);
      res.status(500).json({ error: "Failed to check daily reward" });
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


  // Submit Telegram score (with boost tracking)
  app.post("/api/telegram/score", async (req, res) => {
    try {
      const { telegramId, playerName, score, wave, playTime, usedBoosts } = req.body;

      if (!telegramId || typeof telegramId !== 'string' || telegramId.length > 64 ||
          typeof score !== 'number' || typeof wave !== 'number') {
        return res.status(400).json({ error: "Invalid score data" });
      }

      // Rate limit per client IP
      const clientId = getClientIdentifier(req);
      const rateCheck = checkRateLimit(clientId);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: `Please wait ${rateCheck.waitTime} seconds before submitting again`
        });
      }

      // Reject impossible scores for the reported play time
      const scoreCheck = validateScore(score, playTime || 0);
      if (!scoreCheck.valid) {
        return res.status(400).json({ error: scoreCheck.error });
      }

      // Refuse names that fail moderation
      const nameToCheck = playerName || 'PLAYER';
      const nameCheck = validatePlayerName(nameToCheck);
      if (!nameCheck.valid) {
        return res.status(400).json({ error: nameCheck.error });
      }

      // Banned players can't submit
      if (await storage.isPlayerBanned(telegramId)) {
        return res.status(403).json({ error: "Player is banned" });
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
      if (!requireAdmin(req, res)) return;
      const players = await storage.getAllTelegramPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Telegram players" });
    }
  });

  // Admin: Get all Telegram players (alternate path for admin panel)
  app.get("/api/admin/telegram/players", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const players = await storage.getAllTelegramPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Telegram players" });
    }
  });

  // Admin: Get revenue statistics
  app.get("/api/admin/telegram/revenue", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const revenue = await storage.getRevenueStats();
      res.json(revenue);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch revenue stats" });
    }
  });

  // Admin: Get today's prize pool info
  app.get("/api/admin/telegram/prize-pool", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
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
      if (!requireAdmin(req, res)) return;
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
      if (!requireAdmin(req, res)) return;
      const today = new Date().toISOString().split('T')[0];
      await storage.distributeDailyPrizes(today);
      res.json({ success: true, message: `Prizes distributed for ${today}` });
    } catch (error) {
      res.status(500).json({ error: "Failed to distribute prizes" });
    }
  });


  // Webhook handler for Telegram payment confirmations and bot commands
  app.post("/api/telegram/webhook", async (req, res) => {
    try {
      // Authenticate webhook origin — Telegram echoes our secret in this header
      if (!verifyTelegramWebhook(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const update = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      // Minimal logging in production to avoid leaking payment/PII details
      if (process.env.NODE_ENV !== "production") {
        console.log("[WEBHOOK] Received update keys:", Object.keys(update || {}));
      }
      
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
        const payment = update.message.successful_payment;

        let payload;
        try {
          payload = JSON.parse(payment.invoice_payload);
        } catch (parseError) {
          console.error("[WEBHOOK] Failed to parse payload");
          return res.status(400).json({ error: "Invalid payload" });
        }

        const { telegramId, boostType, quantity } = payload;
        const validBoosts = ['extra_life', 'shield_boost', 'rapid_fire', 'side_guns', 'machine_gun', 'skip_storm'];
        if (!telegramId || !validBoosts.includes(boostType) || typeof quantity !== 'number' || quantity <= 0 || quantity > 100) {
          return res.status(400).json({ error: "Invalid payload contents" });
        }
        if (typeof payment.total_amount !== 'number' || payment.total_amount < 0 || payment.total_amount > 1_000_000) {
          return res.status(400).json({ error: "Invalid amount" });
        }
        
        // Record the purchase in database
        try {
          const purchase = await storage.recordStarPurchase({
            telegramId,
            boostType,
            quantity,
            starsAmount: payment.total_amount,
            telegramPaymentId: payment.telegram_payment_charge_id,
          });

          await storage.addToInventory(telegramId, boostType, quantity);
          await storage.addToDailyPool(payment.total_amount);

          console.log(`[WEBHOOK] Payment recorded: ${quantity}x ${boostType}, ${payment.total_amount} Stars`);

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
        } else if (text === "/play") {
          replyText = `🎮 *SEED STORM* 🎮

Tap the button below to launch the game!

Your progress and purchases are saved to your Telegram account.`;
          replyMarkup = {
            inline_keyboard: [[{ text: "🚀 LAUNCH GAME", url: gameUrl }]]
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

🏆 *Leaderboards*
Daily, All-Time Boosted and All-Time Pure leaderboards!

Tap below to start playing!`;
          replyMarkup = {
            inline_keyboard: [[{ text: "🎮 PLAY NOW", url: gameUrl }]]
          };
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

  // Setup Telegram webhook (admin only — registers our secret token with Telegram)
  app.post("/api/telegram/setup-webhook", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
      }

      const host = req.headers.host;
      if (!host) {
        return res.status(400).json({ error: "Missing host header" });
      }
      const webhookUrl = `https://${host}/api/telegram/webhook`;

      const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: getTelegramWebhookSecret(),
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

  // Check current webhook status (admin only — exposes webhook URL config)
  app.get("/api/telegram/webhook-info", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
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


  // Admin: Manually credit boosts to a player's inventory
  app.post("/api/admin/credit-boosts", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
      
      const { telegramId: rawTelegramId, boostType, quantity, username } = req.body;
      const telegramId = rawTelegramId?.trim();
      
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
      await storage.addToInventory(telegramId, boostType, quantity);
      
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
      if (!requireAdmin(req, res)) return;
      
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
      if (!requireAdmin(req, res)) return;
      
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

  // Demo endpoint - seed test leaderboard data with avatars (admin only)
  app.post("/api/demo/seed-avatars", async (req, res) => {
    try {
      if (!requireAdmin(req, res)) return;
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
