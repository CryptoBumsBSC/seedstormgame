import { useCallback, useEffect, useRef, useState } from "react";
import WebApp from "@twa-dev/sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Copy, Link2, Play, Target, Users } from "lucide-react";

type Role = "host" | "guest";
type Phase = "lobby" | "waiting" | "playing" | "ended";
type InputState = { left: boolean; right: boolean; fire: boolean };
type CoopPlayer = { id: "p1" | "p2"; x: number; y: number; lives: number; alive: boolean; invuln: number };
type Enemy = { id: number; x: number; y: number; vx: number; speed: number; hp: number; maxHp: number; strain: 0 | 1 | 2; shot: number };
type Bullet = { id: number; x: number; y: number; vx: number; vy: number; owner: "p1" | "p2" | "enemy" };
type HazardKind = "bong" | "joint" | "matches" | "skull" | "seed" | "white-seed";
type Hazard = { id: number; x: number; y: number; vx: number; speed: number; kind: HazardKind };
type PickupKind = "shield" | "rapid" | "life";
type Pickup = { id: number; x: number; y: number; speed: number; kind: PickupKind };
type Boss = { x: number; y: number; vx: number; hp: number; maxHp: number; shot: number } | null;

type Snapshot = {
  t: number;
  score: number;
  kills: number;
  wave: number;
  combo: number;
  shieldUntil: number;
  rapidUntil: number;
  players: CoopPlayer[];
  enemies: Enemy[];
  bullets: Bullet[];
  hazards: Hazard[];
  pickups: Pickup[];
  boss: Boss;
  status: string;
};

type RoomState = {
  type: "room-state";
  roomId: string;
  host: { id: string; name: string } | null;
  guest: { id: string; name: string } | null;
  ready: boolean;
};

type Engine = Snapshot & {
  nextId: number;
  enemySpawn: number;
  hazardSpawn: number;
  bossSpawned: boolean;
  seedStormAt: number;
  seedStormUntil: number;
  lastKillAt: number;
  p1Shot: number;
  p2Shot: number;
};

const W = 400;
const H = 600;
const PLAYER_Y = H - 72;
const PLAYER_W = 30;
const WS_SNAPSHOT_MS = 80;
const WEAPONS = [
  { score: 0, name: "SINGLE CANNON" },
  { score: 50, name: "SIDE GUNS" },
  { score: 150, name: "RAPID FIRE" },
  { score: 350, name: "MACHINE GUN" },
  { score: 600, name: "FULL ARSENAL" },
] as const;

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join("");
}

function weaponLevel(score: number) {
  let level = 0;
  WEAPONS.forEach((w, i) => { if (score >= w.score) level = i; });
  return level;
}

function freshEngine(): Engine {
  return {
    t: 0,
    score: 0,
    kills: 0,
    wave: 1,
    combo: 0,
    shieldUntil: 0,
    rapidUntil: 0,
    players: [
      { id: "p1", x: W * 0.28 - PLAYER_W / 2, y: PLAYER_Y, lives: 3, alive: true, invuln: 0 },
      { id: "p2", x: W * 0.72 - PLAYER_W / 2, y: PLAYER_Y, lives: 3, alive: true, invuln: 0 },
    ],
    enemies: [], bullets: [], hazards: [], pickups: [], boss: null,
    status: "CO-OP LINK ACTIVE",
    nextId: 1,
    enemySpawn: 450,
    hazardSpawn: 2500,
    bossSpawned: false,
    seedStormAt: 90_000,
    seedStormUntil: 0,
    lastKillAt: -99_999,
    p1Shot: 0,
    p2Shot: 0,
  };
}

function cloneSnapshot(e: Engine): Snapshot {
  return {
    t: e.t, score: e.score, kills: e.kills, wave: e.wave, combo: e.combo,
    shieldUntil: e.shieldUntil, rapidUntil: e.rapidUntil,
    players: e.players.map(p => ({ ...p })),
    enemies: e.enemies.map(v => ({ ...v })),
    bullets: e.bullets.map(v => ({ ...v })),
    hazards: e.hazards.map(v => ({ ...v })),
    pickups: e.pickups.map(v => ({ ...v })),
    boss: e.boss ? { ...e.boss } : null,
    status: e.status,
  };
}

