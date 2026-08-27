import { useEffect, useRef, useState } from "react";
import "./rift-storm-standalone.css";

type Phase = "ready" | "playing" | "over";
type EnemyKind = "skitter" | "dart" | "brute" | "shifter" | "boss";
type PickupKind = "shield" | "repair";
type Vec = { x: number; y: number };

type Shot = Vec & { vx: number; vy: number; radius: number; damage: number; life: number };
type EnemyShot = Vec & { vx: number; vy: number; radius: number };
type Particle = Vec & { vx: number; vy: number; life: number; maxLife: number; size: number; color: string };
type Pickup = Vec & { kind: PickupKind; vy: number; radius: number; spin: number };
type Star = Vec & { speed: number; size: number; alpha: number };
type Portal = Vec & {
  age: number;
  life: number;
  spawnEvery: number;
  spawnTimer: number;
  spawned: number;
  maxSpawn: number;
  radius: number;
  bossPortal: boolean;
};
type Enemy = Vec & {
  kind: EnemyKind;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  worth: number;
  age: number;
  shootTimer: number;
  wobble: number;
};
type World = {
  time: number;
  score: number;
  kills: number;
  lives: number;
  shield: number;
  combo: number;
  comboTimer: number;
  weaponTier: number;
  nextPortal: number;
  nextBossAt: number;
  bossNumber: number;
  bossActive: boolean;
  fireTimer: number;
  flash: number;
  shake: number;
  announce: string;
  announceTimer: number;
  player: { x: number; y: number; radius: number; speed: number };
  portals: Portal[];
  enemies: Enemy[];
  shots: Shot[];
  enemyShots: EnemyShot[];
  particles: Particle[];
  pickups: Pickup[];
  stars: Star[];
  dead: boolean;
};

const W = 540;
const H = 900;
const PLAYER_Y = H - 94;
const STORAGE_KEY = "riftstorm:best:v2";
const LASER_TIERS = [
  { kills: 0, name: "RIFT PULSE" },
  { kills: 10, name: "TWIN ARC" },
  { kills: 25, name: "TRI-BEAM" },
  { kills: 50, name: "ION FAN" },
  { kills: 90, name: "RIFT ARRAY" },
] as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function distance(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function zoneForTime(seconds: number) {
  if (seconds < 35) return "RIFT EDGE";
  if (seconds < 75) return "SHATTER BELT";
  if (seconds < 120) return "ION VEIL";
  if (seconds < 175) return "THE BREACH";
  return "DEEP RIFT";
}

function tierForKills(kills: number) {
  let tier = 0;
  for (let i = 0; i < LASER_TIERS.length; i += 1) {
    if (kills >= LASER_TIERS[i].kills) tier = i;
  }
  return tier;
}

function makeWorld(): World {
  return {
    time: 0,
    score: 0,
    kills: 0,
    lives: 3,
    shield: 0,
    combo: 0,
    comboTimer: 0,
    weaponTier: 0,
    nextPortal: 0.7,
    nextBossAt: 70,
    bossNumber: 0,
    bossActive: false,
    fireTimer: 0,
    flash: 0,
    shake: 0,
    announce: "",
    announceTimer: 0,
    player: { x: W / 2, y: PLAYER_Y, radius: 18, speed: 330 },
    portals: [],
    enemies: [],
    shots: [],
    enemyShots: [],
    particles: [],
    pickups: [],
    stars: Array.from({ length: 135 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 12 + Math.random() * 48,
      size: Math.random() < 0.82 ? 1 : 1.8,
      alpha: 0.18 + Math.random() * 0.72,
    })),
    dead: false,
  };
}

function difficulty(world: World) {
  return 1 + world.time / 35 + world.kills / 100;
}

function burst(world: World, x: number, y: number, color: string, count = 14, force = 120) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = force * (0.25 + Math.random() * 0.9);
    const life = 0.28 + Math.random() * 0.5;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: 1.7 + Math.random() * 4.2,
      color,
    });
  }
}

