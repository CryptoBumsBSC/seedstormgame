# Threat Model

## Project Overview

SEED STORM is a publicly deployed Telegram Mini App and web game built with a React/Vite frontend, an Express API server, and a PostgreSQL database accessed through Drizzle ORM. Production-sensitive features include Telegram-linked player accounts, leaderboard submissions, Telegram Stars purchase tracking, prize-pool accounting, and a password-protected admin panel. The client is untrusted; in production, only the server can be trusted to authenticate Telegram users, validate payments, and enforce admin-only actions.

Production assumptions for this scan: `NODE_ENV=production`, Replit terminates TLS for the deployment, and only production-reachable code paths are in scope. Dev-only Vite middleware and mockup-only environments are out of scope unless a route is reachable in the public deployment.

## Assets

- **Telegram player identities** — Telegram user IDs, usernames, first names, ban state, avatar ownership, and profile selections. Compromise allows impersonation, leaderboard fraud, and tampering with user-visible state.
- **Leaderboard and game-integrity data** — Daily scores, all-time scores, boost usage flags, and winner selection inputs. Integrity failures can manipulate rankings and undermine prize eligibility.
- **Telegram Stars economy data** — Star purchases, prize-pool balances, owner share, and player winnings. Tampering here can create unearned inventory or distort financial accounting.
- **Admin capabilities** — Manual payouts, boost credits, score deletion, player review, and prize distribution. Unauthorized access would let an attacker directly alter the game economy and moderation state.
- **Application secrets** — `ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, database credentials, and any webhook configuration. Exposure or misuse of these secrets can lead to bot takeover, unauthorized admin actions, or database compromise.

## Trust Boundaries

- **Browser / Telegram Mini App to Express API** — All game, leaderboard, and account-related requests originate from an untrusted client. The server must authenticate Telegram identity and reject forged or replayed requests.
- **Express API to PostgreSQL** — The server can create or modify leaderboard, purchase, and prize records. Any broken authorization or logic abuse at the API layer becomes persistent database tampering.
- **Telegram platform to webhook endpoint** — Payment confirmations and bot updates cross from Telegram into `/api/telegram/webhook`. The server must authenticate webhook origin before accepting financial or moderation actions.
- **Public user to admin boundary** — `/api/admin/*` routes and admin operations must remain inaccessible to regular users and resilient to online guessing or abuse.
- **Production vs dev-only boundary** — `server/vite.ts`, local tooling, and non-production helper code should be ignored unless reachable from the public deployment.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `client/src/pages/game.tsx`, `client/src/pages/admin.tsx`
- **Highest-risk areas:** Telegram identity/bootstrap flow, `/api/telegram/*` endpoints, `/api/telegram/webhook`, `/api/admin/*` routes, prize distribution and purchase recording in `server/storage.ts`
- **Public surfaces:** leaderboard routes, score submission routes, Telegram player/avatar routes, webhook/setup routes, guide/download/demo routes
- **Admin surfaces:** `/api/admin/*` and `/admin` client page guarded only by shared password logic
- **Usually dev-only / lower-priority areas:** `server/vite.ts`, build scripts, static asset helpers unless publicly routed

## Threat Categories

### Spoofing

This project treats Telegram identity as part of its security model, so the server MUST verify that a claimed Telegram user actually originated from Telegram. Any route that accepts `telegramId`, usernames, or other identity-bearing fields from the client MUST bind that data to verified Telegram Mini App init data or another server-validated session. Webhook requests from Telegram MUST be authenticated before processing purchases, bot commands, or payment confirmations.

### Tampering

Leaderboard records, avatar selections, boost inventory, and prize-pool accounting are all business-critical state. The server MUST compute or verify sensitive state transitions instead of trusting client-provided score submissions, boost flags, or purchase payloads. Maintenance or demo endpoints reachable in production MUST require authorization or be removed, because otherwise attackers can inject fraudulent records directly into the database.

### Information Disclosure

Admin and player-management endpoints expose usernames, Telegram IDs, spending, and winnings. These routes MUST be server-side protected and should not leak sensitive player or operational data through public routes, overly broad responses, or logs. Error responses and debug helpers should not expose secrets or internal financial state unnecessarily.

### Denial of Service

Public endpoints such as score submission, webhook processing, and leaderboard generation can be abused to create excessive writes or repeated expensive operations. High-value public routes SHOULD apply request validation and rate controls proportionate to their abuse potential, especially where unauthenticated writes affect shared state.

### Elevation of Privilege

The main privilege boundaries are public player vs. Telegram-authenticated player and regular user vs. admin. The server MUST enforce authorization for any action that mutates another user’s data, affects payouts, changes moderation state, or credits purchasable inventory. Client-side checks alone are not sufficient for bans, admin operations, or prize eligibility.
