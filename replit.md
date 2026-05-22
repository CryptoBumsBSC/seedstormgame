# SEED STORM - Cannabis Galaga Clone

## Overview
SEED STORM is a retro arcade vertical space shooter game where players control "Dudley Bud" to shoot cannabis seeds at incoming enemy buds. The game features a pixel art aesthetic inspired by classic arcade games, offering a complete MVP with a functional game engine, all necessary screens, and persistent leaderboard functionality. It supports touch, mouse, and keyboard controls, includes sound effects, particle explosions, and power-ups. The project aims to provide an engaging, monetized gaming experience primarily through Telegram Stars, with a vision for community engagement and revenue sharing.

## User Preferences
I want iterative development and detailed explanations.
Ask before making major changes.
Do not make changes to folder `Z`.
Do not make changes to file `Y`.
I prefer clear and concise communication.

## System Architecture

### UI/UX Decisions
- **Aesthetic**: Pixel art, retro arcade theme (Galaga, Space Invaders).
- **Color Scheme**: Neon arcade palette: Deep space black background, bright green primary, hot magenta secondary, electric yellow accent, cyan foreground.
- **Font**: "Press Start 2P" (pixel font).
- **Styling**: Tailwind CSS for responsive and themed components.
- **Border Radius**: Small, for a retro pixelated look.
- **Shadows**: Magenta glow effects.
- **Game Screens**:
    1.  **Title Screen**: Game start, leaderboard access, how-to-play, high score display, ad space.
    2.  **Game Screen**: Canvas game, HUD (score/lives/wave/timer), touch controls.
    3.  **Game Over Screen**: Final score, leaderboard submission, play again option, ad space.
    4.  **Leaderboard Screen**: Top 10 scores with player rank, name, score, and wave.
    5.  **How To Play Screen**: Comprehensive game rules and tips.
    6.  **Loadout Screen**: 2x3 grid for selecting boosts before a game.
    7.  **Admin Panel**: Password-protected interface for score management, player tracking, revenue analysis, and prize distribution.

### Technical Implementations
-   **Frontend**: React + TypeScript + Vite.
-   **Game Engine**: Custom HTML5 Canvas rendering.
-   **Backend**: Express.js for API endpoints.
-   **Data Storage**: In-memory storage for scores and game state.
-   **Data Fetching**: TanStack Query.
-   **Controls**:
    -   **Desktop**: Arrow keys/WASD for movement, Space to shoot, Escape to pause.
    -   **Mobile**: Touch buttons for left/right movement and firing.
-   **Game Mechanics**:
    -   **Player**: "Dudley Bud" with seed projectiles.
    -   **Enemies**: Three types (Indica/Sativa/Hybrid) with varying hit points and colors, increasing difficulty every 15 seconds.
    -   **Lives System**: 3 lives, invincibility after being hit, game over on losing all lives.
    -   **Score System**: Points based on enemy hit points.
    -   **Weapon Upgrades**: Automatic progression from single cannon to machine guns.
    -   **Hazards**: Bong, Lit Joint, Matches (damaging), Skull & Crossbones (instant game over unless shielded).
    -   **Special Helper**: Bud Angel (grants shield).
    -   **Power-Ups**: Speed Boost, Double Damage, Rapid Fire, Extra Life (dropped by enemies).
    -   **Combos & Streaks**: Chain kills for point multipliers and kill streak tracking. Combo kills (3+) trigger BIG explosions with extra particles, white screen flash, and screen shake.
    -   **Near-Miss / Graze Bonus**: When a hazard, enemy projectile, enemy, or skull passes within 14px of the player without hitting, award +5 points, play a high-pitched zap, and draw a yellow ring + sparks. Each object can only be grazed once. Disabled while shielded or invincible.
    -   **Personal Best Ghost** *(player-toggleable; default OFF)*: Title-screen toggle (`button-ghost-toggle`) sets `ghostEnabled`, persisted in localStorage under `seedstorm:ghostEnabled:v1`. When ON, samples the player's x position every 50ms and, on a new personal best, persists `{score, path}` to `seedstorm:ghost:v1` to render a faint "BEST" Dudley Bud replay on later runs. When OFF, nothing is recorded or rendered.
    -   **Time-Based Rewards** (stack on top of normal gameplay):
        -   **1:30 Flawless Bonus** (one-time): Reach 90 sec without losing a life → +1 free life and 10 sec rapid fire.
        -   **4:00 Wingman Unlock** (one-time, permanent): Two small Dudley Bud side ships appear flanking the player, each firing double cannons; also grants 5 sec rapid fire.
        -   **4:30+ Rapid Fire Bursts** (recurring): Every 30 sec a fresh 5-second rapid fire burst is granted, indefinitely.
    -   **Meteor Shower**: "SEED STORM" event with falling seeds.
    -   **Enemy Formations**: Dynamic enemy formations after 45 seconds.
    -   **Boss Enemy**: Appears every 2 minutes, grants "Bud Rage" power-up.
    -   **Unpredictability Scaling**: Enemies drift horizontally after 90 seconds.

### Feature Specifications
-   **Leaderboards**:
    -   **Daily**: Tracks scores with icons for boosted (🔥💨) or pure (💎) play.
    -   **All-Time Boosted**: "BLAZED LEGENDS".
    -   **All-Time Pure**: "MR NATURAL".
-   **Monetization (Telegram Stars)**:
    -   **Boosts**: Purchasable items (Extra Life, Shield Boost, Rapid Fire, Side Guns, Machine Gun, Skip Storm) stored in inventory.
    -   **Loadout System**: Players select up to 3 boosts per life before a game.
    -   **Daily Prize Pool**: 50% to owner, 40% to top 3 daily winners, 10% to random players, activated by a minimum 50★ daily spending threshold.
    -   **Player Tracking**: Logs Telegram username, user ID, play dates, Stars spent, and Stars won.
-   **Admin Panel**:
    -   **Sections**: Scores (with suspicious activity detection), Players, Revenue, Prize Pool management.
    -   **Features**: Manual payouts, ban/unban system.

## External Dependencies
-   **Telegram Bot API**: For `@SeedStormBot` integration, payment webhook handling, and user authentication.
-   **Telegram Stars**: In-app purchase system for boosts and monetization.
-   **Vite**: Frontend build tool.
-   **Tailwind CSS**: Utility-first CSS framework for styling.
-   **TanStack Query**: Data fetching library.
-   **Express.js**: Backend web application framework.