function announce(world: World, text: string, seconds = 1.5) {
  world.announce = text;
  world.announceTimer = seconds;
}

function spawnPortal(world: World, bossPortal = false) {
  const d = difficulty(world);
  const x = bossPortal ? W / 2 : 58 + Math.random() * (W - 116);
  const y = bossPortal ? 138 : 105 + Math.random() * 265;
  world.portals.push({
    x,
    y,
    age: 0,
    life: bossPortal ? 3.5 : 3 + Math.random() * 1.6,
    spawnEvery: bossPortal ? 1.4 : clamp(1.05 - d * 0.08, 0.36, 0.95),
    spawnTimer: bossPortal ? 1.25 : 0.62,
    spawned: 0,
    maxSpawn: bossPortal ? 1 : clamp(Math.floor(1 + d * 0.62 + Math.random() * 2), 1, 5),
    radius: bossPortal ? 66 : 33 + Math.random() * 18,
    bossPortal,
  });
  world.shake = Math.max(world.shake, bossPortal ? 10 : 2.8);
}

function chooseEnemy(world: World): EnemyKind {
  const d = difficulty(world);
  const r = Math.random();
  if (d > 3.8 && r < 0.17) return "shifter";
  if (d > 2.2 && r < 0.35) return "brute";
  if (d > 1.35 && r < 0.58) return "dart";
  return "skitter";
}

function spawnEnemy(world: World, portal: Portal) {
  if (portal.bossPortal) {
    const hp = 80 + world.bossNumber * 46;
    world.enemies.push({
      kind: "boss",
      x: portal.x,
      y: portal.y,
      vx: 118,
      vy: 0,
      radius: 45,
      hp,
      maxHp: hp,
      worth: 1500 + world.bossNumber * 350,
      age: 0,
      shootTimer: 1.05,
      wobble: Math.random() * Math.PI * 2,
    });
    world.bossActive = true;
    announce(world, `RIFT LORD ${world.bossNumber + 1}`, 2.1);
    return;
  }

  const kind = chooseEnemy(world);
  const d = difficulty(world);
  let hp = 1;
  let radius = 15;
  let speed = 82 + d * 10;
  let worth = 14;

  if (kind === "dart") {
    hp = d > 4 ? 2 : 1;
    radius = 13;
    speed = 128 + d * 14;
    worth = 22;
  } else if (kind === "brute") {
    hp = 4 + Math.floor(d * 0.6);
    radius = 24;
    speed = 54 + d * 7;
    worth = 44;
  } else if (kind === "shifter") {
    hp = 2 + Math.floor(d * 0.4);
    radius = 18;
    speed = 92 + d * 10;
    worth = 34;
  }

  world.enemies.push({
    kind,
    x: portal.x + (Math.random() - 0.5) * 22,
    y: portal.y,
    vx: (Math.random() - 0.5) * 46,
    vy: speed,
    radius,
    hp,
    maxHp: hp,
    worth,
    age: 0,
    shootTimer: 1.55 + Math.random() * 2.1,
    wobble: Math.random() * Math.PI * 2,
  });
}

function fire(world: World) {
  const p = world.player;
  const speed = 760;
  const add = (x: number, y: number, vx: number, vy: number, radius: number, damage = 1) => {
    world.shots.push({ x, y, vx, vy, radius, damage, life: 1.5 });
  };
  switch (world.weaponTier) {
    case 0:
      add(p.x, p.y - 22, 0, -speed, 3.4);
      break;
    case 1:
      add(p.x - 10, p.y - 18, 0, -speed, 3.4);
      add(p.x + 10, p.y - 18, 0, -speed, 3.4);
      break;
    case 2:
      add(p.x, p.y - 24, 0, -speed, 3.8);
      add(p.x - 11, p.y - 16, -78, -speed * 0.99, 3.2);
      add(p.x + 11, p.y - 16, 78, -speed * 0.99, 3.2);
      break;
    case 3:
      add(p.x - 13, p.y - 16, -110, -speed, 3.3);
      add(p.x - 5, p.y - 24, -28, -speed * 1.05, 3.8);
      add(p.x + 5, p.y - 24, 28, -speed * 1.05, 3.8);
      add(p.x + 13, p.y - 16, 110, -speed, 3.3);
      break;
    default:
      [-165, -82, 0, 82, 165].forEach((vx, i) => {
        add(p.x + (i - 2) * 7, p.y - 22, vx, -speed * (i === 2 ? 1.08 : 1), i === 2 ? 4.5 : 3.4, i === 2 ? 2 : 1);
      });
  }
  world.fireTimer = [0.18, 0.16, 0.135, 0.105, 0.082][world.weaponTier];
}

