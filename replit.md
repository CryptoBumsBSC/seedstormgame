# SEED STORM - Cannabis Galaga Clone

## Overview
SEED STORM is a retro arcade vertical space shooter game where you play as "Dudley Bud" shooting cannabis seeds at incoming enemy buds of different strains. Built with a pixel art aesthetic inspired by classic arcade games like Galaga and Space Invaders.

## Current State
- **Complete MVP** with working game engine, all screens, and leaderboard functionality
- Fully playable with touch/mouse/keyboard controls
- Score submission and persistent leaderboards
- Sound effects, particle explosions, power-ups all working
- Deployed at: https://galaga-clone--oscarjameshardi.replit.app

## Telegram Bot Setup
- Bot: @SeedStormBot
- Token stored in: TELEGRAM_BOT_TOKEN secret
- Banner: /banner.png (640x360)

## Telegram Stars Monetization

### Boosts (Per-Life Purchases)
Players buy boosts with Telegram Stars, stored in inventory, used per-life:
- **Extra Life** (3★): Start with an extra life (max 4)
- **Shield Boost** (3★): 5-second shield at start of life
- **Rapid Fire** (3★): 5-second rapid fire at start of life
- **Side Guns** (5★): 5-second side guns at start of life
- **Machine Gun** (10★): 5-second machine guns at start of life
- **Skip Storm** (20★): No meteor showers for that life

### Inventory & Loadout System
- Buy boosts (1-20 quantity at once) → stored in player inventory
- Before game, select boosts for each life (1 boost per life slot, 3 slots total)
- Loadout screen shows 2x3 grid with +/- buttons
- "Selected: X/3" counter enforces the limit
- **Boosts are consumable**: Used boosts are removed from inventory when game starts
- Unused boosts in inventory stay for future games without additional purchase
- Timed boosts (shield, rapid fire, side guns, machine gun) last 5 seconds at life start

### Daily Prize Pool
Revenue from Stars purchases is split:
- **50%** → Owner (always)
- **40%** → Top 3 daily winners (25% / 10% / 5%)
- **10%** → Up to 10 random players that day (1% each)
- **Unclaimed** → Goes to owner

**Minimum Threshold**: 50★ daily spending to activate prizes. Under 50★ = all to owner.

### Leaderboards
- **Daily**: Single board showing all players with icons:
  - 🔥💨 (lit joint + smoke) = used paid boost
  - 💎 (diamond) = pure skill, no boost
- **All-Time Boosted**: "BLAZED LEGENDS" - top boosted scores
- **All-Time Pure**: "MR NATURAL" - top pure (no boost) scores

### Player Tracking
All players logged with:
- Telegram @username and user ID
- First/last played dates
- Total games, Stars spent, Stars won

## Tech Stack
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS with retro arcade theme
- **Game Engine**: HTML5 Canvas with custom rendering
- **Backend**: Express.js with in-memory storage
- **Data Fetching**: TanStack Query

## Project Structure
```
client/
  src/
    pages/
      game.tsx        # Main game page with all screens and game engine
    components/ui/    # Shadcn UI components
    index.css         # Arcade color theme (neon cyan, magenta, green)
server/
  routes.ts           # API endpoints for scores
  storage.ts          # In-memory score storage
shared/
  schema.ts           # Game types and score schema
```

## Game Features
- **Player**: "Dudley Bud" character that fires seeds
- **Enemies**: Three strain types (Indica/Sativa/Hybrid) with unique colors
- **Difficulty Scaling**: Every 15 seconds enemies get stronger
- **3 Lives System**: Game over when all lives lost
- **Score System**: Points = hits needed to kill enemy
- **Leaderboard**: Persistent high scores with permanent all-time top 3

## Screens
1. **Title Screen**: Start game, view leaderboard, how to play, high score display
2. **Game Screen**: Canvas game, HUD (score/lives/wave), touch controls
3. **Game Over Screen**: Final score, save to leaderboard, play again
4. **Leaderboard Screen**: Top 10 scores with rank/name/score/wave
5. **How To Play Screen**: Complete game rules and tips

## Controls
- **Desktop**: Arrow keys or WASD to move, Space to shoot, Escape to pause
- **Mobile**: Touch buttons for left/right movement and fire

## Complete Game Rules

### Objective
- Survive as long as possible while shooting down enemy buds
- Get the highest score to make the leaderboard

### Lives & Damage
- Start with 3 lives
- When hit, flash for 1.5 seconds (invincible during this time)
- Game Over when all lives are lost

### Enemies
- **Purple (Indica)**: 1 hit to kill = 1 point
- **Green (Sativa)**: 2 hits to kill = 2 points
- **Orange (Hybrid)**: 3 hits to kill = 3 points
- Enemies shoot back at you
- Difficulty increases every 15 seconds

### Weapon Upgrades (automatic)
- **Start**: Single center cannon
- **60 seconds**: Left side gun added
- **90 seconds**: Right side gun added
- **4 minutes**: Double barrel machine guns

