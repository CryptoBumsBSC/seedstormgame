import type { Request, Response } from "express";
import { createHash, timingSafeEqual } from "crypto";

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = req.headers["x-admin-password"];
  if (typeof provided !== "string" || provided.length === 0) return false;
  return safeEq(provided, expected);
}

export function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

let cachedWebhookSecret: string | null = null;
export function getTelegramWebhookSecret(): string {
  if (cachedWebhookSecret) return cachedWebhookSecret;
  const explicit = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (explicit && /^[A-Za-z0-9_-]{1,256}$/.test(explicit)) {
    cachedWebhookSecret = explicit;
    return explicit;
  }
  const seed = process.env.SESSION_SECRET || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!seed) {
    cachedWebhookSecret = "fallback-" + Date.now().toString(36);
    return cachedWebhookSecret;
  }
  cachedWebhookSecret = createHash("sha256")
    .update("seedstorm-telegram-webhook:" + seed)
    .digest("hex");
  return cachedWebhookSecret;
}

export function verifyTelegramWebhook(req: Request): boolean {
  const provided = req.headers["x-telegram-bot-api-secret-token"];
  if (typeof provided !== "string" || provided.length === 0) return false;
  return safeEq(provided, getTelegramWebhookSecret());
}