function hitPlayer(world: World) {
  if (world.shield > 0 || world.dead) return;
  world.lives -= 1;
  world.combo = 0;
  world.comboTimer = 0;
  world.shield = 1.5;
  world.flash = 0.18;
  world.shake = 13;
  burst(world, world.player.x, world.player.y, "#ffb15a", 28, 170);
  if (world.lives <= 0) world.dead = true;
}

function killEnemy(world: World, enemy: Enemy) {
  world.kills += 1;
  world.combo = world.comboTimer > 0 ? world.combo + 1 : 1;
  world.comboTimer = 1.35;
  const multiplier = 1 + Math.min(world.combo - 1, 12) * 0.08;
  world.score += Math.round(enemy.worth * multiplier);
  burst(world, enemy.x, enemy.y, enemy.kind === "boss" ? "#ffd45f" : "#59e9ff", enemy.kind === "boss" ? 72 : 18, enemy.kind === "boss" ? 250 : 125);
  world.shake = Math.max(world.shake, enemy.kind === "boss" ? 18 : 4);

  if (enemy.kind === "boss") {
    world.bossActive = false;
    world.bossNumber += 1;
    world.nextBossAt = world.time + Math.max(52, 70 - world.bossNumber * 4);
    world.score += 1800 + world.bossNumber * 350;
    world.shield = Math.max(world.shield, 3.5);
    announce(world, "RIFT LORD DOWN", 1.9);
  } else if (Math.random() < 0.06) {
    world.pickups.push({
      x: enemy.x,
      y: enemy.y,
      kind: Math.random() < 0.72 ? "shield" : "repair",
      vy: 92,
      radius: 13,
      spin: 0,
    });
  }

  const nextTier = tierForKills(world.kills);
  if (nextTier > world.weaponTier) {
    world.weaponTier = nextTier;
    world.shield = Math.max(world.shield, 1.7);
    world.flash = 0.2;
    announce(world, `LASER EVOLVED: ${LASER_TIERS[nextTier].name}`, 2);
  }
}

