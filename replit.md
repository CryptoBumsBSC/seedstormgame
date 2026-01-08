# SEED STORM - Cannabis Galaga Clone

## Overview
SEED STORM is a retro arcade vertical space shooter game where you play as "Dudley Bud" shooting cannabis seeds at incoming enemy buds of different strains. Built with a pixel art aesthetic inspired by classic arcade games like Galaga and Space Invaders.

## Current State
- **Complete MVP** with working game engine, all screens, and leaderboard functionality
- Fully playable with touch/mouse/keyboard controls
- Score submission and persistent leaderboards
- Sound effects, particle explosions, power-ups all working
- Deployed at: https://galaga-clone--oscarjameshardi.replit.app

## Telegram Bot Setup (In Progress)
- Bot created: @seedstormbot
- Banner images available at:
  - /banner.png (640x360 for BotFather)
  - /download (page with download button)
- Next step: Complete /newapp in BotFather with 640x360 image

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
- **Leaderboard**: Persistent high scores

## Screens
1. **Title Screen**: Start game, view leaderboard, high score display
2. **Game Screen**: Canvas game, HUD (score/lives/wave), touch controls
3. **Game Over Screen**: Final score, save to leaderboard, play again
4. **Leaderboard Screen**: Top 10 scores with rank/name/score/wave

## Controls
- **Desktop**: Arrow keys or WASD to move, Space to shoot, Escape to pause
- **Mobile**: Touch buttons for left/right movement and fire

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

## Recent Changes
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
