# SEED STORM — 2-Player Online Co-op

Development branch: `seed-storm-multiplayer`

## Player flow

1. Player 1 opens `/coop` and creates a room.
2. Seed Storm generates a six-character room code and a Telegram Mini App invite link.
3. Player 1 shares the invite in Telegram.
4. Player 2 taps it. Telegram opens Seed Storm with `startapp=coop_ROOMCODE` and the app enters that room as Player 2.
5. When both players are online, Player 1 starts the match.

## Match model

The first multiplayer build uses a host-authoritative co-op model:

- Player 1 runs the shared Seed Storm simulation.
- Player 2 sends only left/right/fire input.
- Player 1 publishes compact shared game snapshots.
- Both players see the same enemies, hazards, score, weapon level, boss and Seed Storm events.
- Each player has three lives.
- Team power-ups can shield both players, grant shared rapid fire, restore a life or revive a downed player.
- The match ends when both players are down.

This preserves Seed Storm's existing arcade feel without turning the game into a video stream or sending a server request for every frame.

## Telegram identity

When `TELEGRAM_BOT_TOKEN` is configured, the multiplayer relay validates Telegram Mini App `initData` before admitting a socket to a room and checks that the claimed Telegram user id matches the signed user payload.

## Realtime route

`/api/multiplayer/ws`

The realtime relay is attached to the existing HTTP server using `ws` and supports two slots per room: `host` and `guest`.

## Production hardening before prize-bearing multiplayer

The current first build keeps active room fan-out in the server process. That is suitable for development and low-volume testing. Before any prize/reward-bearing multiplayer is enabled, replace room fan-out with shared realtime pub/sub (or another durable coordinator) so rooms remain reliable across horizontally scaled Vercel instances, and add stronger server-side match validation.

## Existing solo game

The existing `/` Seed Storm game is intentionally unchanged. Multiplayer is additive at `/coop`.
