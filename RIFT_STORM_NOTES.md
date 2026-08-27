# RIFT STORM — Boomerverse Arcade

Status: first playable gameplay prototype on the `rift-storm-ready` branch.

## Core loop

Random Rift portals open across the upper battlefield. Rift creatures emerge in increasingly difficult patterns. The player moves along the lower battlefield and fires a laser weapon that automatically evolves as kills accumulate.

Laser progression:

1. 0 kills — RIFT PULSE
2. 10 kills — TWIN ARC
3. 25 kills — TRI-BEAM
4. 50 kills — ION FAN
5. 90 kills — RIFT ARRAY

Difficulty rises continuously through faster portal opening, more simultaneous portals, tougher enemy types, aimed enemy fire and recurring Rift Lord bosses.

## Current features

- random animated portals
- four standard Rift enemy behaviours
- recurring Rift Lord boss portals
- five kill-based laser evolutions
- combo scoring
- rare shield and repair drops
- three-life survival loop
- changing Boomerverse zones: Tasmanian Night, West Coast Rift, Cradle Fracture, The Gateway and Beyond the Rift
- desktop keyboard controls
- mobile drag and hold controls
- optional simple arcade sound
- local best score
- zero server requests during active gameplay

## Routing

- `/` — RIFT STORM
- `/seed-storm` — preserved original Seed Storm page for comparison during development
- `/admin` — existing admin page

## Architecture direction

RIFT STORM is intended to run as a browser-first Boomerverse game and later as the same Vercel-hosted application inside Telegram. Replit-specific configuration and Vite integration have been removed from this branch.
