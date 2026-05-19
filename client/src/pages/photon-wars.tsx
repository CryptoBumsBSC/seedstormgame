import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Play, Trophy, HelpCircle, ChevronLeft, ChevronRight } from "lucide-react";
import WebApp from "@twa-dev/sdk";
import { useLocation } from "wouter";

// ─── Constants ───────────────────────────────────────────────────────────────
const CW = 400;
const CH = 600;
const PLAYER_W = 36;
const PLAYER_H = 28;
const BULLET_W = 4;
const BULLET_H = 14;
const INVADER_W = 32;
const INVADER_H = 24;
const INVADER_COLS = 10;
const INVADER_ROWS = 5;
const INVADER_GAP_X = 8;
const INVADER_GAP_Y = 10;
const INVADER_STEP = 16;
const INVADER_DROP = 18;
const BASE_STEP_MS = 700;
const BOMB_SPEED = 3.2;
const BARRIER_COUNT = 4;
const MYSTERY_SPEED = 1.8;

// ============ AD CONFIGURATION ============
// Change these to update your ads (320x100 banner size recommended)
const ADS = {
  titleScreen: {
    image: "", // Put your ad image URL here, e.g. "/my-ad.png"
    link: "",  // Where clicking the ad goes, e.g. "https://example.com"
  },
  gameOver: {
    image: "", // Put your ad image URL here
    link: "",  // Where clicking the ad goes
  },
};
// ==========================================

type Screen = "title" | "game" | "gameover" | "leaderboard" | "help";
type LeaderboardTab = "daily" | "alltime";

interface Bullet { id: string; x: number; y: number; }
interface Bomb   { id: string; x: number; y: number; vy: number; }
interface Particle { id: string; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; }
interface Invader { id: string; col: number; row: number; x: number; y: number; alive: boolean; type: number; hp: number; maxHp: number; }
interface Barrier { x: number; y: number; blocks: boolean[][]; }
interface Mystery { x: number; y: number; dir: number; active: boolean; }
interface PowerUp { id: string; x: number; y: number; type: "wide"|"laser"|"rapid"|"life"; vy: number; }

// ─── Audio ───────────────────────────────────────────────────────────────────
function createAudio() {
  let ctx: AudioContext | null = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctx;
  }
  function playTone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.18, decay = true) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain); gain.connect(c.destination);
      osc.type = type; osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(vol, c.currentTime);
      if (decay) gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.start(); osc.stop(c.currentTime + dur);
    } catch {}
  }
  return {
    shoot: () => { playTone(880, 0.06, "square", 0.14); },
    hit:   () => { playTone(220, 0.12, "sawtooth", 0.2); playTone(110, 0.15, "square", 0.1); },
    boom:  () => { playTone(80, 0.35, "sawtooth", 0.3); playTone(55, 0.4, "square", 0.2); },
    die:   () => { playTone(440, 0.08, "square", 0.2); playTone(330, 0.1, "square", 0.15); playTone(220, 0.15, "square", 0.1); },
    mystery: () => { for (let i=0;i<4;i++) setTimeout(()=>playTone(660+i*110,0.08,"square",0.12),i*80); },
    levelUp: () => { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>playTone(f,0.12,"square",0.15),i*80)); },
    march:  (step: number) => { const freqs=[160,130,110,90]; playTone(freqs[step%4],0.04,"square",0.08,true); },
    powerup:() => { [440,550,660,880].forEach((f,i)=>setTimeout(()=>playTone(f,0.1,"square",0.15),i*60)); },
  };
}

// ─── Draw helpers ────────────────────────────────────────────────────────────
function makeBarriers(): Barrier[] {
  const barriers: Barrier[] = [];
  const bw = 52, bh = 32, blockSize = 4;
  const cols = bw / blockSize, rows = bh / blockSize;
  const spacing = CW / BARRIER_COUNT;
  for (let i = 0; i < BARRIER_COUNT; i++) {
    const bx = spacing * i + spacing / 2 - bw / 2;
    const by = CH - 130;
    const blocks: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      blocks[r] = [];
      for (let c = 0; c < cols; c++) {
        // Arch cutout at bottom center
        const mid = cols / 2;
        if (r >= rows - 3 && Math.abs(c - mid) < 3) { blocks[r][c] = false; }
        else blocks[r][c] = true;
      }
    }
    barriers.push({ x: bx, y: by, blocks });
  }
  return barriers;
}