### Hazards (start after 20 seconds)
- **Bong** (blue) - damages on contact
- **Lit Joint** (orange) - damages on contact
- **Matches** (red) - damages on contact
- Spawn rate increases over time

### Bud Angel (special helper)
- Glowing angelic bud with wings and halo
- Appears after 90 seconds of continuous play
- 5% spawn chance, minimum 20 seconds between spawns
- Collect it: Grants 15 seconds of shield protection
- Shield protects from all damage

### Skull & Crossbones (deadly hazard)
- Dark green skull with red glowing eyes
- Spawns max once every 30 seconds (3% chance)
- If touched without shield: INSTANT GAME OVER
- Shield protects you from this hazard

### Power-Ups (dropped by destroyed enemies)
- **Speed Boost (S)**: Faster movement
- **Double Damage (D)**: Shots do 2x damage
- **Rapid Fire (R)**: Faster shooting
- **Extra Life (+)**: Gain 1 life

### Tips
- Keep moving - standing still makes you a target
- Clear enemies before they reach the bottom
- Watch for hazards after 20 seconds
- Survive to 4 minutes for max firepower
- Grab the Bud Angel for shield protection
- Avoid the Skull unless you have a shield

## API Endpoints
- `GET /api/scores` - Fetch all scores (sorted by score desc)
- `POST /api/scores` - Submit new score (playerName, score, wave, playTime)

