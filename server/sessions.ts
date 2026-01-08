import { randomBytes } from 'crypto';

interface GameSession {
  id: string;
  walletAddress: string;
  txHash: string;
  paymentVerified: boolean;
  gameStarted: boolean;
  gameEnded: boolean;
  finalScore: number | null;
  finalWave: number | null;
  createdAt: Date;
  expiresAt: Date;
}

const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour

class SessionManager {
  private sessions: Map<string, GameSession> = new Map();

  generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  createSession(walletAddress: string, txHash: string): GameSession {
    const now = new Date();
    const session: GameSession = {
      id: this.generateSessionId(),
      walletAddress: walletAddress.toLowerCase(),
      txHash,
      paymentVerified: false,
      gameStarted: false,
      gameEnded: false,
      finalScore: null,
      finalWave: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    };

    this.sessions.set(session.id, session);
    this.cleanupExpiredSessions();
    
    return session;
  }

  getSession(sessionId: string): GameSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return session;
  }

  verifyPayment(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;
    
    session.paymentVerified = true;
    return true;
  }

  startGame(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    if (!session || !session.paymentVerified || session.gameStarted) {
      return false;
    }
    
    session.gameStarted = true;
    return true;
  }

  endGame(sessionId: string, score: number, wave: number): boolean {
    const session = this.getSession(sessionId);
    if (!session || !session.gameStarted || session.gameEnded) {
      return false;
    }

    // Basic anti-cheat: score can't exceed theoretical maximum
    // Max ~100 kills per minute, 60 minutes max, 10 points per kill max
    const MAX_REASONABLE_SCORE = 60000;
    if (score > MAX_REASONABLE_SCORE || score < 0) {
      return false;
    }

    session.gameEnded = true;
    session.finalScore = score;
    session.finalWave = wave;
    return true;
  }

  getValidatedScore(sessionId: string): { score: number; wave: number; walletAddress: string } | null {
    const session = this.getSession(sessionId);
    if (!session || !session.gameEnded || session.finalScore === null || session.finalWave === null) {
      return null;
    }

    return {
      score: session.finalScore,
      wave: session.finalWave,
      walletAddress: session.walletAddress,
    };
  }

  isPaymentUsed(txHash: string): boolean {
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      if (session.txHash === txHash && session.paymentVerified) {
        return true;
      }
    }
    return false;
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    const entries = Array.from(this.sessions.entries());
    for (const [id, session] of entries) {
      if (session.expiresAt < now) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionManager = new SessionManager();