function makeInvaders(): Invader[] {
  const invaders: Invader[] = [];
  const startX = (CW - (INVADER_COLS * (INVADER_W + INVADER_GAP_X) - INVADER_GAP_X)) / 2;
  const startY = 80;
  for (let row = 0; row < INVADER_ROWS; row++) {
    for (let col = 0; col < INVADER_COLS; col++) {
      const type = row < 1 ? 2 : row < 3 ? 1 : 0;
      const hp = type + 1;
      invaders.push({
        id: `${row}-${col}`,
        col, row,
        x: startX + col * (INVADER_W + INVADER_GAP_X),
        y: startY + row * (INVADER_H + INVADER_GAP_Y),
        alive: true, type, hp, maxHp: hp,
      });
    }
  }
  return invaders;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PhotonWars() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("daily");
  const [playerName, setPlayerName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [finalWave, setFinalWave] = useState(1);
  const [telegramId, setTelegramId] = useState("browser_test");
  const [dailyScores, setDailyScores] = useState<any[]>([]);
  const [allTimeScores, setAllTimeScores] = useState<any[]>([]);

  const audio = useRef(createAudio());

  // game state refs (mutable, no re-render)
  const stateRef = useRef({
    running: false,
    paused: false,
    score: 0,
    wave: 1,
    lives: 3,
    playerX: CW / 2 - PLAYER_W / 2,
    bullets: [] as Bullet[],
    bombs: [] as Bomb[],
    particles: [] as Particle[],
    invaders: makeInvaders(),
    barriers: makeBarriers(),
    mystery: { x: -60, y: 28, dir: 1, active: false } as Mystery,
    powerUps: [] as PowerUp[],
    stepDir: 1,
    stepTimer: 0,
    stepMs: BASE_STEP_MS,
    marchStep: 0,
    bombTimer: 0,
    mysteryTimer: 0,
    shootCooldown: 0,
    weaponLevel: 0,
    rapidActive: 0,
    wideActive: 0,
    laserActive: 0,
    shakeFrames: 0,
    flashFrames: 0,
    flashColor: "#fff",
    invaderAnimFrame: 0,
    animTimer: 0,
    lastTime: 0,
    screenFlashFrames: 0,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const animFrameRef = useRef<number>(0);
  const dprRef = useRef<number>(1);

  // ─── Telegram init ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      WebApp.ready();
      const user = WebApp.initDataUnsafe?.user;
      if (user?.id) setTelegramId(String(user.id));
    } catch {}
  }, []);

  // ─── Leaderboard fetch ─────────────────────────────────────────────────────
  const fetchLeaderboards = useCallback(() => {
    fetch("/api/pw/scores/daily").then(r => r.json()).then(setDailyScores).catch(() => {});
    fetch("/api/pw/scores/alltime").then(r => r.json()).then(setAllTimeScores).catch(() => {});
  }, []);

  useEffect(() => { fetchLeaderboards(); }, [fetchLeaderboards]);

  // ─── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === "Space") e.preventDefault();
      if (e.code === "Escape") {
        const s = stateRef.current;
        if (s.running) s.paused = !s.paused;
      }
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ─── Particles ─────────────────────────────────────────────────────────────
  function spawnParticles(x: number, y: number, color: string, count = 12, speed = 3) {
    const s = stateRef.current;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = speed * (0.5 + Math.random());
      s.particles.push({
        id: Math.random().toString(36).slice(2),
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────
  const endGame = useCallback(() => {
    const s = stateRef.current;
    s.running = false;
    cancelAnimationFrame(animFrameRef.current);
    setFinalScore(s.score);
    setFinalWave(s.wave);
    setSubmitted(false);
    setScreen("gameover");
    audio.current.boom();
  }, []);

  // ─── Next wave ─────────────────────────────────────────────────────────────
  function nextWave() {
    const s = stateRef.current;
    s.wave++;
    s.invaders = makeInvaders();
    s.invaders.forEach(inv => { inv.y += Math.min((s.wave - 1) * 10, 80); });
    s.barriers = makeBarriers();
    s.bombs = [];
    s.bullets = [];
    s.powerUps = [];
    s.stepMs = Math.max(120, BASE_STEP_MS - (s.wave - 1) * 60);
    s.stepTimer = 0;
    s.bombTimer = 0;
    s.mystery.active = false;
    audio.current.levelUp();
  }

  // ─── Fire bullet ───────────────────────────────────────────────────────────
  function fireBullet() {
    const s = stateRef.current;
    if (s.shootCooldown > 0) return;
    const cooldown = s.rapidActive > 0 ? 67 : 167;
    s.shootCooldown = cooldown;
    audio.current.shoot();
    const cx = s.playerX + PLAYER_W / 2;
    const base: Bullet = { id: Math.random().toString(36).slice(2), x: cx - BULLET_W / 2, y: CH - 80 };
    s.bullets.push(base);
    if (s.wideActive > 0 || s.weaponLevel >= 2) {
      s.bullets.push({ ...base, id: Math.random().toString(36).slice(2), x: cx - 20 });
      s.bullets.push({ ...base, id: Math.random().toString(36).slice(2), x: cx + 16 });
    }
    if (s.weaponLevel >= 3) {
      s.bullets.push({ ...base, id: Math.random().toString(36).slice(2), x: cx - 36 });
      s.bullets.push({ ...base, id: Math.random().toString(36).slice(2), x: cx + 32 });
    }
  }

  // ─── Reset & start ─────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const s = stateRef.current;
    s.running = true;
    s.paused = false;
    s.score = 0;
    s.wave = 1;
    s.lives = 3;
    s.playerX = CW / 2 - PLAYER_W / 2;
    s.bullets = [];
    s.bombs = [];
    s.particles = [];
    s.powerUps = [];
    s.invaders = makeInvaders();
    s.barriers = makeBarriers();
    s.mystery = { x: -60, y: 28, dir: 1, active: false };
    s.stepDir = 1;
    s.stepTimer = 0;
    s.stepMs = BASE_STEP_MS;
    s.marchStep = 0;
    s.bombTimer = 0;
    s.mysteryTimer = 0;
    s.shootCooldown = 0;
    s.weaponLevel = 0;
    s.rapidActive = 0;
    s.wideActive = 0;
    s.laserActive = 0;
    s.shakeFrames = 0;
    s.flashFrames = 0;
    s.screenFlashFrames = 0;
    s.lastTime = performance.now();
    setScreen("game");
  }, []);

  // ─── Draw invader sprite ───────────────────────────────────────────────────
  function drawInvader(ctx: CanvasRenderingContext2D, inv: Invader, frame: number) {
    const colors = ["#00eeff", "#aa44ff", "#ff4488"];
    const col = colors[inv.type];
    const dmg = 1 - inv.hp / inv.maxHp;
    ctx.shadowBlur = 12;
    ctx.shadowColor = col;

    const px = inv.x, py = inv.y, w = INVADER_W, h = INVADER_H;

    if (inv.type === 0) {
      // Squid — 2 frames
      ctx.fillStyle = col;
      // body
      ctx.fillRect(px+8, py+2, w-16, h-8);
      ctx.fillRect(px+4, py+6, w-8, h-10);
      // antennae
      ctx.fillRect(px+6, py, 3, 5);
      ctx.fillRect(px+w-9, py, 3, 5);
      // eyes
      ctx.fillStyle = "#000";
      ctx.fillRect(px+9, py+8, 4, 4);
      ctx.fillRect(px+w-13, py+8, 4, 4);
      // tentacles alternate
      if (frame % 2 === 0) {
        ctx.fillStyle = col;
        ctx.fillRect(px+2, py+h-8, 4, 7);
        ctx.fillRect(px+w/2-2, py+h-8, 4, 7);
        ctx.fillRect(px+w-6, py+h-8, 4, 7);
      } else {
        ctx.fillStyle = col;
        ctx.fillRect(px+4, py+h-5, 4, 7);
        ctx.fillRect(px+w/2-2, py+h-4, 4, 7);
        ctx.fillRect(px+w-8, py+h-5, 4, 7);
      }
    } else if (inv.type === 1) {
      // Crab
      ctx.fillStyle = col;
      ctx.fillRect(px+6, py+2, w-12, h-6);
      ctx.fillRect(px+2, py+6, w-4, h-12);
      // claws alternate
      if (frame % 2 === 0) {
        ctx.fillRect(px, py+4, 5, 5);
        ctx.fillRect(px+w-5, py+4, 5, 5);
      } else {
        ctx.fillRect(px+2, py+8, 5, 5);
        ctx.fillRect(px+w-7, py+8, 5, 5);
      }
      ctx.fillStyle = "#000";
      ctx.fillRect(px+10, py+6, 4, 4);
      ctx.fillRect(px+w-14, py+6, 4, 4);
    } else {
      // Octopus (top row — hardest)
      ctx.fillStyle = col;
      ctx.fillRect(px+4, py, w-8, h-4);
      ctx.fillRect(px, py+6, w, h-12);
      ctx.fillRect(px+8, py+h-6, w-16, 6);
      // legs
      const legOff = frame % 2 === 0 ? 0 : 2;
      [0,1,2,3].forEach(i => {
        ctx.fillRect(px + i*(w/4) + legOff, py+h-4, 4, 7);
      });
      ctx.fillStyle = "#000";
      ctx.fillRect(px+10, py+6, 5, 5);
      ctx.fillRect(px+w-15, py+6, 5, 5);
    }

    // Damage crack overlay
    if (dmg > 0) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,80,80,${dmg * 0.7})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + w/2, py + 2);
      ctx.lineTo(px + w/2 + 4, py + h/2);
      ctx.lineTo(px + w/2 - 2, py + h - 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // ─── Draw player ───────────────────────────────────────────────────────────
  function drawPlayer(ctx: CanvasRenderingContext2D, x: number, weaponLevel: number) {
    const py = CH - 68;
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#00ffff";
    ctx.fillStyle = "#00ffff";

    // Base
    ctx.fillRect(x + 14, py + 20, 8, 8);
    // Body
    ctx.fillRect(x + 8, py + 10, 20, 14);
    // Cockpit
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 14, py + 8, 8, 8);
    ctx.fillStyle = "#00ffff";
    // Wings
    ctx.fillRect(x, py + 18, 12, 6);
    ctx.fillRect(x + 24, py + 18, 12, 6);
    // Cannon
    ctx.fillRect(x + 16, py, 4, 14);
    if (weaponLevel >= 2) {
      ctx.fillStyle = "#aa44ff";
      ctx.fillRect(x + 6, py + 4, 3, 10);
      ctx.fillRect(x + 27, py + 4, 3, 10);
    }
    if (weaponLevel >= 3) {
      ctx.fillStyle = "#ff4488";
      ctx.fillRect(x, py + 8, 3, 8);
      ctx.fillRect(x + 33, py + 8, 3, 8);
    }
    ctx.shadowBlur = 0;
  }

  // ─── Main game loop ────────────────────────────────────────────────────────
  const gameLoop = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;
    const keys = keysRef.current;

    if (!s.running) return;

    const dt = Math.min(time - s.lastTime, 50);
    s.lastTime = time;
    const dtN = dt / 16.667; // normalise to 60 fps

    // ── Apply DPR scaling once per frame (crisp pixel art on retina) ──
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (!s.paused) {
      // ── Weapon level ──
      if (s.score >= 600) s.weaponLevel = 3;
      else if (s.score >= 300) s.weaponLevel = 2;
      else if (s.score >= 100) s.weaponLevel = 1;
      else s.weaponLevel = 0;

      // ── Player movement ──
      if (keys["ArrowLeft"] || keys["KeyA"]) s.playerX = Math.max(0, s.playerX - 3 * dtN);
      if (keys["ArrowRight"] || keys["KeyD"]) s.playerX = Math.min(CW - PLAYER_W, s.playerX + 3 * dtN);

      // ── Shoot ──
      if (s.shootCooldown > 0) s.shootCooldown -= dt;
      if (keys["Space"] || keys["ArrowUp"]) fireBullet();

      // ── Invader step ──
      s.stepTimer += dt;
      s.animTimer += dt;
      if (s.animTimer > 400) { s.invaderAnimFrame ^= 1; s.animTimer = 0; }

      const alive = s.invaders.filter(i => i.alive);
      const speedMult = 1 + (1 - alive.length / (INVADER_COLS * INVADER_ROWS)) * 1.8;
      const effectiveStep = s.stepMs / speedMult;

      if (s.stepTimer >= effectiveStep) {
        s.stepTimer = 0;
        audio.current.march(s.marchStep++);

        const minX = Math.min(...alive.map(i => i.x));
        const maxX = Math.max(...alive.map(i => i.x + INVADER_W));
        let drop = false;
        if (s.stepDir === 1 && maxX + INVADER_STEP > CW - 4) { s.stepDir = -1; drop = true; }
        else if (s.stepDir === -1 && minX - INVADER_STEP < 4) { s.stepDir = 1; drop = true; }

        s.invaders.forEach(inv => {
          if (!inv.alive) return;
          if (drop) inv.y += INVADER_DROP;
          else inv.x += INVADER_STEP * s.stepDir;
        });

        // Check if invaders reached player
        if (alive.some(i => i.y + INVADER_H >= CH - 80)) {
          endGame();
          return;
        }
      }

      // ── Invader bombs ──
      s.bombTimer += dt;
      const bombInterval = Math.max(600, 2200 - s.wave * 150);
      if (s.bombTimer >= bombInterval && alive.length > 0) {
        s.bombTimer = 0;
        // Pick random bottom-row invader per column
        const cols = alive.map(i => i.col).filter((c, idx, arr) => arr.indexOf(c) === idx);
        const shootCols = cols.sort(() => Math.random() - 0.5).slice(0, Math.min(2 + s.wave, cols.length));
        shootCols.forEach(col => {
          const colInvaders = alive.filter(i => i.col === col).sort((a, b) => b.row - a.row);
          if (colInvaders[0]) {
            const inv = colInvaders[0];
            s.bombs.push({
              id: Math.random().toString(36).slice(2),
              x: inv.x + INVADER_W / 2 - BULLET_W / 2,
              y: inv.y + INVADER_H,
              vy: BOMB_SPEED + s.wave * 0.3,
            });
          }
        });
      }

      // ── Mystery ship ──
      s.mysteryTimer += dt;
      if (!s.mystery.active && s.mysteryTimer > 12000 + Math.random() * 8000) {
        s.mysteryTimer = 0;
        s.mystery.active = true;
        s.mystery.dir = Math.random() > 0.5 ? 1 : -1;
        s.mystery.x = s.mystery.dir === 1 ? -60 : CW + 20;
        audio.current.mystery();
      }
      if (s.mystery.active) {
        s.mystery.x += MYSTERY_SPEED * s.mystery.dir * dtN;
        if (s.mystery.x > CW + 60 || s.mystery.x < -60) s.mystery.active = false;
      }

      // ── Move bullets ──
      s.bullets = s.bullets.filter(b => b.y > -10);
      s.bullets.forEach(b => { b.y -= 9 * dtN; });

      // ── Move bombs ──
      s.bombs = s.bombs.filter(b => b.y < CH + 10);
      s.bombs.forEach(b => { b.y += b.vy * dtN; });

      // ── Move power-ups ──
      s.powerUps = s.powerUps.filter(p => p.y < CH);
      s.powerUps.forEach(p => { p.y += p.vy * dtN; });

      // ── Bullet vs invader ──
      s.bullets = s.bullets.filter(bullet => {
        let hit = false;
        for (const inv of s.invaders) {
          if (!inv.alive) continue;
          if (bullet.x < inv.x + INVADER_W && bullet.x + BULLET_W > inv.x &&
              bullet.y < inv.y + INVADER_H && bullet.y + BULLET_H > inv.y) {
            inv.hp--;
            hit = true;
            const col = ["#00eeff","#aa44ff","#ff4488"][inv.type];
            spawnParticles(inv.x + INVADER_W/2, inv.y + INVADER_H/2, col, 8);
            if (inv.hp <= 0) {
              inv.alive = false;
              const pts = (inv.type + 1) * 10 * s.wave;
              s.score += pts;
              s.shakeFrames = 8;
              spawnParticles(inv.x + INVADER_W/2, inv.y + INVADER_H/2, col, 20, 5);
              audio.current.boom();
              // Chance to drop power-up
              if (Math.random() < 0.1) {
                const types: PowerUp["type"][] = ["wide","rapid","life","laser"];
                s.powerUps.push({ id: Math.random().toString(36).slice(2), x: inv.x, y: inv.y, type: types[Math.floor(Math.random()*types.length)], vy: 1.2 });
              }
            } else {
              audio.current.hit();
            }
            break;
          }
        }
        return !hit;
      });

      // ── Bullet vs mystery ──
      if (s.mystery.active) {
        s.bullets = s.bullets.filter(bullet => {
          const mx = s.mystery.x, my = s.mystery.y;
          if (bullet.x < mx + 50 && bullet.x + BULLET_W > mx && bullet.y < my + 18 && bullet.y + BULLET_H > my) {
            s.mystery.active = false;
            const bonus = [50, 100, 150, 200, 300][Math.floor(Math.random() * 5)];
            s.score += bonus * s.wave;
            s.shakeFrames = 12;
            s.screenFlashFrames = 6;
            spawnParticles(mx + 25, my + 9, "#ff0066", 30, 6);
            audio.current.boom();
            return false;
          }
          return true;
        });
      }

      // ── Bullet vs barrier ──
      s.bullets = s.bullets.filter(bullet => {
        for (const bar of s.barriers) {
          const blockSize = 4;
          const localX = bullet.x - bar.x, localY = bullet.y - bar.y;
          const gc = Math.floor(localX / blockSize), gr = Math.floor(localY / blockSize);
          if (gr >= 0 && gr < bar.blocks.length && gc >= 0 && gc < (bar.blocks[0]?.length || 0)) {
            if (bar.blocks[gr][gc]) {
              bar.blocks[gr][gc] = false;
              // Also destroy neighbors for blast effect
              [[gr-1,gc],[gr+1,gc],[gr,gc-1],[gr,gc+1]].forEach(([r,c]) => {
                if (bar.blocks[r]?.[c]) bar.blocks[r][c] = Math.random() > 0.5;
              });
              spawnParticles(bullet.x, bullet.y, "#886622", 5, 2);
              return false;
            }
          }
        }
        return true;
      });

      // ── Bomb vs player ──
      const px = s.playerX, py2 = CH - 68;
      s.bombs = s.bombs.filter(bomb => {
        if (bomb.x < px + PLAYER_W && bomb.x + BULLET_W > px &&
            bomb.y < py2 + PLAYER_H && bomb.y + BULLET_H > py2) {
          s.lives--;
          s.shakeFrames = 20;
          s.screenFlashFrames = 10;
          spawnParticles(px + PLAYER_W/2, py2 + PLAYER_H/2, "#ff4400", 24, 5);
          audio.current.die();
          if (s.lives <= 0) { endGame(); return false; }
          s.playerX = CW / 2 - PLAYER_W / 2;
          return false;
        }
        return true;
      });

      // ── Bomb vs barrier ──
      s.bombs.forEach(bomb => {
        for (const bar of s.barriers) {
          const blockSize = 4;
          const localX = bomb.x - bar.x, localY = bomb.y - bar.y;
          const gc = Math.floor(localX / blockSize), gr = Math.floor(localY / blockSize);
          if (gr >= 0 && gr < bar.blocks.length && gc >= 0 && gc < (bar.blocks[0]?.length || 0)) {
            if (bar.blocks[gr][gc]) {
              bar.blocks[gr][gc] = false;
              [[gr-1,gc],[gr+1,gc],[gr,gc-1],[gr,gc+1]].forEach(([r,c]) => {
                if (bar.blocks[r]?.[c]) bar.blocks[r][c] = Math.random() > 0.4;
              });
            }
          }
        }
      });

      // ── Power-up vs player ──
      s.powerUps = s.powerUps.filter(pu => {
        if (pu.x < px + PLAYER_W && pu.x + 20 > px && pu.y < py2 + PLAYER_H && pu.y + 20 > py2) {
          if (pu.type === "life") { s.lives = Math.min(5, s.lives + 1); }
          else if (pu.type === "rapid") { s.rapidActive = 5000; }
          else if (pu.type === "wide")  { s.wideActive  = 5000; }
          else if (pu.type === "laser") { s.laserActive = 5000; }
          audio.current.powerup();
          spawnParticles(pu.x + 10, pu.y + 10, "#ffff00", 16, 4);
          return false;
        }
        return true;
      });

      // Tick power-up timers (ms-based)
      if (s.rapidActive > 0) s.rapidActive = Math.max(0, s.rapidActive - dt);
      if (s.wideActive > 0)  s.wideActive  = Math.max(0, s.wideActive  - dt);
      if (s.laserActive > 0) s.laserActive = Math.max(0, s.laserActive - dt);

      // ── Update particles ──
      s.particles = s.particles.filter(p => p.life > 0);
      s.particles.forEach(p => {
        p.x += p.vx * dtN; p.y += p.vy * dtN;
        p.vy += 0.12 * dtN; p.life -= dtN;
        p.vx *= Math.pow(0.94, dtN);
      });
      if (s.shakeFrames > 0) s.shakeFrames = Math.max(0, s.shakeFrames - dtN);
      if (s.screenFlashFrames > 0) s.screenFlashFrames = Math.max(0, s.screenFlashFrames - dtN);

      // ── Check wave clear ──
      if (alive.filter(i => i.alive).length === 0) {
        nextWave();
      }
    }

    // ──────── DRAW ────────────────────────────────────────────────────────────
    const shakeX = s.shakeFrames > 0 ? (Math.random() - 0.5) * 6 : 0;
    const shakeY = s.shakeFrames > 0 ? (Math.random() - 0.5) * 6 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // Background
    ctx.fillStyle = "#000010";
    ctx.fillRect(-10, -10, CW + 20, CH + 20);

    // Stars background
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137.5 + s.score * 0.1) % CW);
      const sy = ((i * 97.3 + time * 0.01) % CH);
      ctx.globalAlpha = 0.3 + (i % 3) * 0.2;
      ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;

    // Screen flash
    if (s.screenFlashFrames > 0) {
      ctx.globalAlpha = s.screenFlashFrames * 0.06;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CW, CH);
      ctx.globalAlpha = 1;
    }

    // Barriers
    const blockSize = 4;
    ctx.shadowBlur = 4; ctx.shadowColor = "#886622";
    s.barriers.forEach(bar => {
      bar.blocks.forEach((row, r) => {
        row.forEach((alive2, c) => {
          if (alive2) {
            const dmgR = r / bar.blocks.length;
            ctx.fillStyle = `hsl(40,60%,${30 + dmgR * 20}%)`;
            ctx.fillRect(bar.x + c * blockSize, bar.y + r * blockSize, blockSize - 1, blockSize - 1);
          }
        });
      });
    });
    ctx.shadowBlur = 0;

    // Invaders
    s.invaders.forEach(inv => {
      if (inv.alive) drawInvader(ctx, inv, s.invaderAnimFrame);
    });

    // Mystery ship
    if (s.mystery.active) {
      ctx.shadowBlur = 16; ctx.shadowColor = "#ff0066";
      ctx.fillStyle = "#ff0066";
      const mx = s.mystery.x, my = s.mystery.y;
      ctx.fillRect(mx + 10, my, 30, 12);
      ctx.fillRect(mx + 5,  my + 4, 40, 8);
      ctx.fillRect(mx, my + 8, 50, 6);
      ctx.fillRect(mx + 15, my - 4, 8, 6);
      ctx.fillRect(mx + 27, my - 4, 8, 6);
      ctx.fillStyle = "#ffcc00";
      ctx.fillRect(mx + 14, my + 4, 5, 5);
      ctx.fillRect(mx + 31, my + 4, 5, 5);
      ctx.shadowBlur = 0;
    }

    // Player bullets
    s.bullets.forEach(b => {
      ctx.shadowBlur = 10; ctx.shadowColor = "#00ffff";
      ctx.fillStyle = "#00ffff";
      ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
    });
    ctx.shadowBlur = 0;

    // Bombs
    s.bombs.forEach(b => {
      ctx.shadowBlur = 8; ctx.shadowColor = "#ff4400";
      ctx.fillStyle = "#ff6600";
      ctx.fillRect(b.x, b.y, BULLET_W, 10);
    });
    ctx.shadowBlur = 0;

    // Power-ups
    const puColors: Record<string, string> = { wide: "#aa44ff", rapid: "#ffaa00", life: "#00ff88", laser: "#ff0066" };
    const puLabels: Record<string, string> = { wide: "W", rapid: "R", life: "♥", laser: "L" };
    ctx.font = "bold 9px monospace";
    s.powerUps.forEach(pu => {
      const col = puColors[pu.type] || "#fff";
      ctx.shadowBlur = 10; ctx.shadowColor = col;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.strokeRect(pu.x, pu.y, 20, 20);
      ctx.fillStyle = col;
      ctx.textAlign = "center";
      ctx.fillText(puLabels[pu.type] || "?", pu.x + 10, pu.y + 14);
    });
    ctx.shadowBlur = 0;

    // Particles
    s.particles.forEach(p => {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.shadowBlur = 6; ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // Player
    drawPlayer(ctx, s.playerX, s.weaponLevel);

    // HUD
    ctx.font = "bold 11px 'Press Start 2P', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#00ffff";
    ctx.shadowBlur = 6; ctx.shadowColor = "#00ffff";
    ctx.fillText(`${s.score}`, 8, 22);
    ctx.textAlign = "right";
    ctx.fillText(`WAVE ${s.wave}`, CW - 8, 22);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4488";
    ctx.shadowColor = "#ff4488";
    ctx.fillText("♥".repeat(s.lives), CW/2, 22);
    ctx.shadowBlur = 0;

    // Active power-up indicators
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.textAlign = "left";
    let indX = 8;
    if (s.rapidActive > 0) { ctx.fillStyle="#ffaa00"; ctx.fillText("RAPID", indX, 36); indX += 48; }
    if (s.wideActive > 0)  { ctx.fillStyle="#aa44ff"; ctx.fillText("WIDE", indX, 36);  indX += 40; }
    if (s.laserActive > 0) { ctx.fillStyle="#ff0066"; ctx.fillText("LASER", indX, 36); }

    // Paused overlay
    if (s.paused) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, CW, CH);
      ctx.font = "bold 16px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#00ffff";
      ctx.shadowBlur = 12; ctx.shadowColor = "#00ffff";
      ctx.fillText("PAUSED", CW/2, CH/2);
      ctx.font = "8px 'Press Start 2P', monospace";
      ctx.fillStyle = "#888";
      ctx.shadowBlur = 0;
      ctx.fillText("ESC TO RESUME", CW/2, CH/2 + 30);
    }

    ctx.restore();

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [endGame]);

  // ─── DPR canvas setup — run before loop starts ─────────────────────────────
  useEffect(() => {
    if (screen !== "game") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;
    canvas.style.width = `${CW}px`;
    canvas.style.height = `${CH}px`;
  }, [screen]);

  // ─── Start/stop loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (screen === "game") {
      stateRef.current.lastTime = performance.now();
      animFrameRef.current = requestAnimationFrame(gameLoop);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [screen, gameLoop]);

  // ─── Submit score ──────────────────────────────────────────────────────────
  async function submitScore() {
    if (!playerName.trim()) return;
    try {
      await fetch("/api/pw/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId, playerName: playerName.trim(), score: finalScore, wave: finalWave }),
      });
      setSubmitted(true);
      fetchLeaderboards();
      toast({ title: "Score submitted!", description: `${finalScore} pts` });
    } catch {
      toast({ title: "Error", description: "Could not submit score", variant: "destructive" });
    }
  }

  // ─── Touch controls ────────────────────────────────────────────────────────
  const touchLeft  = useCallback((down: boolean) => { keysRef.current["ArrowLeft"]  = down; }, []);
  const touchRight = useCallback((down: boolean) => { keysRef.current["ArrowRight"] = down; }, []);
  const touchFire  = useCallback(() => { keysRef.current["Space"] = true; setTimeout(() => { keysRef.current["Space"] = false; }, 80); }, []);

  // ─── TITLE SCREEN ──────────────────────────────────────────────────────────
  if (screen === "title") {
    return (
      <div style={{ minHeight: "100vh", background: "#000010", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Press Start 2P', monospace", padding: "16px" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
          @keyframes pw-glow { 0%,100%{text-shadow:0 0 10px #aa44ff,0 0 30px #aa44ff;} 50%{text-shadow:0 0 20px #ff4488,0 0 50px #ff4488,0 0 80px #aa44ff;} }
          @keyframes pw-float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-6px);} }
          .scanlines{pointer-events:none;position:fixed;inset:0;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 3px,rgba(0,0,0,0.15) 3px,rgba(0,0,0,0.15) 4px);z-index:50;}
        `}</style>
        <div className="scanlines" />

        {/* Back to hub */}
        <button onClick={() => setLocation("/")} style={{ position:"absolute", top:12, left:12, background:"transparent", border:"1px solid #444", color:"#888", fontSize:"8px", fontFamily:"'Press Start 2P',monospace", padding:"6px 10px", cursor:"pointer" }}>
          ← HUB
        </button>

        {/* Invader demo */}
        <div style={{ display:"flex", gap:"12px", marginBottom:"16px" }}>
          {["#ff4488","#aa44ff","#00eeff"].map((col,i) => (
            <div key={i} style={{ width:24, height:18, background:col, boxShadow:`0 0 10px ${col}`, borderRadius:"2px" }} />
          ))}
        </div>

        <h1 style={{ color:"#aa44ff", fontSize:"clamp(18px,6vw,32px)", animation:"pw-glow 2s ease-in-out infinite", letterSpacing:"4px", textAlign:"center", marginBottom:"6px" }}>
          PHOTON WARS
        </h1>
        <p style={{ color:"#ff4488", fontSize:"8px", marginBottom:"32px", letterSpacing:"2px" }}>DESTROY THE INVADERS</p>

        <button
          onClick={() => { startGame(); }}
          data-testid="button-play-pw"
          style={{ width:"100%", maxWidth:"280px", padding:"16px", background:"linear-gradient(135deg,#6600ff,#aa44ff)", color:"#fff", fontSize:"14px", fontFamily:"'Press Start 2P',monospace", border:"none", borderRadius:"2px", cursor:"pointer", boxShadow:"0 0 30px #6600ff88", marginBottom:"12px", animation:"pw-float 2s ease-in-out infinite" }}
        >
          ▶ PLAY NOW
        </button>

        <button
          onClick={() => { fetchLeaderboards(); setScreen("leaderboard"); }}
          data-testid="button-leaderboard-pw"
          style={{ width:"100%", maxWidth:"280px", padding:"12px", background:"transparent", color:"#00ffff", fontSize:"11px", fontFamily:"'Press Start 2P',monospace", border:"2px solid #00ffff", borderRadius:"2px", cursor:"pointer", marginBottom:"12px" }}
        >
          🏆 LEADERBOARD
        </button>

        <button
          onClick={() => setScreen("help")}
          data-testid="button-help-pw"
          style={{ width:"100%", maxWidth:"280px", padding:"12px", background:"transparent", color:"#888", fontSize:"11px", fontFamily:"'Press Start 2P',monospace", border:"2px solid #444", borderRadius:"2px", cursor:"pointer", marginBottom:"32px" }}
        >
          ? HOW TO PLAY
        </button>

        {/* Ad banner */}
        {ADS.titleScreen.image ? (
          <a href={ADS.titleScreen.link || "#"} target="_blank" rel="noopener noreferrer"
            style={{ display:"block", marginBottom:"16px" }} data-testid="link-ad-title-pw"
            onClick={() => fetch("/api/ad-click",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({placement:"titleScreen"})}).catch(()=>{})}>
            <img src={ADS.titleScreen.image} alt="Advertisement" style={{ width:"320px", height:"100px", objectFit:"cover", borderRadius:"2px", border:"2px solid #aa44ff" }} />
          </a>
        ) : (
          <a href="https://www.astraark.com/" target="_blank" rel="noopener noreferrer" data-testid="placeholder-ad-title-pw"
            style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", width:"320px", height:"100px", border:"2px dashed #aa44ff", borderRadius:"2px", background:"rgba(170,68,255,0.05)", marginBottom:"16px", textDecoration:"none" }}>
            <p style={{ color:"#555", fontSize:"9px", margin:"0 0 4px" }}>SPONSORED BY</p>
            <p style={{ color:"#aa44ff", fontSize:"14px", fontWeight:"bold", letterSpacing:"4px", margin:"0 0 4px", textShadow:"0 0 8px #aa44ff" }}>ASTRAARK</p>
            <p style={{ color:"#aa44ff", fontSize:"9px", margin:0, opacity:0.7 }}>www.astraark.com</p>
          </a>
        )}

        <div style={{ textAlign:"center" }}>
          <p style={{ color:"#444", fontSize:"7px", marginBottom:"4px" }}>ARROWS / WASD — MOVE</p>
          <p style={{ color:"#444", fontSize:"7px" }}>SPACE — FIRE · ESC — PAUSE</p>
        </div>
      </div>
    );
  }

  // ─── GAME SCREEN ───────────────────────────────────────────────────────────
  if (screen === "game") {
    return (
      <div style={{ minHeight:"100vh", background:"#000010", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", touchAction:"none" }}>
        <canvas ref={canvasRef} style={{ display:"block", width:`${CW}px`, height:`${CH}px`, maxWidth:"100vw", maxHeight:"calc(100vh - 80px)", imageRendering:"pixelated", border:"1px solid #222" }} />

        {/* Mobile controls */}
        <div style={{ display:"flex", gap:"12px", marginTop:"10px", justifyContent:"center", width:"100%", maxWidth:"400px" }}>
          <button
            data-testid="button-touch-left-pw"
            onPointerDown={() => touchLeft(true)} onPointerUp={() => touchLeft(false)} onPointerLeave={() => touchLeft(false)}
            style={{ flex:1, padding:"18px 0", background:"rgba(0,255,255,0.1)", border:"2px solid #00ffff", color:"#00ffff", fontSize:"20px", fontFamily:"monospace", borderRadius:"4px", cursor:"pointer", userSelect:"none" }}
          >◀</button>
          <button
            data-testid="button-touch-fire-pw"
            onPointerDown={touchFire}
            style={{ flex:1, padding:"18px 0", background:"rgba(170,68,255,0.2)", border:"2px solid #aa44ff", color:"#aa44ff", fontSize:"14px", fontFamily:"'Press Start 2P',monospace", borderRadius:"4px", cursor:"pointer", userSelect:"none" }}
          >FIRE</button>
          <button
            data-testid="button-touch-right-pw"
            onPointerDown={() => touchRight(true)} onPointerUp={() => touchRight(false)} onPointerLeave={() => touchRight(false)}
            style={{ flex:1, padding:"18px 0", background:"rgba(0,255,255,0.1)", border:"2px solid #00ffff", color:"#00ffff", fontSize:"20px", fontFamily:"monospace", borderRadius:"4px", cursor:"pointer", userSelect:"none" }}
          >▶</button>
        </div>
      </div>
    );
  }

  // ─── GAME OVER ─────────────────────────────────────────────────────────────
  if (screen === "gameover") {
    return (
      <div style={{ minHeight:"100vh", background:"#000010", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Press Start 2P',monospace", padding:"16px" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');`}</style>
        <h1 style={{ color:"#ff4488", fontSize:"20px", textShadow:"0 0 20px #ff4488", marginBottom:"8px" }}>GAME OVER</h1>
        <p style={{ color:"#aa44ff", fontSize:"12px", marginBottom:"4px" }}>SCORE: {finalScore}</p>
        <p style={{ color:"#666", fontSize:"9px", marginBottom:"32px" }}>WAVE {finalWave} REACHED</p>

        {!submitted ? (
          <div style={{ width:"100%", maxWidth:"280px", marginBottom:"20px" }}>
            <p style={{ color:"#888", fontSize:"8px", marginBottom:"8px", textAlign:"center" }}>ENTER YOUR NAME</p>
            <input
              value={playerName}
              onChange={e => setPlayerName(e.target.value.slice(0,16))}
              placeholder="PLAYER NAME"
              maxLength={16}
              data-testid="input-player-name-pw"
              style={{ width:"100%", padding:"10px", background:"#111", border:"2px solid #aa44ff", color:"#fff", fontSize:"11px", fontFamily:"'Press Start 2P',monospace", marginBottom:"10px", boxSizing:"border-box" }}
            />
            <button
              onClick={submitScore}
              data-testid="button-submit-score-pw"
              style={{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#6600ff,#aa44ff)", color:"#fff", fontSize:"11px", fontFamily:"'Press Start 2P',monospace", border:"none", cursor:"pointer" }}
            >SUBMIT SCORE</button>
          </div>
        ) : (
          <p style={{ color:"#00ff88", fontSize:"9px", marginBottom:"20px" }}>✓ SCORE SAVED!</p>
        )}

        <button
          onClick={() => { startGame(); }}
          data-testid="button-play-again-pw"
          style={{ width:"100%", maxWidth:"280px", padding:"14px", background:"linear-gradient(135deg,#6600ff,#aa44ff)", color:"#fff", fontSize:"12px", fontFamily:"'Press Start 2P',monospace", border:"none", cursor:"pointer", marginBottom:"10px" }}
        >▶ PLAY AGAIN</button>
        <button
          onClick={() => setScreen("title")}
          data-testid="button-menu-pw"
          style={{ width:"100%", maxWidth:"280px", padding:"12px", background:"transparent", color:"#888", fontSize:"10px", fontFamily:"'Press Start 2P',monospace", border:"2px solid #444", cursor:"pointer" }}
        >MAIN MENU</button>

        {/* Ad banner */}
        {ADS.gameOver.image ? (
          <a href={ADS.gameOver.link || "#"} target="_blank" rel="noopener noreferrer"
            style={{ display:"block", marginTop:"20px" }} data-testid="link-ad-gameover-pw"
            onClick={() => fetch("/api/ad-click",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({placement:"gameOver"})}).catch(()=>{})}>
            <img src={ADS.gameOver.image} alt="Advertisement" style={{ width:"320px", height:"100px", objectFit:"cover", borderRadius:"2px", border:"2px solid #ff4488" }} />
          </a>
        ) : (
          <a href="https://www.astraark.com/" target="_blank" rel="noopener noreferrer" data-testid="placeholder-ad-gameover-pw"
            style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", width:"320px", height:"100px", border:"2px dashed #ff4488", borderRadius:"2px", background:"rgba(255,68,136,0.05)", marginTop:"20px", textDecoration:"none" }}>
            <p style={{ color:"#555", fontSize:"9px", margin:"0 0 4px" }}>SPONSORED BY</p>
            <p style={{ color:"#ff4488", fontSize:"14px", fontWeight:"bold", letterSpacing:"4px", margin:"0 0 4px", textShadow:"0 0 8px #ff4488" }}>ASTRAARK</p>
            <p style={{ color:"#ff4488", fontSize:"9px", margin:0, opacity:0.7 }}>www.astraark.com</p>
          </a>
        )}
      </div>
    );
  }

  // ─── LEADERBOARD ───────────────────────────────────────────────────────────
  if (screen === "leaderboard") {
    const scores = leaderboardTab === "daily" ? dailyScores : allTimeScores;
    return (
      <div style={{ minHeight:"100vh", background:"#000010", display:"flex", flexDirection:"column", alignItems:"center", padding:"16px", fontFamily:"'Press Start 2P',monospace" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');`}</style>
        <button onClick={() => setScreen("title")} style={{ alignSelf:"flex-start", background:"transparent", border:"1px solid #444", color:"#888", fontSize:"8px", fontFamily:"'Press Start 2P',monospace", padding:"6px 10px", cursor:"pointer", marginBottom:"16px" }}>← BACK</button>
        <h1 style={{ color:"#aa44ff", fontSize:"16px", textShadow:"0 0 12px #aa44ff", marginBottom:"16px" }}>🏆 LEADERBOARD</h1>

        <div style={{ display:"flex", gap:"8px", marginBottom:"20px" }}>
          {(["daily","alltime"] as const).map(tab => (
            <button key={tab} onClick={() => setLeaderboardTab(tab)} data-testid={`tab-${tab}-pw`}
              style={{ padding:"8px 14px", background: leaderboardTab===tab ? "#aa44ff" : "transparent", color: leaderboardTab===tab ? "#fff" : "#888", fontSize:"8px", fontFamily:"'Press Start 2P',monospace", border:`2px solid ${leaderboardTab===tab ? "#aa44ff" : "#444"}`, cursor:"pointer" }}>
              {tab === "daily" ? "TODAY" : "ALL TIME"}
            </button>
          ))}
        </div>

        <div style={{ width:"100%", maxWidth:"380px" }}>
          {scores.length === 0 ? (
            <p style={{ color:"#444", textAlign:"center", fontSize:"9px" }}>NO SCORES YET</p>
          ) : scores.slice(0,10).map((s: any, i: number) => (
            <div key={i} data-testid={`row-score-pw-${i}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 12px", marginBottom:"6px", background: i===0?"rgba(170,68,255,0.15)":"rgba(255,255,255,0.03)", border:`1px solid ${i===0?"#aa44ff":"#222"}` }}>
              <span style={{ color: i===0?"#ffd700":i===1?"#aaa":i===2?"#cd7f32":"#555", fontSize:"10px", width:"24px" }}>#{i+1}</span>
              <span style={{ color:"#fff", fontSize:"9px", flex:1, marginLeft:"8px" }}>{s.playerName}</span>
              <span style={{ color:"#aa44ff", fontSize:"10px" }}>{s.score}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── HOW TO PLAY ───────────────────────────────────────────────────────────
  if (screen === "help") {
    return (
      <div style={{ minHeight:"100vh", background:"#000010", display:"flex", flexDirection:"column", alignItems:"center", padding:"16px", fontFamily:"'Press Start 2P',monospace", overflowY:"auto" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');`}</style>
        <button onClick={() => setScreen("title")} style={{ alignSelf:"flex-start", background:"transparent", border:"1px solid #444", color:"#888", fontSize:"8px", fontFamily:"'Press Start 2P',monospace", padding:"6px 10px", cursor:"pointer", marginBottom:"16px" }}>← BACK</button>
        <h1 style={{ color:"#aa44ff", fontSize:"14px", marginBottom:"20px" }}>HOW TO PLAY</h1>
        {[
          ["CONTROLS", "ARROWS/WASD to move\nSPACE to fire\nESC to pause"],
          ["ENEMIES", "Destroy all invaders\nto advance to next wave\nThey speed up as they die!"],
          ["MYSTERY SHIP", "Red ship crosses top\nshoot it for big bonus\n50-300 pts × wave"],
          ["BARRIERS", "Use for cover — they\nget destroyed over time\nby invader bombs"],
          ["POWER-UPS", "W = Wide shot\nR = Rapid fire\n♥ = Extra life\nL = Laser"],
          ["WEAPONS", "Score 100 → Side guns\nScore 300 → 3-wide\nScore 600 → Full arsenal"],
        ].map(([title, body]) => (
          <div key={title} style={{ width:"100%", maxWidth:"340px", marginBottom:"16px", padding:"14px", border:"1px solid #333", background:"rgba(255,255,255,0.02)" }}>
            <p style={{ color:"#aa44ff", fontSize:"9px", marginBottom:"8px" }}>{title}</p>
            {body.split("\n").map((line,i) => <p key={i} style={{ color:"#888", fontSize:"7px", lineHeight:"1.8" }}>{line}</p>)}
          </div>
        ))}
      </div>
    );
  }

  return null;
}