export default function SeedStormCoop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(800);
  const rafRef = useRef<number>();
  const lastFrameRef = useRef(0);
  const lastSnapshotSentRef = useRef(0);
  const engineRef = useRef<Engine>(freshEngine());
  const snapshotRef = useRef<Snapshot>(cloneSnapshot(engineRef.current));
  const localInputRef = useRef<InputState>({ left: false, right: false, fire: false });
  const remoteInputRef = useRef<InputState>({ left: false, right: false, fire: false });
  const inputSeqRef = useRef(0);
  const identityRef = useRef({ id: "", name: "Player", initData: "" });
  const roleRef = useRef<Role | null>(null);
  const roomRef = useRef("");
  const phaseRef = useRef<Phase>("lobby");

  const [phase, setPhaseState] = useState<Phase>("lobby");
  const [role, setRoleState] = useState<Role | null>(null);
  const [roomId, setRoomIdState] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState("OFFLINE");
  const [identityReady, setIdentityReady] = useState(false);
  const [summary, setSummary] = useState({ score: 0, kills: 0, wave: 1, weapon: WEAPONS[0].name, p1: 3, p2: 3 });

  const setPhase = useCallback((value: Phase) => { phaseRef.current = value; setPhaseState(value); }, []);
  const setRole = useCallback((value: Role | null) => { roleRef.current = value; setRoleState(value); }, []);
  const setRoomId = useCallback((value: string) => { roomRef.current = value; setRoomIdState(value); }, []);

  const send = useCallback((payload: unknown) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const syncSummary = useCallback((snap: Snapshot) => {
    setSummary({
      score: snap.score,
      kills: snap.kills,
      wave: snap.wave,
      weapon: WEAPONS[weaponLevel(snap.score)].name,
      p1: snap.players[0]?.lives ?? 0,
      p2: snap.players[1]?.lives ?? 0,
    });
  }, []);

  const handleServerMessage = useCallback((event: MessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(String(event.data)); } catch { return; }

    if (msg.type === "room-state") {
      setRoomState(msg as RoomState);
      if (phaseRef.current === "lobby") setPhase("waiting");
      return;
    }
    if (msg.type === "input" && roleRef.current === "host") {
      remoteInputRef.current = {
        left: Boolean(msg.input?.left),
        right: Boolean(msg.input?.right),
        fire: Boolean(msg.input?.fire),
      };
      return;
    }
    if (msg.type === "match-start" && roleRef.current === "guest") {
      setPhase("playing");
      return;
    }
    if (msg.type === "snapshot" && roleRef.current === "guest" && msg.state) {
      snapshotRef.current = msg.state as Snapshot;
      syncSummary(snapshotRef.current);
      return;
    }
    if (msg.type === "match-end" && roleRef.current === "guest") {
      if (msg.state) snapshotRef.current = msg.state as Snapshot;
      syncSummary(snapshotRef.current);
      setPhase("ended");
      return;
    }
    if (msg.type === "peer-disconnected") {
      setConnection("PARTNER RECONNECTING");
      if (roleRef.current === "host" && phaseRef.current === "playing") {
        engineRef.current.status = "PARTNER RECONNECTING";
      }
    }
  }, [setPhase, syncSummary]);

  const connectRef = useRef<(r: Role, code: string) => void>(() => {});
  const connect = useCallback((nextRole: Role, codeRaw: string) => {
    const code = codeRaw.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
    if (!identityRef.current.id) return;

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    socketRef.current?.close();
    setRole(nextRole);
    setRoomId(code);
    setConnection("CONNECTING");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/multiplayer/ws`);
    socketRef.current = ws;

    ws.addEventListener("open", () => {
      reconnectDelayRef.current = 800;
      setConnection("ONLINE");
      ws.send(JSON.stringify({
        type: "join",
        roomId: code,
        role: nextRole,
        playerId: identityRef.current.id,
        name: identityRef.current.name,
        initData: identityRef.current.initData,
      }));
    });
    ws.addEventListener("message", handleServerMessage);
    ws.addEventListener("close", () => {
      if (socketRef.current !== ws) return;
      setConnection("RECONNECTING");
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(10_000, Math.round(delay * 1.7));
      reconnectTimerRef.current = setTimeout(() => connectRef.current(nextRole, code), delay);
    });
    ws.addEventListener("error", () => setConnection("LINK ERROR"));
  }, [handleServerMessage, setRole, setRoomId]);
  connectRef.current = connect;

  useEffect(() => {
    let id = `web-${Math.random().toString(36).slice(2, 12)}`;
    let name = "Web Player";
    let initData = "";
    let startParam = new URLSearchParams(location.search).get("room") || "";
    try {
      WebApp.ready();
      initData = WebApp.initData || "";
      const user = WebApp.initDataUnsafe?.user;
      const telegramStart = (WebApp.initDataUnsafe as any)?.start_param || "";
      if (user && initData) {
        id = String(user.id);
        name = user.username || user.first_name || "Player";
      }
      if (telegramStart.startsWith("coop_")) startParam = telegramStart.slice(5);
    } catch {
      // Normal browser play is supported when the multiplayer server allows web identities.
    }
    identityRef.current = { id, name, initData };
    setIdentityReady(true);
    if (startParam) {
      const code = startParam.trim().toUpperCase();
      setRoomInput(code);
      setTimeout(() => connectRef.current("guest", code), 0);
    }
  }, []);

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    socketRef.current?.close();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const startHostMatch = useCallback(() => {
    if (roleRef.current !== "host" || !roomState?.ready) return;
    engineRef.current = freshEngine();
    engineRef.current.status = "DOUBLE TROUBLE";
    snapshotRef.current = cloneSnapshot(engineRef.current);
    syncSummary(snapshotRef.current);
    setPhase("playing");
    send({ type: "match-start", roomId: roomRef.current, t: Date.now() });
    send({ type: "snapshot", state: snapshotRef.current });
  }, [roomState?.ready, send, setPhase, syncSummary]);

  const endHostMatch = useCallback(() => {
    const snap = cloneSnapshot(engineRef.current);
    snapshotRef.current = snap;
    syncSummary(snap);
    setPhase("ended");
    send({ type: "match-end", state: snap });
  }, [send, setPhase, syncSummary]);

  const hitPlayer = useCallback((e: Engine, p: CoopPlayer, deadly = false) => {
    if (!p.alive || p.invuln > 0 || e.shieldUntil > e.t) return;
    p.lives = deadly ? 0 : p.lives - 1;
    p.invuln = 1500;
    if (p.lives <= 0) { p.lives = 0; p.alive = false; }
    e.combo = 0;
    e.status = p.alive ? `${p.id.toUpperCase()} TOOK A HIT` : `${p.id.toUpperCase()} IS DOWN`;
  }, []);

  const spawnEnemy = useCallback((e: Engine) => {
    const strain = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    const hp = Math.max(1, e.wave + (strain === 2 ? 1 : 0));
    e.enemies.push({
      id: e.nextId++, x: 18 + Math.random() * (W - 54), y: -34,
      vx: (Math.random() - .5) * Math.min(1.4, .25 + e.wave * .08),
      speed: 1.25 + e.wave * .23 + Math.random() * 1.1,
      hp, maxHp: hp, strain, shot: 500 + Math.random() * 1500,
    });
  }, []);

  const firePlayer = useCallback((e: Engine, p: CoopPlayer, owner: "p1" | "p2") => {
    if (!p.alive) return;
    const level = weaponLevel(e.score);
    const cx = p.x + PLAYER_W / 2;
    const patterns: number[][] = [[0], [-6, 6], [-10, 0, 10], [-13, -4, 4, 13], [-16, -8, 0, 8, 16]];
    patterns[level].forEach(offset => e.bullets.push({
      id: e.nextId++, x: cx + offset, y: p.y - 8,
      vx: offset * .025, vy: level >= 3 ? -12 : -10.5, owner,
    }));
  }, []);

  const updateHost = useCallback((dt: number) => {
    const e = engineRef.current;
    if (phaseRef.current !== "playing") return;
    e.t += dt;
    e.wave = 1 + Math.floor(e.t / 12_500);
    e.players.forEach(p => { p.invuln = Math.max(0, p.invuln - dt); });

    const inputs = [localInputRef.current, remoteInputRef.current];
    e.players.forEach((p, idx) => {
      if (!p.alive) return;
      const input = inputs[idx];
      const speed = 5.2;
      if (input.left) p.x -= speed;
      if (input.right) p.x += speed;
      p.x = Math.max(0, Math.min(W - PLAYER_W, p.x));
      const key = idx === 0 ? "p1Shot" : "p2Shot";
      e[key] = Math.max(0, e[key] - dt);
      const lvl = weaponLevel(e.score);
      const baseDelay = lvl >= 3 ? 115 : lvl >= 2 ? 155 : 205;
      const delay = e.rapidUntil > e.t ? baseDelay * .5 : baseDelay;
      if (input.fire && e[key] <= 0) {
        firePlayer(e, p, idx === 0 ? "p1" : "p2");
        e[key] = delay;
      }
    });

    e.enemySpawn -= dt;
    if (e.enemySpawn <= 0) {
      spawnEnemy(e);
      if (e.t > 35_000 && Math.random() < .22) spawnEnemy(e);
      e.enemySpawn = Math.max(330, 1450 - e.wave * 92) * (.65 + Math.random() * .65);
    }

    e.hazardSpawn -= dt;
    if (e.t > 20_000 && e.hazardSpawn <= 0) {
      const kinds: HazardKind[] = ["bong", "joint", "matches"];
      const kind = e.t > 60_000 && Math.random() < .06 ? "skull" : kinds[Math.floor(Math.random() * kinds.length)];
      e.hazards.push({ id: e.nextId++, x: 15 + Math.random() * (W - 45), y: -28, vx: (Math.random() - .5) * .45, speed: 2 + Math.random() * 3.2, kind });
      e.hazardSpawn = Math.max(900, 3900 - e.wave * 170) * (.55 + Math.random() * .8);
    }

    if (e.t >= e.seedStormAt && e.seedStormUntil <= e.t) {
      e.seedStormUntil = e.t + 4500;
      e.seedStormAt = e.t + 45_000 + Math.random() * 25_000;
      e.status = "SEED STORM!";
    }
    if (e.seedStormUntil > e.t && Math.random() < dt / 125) {
      const white = Math.random() < .04;
      e.hazards.push({ id: e.nextId++, x: Math.random() * (W - 12), y: -20, vx: (Math.random() - .5) * 1.1, speed: 5 + Math.random() * 4, kind: white ? "white-seed" : "seed" });
    }

    if (!e.bossSpawned && e.t >= 120_000) {
      e.bossSpawned = true;
      e.boss = { x: W / 2 - 42, y: -65, vx: 2, hp: 22, maxHp: 22, shot: 800 };
      e.status = "BUD BOSS INBOUND";
    }

    if (e.boss) {
      if (e.boss.y < 42) e.boss.y += 1.1;
      else {
        e.boss.x += e.boss.vx;
        if (e.boss.x < 8 || e.boss.x > W - 92) e.boss.vx *= -1;
        e.boss.shot -= dt;
        if (e.boss.shot <= 0) {
          [0, -1.7, 1.7].forEach(vx => e.bullets.push({ id: e.nextId++, x: e.boss!.x + 42, y: e.boss!.y + 55, vx, vy: 5.3, owner: "enemy" }));
          e.boss.shot = 700;
        }
      }
    }

    e.enemies.forEach(en => {
      en.y += en.speed;
      en.x += en.vx;
      if (en.x < 0 || en.x > W - 28) en.vx *= -1;
      en.shot -= dt;
      if (en.shot <= 0) {
        e.bullets.push({ id: e.nextId++, x: en.x + 14, y: en.y + 22, vx: (Math.random() - .5) * .7, vy: 4.3 + e.wave * .18, owner: "enemy" });
        en.shot = Math.max(450, 1700 - e.wave * 75) + Math.random() * 900;
      }
    });
    e.hazards.forEach(h => { h.y += h.speed; h.x += h.vx; });
    e.pickups.forEach(p => { p.y += p.speed; });
    e.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });

    const boxHit = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

    e.bullets.forEach(b => {
      if ((b as any).dead) return;
      if (b.owner === "enemy") {
        e.players.forEach(p => {
          if (p.alive && boxHit(b.x - 3, b.y - 5, 6, 10, p.x, p.y, PLAYER_W, 30)) {
            (b as any).dead = true; hitPlayer(e, p);
          }
        });
        return;
      }
      if (e.boss && boxHit(b.x - 3, b.y - 7, 6, 14, e.boss.x, e.boss.y, 84, 58)) {
        (b as any).dead = true; e.boss.hp--;
        if (e.boss.hp <= 0) { e.score += 100; e.kills += 10; e.status = "BUD BOSS SMOKED!"; e.shieldUntil = e.t + 10_000; e.boss = null; }
        return;
      }
      for (const en of e.enemies) {
        if ((en as any).dead) continue;
        if (boxHit(b.x - 3, b.y - 7, 6, 14, en.x, en.y, 28, 28)) {
          (b as any).dead = true; en.hp--;
          if (en.hp <= 0) {
            (en as any).dead = true;
            const quick = e.t - e.lastKillAt < 1500;
            e.combo = quick ? e.combo + 1 : 1;
            e.lastKillAt = e.t;
            e.kills++;
            const mult = Math.min(3, 1 + Math.max(0, e.combo - 1) * .1);
            e.score += Math.max(1, Math.round(en.maxHp * mult));
            if (Math.random() < .18) {
              const r = Math.random();
              const kind: PickupKind = r < .42 ? "shield" : r < .84 ? "rapid" : "life";
              e.pickups.push({ id: e.nextId++, x: en.x + 6, y: en.y + 8, speed: 1.45, kind });
            }
          }
          break;
        }
      }
    });

    e.players.forEach(p => {
      if (!p.alive) return;
      e.enemies.forEach(en => {
        if (!(en as any).dead && boxHit(p.x, p.y, PLAYER_W, 30, en.x, en.y, 28, 28)) { (en as any).dead = true; hitPlayer(e, p); }
      });
      e.hazards.forEach(h => {
        if ((h as any).dead) return;
        if (boxHit(p.x, p.y, PLAYER_W, 30, h.x, h.y, 24, 28)) {
          (h as any).dead = true;
          if (h.kind === "white-seed") { e.shieldUntil = Math.max(e.shieldUntil, e.t) + 5000; e.rapidUntil = Math.max(e.rapidUntil, e.t) + 5000; e.status = "WHITE-HOT SEED BONUS!"; }
          else hitPlayer(e, p, h.kind === "skull");
        }
      });
      e.pickups.forEach(pk => {
        if ((pk as any).dead || !boxHit(p.x, p.y, PLAYER_W, 30, pk.x, pk.y, 18, 18)) return;
        (pk as any).dead = true;
        if (pk.kind === "shield") { e.shieldUntil = Math.max(e.shieldUntil, e.t) + 5000; e.status = "TEAM SHIELD!"; }
        if (pk.kind === "rapid") { e.rapidUntil = Math.max(e.rapidUntil, e.t) + 5000; e.status = "DOUBLE RAPID FIRE!"; }
        if (pk.kind === "life") {
          const down = e.players.find(v => !v.alive);
          if (down) { down.alive = true; down.lives = 1; down.invuln = 2000; e.status = `${down.id.toUpperCase()} REVIVED!`; }
          else { const target = e.players.reduce((a, b) => a.lives <= b.lives ? a : b); target.lives = Math.min(3, target.lives + 1); e.status = "+1 TEAM LIFE"; }
        }
      });
    });

    e.enemies.forEach(en => { if (en.y > H + 30) (en as any).dead = true; });
    e.hazards.forEach(h => { if (h.y > H + 35) (h as any).dead = true; });
    e.bullets = e.bullets.filter(b => !(b as any).dead && b.y > -25 && b.y < H + 30 && b.x > -30 && b.x < W + 30);
    e.enemies = e.enemies.filter(en => !(en as any).dead);
    e.hazards = e.hazards.filter(h => !(h as any).dead);
    e.pickups = e.pickups.filter(p => !(p as any).dead && p.y < H + 25);

    if (e.t - e.lastKillAt > 2200) e.combo = 0;
    if (e.players.every(p => !p.alive)) endHostMatch();
  }, [endHostMatch, firePlayer, hitPlayer, spawnEnemy]);

  const draw = useCallback((snap: Snapshot) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#08080d"; ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 70; i++) {
      const y = (i * 83 + snap.t * .035 * (1 + snap.wave * .06)) % H;
      const x = (i * 47 + (i % 3) * 97) % W;
      ctx.fillStyle = `rgba(255,255,255,${.18 + (i % 4) * .08})`; ctx.fillRect(x, y, 1 + (i % 2), 1 + (i % 2));
    }

    ctx.fillStyle = "rgba(255,165,0,.07)"; ctx.fillRect(0, 0, W, 80);
    ctx.strokeStyle = "rgba(255,190,0,.45)"; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(0,80); ctx.lineTo(W,80); ctx.stroke(); ctx.setLineDash([]);

    const drawBud = (x: number, y: number, color: string, label: string, alive: boolean) => {
      ctx.save(); ctx.globalAlpha = alive ? 1 : .22; ctx.shadowColor = color; ctx.shadowBlur = 12;
      ctx.fillStyle = "#15803d"; ctx.fillRect(x + 12, y - 10, 6, 18); ctx.fillRect(x + 3, y - 3, 24, 6); ctx.fillRect(x + 6, y - 7, 6, 16); ctx.fillRect(x + 18, y - 7, 6, 16);
      ctx.fillStyle = "#22c55e"; ctx.fillRect(x + 3, y + 7, 24, 20); ctx.fillStyle = "#111"; ctx.fillRect(x + 5, y + 13, 20, 5); ctx.fillStyle = color; ctx.fillRect(x + 12, y + 28, 6, 4);
      ctx.shadowBlur = 0; ctx.font = "8px monospace"; ctx.textAlign = "center"; ctx.fillStyle = color; ctx.fillText(label, x + 15, y + 42); ctx.restore();
    };

    snap.players.forEach((p, i) => {
      if (snap.shieldUntil > snap.t && p.alive) { ctx.strokeStyle = i === 0 ? "#00ffff" : "#ffd700"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x + 15, p.y + 13, 24, 0, Math.PI * 2); ctx.stroke(); }
      drawBud(p.x, p.y, i === 0 ? "#00ffff" : "#ffd700", `P${i+1}`, p.alive);
    });

    snap.enemies.forEach(en => {
      const cols = ["#9b5de5", "#22c55e", "#f97316"];
      ctx.shadowColor = cols[en.strain]; ctx.shadowBlur = 8; ctx.fillStyle = cols[en.strain];
      ctx.fillRect(en.x + 4, en.y + 2, 20, 24); ctx.fillRect(en.x, en.y + 8, 28, 12); ctx.fillStyle = "#111"; ctx.fillRect(en.x + 5, en.y + 10, 6, 4); ctx.fillRect(en.x + 17, en.y + 10, 6, 4); ctx.shadowBlur = 0;
      if (en.hp < en.maxHp) { ctx.fillStyle="#333"; ctx.fillRect(en.x, en.y-6, 28,3); ctx.fillStyle="#00ff00"; ctx.fillRect(en.x,en.y-6,28*(en.hp/en.maxHp),3); }
    });

    const hazardColor: Record<HazardKind,string> = { bong:"#4488ff", joint:"#ff6600", matches:"#ff3333", skull:"#0b6623", seed:"#b88955", "white-seed":"#ffffff" };
    snap.hazards.forEach(h => {
      const c = hazardColor[h.kind]; ctx.shadowColor=c;ctx.shadowBlur=h.kind==="white-seed"?18:8;ctx.fillStyle=c;
      if (h.kind === "seed" || h.kind === "white-seed") { ctx.beginPath();ctx.ellipse(h.x+8,h.y+10,5,9,0,0,Math.PI*2);ctx.fill(); }
      else { ctx.fillRect(h.x,h.y,22,25);ctx.fillStyle="#090909";ctx.font="bold 9px monospace";ctx.textAlign="center";ctx.fillText(h.kind==="bong"?"B":h.kind==="joint"?"J":h.kind==="matches"?"M":"☠",h.x+11,h.y+16); }
      ctx.shadowBlur=0;
    });

    snap.pickups.forEach(pk => { const c=pk.kind==="shield"?"#00ffff":pk.kind==="rapid"?"#ff00ff":"#ff3344";ctx.shadowColor=c;ctx.shadowBlur=12;ctx.fillStyle=c;ctx.beginPath();ctx.arc(pk.x+9,pk.y+9,8,0,Math.PI*2);ctx.fill();ctx.fillStyle="#000";ctx.font="bold 10px monospace";ctx.textAlign="center";ctx.fillText(pk.kind==="shield"?"S":pk.kind==="rapid"?"R":"+",pk.x+9,pk.y+12);ctx.shadowBlur=0; });

    if (snap.boss) { const b=snap.boss;ctx.shadowColor="#ff0000";ctx.shadowBlur=18;ctx.fillStyle="#780000";ctx.beginPath();ctx.ellipse(b.x+42,b.y+29,42,29,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#ffff00";ctx.fillRect(b.x+22,b.y+20,8,6);ctx.fillRect(b.x+54,b.y+20,8,6);ctx.shadowBlur=0;ctx.fillStyle="#333";ctx.fillRect(b.x,b.y-10,84,6);ctx.fillStyle="#ff2222";ctx.fillRect(b.x,b.y-10,84*(b.hp/b.maxHp),6); }

    snap.bullets.forEach(b => { const enemy=b.owner==="enemy";ctx.fillStyle=enemy?"#ff00ff":"#8dff63";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=6;ctx.fillRect(b.x-2,b.y-6,4,12);ctx.shadowBlur=0; });

    ctx.font="9px monospace";ctx.textAlign="left";ctx.fillStyle="#ffaa00";ctx.fillText("2X ZONE",6,14);
    if (snap.combo>=3){ctx.textAlign="right";ctx.fillStyle="#ffff00";ctx.fillText(`${snap.combo}x TEAM COMBO`,W-8,18);}
    if (snap.status){ctx.textAlign="center";ctx.fillStyle="#00ffff";ctx.fillText(snap.status,W/2,H-18);}
  }, []);

  useEffect(() => {
    const loop = (now: number) => {
      const dt = Math.min(34, now - (lastFrameRef.current || now));
      lastFrameRef.current = now;
      if (phaseRef.current === "playing" && roleRef.current === "host") {
        updateHost(dt);
        const snap = cloneSnapshot(engineRef.current);
        snapshotRef.current = snap;
        if (now - lastSnapshotSentRef.current >= WS_SNAPSHOT_MS) {
          lastSnapshotSentRef.current = now;
          send({ type: "snapshot", state: snap });
          syncSummary(snap);
        }
      }
      draw(snapshotRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [draw, send, syncSummary, updateHost]);

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (["ArrowLeft","a","A"].includes(ev.key)) localInputRef.current.left = true;
      if (["ArrowRight","d","D"].includes(ev.key)) localInputRef.current.right = true;
      if (ev.code === "Space" || ev.key === "ArrowUp") localInputRef.current.fire = true;
      if (["ArrowLeft","ArrowRight","ArrowUp"].includes(ev.key) || ev.code === "Space") ev.preventDefault();
      if (roleRef.current === "guest") send({ type:"input", seq:++inputSeqRef.current, input:localInputRef.current });
    };
    const up = (ev: KeyboardEvent) => {
      if (["ArrowLeft","a","A"].includes(ev.key)) localInputRef.current.left = false;
      if (["ArrowRight","d","D"].includes(ev.key)) localInputRef.current.right = false;
      if (ev.code === "Space" || ev.key === "ArrowUp") localInputRef.current.fire = false;
      if (roleRef.current === "guest") send({ type:"input", seq:++inputSeqRef.current, input:localInputRef.current });
    };
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);
    return()=>{window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);};
  }, [send]);

  const setControl = (key: keyof InputState, value: boolean) => {
    localInputRef.current = { ...localInputRef.current, [key]: value };
    if (roleRef.current === "guest") send({ type:"input", seq:++inputSeqRef.current, input:localInputRef.current });
  };

  const createRoom = () => {
    const code = makeRoomCode();
    setRoomInput(code);
    connect("host", code);
    setPhase("waiting");
  };
  const joinRoom = () => {
    const code = roomInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
    connect("guest", code);
    setPhase("waiting");
  };

  const inviteUrl = roomId ? `https://t.me/SeedStormBot/seedstorm?startapp=coop_${roomId}` : "";
  const shareInvite = () => {
    if (!inviteUrl) return;
    const share = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent("Join my 2-player SEED STORM co-op match!")}`;
    try { WebApp.openTelegramLink(share); } catch { window.open(share, "_blank"); }
  };
  const copyInvite = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setConnection("INVITE COPIED"); } catch { setConnection("COPY FAILED — USE SHARE"); }
  };

  const partnerName = role === "host" ? roomState?.guest?.name : roomState?.host?.name;
  const ready = Boolean(roomState?.ready);

  return (
    <div className="min-h-screen bg-[#08080d] text-white flex flex-col items-center p-3 overflow-auto">
      <div className="w-full max-w-[430px]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[9px] tracking-[.2em] text-[#00ffff]">SEED STORM // ONLINE</div>
            <h1 className="text-xl font-bold text-[#00ff00]" style={{textShadow:"0 0 12px #00ff00"}}>2-PLAYER CO-OP</h1>
          </div>
          <div className="text-right text-[9px]"><div className="text-[#888]">LINK</div><div className={connection.includes("ONLINE")||connection.includes("COPIED")?"text-[#00ff00]":"text-[#ffff00]"}>{connection}</div></div>
        </div>

        {phase === "lobby" && (
          <Card className="p-4 border-2 bg-black/70" style={{borderColor:"#00ffff"}}>
            <div className="text-center mb-4"><Users className="w-10 h-10 mx-auto text-[#00ffff] mb-2"/><div className="text-sm text-[#00ffff]">TWO PHONES. ONE STORM.</div><p className="text-[10px] text-[#888] mt-2 leading-5">Create a room and invite a mate in Telegram, or enter their room code. Both players fight the same enemies, share the score and build the same weapon arsenal.</p></div>
            <Button disabled={!identityReady} onClick={createRoom} className="w-full py-6 mb-4 font-bold" style={{background:"#00ff00",color:"#000"}}><Link2 className="w-4 h-4 mr-2"/>CREATE CO-OP ROOM</Button>
            <div className="flex gap-2"><Input value={roomInput} onChange={e=>setRoomInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12))} placeholder="ROOM CODE" className="uppercase text-center bg-[#111] border-[#ff00ff]"/><Button onClick={joinRoom} disabled={roomInput.length<4} style={{background:"#ff00ff",color:"#000"}}>JOIN</Button></div>
            <a href="/" className="block mt-5 text-center text-[10px] text-[#888] hover:text-[#00ffff]">← BACK TO SOLO SEED STORM</a>
          </Card>
        )}

        {(phase === "waiting" || phase === "ended") && (
          <Card className="p-4 border-2 bg-black/70 mb-3" style={{borderColor:ready?"#00ff00":"#ffff00"}}>
            <div className="text-center">
              <div className="text-[9px] text-[#888]">ROOM</div><div className="text-3xl tracking-[.2em] font-bold text-[#ffff00] my-1">{roomId || roomInput}</div>
              <div className="text-[10px] text-[#00ffff] mb-3">{ready ? `${roomState?.host?.name} + ${roomState?.guest?.name}` : role === "host" ? "WAITING FOR PLAYER 2…" : "CONNECTING TO HOST…"}</div>
              {role === "host" && !ready && <div className="flex gap-2 mb-3"><Button onClick={shareInvite} className="flex-1" style={{background:"#229ED9",color:"white"}}><Link2 className="w-4 h-4 mr-2"/>SHARE IN TELEGRAM</Button><Button onClick={copyInvite} variant="outline" className="border-[#00ffff] text-[#00ffff]"><Copy className="w-4 h-4"/></Button></div>}
              {role === "host" && ready && <Button onClick={startHostMatch} className="w-full py-6 font-bold" style={{background:"#00ff00",color:"#000",boxShadow:"0 0 18px #00ff00"}}><Play className="w-5 h-5 mr-2"/>{phase==="ended"?"PLAY AGAIN":"START CO-OP"}</Button>}
              {role === "guest" && ready && <div className="text-sm text-[#00ff00] animate-pulse">HOST IS READY — HOLD ON</div>}
              {phase === "ended" && <div className="mt-3 text-[#ffff00] text-xs">FINAL TEAM SCORE: {summary.score}</div>}
            </div>
          </Card>
        )}

        <div className={phase === "playing" ? "block" : "hidden"}>
          <div className="grid grid-cols-4 gap-1 mb-2 text-center text-[9px]">
            <div className="border border-[#333] p-2"><span className="text-[#888]">SCORE</span><div className="text-[#00ff00] text-sm">{String(summary.score).padStart(5,"0")}</div></div>
            <div className="border border-[#333] p-2"><span className="text-[#888]">WAVE</span><div className="text-[#ffff00] text-sm">{summary.wave}</div></div>
            <div className="border border-[#00ffff] p-2"><span className="text-[#00ffff]">P1</span><div>{summary.p1} ♥</div></div>
            <div className="border border-[#ffd700] p-2"><span className="text-[#ffd700]">P2</span><div>{summary.p2} ♥</div></div>
          </div>
          <div className="text-center text-[9px] mb-1 text-[#ff00ff]">{summary.weapon} · {summary.kills} KILLS · {partnerName ? `WITH ${partnerName}` : "CO-OP"}</div>
          <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto border-2 border-[#ff00ff] bg-black touch-none" style={{imageRendering:"pixelated",aspectRatio:`${W}/${H}`}}/>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Button className="h-16 bg-[#222] text-[#00ffff]" onPointerDown={()=>setControl("left",true)} onPointerUp={()=>setControl("left",false)} onPointerCancel={()=>setControl("left",false)} onPointerLeave={()=>setControl("left",false)}><ChevronLeft className="w-8 h-8"/></Button>
            <Button className="h-16 font-bold" style={{background:"#00ff00",color:"#000",boxShadow:"0 0 12px #00ff00"}} onPointerDown={()=>setControl("fire",true)} onPointerUp={()=>setControl("fire",false)} onPointerCancel={()=>setControl("fire",false)} onPointerLeave={()=>setControl("fire",false)}><Target className="w-7 h-7"/></Button>
            <Button className="h-16 bg-[#222] text-[#00ffff]" onPointerDown={()=>setControl("right",true)} onPointerUp={()=>setControl("right",false)} onPointerCancel={()=>setControl("right",false)} onPointerLeave={()=>setControl("right",false)}><ChevronRight className="w-8 h-8"/></Button>
          </div>
          <p className="text-center text-[8px] text-[#666] mt-2">DESKTOP: A/D OR ←/→ · SPACE TO FIRE · PLAYER 1 HOSTS THE SHARED STORM</p>
        </div>
      </div>
    </div>
  );
}