function enemyColor(kind: EnemyKind) {
  if (kind === "boss") return "#ffd45f";
  if (kind === "brute") return "#ff9f43";
  if (kind === "shifter") return "#a77cff";
  if (kind === "dart") return "#ff5f78";
  return "#59e9ff";
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const color = enemyColor(enemy.kind);
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  const pulse = 1 + Math.sin(enemy.age * 6.5 + enemy.wobble) * 0.055;
  ctx.scale(pulse, pulse);
  ctx.shadowBlur = enemy.kind === "boss" ? 30 : 18;
  ctx.shadowColor = color;
  ctx.lineWidth = enemy.kind === "boss" ? 3 : 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = "rgba(7,10,18,.94)";

  ctx.beginPath();
  if (enemy.kind === "boss") {
    for (let i = 0; i < 10; i += 1) {
      const a = (Math.PI * 2 * i) / 10 + enemy.age * 0.18;
      const r = i % 2 === 0 ? enemy.radius : enemy.radius * 0.7;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  } else if (enemy.kind === "dart") {
    ctx.moveTo(0, -enemy.radius * 1.35);
    ctx.lineTo(enemy.radius, enemy.radius);
    ctx.lineTo(0, enemy.radius * 0.5);
    ctx.lineTo(-enemy.radius, enemy.radius);
  } else if (enemy.kind === "brute") {
    ctx.roundRect(-enemy.radius, -enemy.radius * 0.72, enemy.radius * 2, enemy.radius * 1.44, 4);
  } else {
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const r = enemy.radius + (i % 2 ? 3 : 0);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  const eye = ctx.createLinearGradient(-8, 0, 8, 0);
  eye.addColorStop(0, "#ffffff");
  eye.addColorStop(0.5, color);
  eye.addColorStop(1, "#ffffff");
  ctx.fillStyle = eye;
  ctx.fillRect(-8, -3, 5, 5);
  ctx.fillRect(3, -3, 5, 5);

  if (enemy.kind === "boss") {
    const hp = clamp(enemy.hp / enemy.maxHp, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(-38, enemy.radius + 13, 76, 5);
    ctx.fillStyle = color;
    ctx.fillRect(-38, enemy.radius + 13, 76 * hp, 5);
  }
  ctx.restore();
}

function drawWorld(ctx: CanvasRenderingContext2D, world: World) {
  ctx.save();
  const shakeX = (Math.random() - 0.5) * world.shake;
  const shakeY = (Math.random() - 0.5) * world.shake;
  ctx.translate(shakeX, shakeY);

  const zone = zoneForTime(world.time);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (zone === "RIFT EDGE") {
    bg.addColorStop(0, "#030712");
    bg.addColorStop(0.55, "#071322");
    bg.addColorStop(1, "#0b1b25");
  } else if (zone === "SHATTER BELT") {
    bg.addColorStop(0, "#050817");
    bg.addColorStop(0.5, "#10102b");
    bg.addColorStop(1, "#211331");
  } else if (zone === "ION VEIL") {
    bg.addColorStop(0, "#040a13");
    bg.addColorStop(0.52, "#071e25");
    bg.addColorStop(1, "#102b2b");
  } else if (zone === "THE BREACH") {
    bg.addColorStop(0, "#080510");
    bg.addColorStop(0.5, "#1a0c22");
    bg.addColorStop(1, "#26101c");
  } else {
    bg.addColorStop(0, "#02030a");
    bg.addColorStop(0.5, "#0a0714");
    bg.addColorStop(1, "#14091d");
  }
  ctx.fillStyle = bg;
  ctx.fillRect(-30, -30, W + 60, H + 60);

  const glow = ctx.createRadialGradient(W * 0.5, H * 0.28, 10, W * 0.5, H * 0.28, W * 0.7);
  glow.addColorStop(0, "rgba(70,220,255,.065)");
  glow.addColorStop(0.45, "rgba(130,80,255,.035)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  world.stars.forEach((star) => {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = zone === "DEEP RIFT" ? "#ffd45f" : "#dff8ff";
    ctx.fillRect(star.x, star.y, star.size, star.size);
  });
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(89,233,255,.035)";
  ctx.lineWidth = 1;
  for (let y = 110; y < H; y += 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + 24);
    ctx.stroke();
  }

  world.portals.forEach((portal) => {
    const open = clamp(Math.min(portal.age / 0.34, (portal.life - portal.age) / 0.4), 0, 1);
    const r = portal.radius * open;
    const rotation = portal.age * (portal.bossPortal ? 2.6 : 4.5);
    ctx.save();
    ctx.translate(portal.x, portal.y);
    ctx.rotate(rotation);
    ctx.shadowBlur = portal.bossPortal ? 38 : 27;
    ctx.shadowColor = portal.bossPortal ? "#ffd45f" : "#59e9ff";
    ctx.strokeStyle = portal.bossPortal ? "#ffd45f" : "#59e9ff";
    ctx.lineWidth = portal.bossPortal ? 4.5 : 3.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.48, 0, 0.1, Math.PI * 1.82);
    ctx.stroke();
    ctx.rotate(-rotation * 1.85);
    ctx.strokeStyle = "#a77cff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r * 0.34, 0, 0.34, Math.PI * 1.86);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(1,2,8,.86)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.45, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  world.pickups.forEach((pickup) => {
    const color = pickup.kind === "shield" ? "#59e9ff" : "#ffd45f";
    ctx.save();
    ctx.translate(pickup.x, pickup.y);
    ctx.rotate(pickup.spin);
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(-10, -10, 20, 20);
    ctx.fillStyle = color;
    ctx.fillRect(-2, -7, 4, 14);
    if (pickup.kind === "repair") ctx.fillRect(-7, -2, 14, 4);
    ctx.restore();
  });

  world.enemies.forEach((enemy) => drawEnemy(ctx, enemy));

  world.enemyShots.forEach((shot) => {
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#ff5f78";
    ctx.fillStyle = "#ff5f78";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  world.shots.forEach((shot) => {
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#59e9ff";
    ctx.strokeStyle = shot.damage > 1 ? "#ffffff" : "#59e9ff";
    ctx.lineWidth = shot.damage > 1 ? 4.2 : 2.8;
    ctx.beginPath();
    ctx.moveTo(shot.x, shot.y + 16);
    ctx.lineTo(shot.x - shot.vx * 0.014, shot.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  world.particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;

  const p = world.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (world.shield > 0) {
    ctx.strokeStyle = `rgba(89,233,255,${0.38 + Math.sin(world.time * 10) * 0.14})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 31, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 24;
  ctx.shadowColor = "#59e9ff";
  ctx.fillStyle = "#dffaff";
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(18, 18);
  ctx.lineTo(7, 13);
  ctx.lineTo(0, 21);
  ctx.lineTo(-7, 13);
  ctx.lineTo(-18, 18);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#59e9ff";
  ctx.fillRect(-4, -10, 8, 19);
  ctx.fillStyle = "rgba(167,124,255,.95)";
  ctx.beginPath();
  ctx.moveTo(-7, 20);
  ctx.lineTo(0, 35 + Math.random() * 7);
  ctx.lineTo(7, 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (world.announceTimer > 0 && world.announce) {
    const alpha = clamp(world.announceTimer * 1.25, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "900 24px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillStyle = "#ffffff";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#59e9ff";
    ctx.fillText(world.announce, W / 2, H * 0.48);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  if (world.flash > 0) {
    ctx.globalAlpha = clamp(world.flash * 3.5, 0, 0.48);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export default function RiftStormStandalone() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World>(makeWorld());
  const keysRef = useRef(new Set<string>());
  const touchRef = useRef({ left: false, right: false, fire: false });
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const hudTimerRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [soundOn, setSoundOn] = useState(true);
  const [hud, setHud] = useState({ score: 0, kills: 0, lives: 3, tier: 0, combo: 0, time: 0, zone: "RIFT EDGE", best: 0 });

  const beep = (frequency: number, duration = 0.045, volume = 0.03) => {
    if (!soundOn) return;
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      const audio = audioRef.current;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Sound is optional.
    }
  };

  const readBest = () => {
    try {
      return Number(localStorage.getItem(STORAGE_KEY) || "0") || 0;
    } catch {
      return 0;
    }
  };

  const syncHud = (world: World) => {
    setHud({
      score: world.score,
      kills: world.kills,
      lives: world.lives,
      tier: world.weaponTier,
      combo: world.combo,
      time: world.time,
      zone: zoneForTime(world.time),
      best: readBest(),
    });
  };

  const startGame = () => {
    const world = makeWorld();
    worldRef.current = world;
    lastRef.current = performance.now();
    syncHud(world);
    setPhase("playing");
    beep(560, 0.08, 0.045);
  };

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "a", "d", " "].includes(key)) event.preventDefault();
      keysRef.current.add(key);
    };
    const onUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = clamp(window.devicePixelRatio || 1, 1, 3);
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(H * ratio);
    canvas.style.aspectRatio = `${W} / ${H}`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;
    drawWorld(ctx, worldRef.current);
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = clamp(window.devicePixelRatio || 1, 1, 3);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.imageSmoothingEnabled = true;

    let stopped = false;
    lastRef.current = performance.now();

    const frame = (now: number) => {
      if (stopped) return;
      const world = worldRef.current;
      const dt = clamp((now - lastRef.current) / 1000, 0, 0.033);
      lastRef.current = now;
      const d = difficulty(world);

      world.time += dt;
      world.nextPortal -= dt;
      world.fireTimer -= dt;
      world.comboTimer -= dt;
      world.shield -= dt;
      world.flash -= dt;
      world.announceTimer -= dt;
      world.shake *= Math.pow(0.02, dt);
      if (world.comboTimer <= 0) world.combo = 0;

      world.stars.forEach((star) => {
        star.y += star.speed * dt * (1 + d * 0.05);
        if (star.y > H) {
          star.y = -2;
          star.x = Math.random() * W;
        }
      });

      const left = keysRef.current.has("arrowleft") || keysRef.current.has("a") || touchRef.current.left;
      const right = keysRef.current.has("arrowright") || keysRef.current.has("d") || touchRef.current.right;
      const firing = keysRef.current.has(" ") || touchRef.current.fire;
      const direction = (right ? 1 : 0) - (left ? 1 : 0);
      world.player.x = clamp(world.player.x + direction * world.player.speed * dt, 28, W - 28);
      if (firing && world.fireTimer <= 0) {
        fire(world);
        beep(780 + world.weaponTier * 95, 0.032, 0.016);
      }

      if (!world.bossActive && world.time >= world.nextBossAt && !world.portals.some((portal) => portal.bossPortal)) {
        spawnPortal(world, true);
      }
      if (world.nextPortal <= 0) {
        const activeNormal = world.portals.filter((portal) => !portal.bossPortal).length;
        const cap = clamp(Math.floor(1 + d / 1.5), 1, 4);
        if (activeNormal < cap) spawnPortal(world, false);
        world.nextPortal = clamp(2.2 - d * 0.25, 0.58, 2) * (0.76 + Math.random() * 0.5);
      }

      world.portals.forEach((portal) => {
        portal.age += dt;
        portal.spawnTimer -= dt;
        if (portal.age > 0.42 && portal.spawned < portal.maxSpawn && portal.spawnTimer <= 0) {
          spawnEnemy(world, portal);
          portal.spawned += 1;
          portal.spawnTimer = portal.spawnEvery;
        }
      });
      world.portals = world.portals.filter((portal) => portal.age < portal.life);

      world.shots.forEach((shot) => {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        shot.life -= dt;
      });
      world.shots = world.shots.filter((shot) => shot.life > 0 && shot.y > -40 && shot.x > -50 && shot.x < W + 50);

      world.enemyShots.forEach((shot) => {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
      });
      world.enemyShots = world.enemyShots.filter((shot) => shot.y < H + 40 && shot.x > -40 && shot.x < W + 40);

      world.enemies.forEach((enemy) => {
        enemy.age += dt;
        enemy.shootTimer -= dt;
        if (enemy.kind === "boss") {
          enemy.x += enemy.vx * dt;
          if (enemy.x < 76 || enemy.x > W - 76) enemy.vx *= -1;
          enemy.y = 140 + Math.sin(enemy.age * 1.55) * 21;
          if (enemy.shootTimer <= 0) {
            const dx = world.player.x - enemy.x;
            const dy = world.player.y - enemy.y;
            const length = Math.hypot(dx, dy) || 1;
            const speed = 175 + d * 14;
            [-0.18, 0, 0.18].forEach((offset) => {
              const ux = dx / length;
              const uy = dy / length;
              const ca = Math.cos(offset);
              const sa = Math.sin(offset);
              world.enemyShots.push({
                x: enemy.x,
                y: enemy.y + 28,
                vx: (ux * ca - uy * sa) * speed,
                vy: (ux * sa + uy * ca) * speed,
                radius: 6,
              });
            });
            enemy.shootTimer = clamp(1.1 - world.bossNumber * 0.07, 0.58, 1.1);
          }
        } else {
          if (enemy.kind === "dart") {
            const steer = clamp((world.player.x - enemy.x) * 0.9, -110, 110);
            enemy.vx += steer * dt;
            enemy.vx *= Math.pow(0.17, dt);
          } else if (enemy.kind === "shifter") {
            enemy.vx += Math.sin(enemy.age * 4.5 + enemy.wobble) * 170 * dt;
          } else if (enemy.kind === "skitter") {
            enemy.vx += Math.sin(enemy.age * 3.1 + enemy.wobble) * 52 * dt;
          }
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;

          if (d > 3.1 && enemy.shootTimer <= 0 && Math.random() < 0.25) {
            const dx = world.player.x - enemy.x;
            const dy = world.player.y - enemy.y;
            const length = Math.hypot(dx, dy) || 1;
            const speed = 140 + d * 9;
            world.enemyShots.push({ x: enemy.x, y: enemy.y, vx: (dx / length) * speed, vy: (dy / length) * speed, radius: 4.5 });
            enemy.shootTimer = 2.1 + Math.random() * 1.55;
          }
        }
      });

      for (const shot of world.shots) {
        if (shot.life <= 0) continue;
        for (const enemy of world.enemies) {
          if (enemy.hp <= 0) continue;
          if (distance(shot, enemy) <= shot.radius + enemy.radius) {
            shot.life = 0;
            enemy.hp -= shot.damage;
            burst(world, shot.x, shot.y, "#ffffff", 4, 72);
            if (enemy.hp <= 0) {
              killEnemy(world, enemy);
              beep(enemy.kind === "boss" ? 105 : 190 + Math.random() * 90, enemy.kind === "boss" ? 0.18 : 0.055, enemy.kind === "boss" ? 0.08 : 0.03);
            }
            break;
          }
        }
      }
      world.enemies = world.enemies.filter((enemy) => enemy.hp > 0 && enemy.y < H + 90);

      world.enemies.forEach((enemy) => {
        if (enemy.kind !== "boss" && enemy.y > H - 30) {
          enemy.hp = 0;
          hitPlayer(world);
        } else if (distance(enemy, world.player) < enemy.radius + world.player.radius) {
          enemy.hp = 0;
          hitPlayer(world);
        }
      });
      world.enemies = world.enemies.filter((enemy) => enemy.hp > 0);

      world.enemyShots.forEach((shot) => {
        if (distance(shot, world.player) < shot.radius + world.player.radius) {
          shot.y = H + 100;
          hitPlayer(world);
        }
      });

      world.pickups.forEach((pickup) => {
        pickup.y += pickup.vy * dt;
        pickup.spin += dt * 3.4;
        if (distance(pickup, world.player) < pickup.radius + world.player.radius + 5) {
          if (pickup.kind === "shield") {
            world.shield = Math.max(world.shield, 5.8);
            announce(world, "RIFT SHIELD", 1.2);
          } else {
            world.lives = Math.min(5, world.lives + 1);
            announce(world, "FIELD REPAIR +1", 1.2);
          }
          pickup.y = H + 100;
          beep(1080, 0.12, 0.045);
        }
      });
      world.pickups = world.pickups.filter((pickup) => pickup.y < H + 40);

      world.particles.forEach((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= Math.pow(0.14, dt);
        particle.vy *= Math.pow(0.14, dt);
        particle.life -= dt;
      });
      world.particles = world.particles.filter((particle) => particle.life > 0);

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawWorld(ctx, world);

      hudTimerRef.current -= dt;
      if (hudTimerRef.current <= 0) {
        syncHud(world);
        hudTimerRef.current = 0.1;
      }

      if (world.dead) {
        try {
          const oldBest = readBest();
          if (world.score > oldBest) localStorage.setItem(STORAGE_KEY, String(world.score));
        } catch {
          // Local best is optional.
        }
        syncHud(world);
        setPhase("over");
        beep(92, 0.38, 0.065);
        return;
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, soundOn]);

  const movePlayerToPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "playing") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    worldRef.current.player.x = clamp(x, 28, W - 28);
  };

  const bindHold = (key: "left" | "right" | "fire") => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      touchRef.current[key] = true;
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      touchRef.current[key] = false;
    },
    onPointerCancel: () => {
      touchRef.current[key] = false;
    },
    onPointerLeave: () => {
      touchRef.current[key] = false;
    },
  });

  return (
    <main className="rs-page">
      <section className="rs-shell" aria-label="Rift Storm standalone arcade game">
        <header className="rs-topbar">
          <div>
            <div className="rs-kicker">STANDALONE ARCADE // SURVIVAL SHOOTER</div>
            <h1>RIFT <span>STORM</span></h1>
          </div>
          <button className="rs-sound" type="button" aria-pressed={soundOn} onClick={() => setSoundOn((value) => !value)}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>
        </header>

        <div className="rs-hud" aria-live="polite">
          <div><b>{hud.score.toLocaleString()}</b><span>SCORE</span></div>
          <div><b>{hud.kills}</b><span>KILLS</span></div>
          <div><b>{"◆".repeat(Math.max(0, hud.lives)) || "—"}</b><span>HULL</span></div>
          <div><b>{LASER_TIERS[hud.tier].name}</b><span>LASER</span></div>
        </div>

        <div className="rs-stage-wrap">
          <canvas
            ref={canvasRef}
            className="rs-canvas"
            onPointerDown={movePlayerToPointer}
            onPointerMove={(event) => {
              if (event.buttons === 1 || event.pointerType === "touch") movePlayerToPointer(event);
            }}
            aria-label="Rift Storm game area"
          />

          {phase === "ready" && (
            <div className="rs-overlay">
              <div className="rs-status">RIFT STATUS: UNSTABLE</div>
              <h2>THE PORTALS ARE OPENING.</h2>
              <p>Move. Fire. Survive. Every kill evolves your laser. Every minute the storm becomes more dangerous.</p>
              <div className="rs-rules">
                <span>RANDOM PORTALS</span><span>EVOLVING LASER</span><span>RIFT LORDS</span><span>ENDLESS DIFFICULTY</span>
              </div>
              <button type="button" className="rs-enter" onClick={startGame}>ENTER THE RIFT</button>
              <small>Desktop: A / D or arrows + Space. Mobile: drag the ship or use the controls.</small>
            </div>
          )}

          {phase === "over" && (
            <div className="rs-overlay rs-over">
              <div className="rs-status">SIGNAL LOST // RUN ENDED</div>
              <h2>{hud.score.toLocaleString()}</h2>
              <p>{hud.kills} creatures destroyed · {Math.floor(hud.time)} seconds survived</p>
              <div className="rs-final-grid">
                <div><b>{hud.best.toLocaleString()}</b><span>BEST SCORE</span></div>
                <div><b>{LASER_TIERS[hud.tier].name}</b><span>FINAL LASER</span></div>
              </div>
              <button type="button" className="rs-enter" onClick={startGame}>GO AGAIN</button>
            </div>
          )}
        </div>

        <div className="rs-progress-row">
          <div><span>ZONE</span><b>{hud.zone}</b></div>
          <div className="rs-tier-track" aria-label="Laser evolution progress">
            {LASER_TIERS.map((tier, index) => (
              <span key={tier.name} className={index <= hud.tier ? "active" : ""} title={`${tier.kills} kills: ${tier.name}`} />
            ))}
          </div>
          <div className="rs-combo"><span>COMBO</span><b>{hud.combo > 1 ? `x${hud.combo}` : "—"}</b></div>
        </div>

        <div className="rs-controls" aria-label="Mobile game controls">
          <button type="button" {...bindHold("left")}>◀ MOVE</button>
          <button type="button" className="fire" {...bindHold("fire")}>FIRE</button>
          <button type="button" {...bindHold("right")}>MOVE ▶</button>
        </div>

        <p className="rs-footnote">Random portals, evolving weapons, escalating enemy patterns and recurring bosses. No external branding or project dependency.</p>
      </section>
    </main>
  );
}
