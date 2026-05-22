// Slurs are base64 encoded to keep source code clean
const ENCODED_SLURS = [
  "bmlnZ2Vy", "bmlnZ2E=", "bmVncm8=", "bmVncg==",
  "a2lrZQ==",
  "Y2hpbms=",
  "Y3JhY2tlcg==",
  "c3BpYw==", "c3BpY2s=",
  "d2V0YmFjaw==",
  "Z29vaw==",
  "YmVhbmVy",
  "Y29vbg==",
  "cGFraQ==",
  "ZmFn", "ZmFnZ290", "ZmFnb3Q=", "ZmFnZXQ=",
  "ZHlrZQ==",
  "dHJhbm55", "dHJhbm5pZQ==",
  "cmV0YXJk", "cmV0YXJkZWQ=", "dGFyZA=="
];

const BLOCKED_SLURS = ENCODED_SLURS.map(s => Buffer.from(s, 'base64').toString('utf8'));

function normalizeText(text: string): string {
  let normalized = text.toLowerCase();
  
  normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  
  // Remove zero-width and invisible Unicode characters
  normalized = normalized.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '');
  
  const replacements: Record<string, string> = {
    '0': 'o', 'о': 'o', 'ο': 'o',
    '1': 'i', 'і': 'i', 'ı': 'i', 'l': 'i', '|': 'i',
    '3': 'e', 'е': 'e', 'ε': 'e', 'é': 'e', 'è': 'e', 'ë': 'e',
    '4': 'a', 'а': 'a', 'α': 'a', 'á': 'a', 'à': 'a', 'ä': 'a', '@': 'a',
    '5': 's', '$': 's', 'ѕ': 's',
    '6': 'g', '9': 'g',
    '7': 't',
    '8': 'b',
    '!': 'i', '¡': 'i',
    '*': '', '-': '', '_': '', '.': '', ',': '', "'": '', '"': '',
    'ñ': 'n', 'ń': 'n',
    'ç': 'c', 'с': 'c',
    'к': 'k', 'κ': 'k',
    'р': 'p', 'ρ': 'p',
    'х': 'x', 'χ': 'x',
    'у': 'y', 'ү': 'y',
    ' ': '', '\t': '', '\n': ''
  };
  
  for (const [char, replacement] of Object.entries(replacements)) {
    normalized = normalized.split(char).join(replacement);
  }
  
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
  
  return normalized;
}

export function containsHateSpeech(text: string): { blocked: boolean; reason?: string } {
  const normalized = normalizeText(text);
  
  for (const slur of BLOCKED_SLURS) {
    const normalizedSlur = normalizeText(slur);
    if (normalized.includes(normalizedSlur)) {
      return { blocked: true, reason: "Name contains prohibited language" };
    }
  }
  
  return { blocked: false };
}

export function validatePlayerName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }
  
  if (name.length > 10) {
    return { valid: false, error: "Name must be 10 characters or less" };
  }
  
  const hateSpeechCheck = containsHateSpeech(name);
  if (hateSpeechCheck.blocked) {
    return { valid: false, error: hateSpeechCheck.reason };
  }
  
  return { valid: true };
}

const MAX_POINTS_PER_SECOND = 3;
// Hard cap on reported play time to prevent artificially inflating allowable score
const MAX_PLAY_TIME_MS = 7_200_000; // 2 hours

export function validateScore(score: number, playTimeMs: number): { valid: boolean; error?: string } {
  if (score < 0) {
    return { valid: false, error: "Invalid score" };
  }
  
  if (playTimeMs < 1000) {
    return { valid: false, error: "Play time too short" };
  }
  
  // Clamp play time to the hard maximum so attackers cannot pick an
  // arbitrarily large playTime to make any score appear valid.
  const effectivePlayTimeMs = Math.min(playTimeMs, MAX_PLAY_TIME_MS);
  const playTimeSeconds = effectivePlayTimeMs / 1000;
  const maxPossibleScore = Math.ceil(playTimeSeconds * MAX_POINTS_PER_SECOND);
  
  if (score > maxPossibleScore) {
    return { valid: false, error: "Score appears invalid for play time" };
  }
  
  return { valid: true };
}

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 10_000; // 10 seconds between submissions

export function getClientIdentifier(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  // Use Express's req.ip which respects the trust proxy setting and cannot be
  // spoofed by a client injecting arbitrary X-Forwarded-For / X-Real-IP headers.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(identifier: string): { allowed: boolean; waitTime?: number } {
  const now = Date.now();
  const lastSubmission = rateLimitMap.get(identifier);
  
  if (lastSubmission && (now - lastSubmission) < RATE_LIMIT_MS) {
    const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastSubmission)) / 1000);
    return { allowed: false, waitTime };
  }
  
  rateLimitMap.set(identifier, now);
  
  if (rateLimitMap.size > 10000) {
    const entries = Array.from(rateLimitMap.entries());
    entries.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < 5000; i++) {
      rateLimitMap.delete(entries[i][0]);
    }
  }
  
  return { allowed: true };
}
