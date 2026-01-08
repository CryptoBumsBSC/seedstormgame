# SEED STORM - Design Guidelines

## Design Approach
**Reference-Based**: Retro arcade games (Galaga, Space Invaders, Asteroids) with modern cannabis branding overlay. Full pixel-art aesthetic with authentic 8-bit/16-bit visual treatment.

## Core Design Principles
1. **Authentic Retro Arcade Experience**: Embrace pixel-perfect graphics, scanline effects, CRT screen simulation
2. **Cannabis Brand Integration**: Dudley Bud character and strain-themed enemies feel playful, not corporate
3. **Competitive Gaming Focus**: Leaderboards and prize pools are prominently featured
4. **Mobile-First Telegram App**: Vertical portrait orientation, touch-optimized controls

## Typography
- **Primary**: "Press Start 2P" (Google Fonts) for all game text, UI, scores
- **Sizes**: 8px (small text), 12px (standard), 16px (headers), 24px (title screen)
- **Style**: All-caps for emphasis, monospaced retro feel, bright high-contrast colors against dark backgrounds

## Layout System
**Tailwind Spacing**: Use units of 1, 2, 4, 8 for tight retro arcade spacing
- Game canvas: Full viewport minus top stats bar (40px) and bottom controls (80px)
- Menus: Centered modal overlays with 4-unit padding
- Leaderboards: Dense spacing (gap-2) for maximum entries visible

## Screen Layouts

### Title Screen
- Animated pixel-art logo "SEED STORM" (pulsing glow effect)
- Dudley Bud mascot sprite animation (idle bobbing)
- "INSERT COIN" flashing text with entry fee amount
- High score ticker scrolling across top
- "CONNECT WALLET" pixel button (chunky, beveled)
- Mini preview of gameplay in background (looping demo)

### Game Screen
- **Top Stats Bar** (fixed, 40px): Score (left) | High Score (center) | Lives indicator (right, heart sprites)
- **Game Canvas**: Vertical scrolling starfield, full remaining viewport
- **Bottom Controls** (fixed, 80px): Large touch zones - Left/Right movement arrows, centered Fire button (all pixelated icons)
- **Pause Overlay**: Centered pixel-border modal with "PAUSED" text, Resume/Quit options

### Leaderboard Screen
- Arcade cabinet-style frame around leaderboard
- Podium graphics for top 3 (1st = gold pixel trophy, 2nd = silver, 3rd = bronze)
- Table columns: Rank | Player Name | Score | Prize Amount
- Weekly timer countdown (pixel digits, flashing when <1 hour)
- Tabbed navigation: "DAILY" / "WEEKLY" / "ALL-TIME"
- Entry fee pool total displayed prominently at top

### Death/Game Over Screen
- Full-screen pixel explosion animation
- "GAME OVER" in large flashing text
- Final score with rank comparison ("You placed #47 this week!")
- "PLAY AGAIN" button with entry fee
- Option to share score to Telegram

## Component Library

### Buttons
- Chunky pixel borders (3-4px thick)
- Beveled edges (light top/left, dark bottom/right for 3D effect)
- Press state: Inverted bevel + 2px downward shift
- Glow effect for primary actions

### Modals/Overlays
- Thick pixel borders (8px)
- Scanline overlay effect
- Semi-transparent dark background (80% opacity)
- Corner decorations (small pixel ornaments)

### Progress Bars
- Pixel-block fill animation (chunky segments, not smooth)
- Flashing when critical (low health, time running out)
- Border: 2px solid outline

### Character Sprites
- **Dudley Bud (Player)**: 32x32px, friendly bud character with shades, animated idle/move/shoot states
- **Enemy Buds**: 24x24px to 40x40px based on strain type, distinct color palettes (purple Indica, green Sativa, orange Hybrid)
- **Projectiles**: 4x4px seeds, 8x8px enemy bullets

### Particle Effects
- Explosion: 16x16px expanding pixel circles
- Hit flash: White overlay blink
- Smoke trail: Fading pixel squares

## Color Palette (Retro Gaming)
- **Background**: Deep space black (#0a0a0f)
- **Primary UI**: Bright cyan (#00ffff), hot magenta (#ff00ff)
- **Accents**: Lime green (#39ff14), electric yellow (#ffff00)
- **Player**: Bright green (#00ff00)
- **Enemies**: Strain-specific (purple, green, orange with neon glow)
- **Danger**: Flashing red (#ff0000)

## Animations
- **Critical Only**: Player/enemy spawn flash, death explosions, projectile trails
- **Menu Transitions**: Instant or 1-frame slide (no smooth easing)
- **Text**: Blinking cursors, scrolling tickers, flashing "INSERT COIN"
- **Background**: Slow vertical parallax starfield (3 layers, different speeds)

## Images
No photographic images. All visuals are pixel-art sprites and illustrations created in-code or via simple sprite sheets.

## Audio Integration
Use Web Audio API with retro sound libraries:
- Chiptune background music (looping arcade theme)
- 8-bit shoot/hit/explosion sound effects
- Coin insert "ka-ching" for entry fee payment
- Victory fanfare for leaderboard placement

## Accessibility
- High contrast pixel art naturally aids visibility
- Large touch targets (minimum 64x64px) for mobile controls
- Screen reader labels for score/lives updates
- Pause available at any time
- Colorblind consideration: Use shape + color differentiation for enemies

## Mobile Optimization (Telegram Mini App)
- Portrait orientation locked
- Touch controls only (no keyboard)
- Haptic feedback on shoot/hit/death
- Loading screen with progress bar
- Minimal network calls during gameplay (cache assets)
- Offline-friendly game logic, sync scores after death

---

**Design Philosophy**: This is an authentic arcade experience with modern Web3 integration. Every pixel matters. Embrace the constraints and charm of retro gaming while making wallet connection and prize pools feel seamless and exciting.