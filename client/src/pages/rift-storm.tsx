import { useEffect, useRef, useState } from "react";
import "./rift-storm.css";

type Phase = "ready" | "playing" | "over";
type EnemyKind = "skitter" | "dart" | "brute" | "shifter" | "boss";
type PickupKind = "shield" | "repair";

type Vec = { x: number; y: number };

type Shot = Vec & {
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
};

type EnemyShot = Vec & {
  vx: number;
  vy: number;
  radius: number;
};

type Portal = Vec & {
  id: number;
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
  id: number;
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

type Particle = Vec & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type Pickup = Vec & {
  kind: PickupKind;
  vy: number;
  radius: number;
  spin: number;
};

type Star = Vec & {
  speed: number;
  size: number;
  alpha: number;
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

const W = 420;
const H = 680;
const PLAYER_Y = H - 78;
const PORTAL_TOP = 86;
const PORTAL_BOTTOM = 300;
const LASER_TIERS = [
  { kills: 0, name: "RIFT PULSE" },
  { kills: 10, name: "TWIN ARC" },
  { kills: 25, name: "TRI-BEAM" },
  { kills: 50, name: "ION FAN" },
  { kills: 90, name: "RIFT ARRAY" },
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dist(a: Vec, b: Vec) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function weaponTierForKills(kills: number) {
  let tier = 0;
  for (let i = 0; i < LASER_TIERS.length; i += 1) {
    if (kills >= LASER_TIERS[i].kills) tier = i;
  }
  return tier;
}

function zoneForTime(t: number) {
  if (t < 35) return "TASMANIAN NIGHT";
  if (t < 70) return "WEST COAST RIFT";
  if (t < 110) return "CRADLE FRACTURE";
  if (t < 160) return "THE GATEWAY";
  return "BEYOND THE RIFT";
}

function newWorld(): World {
  const stars: Star[] = Array.from({ length: 95 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    speed: 8 + Math.random() * 34,
    size: Math.random() < 0.82 ? 1 : 2,
    alpha: 0.2 + Math.random() * 0.7,
  }));

  return {
    time: 0,
    score: 0,
    kills: 0,
    lives: 3,
    shield: 0,
    combo: 0,
    comboTimer: 0,
    weaponTier: 0,
    nextPortal: 0.8,
    nextBossAt: 72,
    bossNumber: 0,
    bossActive: false,
    fireTimer: 0,
    flash: 0,
    shake: 0,
    announce: "",
    announceTimer: 0,
    player: { x: W / 2, y: PLAYER_Y, radius: 15, speed: 250 },
    portals: [],
    enemies: [],
    shots: [],
    enemyShots: [],
    particles: [],
    pickups: [],
    stars,
    dead: false,
  };
}

function difficulty(world: World) {
  return 1 + world.time / 34 + world.kills / 95;
}

function addBurst(world: World, x: number, y: number, color: string, amount = 12, force = 100) {
  for (let i = 0; i < amount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = force * (0.25 + Math.random() * 0.85);
    const life = 0.25 + Math.random() * 0.45;
    world.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      maxLife: life,
      size: 1.5 + Math.random() * 3.5,
      color,
    });
  }
}

function announce(world: World, text: string, seconds = 1.6) {
  world.announce = text;
  world.announceTimer = seconds;
}

function spawnPortal(world: World, bossPortal = false) {
  const d = difficulty(world);
  const x = bossPortal ? W / 2 : 48 + Math.random() * (W - 96);
  const y = bossPortal ? 118 : PORTAL_TOP + Math.random() * (PORTAL_BOTTOM - PORTAL_TOP);
  const maxSpawn = bossPortal ? 1 : clamp(Math.floor(1 + d * 0.58 + Math.random() * 2), 1, 5);
  world.portals.push({
    id: Math.floor(Math.random() * 1e9),
    x,
    y,
    age: 0,
    life: bossPortal ? 3.4 : 3.1 + Math.random() * 1.6,
    spawnEvery: bossPortal ? 1.45 : clamp(1.0 - d * 0.075, 0.38, 0.95),
    spawnTimer: bossPortal ? 1.35 : 0.7,
    spawned: 0,
    maxSpawn,
    radius: bossPortal ? 54 : 28 + Math.random() * 17,
    bossPortal,
  });
  world.shake = Math.max(world.shake, bossPortal ? 9 : 2.5);
}

