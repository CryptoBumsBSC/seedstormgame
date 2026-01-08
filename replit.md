# SEED STORM - Cannabis Galaga Clone

## Overview
SEED STORM is a retro arcade vertical space shooter game where you play as "Dudley Bud" shooting cannabis seeds at incoming enemy buds of different strains. Built with a pixel art aesthetic inspired by classic arcade games like Galaga and Space Invaders.

## Current State
- **Complete MVP** with working game engine, all screens, and leaderboard functionality
- Fully playable with touch/mouse/keyboard controls
- Score submission and persistent leaderboards

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
- 2026-01-08: Initial MVP complete with all core game mechanics
