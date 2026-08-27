# RIFT STORM — Standalone Arcade

Status: standalone playable build on the `rift-storm-ready` branch.

## Core loop

Random Rift portals open across the upper battlefield. Creatures emerge in increasingly difficult patterns. The player moves along the lower battlefield and fires a laser weapon that automatically evolves as kills accumulate.

Laser progression:

1. 0 kills — RIFT PULSE
2. 10 kills — TWIN ARC
3. 25 kills — TRI-BEAM
4. 50 kills — ION FAN
5. 90 kills — RIFT ARRAY

Difficulty rises continuously through faster portal opening, more simultaneous portals, tougher enemy types, aimed enemy fire and recurring Rift Lord bosses.

## Current standalone build

- random animated portals
- four standard enemy behaviours
- recurring Rift Lord boss portals
- five kill-based laser evolutions
- combo scoring
- rare shield and repair drops
- three-life survival loop
- standalone zones: Rift Edge, Shatter Belt, Ion Veil, The Breach and Deep Rift
- desktop keyboard controls
- mobile drag and hold controls
- optional arcade sound
- local best score stored only under the Rift Storm namespace
- zero server requests during active gameplay
- high-density canvas rendering up to 3x device pixel ratio for crisp modern screens
- no Boomerverse branding, domain dependency or project identity in the production game

## Routing

- `/` — current standalone RIFT STORM build
- `/seed-storm` — preserved older Seed Storm page for development comparison
- `/admin` — existing admin page

## Architecture direction

RIFT STORM is a standalone browser-first game. Hosting and domain decisions are intentionally separate and are not defined by this branch.