function chooseEnemyKind(world: World): EnemyKind {
  const d = difficulty(world);
  const r = Math.random();
  if (d > 3.7 && r < 0.17) return "shifter";
  if (d > 2.1 && r < 0.34) return "brute";
  if (d > 1.35 && r < 0.58) return "dart";
  return "skitter";
}

function spawnEnemy(world: World, portal: Portal) {
  if (portal.bossPortal) {
    const hp = 72 + world.bossNumber * 42;
    world.enemies.push({
      id: Math.floor(Math.random() * 1e9),
      kind: "boss",
      x: portal.x,
      y: portal.y,
      vx: 105,
      vy: 0,
      radius: 37,
      hp,
      maxHp: hp,
      worth: 1200 + world.bossNumber * 300,
      age: 0,
      shootTimer: 1.1,
      wobble: Math.random() * Math.PI * 2,
    });
    world.bossActive = true;
    announce(world, `RIFT LORD ${world.bossNumber + 1}`, 2.3);
    return;
  }

  const kind = chooseEnemyKind(world);
  const d = difficulty(world);
  let hp = 1;
  let radius = 13;
  let speed = 72 + d * 9;
  let worth = 12;

  if (kind === "dart") {
    hp = d > 4 ? 2 : 1;
    radius = 11;
    speed = 115 + d * 12;
    worth = 18;
  } else if (kind === "brute") {
    hp = 4 + Math.floor(d * 0.55);
    radius = 20;
    speed = 48 + d * 6;
    worth = 38;
  } else if (kind === "shifter") {
    hp = 2 + Math.floor(d * 0.35);
    radius = 15;
    speed = 82 + d * 9;
    worth = 28;
  }

  world.enemies.push({
    id: Math.floor(Math.random() * 1e9),
    kind,
    x: portal.x + (Math.random() - 0.5) * 18,
    y: portal.y,
    vx: (Math.random() - 0.5) * 38,
    vy: speed,
    radius,
    hp,
    maxHp: hp,
    worth,
    age: 0,
    shootTimer: 1.6 + Math.random() * 2.2,
    wobble: Math.random() * Math.PI * 2,
  });
}

function fireLaser(world: World) {
  const t = world.weaponTier;
  const p = world.player;
  const speed = 560;
  const add = (x: number, y: number, vx: number, vy: number, radius: number, damage = 1) => {
    world.shots.push({ x, y, vx, vy, radius, damage, life: 1.55 });
  };

  if (t === 0) {
    add(p.x, p.y - 18, 0, -speed, 3.2);
  } else if (t === 1) {
    add(p.x - 8, p.y - 16, 0, -speed, 3.2);
    add(p.x + 8, p.y - 16, 0, -speed, 3.2);
  } else if (t === 2) {
    add(p.x, p.y - 19, 0, -speed, 3.4);
    add(p.x - 9, p.y - 14, -62, -speed * 0.99, 3.1);
    add(p.x + 9, p.y - 14, 62, -speed * 0.99, 3.1);
  } else if (t === 3) {
    add(p.x - 10, p.y - 13, -84, -speed, 3.1);
    add(p.x - 4, p.y - 19, -24, -speed * 1.05, 3.6);
    add(p.x + 4, p.y - 19, 24, -speed * 1.05, 3.6);
    add(p.x + 10, p.y - 13, 84, -speed, 3.1);
  } else {
    [-130, -66, 0, 66, 130].forEach((vx, i) => {
      add(p.x + (i - 2) * 5, p.y - 18, vx, -speed * (i === 2 ? 1.08 : 1), i === 2 ? 4.2 : 3.2, i === 2 ? 2 : 1);
    });
  }

  world.fireTimer = [0.19, 0.17, 0.145, 0.115, 0.09][t];
}

function damagePlayer(world: World) {
  if (world.shield > 0 || world.dead) return;
  world.lives -= 1;
  world.combo = 0;
  world.comboTimer = 0;
  world.shield = 1.45;
  world.flash = 0.18;
  world.shake = 12;
  addBurst(world, world.player.x, world.player.y, "#EF9F27", 24, 150);
  if (world.lives <= 0) world.dead = true;
}