## Design System
- **Font**: Press Start 2P (pixel font)
- **Colors**: Neon arcade palette
  - Background: Deep space black (#0a0a0f)
  - Primary: Bright green (#00ff00)
  - Secondary: Hot magenta (#ff00ff)
  - Accent: Electric yellow (#ffff00)
  - Foreground: Cyan (#00ffff)
- **Border Radius**: Small (retro pixel look)
- **Shadows**: Magenta glow effects

## Admin Panel (/admin)
Password-protected admin panel with tabs:
- **Scores**: View all scores with suspicious activity detection (>2 pts/sec highlighted)
- **Players**: All Telegram players with @username, ID, games played, Stars spent/won, dates
- **Revenue**: Total and daily Stars spent, owner earnings, purchase breakdown by boost type
- **Prize Pool**: Today's pool info, threshold status, distribute prizes button

## Recent Changes
- 2026-01-13: Major Update - Score Fix, Payouts, Unpredictability
  - **Score Submission Fix**: Telegram scores now go to correct endpoint (/api/telegram/score)
  - **BLAZED/PURE Leaderboards**: Now properly populate with usedBoosts tracking
  - **Debug Webhook Logging**: Comprehensive logging for payment webhook troubleshooting
  - **Affiliate Program**: /affiliate bot command + link on title screen (10% commission)
  - **Manual Payout**: Admin panel now has player selector + Stars amount for direct payouts
  - **Midnight Cron Job**: Auto-distributes prizes at 00:00 UTC, clears classic leaderboard
  - **Timer in HUD**: Shows elapsed time between SCORE and LIVES displays
  - **Unpredictability Scaling**: Enemies drift horizontally after 90sec (15% + 2% per 30sec)
  - **How To Play**: Added UNPREDICTABILITY section explaining enemy behavior scaling
- 2026-01-12: Quantity selector and inventory consumption
  - Buy 1-20 boosts at once with quantity +/- buttons in shop
  - Boosts consumed from inventory when game starts
  - Loadout clears after game to prevent reuse
  - Remaining inventory available for future games
- 2026-01-12: Fixed Telegram Stars payment webhook
  - Added /api/telegram/setup-webhook endpoint to register payment webhook
  - Webhook URL: https://galaga-clone--oscarjameshardi.replit.app/api/telegram/webhook
  - Resolves "bot didn't respond in time" error during Star purchases
- 2026-01-12: Fixed How To Play boost documentation
  - Corrected all 6 boost star prices in the help screen
  - Updated boost descriptions to match actual functionality
- 2026-01-12: Expanded Boost System (6 Boosts)
  - **New Boosts**: Extra Life (3★), Shield Boost (3★), Rapid Fire (3★), Side Guns (5★), Machine Gun (10★), Skip Storm (20★)
  - **Max 3 Boosts Per Life**: Loadout screen enforces limit with "Selected: X/3" counter
  - **Timed Boost Effects**: Shield, rapid fire, side guns, machine gun all last 5 seconds at life start
  - **Extra Life Capped**: Maximum 4 starting lives with extra life boost
  - **2x3 Grid UI**: Both shop and loadout screens use color-coded 2x3 grid layout
- 2026-01-12: Complete Telegram Stars Monetization System
  - **Boost Shop**: Purchase all 6 boost types with Telegram Stars
  - **Loadout Screen**: Select boosts per life before each game
  - **Per-Life Boost Logic**: Boosts activate per life with proper timing
  - **Telegram Stars Payments**: WebApp.openInvoice integration with secure webhook handling
  - **Daily Prize Pool**: 101★ minimum, 50% owner, 40% top 3 (25/10/5%), 10% random
  - **Leaderboard Tabs**: Daily (🔥💨/💎 icons), BLAZED LEGENDS, MR NATURAL
  - **How To Play**: Added Stars boosts, prizes, and leaderboard documentation
  - **Admin Panel**: Player tracking, revenue stats, prize pool management
- 2026-01-12: Visual polish (Phase 3)
  - **Damage Flash**: Red screen flash when player takes damage
  - **Enemy Formations**: V-shape, diagonal lines, horizontal lines spawn after 45 sec (15% chance)
- 2026-01-12: Major gameplay enhancements (Phase 2)
  - **Boss Enemy**: Spawns every 2 min, 10 hits to kill, side-to-side movement, spread shot attack
  - **Bud Rage Power-up**: Permanent 25% faster fire + 10 sec shield when boss killed
  - **Slow-Mo Effect**: Brief slow motion when collecting power-ups
  - **Particle Trails**: Green trails behind player projectiles
  - **Bud Rage Indicator**: HUD display when permanent power-up is active
  - **Slow-Mo Border**: Visual cyan border effect during slow motion
- 2026-01-12: Major gameplay enhancements (Phase 1)
  - **Combo System**: Chain kills within 1.5 sec for up to 3x point multiplier
  - **Kill Streak**: Track consecutive kills, display at 5+ streak
  - **Screen Shake**: Visual feedback on 3+ combo kills
  - **Shield Stacking**: All shields now extend duration when already active
  - **Machine Gun Preview**: 5-second preview at 3:30 before permanent unlock at 4:00
  - **Star Speed Progression**: Background stars accelerate with game progress
  - **Fixed 4th Life Bug**: Lives properly capped at 3 maximum
  - **Reduced Bud Angel Spawn**: From 5% to 4.5% for better balance
  - **Admin Panel**: Password-protected at /admin route for score management
  - **Updated How To Play**: Added sections for combo, preview, and stacking mechanics
- 2026-01-11: Added White-Hot Seed to SEED STORM event
  - Rare glowing white seed (10% chance, max 1 per shower)
  - Bright white glow with white flame trail
  - SHOOT IT to get 5 sec shield + 5 sec rapid fire bonus
  - Updated How To Play with visual guide for white-hot seed
- 2026-01-11: Enhanced Dudley Bud player character with 50% more detail
  - Sharper leaf edges with more pronounced tips
  - Additional serrations on all 5 leaf fingers
  - Thicker veins with darker accent details
  - Better leaf texture and stem detail
- 2026-01-11: Fixed control bugs
  - Reset controls when window loses focus (prevents stuck movement)
  - Added touchcancel handler for interrupted touch events
- 2026-01-11: Added ad click tracking
  - Database table for tracking clicks by placement
  - API endpoints: POST /api/ad-click, GET /api/ad-stats
  - SQL aggregation for efficient stats retrieval
- 2026-01-10: Added self-hosted ad spaces for monetization
  - Two 320x100 banner slots: title screen and game over screen
  - ADS config object at top of game.tsx for easy ad management
  - "ad enquiry @dudley420" contact text on title screen
- 2026-01-10: Added Meteor Shower "SEED STORM" event
  - Spawns after 90 seconds of play (3% chance, 15s cooldown)
  - Lasts 3-6 seconds with 5-15 falling seeds
  - Seeds have orange glow, fire trails, and diagonal movement
  - Causes 1 life loss on contact (respects shield/invincibility)
  - Warning text "SEED STORM!" appears during active shower
- 2026-01-10: Enhanced profanity filter
  - Unicode normalization and zero-width character removal
  - Base64-encoded slurs to keep source clean
  - Only blocks hate speech; allows all cannabis/drug terminology
- 2026-01-10: UI improvements
  - Better spacing between title and buttons
  - Cleaner layout on title and game over screens
- 2026-01-08: Enhanced all game assets with 50% more detail
  - Player ship now features iconic 5-point cannabis leaf with veins, serrations, and defined fingers
  - Enemy buds have 50% more layers, pistils, trichomes, and calyx bumps
  - Hazards (bong, joint, matches) enhanced with glass effects, reflections, and textures
  - Cannabis seed projectiles have more tiger stripe detail and realistic mottling
  - Power-ups now have pulsing glow rings and type indicator letters (S/D/R/+)
- 2026-01-08: Added Bud Angel special object (appears after 90 sec, grants 15s shield on contact)
- 2026-01-08: Added Skull & Crossbones hazard (max once per 30 sec, instant game over unless shielded)
- 2026-01-08: Added permanent all-time leaderboard (top 3 scores that never reset)
- 2026-01-08: Removed branding text from canvas borders (cleaner look)
- 2026-01-08: Initial MVP complete with all core game mechanics