function killEnemy(world: World, enemy: Enemy) {
  world.kills += 1;
  world.combo = world.comboTimer > 0 ? world.combo + 1 : 1;
  world.comboTimer = 1.35;
  const comboMult = 1 + Math.min(world.combo - 1, 12) * 0.08;
  world.score += Math.round(enemy.worth * comboMult);
  world.shake = Math.max(world.shake, enemy.kind === "boss" ? 17 : 3.8);
  addBurst(world, enemy.x, enemy.y, enemy.kind === "boss" ? "#C9A227" : "#35D4E8", enemy.kind === "boss" ? 60 : 16, enemy.kind === "boss" ? 220 : 115);

  if (enemy.kind === "boss") {
    world.bossActive = false;
    world.nextBossAt = world.time + Math.max(56, 72 - world.bossNumber * 4);
    world.bossNumber += 1;
    world.score += 1500 + world.bossNumber * 300;
    world.shield = Math.max(world.shield, 3.2);
    announce(world, "RIFT LORD DOWN", 2.0);
  } else if (Math.random() < 0.055) {
    world.pickups.push({
      x: enemy.x,
      y: enemy.y,
      kind: Math.random() < 0.72 ? "shield" : "repair",
      vy: 82,
      radius: 11,
      spin: 0,
    });
  }

  const newTier = weaponTierForKills(world.kills);
  if (newTier > world.weaponTier) {
    world.weaponTier = newTier;
    world.shield = Math.max(world.shield, 1.5);
    world.flash = 0.22;
    announce(world, `LASER EVOLVED: ${LASER_TIERS[newTier].name}`, 2.0);
  }
}

function drawRiftCreature(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  const pulse = 1 + Math.sin(enemy.age * 7 + enemy.wobble) * 0.06;
  ctx.scale(pulse, pulse);

  if (enemy.kind === "boss") {
    ctx.shadowBlur = 26;
    ctx.shadowColor = "#7B5BC4";
    ctx.fillStyle = "#171020";
    ctx.strokeStyle = "#C9A227";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8 + enemy.age * 0.25;
      const r = i % 2 === 0 ? 40 : 29;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#35D4E8";
    ctx.fillRect(-14, -5, 28, 10);
    ctx.fillStyle = "#E6EFF6";
    ctx.fillRect(-8, -2, 5, 4);
    ctx.fillRect(3, -2, 5, 4);
    return ctx.restore();
  }

  const main = enemy.kind === "brute" ? "#C9A227" : enemy.kind === "shifter" ? "#7B5BC4" : enemy.kind === "dart" ? "#EF9F27" : "#35D4E8";
  ctx.shadowBlur = 15;
  ctx.shadowColor = main;
  ctx.strokeStyle = main;
  ctx.fillStyle = "rgba(8,13,19,.88)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (enemy.kind === "dart") {
    ctx.moveTo(0, -enemy.radius - 4);
    ctx.lineTo(enemy.radius, enemy.radius);
    ctx.lineTo(0, enemy.radius * 0.45);
    ctx.lineTo(-enemy.radius, enemy.radius);
  } else if (enemy.kind === "brute") {
    ctx.rect(-enemy.radius, -enemy.radius * 0.75, enemy.radius * 2, enemy.radius * 1.5);
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
  ctx.fillStyle = "#E6EFF6";
  ctx.fillRect(-4, -2, 3, 3);
  ctx.fillRect(2, -2, 3, 3);
  ctx.restore();
}

function drawWorld(ctx: CanvasRenderingContext2D, world: World) {
  ctx.save();
  const zone = zoneForTime(world.time);
  const shakeX = (Math.random() - 0.5) * world.shake;
  const shakeY = (Math.random() - 0.5) * world.shake;
  ctx.translate(shakeX, shakeY);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (zone === "TASMANIAN NIGHT") {
    grad.addColorStop(0, "#080D13");
    grad.addColorStop(0.62, "#13231f");
    grad.addColorStop(1, "#1f2b22");
  } else if (zone === "WEST COAST RIFT") {
    grad.addColorStop(0, "#071019");
    grad.addColorStop(0.58, "#17202b");
    grad.addColorStop(1, "#33261d");
  } else if (zone === "CRADLE FRACTURE") {
    grad.addColorStop(0, "#090d16");
    grad.addColorStop(0.6, "#172231");
    grad.addColorStop(1, "#28313b");
  } else {
    grad.addColorStop(0, "#080812");
    grad.addColorStop(0.5, "#120d20");
    grad.addColorStop(1, "#0b1b21");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(-20, -20, W + 40, H + 40);

  world.stars.forEach((s) => {
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = zone === "BEYOND THE RIFT" ? "#C9A227" : "#B9CEDC";
    ctx.fillRect(s.x, s.y, s.size, s.size);
  });
  ctx.globalAlpha = 1;

  if (zone === "TASMANIAN NIGHT") {
    ctx.fillStyle = "#0b1714";
    for (let x = -10; x < W + 20; x += 32) {
      const h = 22 + ((x * 13) % 27 + 27) % 27;
      ctx.beginPath();
      ctx.moveTo(x, H - 6);
      ctx.lineTo(x + 14, H - h);
      ctx.lineTo(x + 28, H - 6);
      ctx.fill();
    }
  }

  world.portals.forEach((p) => {
    const open = clamp(Math.min(p.age / 0.38, (p.life - p.age) / 0.42), 0, 1);
    const r = p.radius * open;
    const rot = p.age * (p.bossPortal ? 2.7 : 4.2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rot);
    ctx.shadowBlur = p.bossPortal ? 34 : 22;
    ctx.shadowColor = p.bossPortal ? "#C9A227" : "#35D4E8";
    ctx.strokeStyle = p.bossPortal ? "#C9A227" : "#35D4E8";
    ctx.lineWidth = p.bossPortal ? 4 : 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.48, 0, 0.15, Math.PI * 1.78);
    ctx.stroke();
    ctx.rotate(-rot * 1.9);
    ctx.strokeStyle = p.bossPortal ? "#7B5BC4" : "#7B5BC4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.72, r * 0.34, 0, 0.4, Math.PI * 1.85);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(3,5,10,.78)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.46, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  world.pickups.forEach((p) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    const c = p.kind === "shield" ? "#35D4E8" : "#C9A227";
    ctx.shadowBlur = 16;
    ctx.shadowColor = c;
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.fillStyle = c;
    ctx.fillRect(-2, -6, 4, 12);
    if (p.kind === "repair") ctx.fillRect(-6, -2, 12, 4);
    ctx.restore();
  });

  world.enemies.forEach((e) => drawRiftCreature(ctx, e));

  world.enemyShots.forEach((s) => {
    ctx.shadowBlur = 14;
    ctx.shadowColor = "#E24B4A";
    ctx.fillStyle = "#E24B4A";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  world.shots.forEach((s) => {
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#35D4E8";
    ctx.strokeStyle = s.damage > 1 ? "#E6EFF6" : "#35D4E8";
    ctx.lineWidth = s.damage > 1 ? 3.6 : 2.4;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + 11);
    ctx.lineTo(s.x - s.vx * 0.018, s.y + 1);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  world.particles.forEach((p) => {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  const pl = world.player;
  ctx.save();
  ctx.translate(pl.x, pl.y);
  if (world.shield > 0) {
    ctx.strokeStyle = `rgba(53,212,232,${0.35 + Math.sin(world.time * 11) * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#35D4E8";
  ctx.fillStyle = "#DDE6EC";
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(12, 13);
  ctx.lineTo(3, 9);
  ctx.lineTo(0, 16);
  ctx.lineTo(-3, 9);
  ctx.lineTo(-12, 13);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#35D4E8";
  ctx.fillRect(-3, -8, 6, 13);
  ctx.fillStyle = "#C9A227";
  ctx.fillRect(-7, 11, 4, 6);
  ctx.fillRect(3, 11, 4, 6);
  ctx.restore();

  const boss = world.enemies.find((e) => e.kind === "boss");
  if (boss) {
    const width = 250;
    const x = (W - width) / 2;
    ctx.fillStyle = "rgba(8,13,19,.8)";
    ctx.fillRect(x, 18, width, 10);
    ctx.fillStyle = "#C9A227";
    ctx.fillRect(x + 2, 20, (width - 4) * clamp(boss.hp / boss.maxHp, 0, 1), 6);
  }

  if (world.announceTimer > 0 && world.announce) {
    const a = clamp(world.announceTimer / 0.35, 0, 1);
    ctx.globalAlpha = Math.min(1, a);
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#E6EFF6";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#35D4E8";
    ctx.fillText(world.announce, W / 2, H * 0.43);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  if (world.flash > 0) {
    ctx.fillStyle = `rgba(230,239,246,${clamp(world.flash * 2.6, 0, 0.55)})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
}

export default function RiftStorm() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World>(newWorld());
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef(new Set<string>());
  const touchRef = useRef({ left: false, right: false, fire: false });
  const lastRef = useRef(0);
  const hudTickRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [soundOn, setSoundOn] = useState(true);
  const [hud, setHud] = useState({ score: 0, kills: 0, lives: 3, tier: 0, combo: 0, time: 0, zone: "TASMANIAN NIGHT", best: 0 });

  const beepRef = useRef<AudioContext | null>(null);
  const beep = (freq: number, duration = 0.045, volume = 0.035) => {
    if (!soundOn) return;
    try {
      if (!beepRef.current) beepRef.current = new AudioContext();
      const ac = beepRef.current;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.value = volume;
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + duration);
    } catch {
      // Audio is optional.
    }
  };

  const syncHud = (world: World) => {
    let best = 0;
    try {
      best = Number(localStorage.getItem("boomerverse:rift-storm:best") || "0") || 0;
    } catch {
      best = 0;
    }
    setHud({
      score: world.score,
      kills: world.kills,
      lives: world.lives,
      tier: world.weaponTier,
      combo: world.combo,
      time: world.time,
      zone: zoneForTime(world.time),
      best,
    });
  };

  const startGame = () => {
    const world = newWorld();
    worldRef.current = world;
    lastRef.current = performance.now();
    syncHud(world);
    setPhase("playing");
    beep(520, 0.08, 0.045);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (["arrowleft", "arrowright", "a", "d", " "].includes(key)) e.preventDefault();
      keysRef.current.add(key);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

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
      world.shake *= Math.pow(0.02, dt);
      world.announceTimer -= dt;

      if (world.comboTimer <= 0) world.combo = 0;

      world.stars.forEach((s) => {
        s.y += s.speed * dt * (1 + d * 0.05);
        if (s.y > H) {
          s.y = -2;
          s.x = Math.random() * W;
        }
      });

      const left = keysRef.current.has("arrowleft") || keysRef.current.has("a") || touchRef.current.left;
      const right = keysRef.current.has("arrowright") || keysRef.current.has("d") || touchRef.current.right;
      const firing = keysRef.current.has(" ") || touchRef.current.fire;
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      world.player.x = clamp(world.player.x + dir * world.player.speed * dt, 22, W - 22);
      if (firing && world.fireTimer <= 0) {
        fireLaser(world);
        beep(760 + world.weaponTier * 90, 0.035, 0.018);
      }

      if (!world.bossActive && world.time >= world.nextBossAt && !world.portals.some((p) => p.bossPortal)) {
        spawnPortal(world, true);
      }

      if (world.nextPortal <= 0) {
        const simultaneous = world.portals.filter((p) => !p.bossPortal).length;
        const cap = clamp(Math.floor(1 + d / 1.45), 1, 4);
        if (simultaneous < cap) spawnPortal(world, false);
        world.nextPortal = clamp(2.25 - d * 0.25, 0.62, 2.0) * (0.76 + Math.random() * 0.54);
      }

      world.portals.forEach((p) => {
        p.age += dt;
        p.spawnTimer -= dt;
        if (p.age > 0.45 && p.spawned < p.maxSpawn && p.spawnTimer <= 0) {
          spawnEnemy(world, p);
          p.spawned += 1;
          p.spawnTimer = p.spawnEvery;
        }
      });
      world.portals = world.portals.filter((p) => p.age < p.life);

      world.shots.forEach((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
      });
      world.shots = world.shots.filter((s) => s.life > 0 && s.y > -30 && s.x > -40 && s.x < W + 40);

      world.enemyShots.forEach((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      });
      world.enemyShots = world.enemyShots.filter((s) => s.y < H + 30 && s.x > -30 && s.x < W + 30);

      world.enemies.forEach((e) => {
        e.age += dt;
        e.shootTimer -= dt;
        if (e.kind === "boss") {
          e.x += e.vx * dt;
          if (e.x < 62 || e.x > W - 62) e.vx *= -1;
          e.y = 118 + Math.sin(e.age * 1.6) * 18;
          if (e.shootTimer <= 0) {
            const dx = world.player.x - e.x;
            const dy = world.player.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            const speed = 155 + d * 13;
            [-0.18, 0, 0.18].forEach((off) => {
              const ca = Math.cos(off);
              const sa = Math.sin(off);
              const ux = dx / len;
              const uy = dy / len;
              world.enemyShots.push({
                x: e.x,
                y: e.y + 24,
                vx: (ux * ca - uy * sa) * speed,
                vy: (ux * sa + uy * ca) * speed,
                radius: 5.5,
              });
            });
            e.shootTimer = clamp(1.15 - world.bossNumber * 0.07, 0.62, 1.15);
          }
        } else {
          if (e.kind === "dart") {
            const steer = clamp((world.player.x - e.x) * 0.9, -95, 95);
            e.vx += steer * dt;
            e.vx *= Math.pow(0.17, dt);
          } else if (e.kind === "shifter") {
            e.vx += Math.sin(e.age * 4.6 + e.wobble) * 150 * dt;
          } else if (e.kind === "skitter") {
            e.vx += Math.sin(e.age * 3.2 + e.wobble) * 45 * dt;
          }
          e.x += e.vx * dt;
          e.y += e.vy * dt;

          if (d > 3.2 && e.shootTimer <= 0 && Math.random() < 0.24) {
            const dx = world.player.x - e.x;
            const dy = world.player.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            const speed = 125 + d * 8;
            world.enemyShots.push({ x: e.x, y: e.y, vx: (dx / len) * speed, vy: (dy / len) * speed, radius: 4 });
            e.shootTimer = 2.2 + Math.random() * 1.6;
          }
        }
      });

      for (const s of world.shots) {
        if (s.life <= 0) continue;
        for (const e of world.enemies) {
          if (e.hp <= 0) continue;
          if (dist(s, e) <= s.radius + e.radius) {
            s.life = 0;
            e.hp -= s.damage;
            addBurst(world, s.x, s.y, "#E6EFF6", 4, 70);
            if (e.hp <= 0) {
              killEnemy(world, e);
              beep(e.kind === "boss" ? 110 : 180 + Math.random() * 80, e.kind === "boss" ? 0.18 : 0.06, e.kind === "boss" ? 0.08 : 0.035);
            }
            break;
          }
        }
      }
      world.enemies = world.enemies.filter((e) => e.hp > 0 && e.y < H + 70);

      world.enemies.forEach((e) => {
        if (e.kind !== "boss" && e.y > H - 25) {
          e.hp = 0;
          damagePlayer(world);
        } else if (dist(e, world.player) < e.radius + world.player.radius) {
          e.hp = 0;
          damagePlayer(world);
        }
      });
      world.enemies = world.enemies.filter((e) => e.hp > 0);

      world.enemyShots.forEach((s) => {
        if (dist(s, world.player) < s.radius + world.player.radius) {
          s.y = H + 100;
          damagePlayer(world);
        }
      });

      world.pickups.forEach((p) => {
        p.y += p.vy * dt;
        p.spin += dt * 3.4;
        if (dist(p, world.player) < p.radius + world.player.radius + 4) {
          if (p.kind === "shield") {
            world.shield = Math.max(world.shield, 5.5);
            announce(world, "RIFT SHIELD", 1.2);
          } else {
            world.lives = Math.min(5, world.lives + 1);
            announce(world, "FIELD REPAIR +1", 1.2);
          }
          p.y = H + 100;
          beep(1040, 0.12, 0.05);
        }
      });
      world.pickups = world.pickups.filter((p) => p.y < H + 30);

      world.particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.14, dt);
        p.vy *= Math.pow(0.14, dt);
        p.life -= dt;
      });
      world.particles = world.particles.filter((p) => p.life > 0);

      drawWorld(ctx, world);

      hudTickRef.current -= dt;
      if (hudTickRef.current <= 0) {
        syncHud(world);
        hudTickRef.current = 0.1;
      }

      if (world.dead) {
        try {
          const oldBest = Number(localStorage.getItem("boomerverse:rift-storm:best") || "0") || 0;
          if (world.score > oldBest) localStorage.setItem("boomerverse:rift-storm:best", String(world.score));
        } catch {
          // Local best is optional.
        }
        syncHud(world);
        setPhase("over");
        beep(95, 0.38, 0.065);
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

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "playing") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    worldRef.current.player.x = clamp(x, 22, W - 22);
  };

  const bindHold = (key: "left" | "right" | "fire") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      touchRef.current[key] = true;
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
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
    <main className="rift-storm-page">
      <section className="rift-shell" aria-label="Rift Storm arcade game">
        <header className="rift-topbar">
          <div>
            <div className="rift-kicker">BOOMERVERSE ARCADE // RIFT EVENT 002</div>
            <h1>RIFT <span>STORM</span></h1>
          </div>
          <button className="rift-sound" type="button" aria-pressed={soundOn} onClick={() => setSoundOn((v) => !v)}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>
        </header>

        <div className="rift-hud" aria-live="polite">
          <div><b>{hud.score.toLocaleString()}</b><span>SCORE</span></div>
          <div><b>{hud.kills}</b><span>KILLS</span></div>
          <div><b>{"◆".repeat(Math.max(0, hud.lives)) || "—"}</b><span>HULL</span></div>
          <div><b>{LASER_TIERS[hud.tier].name}</b><span>LASER</span></div>
        </div>

        <div className="rift-stage-wrap">
          <canvas
            ref={canvasRef}
            className="rift-canvas"
            width={W}
            height={H}
            onPointerDown={pointerMove}
            onPointerMove={(e) => {
              if (e.buttons === 1 || e.pointerType === "touch") pointerMove(e);
            }}
            aria-label="Rift Storm game area"
          />

          {phase === "ready" && (
            <div className="rift-overlay">
              <div className="rift-status">RIFT STATUS: UNSTABLE</div>
              <h2>THE PORTALS ARE OPENING.</h2>
              <p>Move. Fire. Survive. Every kill evolves your laser. Every minute the Rift gets meaner.</p>
              <div className="rift-rules">
                <span>RANDOM PORTALS</span><span>EVOLVING LASER</span><span>RIFT LORDS</span><span>ENDLESS DIFFICULTY</span>
              </div>
              <button type="button" className="rift-enter" onClick={startGame}>ENTER THE RIFT</button>
              <small>Desktop: A / D or arrows + Space. Mobile: drag the ship or use the controls.</small>
            </div>
          )}

          {phase === "over" && (
            <div className="rift-overlay rift-over">
              <div className="rift-status">SIGNAL LOST // RUN ENDED</div>
              <h2>{hud.score.toLocaleString()}</h2>
              <p>{hud.kills} Rift creatures destroyed · {Math.floor(hud.time)} seconds survived</p>
              <div className="rift-final-grid">
                <div><b>{hud.best.toLocaleString()}</b><span>BEST SCORE</span></div>
                <div><b>{LASER_TIERS[hud.tier].name}</b><span>FINAL LASER</span></div>
              </div>
              <button type="button" className="rift-enter" onClick={startGame}>GO AGAIN</button>
            </div>
          )}
        </div>

        <div className="rift-progress-row">
          <div>
            <span>ZONE</span>
            <b>{hud.zone}</b>
          </div>
          <div className="rift-tier-track" aria-label="Laser evolution progress">
            {LASER_TIERS.map((tier, i) => (
              <span key={tier.name} className={i <= hud.tier ? "active" : ""} title={`${tier.kills} kills: ${tier.name}`} />
            ))}
          </div>
          <div className="rift-combo"><span>COMBO</span><b>{hud.combo > 1 ? `x${hud.combo}` : "—"}</b></div>
        </div>

        <div className="rift-controls" aria-label="Mobile game controls">
          <button type="button" {...bindHold("left")}>◀ MOVE</button>
          <button type="button" className="fire" {...bindHold("fire")}>FIRE</button>
          <button type="button" {...bindHold("right")}>MOVE ▶</button>
        </div>

        <p className="rift-footnote">Portals open in random positions. Enemies emerge in different patterns. The longer you survive, the faster portals open, tougher creatures appear, enemy fire increases, and Rift Lords arrive.</p>
      </section>
    </main>
  );
}
