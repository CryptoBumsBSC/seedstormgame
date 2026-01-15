import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { 
  GameState, 
  PlayerSprite, 
  Enemy, 
  Projectile, 
  Star, 
  StrainType,
  Score 
} from "@shared/schema";
import { Heart, ChevronLeft, ChevronRight, Target, Trophy, Play, Pause, RotateCcw, Gamepad2, HelpCircle, Crosshair, Shield, Zap, AlertTriangle, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import WebApp from "@twa-dev/sdk";

type Screen = "title" | "game" | "gameover" | "leaderboard" | "help" | "shop" | "loadout";
type LeaderboardTab = "daily" | "blazed" | "natural";

// Telegram Stars Boost Types
interface PlayerInventory {
  extra_life: number;
  shield_boost: number;
  rapid_fire: number;
  side_guns: number;
  machine_gun: number;
  skip_storm: number;
}

// Per-life boost slot: each life can have one boost assigned
type BoostSlot = BoostType | null;

// Loadout is an array of 3 slots (one per life)
// Life 1 uses slot[0], Life 2 uses slot[1], Life 3 uses slot[2]
type BoostLoadout = [BoostSlot, BoostSlot, BoostSlot];

const BOOST_PRICES = {
  extra_life: 3,
  shield_boost: 3,
  rapid_fire: 3,
  side_guns: 5,
  machine_gun: 10,
  skip_storm: 20,
} as const;

// Boost durations in milliseconds (gameTimeRef is in ms)
const BOOST_DURATIONS = {
  extra_life: 0,
  shield_boost: 5000,  // 5 seconds
  rapid_fire: 5000,    // 5 seconds
  side_guns: 5000,     // 5 seconds
  machine_gun: 5000,   // 5 seconds
  skip_storm: 0,
} as const;

const MAX_BOOSTS_PER_LIFE = 3;

type BoostType = keyof typeof BOOST_PRICES;

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 32;
const ENEMY_SIZE = 28;
const PROJECTILE_SIZE = 6;
const DIFFICULTY_INTERVAL = 15000;
const HAZARD_SIZE = 24;

type HazardType = "bong" | "joint" | "matches";
type PowerUpType = "speed" | "shield" | "rapid" | "life";
type SpecialObjectType = "budAngel" | "skull";

interface Hazard {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  type: HazardType;
}

interface SpecialObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  type: SpecialObjectType;
}

interface PowerUp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  type: PowerUpType;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  direction: number;
  spawnTime: number;
  shootCooldown: number;
}

interface MeteorSeed {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  angle: number; // Direction angle for diagonal movement
  isWhiteHot?: boolean; // Rare white-hot seed that grants bonuses when shot
}

const strainColors: Record<StrainType, { fill: string; glow: string }> = {
  indica: { fill: "#9333ea", glow: "#c084fc" },
  sativa: { fill: "#22c55e", glow: "#86efac" },
  hybrid: { fill: "#f97316", glow: "#fdba74" },
};

const powerUpColors: Record<PowerUpType, string> = {
  speed: "#00ffff",
  shield: "#ffff00",
  rapid: "#ff00ff",
  life: "#ff0000",
};

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

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Sound system using Web Audio API
class SoundSystem {
  private audioContext: AudioContext | null = null;
  private enabled = true;

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = "square", volume = 0.1) {
    if (!this.enabled || !this.audioContext) return;
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gainNode.gain.value = volume;
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
    
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  shoot() {
    this.playTone(800, 0.05, "square", 0.10);
  }

  hit() {
    this.playTone(200, 0.1, "sawtooth", 0.125);
  }

  explosion() {
    this.playTone(100, 0.2, "sawtooth", 0.19);
    setTimeout(() => this.playTone(80, 0.15, "sawtooth", 0.125), 50);
  }

  powerUp() {
    this.playTone(523, 0.1, "sine", 0.125);
    setTimeout(() => this.playTone(659, 0.1, "sine", 0.125), 100);
    setTimeout(() => this.playTone(784, 0.15, "sine", 0.125), 200);
  }

  damage() {
    this.playTone(150, 0.2, "square", 0.19);
  }

  gameOver() {
    this.playTone(200, 0.3, "square", 0.125);
    setTimeout(() => this.playTone(150, 0.3, "square", 0.125), 300);
    setTimeout(() => this.playTone(100, 0.5, "square", 0.125), 600);
  }

  newHighScore() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, "sine", 0.15), i * 150);
    });
  }
}

const soundSystem = new SoundSystem();

export default function Game() {
  const [screen, setScreen] = useState<Screen>("title");
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    lives: 3,
    wave: 1,
    gameTime: 0,
    isPlaying: false,
    isPaused: false,
    isGameOver: false,
  });
  const [playerName, setPlayerName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);
  const [isNewHighScore, setIsNewHighScore] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  const { toast } = useToast();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const playerRef = useRef<PlayerSprite>({
    x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    y: CANVAS_HEIGHT - PLAYER_SIZE - 80,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    speed: 5,
  });
  const enemiesRef = useRef<Enemy[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const starsRef = useRef<Star[]>([]);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef<{ left: boolean; right: boolean; fire: boolean }>({
    left: false,
    right: false,
    fire: false,
  });
  const swipeTouchRef = useRef<{ startX: number; currentX: number; active: boolean }>({
    startX: 0,
    currentX: 0,
    active: false,
  });
  const shootCooldownRef = useRef<number>(0);
  const invincibilityRef = useRef<number>(0);
  const spawnCooldownRef = useRef<number>(0);
  const hazardCooldownRef = useRef<number>(0);
  const difficultyRef = useRef<number>(1);
  const gameTimeRef = useRef<number>(0);
  const weaponLevelRef = useRef<number>(0);
  const hazardsRef = useRef<Hazard[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rapidFireEndRef = useRef<number>(0);
  const speedBoostEndRef = useRef<number>(0);
  const sideGunsBoostEndRef = useRef<number>(0);
  const machineGunBoostEndRef = useRef<number>(0);
  const shieldEndRef = useRef<number>(0);
  const specialObjectsRef = useRef<SpecialObject[]>([]);
  const lastSkullSpawnRef = useRef<number>(0);
  const lastBudAngelSpawnRef = useRef<number>(0);
  const meteorSeedsRef = useRef<MeteorSeed[]>([]);
  const meteorShowerActiveRef = useRef<boolean>(false);
  const meteorShowerEndRef = useRef<number>(0);
  const lastMeteorShowerRef = useRef<number>(0);
  const whiteHotSpawnedRef = useRef<boolean>(false); // Track if white-hot already spawned this shower
  
  // New gameplay features
  const comboCountRef = useRef<number>(0);
  const comboMultiplierRef = useRef<number>(1);
  const lastKillTimeRef = useRef<number>(0);
  const killStreakRef = useRef<number>(0);
  const totalKillsRef = useRef<number>(0);
  const personalBestRef = useRef<number>(0);
  const bossRef = useRef<Boss | null>(null);
  const lastBossSpawnRef = useRef<number>(0);
  const bossKilledRef = useRef<boolean>(false);
  const budRageActiveRef = useRef<boolean>(false);
  const machineGunPreviewRef = useRef<{ active: boolean; endTime: number }>({ active: false, endTime: 0 });
  const screenShakeRef = useRef<{ intensity: number; duration: number }>({ intensity: 0, duration: 0 });
  const slowMoRef = useRef<{ active: boolean; endTime: number }>({ active: false, endTime: 0 });
  const damageFlashRef = useRef<{ active: boolean; endTime: number }>({ active: false, endTime: 0 });
  const waveRef = useRef<number>(1);
  const waveTimerRef = useRef<number>(0);
  const formationTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gameSessionRef = useRef<number>(0); // Increments on each game start to invalidate old timeouts
  const starSpeedMultiplierRef = useRef<number>(1);

  const { data: scores = [] } = useQuery<Score[]>({
    queryKey: ["/api/scores"],
  });

  const { data: allTimeScores = [] } = useQuery<Score[]>({
    queryKey: ["/api/scores/all-time"],
  });

  // Telegram leaderboard queries
  interface DailyScoreData {
    id: number;
    telegramId: string;
    playerName: string;
    score: number;
    wave: number;
    playTime: number;
    usedBoosts: boolean;
    date: string;
  }
  
  interface AllTimeScoreData {
    id: number;
    telegramId: string;
    playerName: string;
    score: number;
    wave: number;
    playTime: number;
    createdAt: string;
  }

  const { data: dailyScores = [] } = useQuery<DailyScoreData[]>({
    queryKey: ["/api/telegram/leaderboard/daily"],
  });

  const { data: boostedScores = [] } = useQuery<AllTimeScoreData[]>({
    queryKey: ["/api/telegram/leaderboard/boosted"],
  });

  const { data: pureScores = [] } = useQuery<AllTimeScoreData[]>({
    queryKey: ["/api/telegram/leaderboard/pure"],
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Telegram Stars / Boost System State
  const [inventory, setInventory] = useState<PlayerInventory>({ 
    extra_life: 0, shield_boost: 0, rapid_fire: 0, side_guns: 0, machine_gun: 0, skip_storm: 0 
  });
  const [loadout, setLoadout] = useState<BoostLoadout>([null, null, null]);
  const [telegramId, setTelegramId] = useState<string | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);
  const [usedBoostsThisGame, setUsedBoostsThisGame] = useState<boolean>(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>("daily");
  const [shopQuantities, setShopQuantities] = useState<Record<BoostType, number>>({
    extra_life: 1, shield_boost: 1, rapid_fire: 1, side_guns: 1, machine_gun: 1, skip_storm: 1
  });
  
  // Per-life boost tracking: stores the loadout slots and current life index
  // Life 1 = index 0, Life 2 = index 1, Life 3 = index 2
  const activeBoostsRef = useRef<{
    slots: BoostLoadout;      // The 3 boost slots [life1, life2, life3]
    currentLifeIndex: number; // Which life we're on (0, 1, or 2)
    skipStormActive: boolean; // If current life has skip storm active
  }>({ slots: [null, null, null], currentLifeIndex: 0, skipStormActive: false });
  
  const submitScoreMutation = useMutation({
    mutationFn: async (data: { playerName: string; score: number; wave: number; playTime: number }) => {
      // Use Telegram endpoint if running in Telegram, otherwise use classic endpoint
      if (telegramId) {
        const response = await apiRequest("POST", "/api/telegram/score", {
          ...data,
          telegramId,
          usedBoosts: usedBoostsThisGame,
        });
        return response;
      } else {
        const response = await apiRequest("POST", "/api/scores", data);
        return response;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scores/all-time"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/leaderboard/daily"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/leaderboard/boosted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/leaderboard/pure"] });
      setSubmitError(null);
      setShowNameInput(false);
      setScreen("leaderboard");
    },
    onError: (error: Error) => {
      setSubmitError(error.message || "Please choose a different name");
    },
  });

  // Initialize Telegram WebApp SDK
  useEffect(() => {
    try {
      WebApp.ready();
      const user = WebApp.initDataUnsafe?.user;
      if (user) {
        setTelegramId(user.id.toString());
        setTelegramUsername(user.username || user.first_name || "Player");
      }
    } catch (e) {
      console.log("Not running in Telegram Mini App context");
    }
  }, []);

  // Fetch player inventory from server when telegramId is available
  useEffect(() => {
    if (telegramId) {
      fetch(`/api/telegram/inventory/${telegramId}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setInventory({
              extra_life: data.extra_life || 0,
              shield_boost: data.shield_boost || 0,
              rapid_fire: data.rapid_fire || 0,
              side_guns: data.side_guns || 0,
              machine_gun: data.machine_gun || 0,
              skip_storm: data.skip_storm || 0,
            });
          }
        })
        .catch(console.error);
    }
  }, [telegramId]);

  // Purchase boost with Telegram Stars
  const handlePurchaseBoost = useCallback(async (boostType: BoostType, quantity: number = 1) => {
    if (!telegramId) {
      toast({
        title: "Not Connected",
        description: "Please open this app in Telegram",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("/api/telegram/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramId,
          boostType,
          quantity,
        }),
      });

      const data = await response.json();
      
      if (!data.invoiceUrl) {
        toast({
          title: "Error",
          description: data.error || "Failed to create invoice",
          variant: "destructive",
        });
        return;
      }

      // Open Telegram's native payment UI
      WebApp.openInvoice(data.invoiceUrl, async (status: string) => {
        if (status === "paid") {
          // Confirm the payment and update inventory
          const confirmRes = await fetch("/api/telegram/confirm-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telegramId,
              boostType,
              quantity,
              totalStars: data.totalStars,
            }),
          });
          
          const confirmData = await confirmRes.json();
          
          if (confirmData.success && confirmData.inventory) {
            const inv = confirmData.inventory;
            const getQty = (type: string) => inv.find((i: { boostType: string; quantity: number }) => i.boostType === type)?.quantity || 0;
            setInventory({
              extra_life: getQty("extra_life"),
              shield_boost: getQty("shield_boost"),
              rapid_fire: getQty("rapid_fire"),
              side_guns: getQty("side_guns"),
              machine_gun: getQty("machine_gun"),
              skip_storm: getQty("skip_storm"),
            });
            
            toast({
              title: "Purchase Successful!",
              description: confirmData.message,
            });
          }
        } else if (status === "cancelled") {
          toast({
            title: "Payment Cancelled",
            description: "No Stars were charged",
          });
        } else if (status === "failed") {
          toast({
            title: "Payment Failed",
            description: "Please try again",
            variant: "destructive",
          });
        }
      });
    } catch (error) {
      console.error("Purchase error:", error);
      toast({
        title: "Error",
        description: "Failed to process purchase",
        variant: "destructive",
      });
    }
  }, [telegramId, toast]);

  const initStars = useCallback(() => {
    starsRef.current = Array.from({ length: 100 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      size: Math.random() * 2 + 1,
      speed: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.3,
    }));
  }, []);

  const spawnEnemy = useCallback(() => {
    const strains: StrainType[] = ["indica", "sativa", "hybrid"];
    const strain = strains[Math.floor(Math.random() * strains.length)];
    const health = difficultyRef.current;
    
    // Randomized speed: base + difficulty bonus + random variation (-30% to +50%)
    const baseSpeed = 1 + difficultyRef.current * 0.2;
    const speedVariation = baseSpeed * (0.7 + Math.random() * 0.8); // 70% to 150% of base
    
    const enemy: Enemy = {
      id: generateId(),
      x: Math.random() * (CANVAS_WIDTH - ENEMY_SIZE),
      y: -ENEMY_SIZE,
      width: ENEMY_SIZE,
      height: ENEMY_SIZE,
      health,
      maxHealth: health,
      strain,
      speed: speedVariation,
      shootCooldown: Math.random() * 2000 + 500, // Faster initial shots sometimes
      points: health,
    };
    
    enemiesRef.current.push(enemy);
  }, []);

  const shoot = useCallback((isPlayer: boolean, x: number, y: number) => {
    if (isPlayer) {
      soundSystem.shoot();
      const weaponLevel = weaponLevelRef.current;
      const player = playerRef.current;
      const machineGunActive = weaponLevel >= 3 || machineGunPreviewRef.current.active;
      
      // Center gun (always active)
      const centerX = player.x + player.width / 2;
      
      if (machineGunActive) {
        // Double barrel machine gun - 2 projectiles from center
        projectilesRef.current.push({
          id: generateId(),
          x: centerX - 4 - PROJECTILE_SIZE / 2,
          y: player.y - PROJECTILE_SIZE,
          width: PROJECTILE_SIZE,
          height: PROJECTILE_SIZE * 2,
          speed: -12,
          isPlayerBullet: true,
        });
        projectilesRef.current.push({
          id: generateId(),
          x: centerX + 4 - PROJECTILE_SIZE / 2,
          y: player.y - PROJECTILE_SIZE,
          width: PROJECTILE_SIZE,
          height: PROJECTILE_SIZE * 2,
          speed: -12,
          isPlayerBullet: true,
        });
      } else {
        // Single center shot
        projectilesRef.current.push({
          id: generateId(),
          x: centerX - PROJECTILE_SIZE / 2,
          y: player.y - PROJECTILE_SIZE,
          width: PROJECTILE_SIZE,
          height: PROJECTILE_SIZE * 2,
          speed: -10,
          isPlayerBullet: true,
        });
      }
      
      // Left gun (weapon level 1+)
      if (weaponLevel >= 1) {
        projectilesRef.current.push({
          id: generateId(),
          x: player.x - 6,
          y: player.y + 8,
          width: PROJECTILE_SIZE,
          height: PROJECTILE_SIZE * 2,
          speed: -10,
          isPlayerBullet: true,
        });
      }
      
      // Right gun (weapon level 2+)
      if (weaponLevel >= 2) {
        projectilesRef.current.push({
          id: generateId(),
          x: player.x + player.width,
          y: player.y + 8,
          width: PROJECTILE_SIZE,
          height: PROJECTILE_SIZE * 2,
          speed: -10,
          isPlayerBullet: true,
        });
      }
    } else {
      // Enemy projectile with randomized speed
      // Base speed + difficulty + random variation
      // Sometimes fires FAST burst shots (15% chance)
      const isBurstShot = Math.random() < 0.15;
      const baseSpeed = 4 + difficultyRef.current * 0.5;
      const randomVariation = baseSpeed * (0.6 + Math.random() * 0.8); // 60% to 140% variation
      const burstMultiplier = isBurstShot ? 1.8 + Math.random() * 0.7 : 1; // 1.8x to 2.5x for bursts
      const finalSpeed = randomVariation * burstMultiplier;
      
      const projectile: Projectile = {
        id: generateId(),
        x: x - PROJECTILE_SIZE / 2,
        y: y + ENEMY_SIZE,
        width: PROJECTILE_SIZE,
        height: PROJECTILE_SIZE * 2,
        speed: finalSpeed,
        isPlayerBullet: false,
      };
      projectilesRef.current.push(projectile);
    }
  }, []);

  const checkCollision = (a: { x: number; y: number; width: number; height: number }, 
                         b: { x: number; y: number; width: number; height: number }) => {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  };

  const spawnHazard = useCallback(() => {
    const hazardTypes: HazardType[] = ["bong", "joint", "matches"];
    const type = hazardTypes[Math.floor(Math.random() * hazardTypes.length)];
    
    // Highly randomized hazard speed: some slow, some FAST
    // 20% chance of "fast hazard" that zooms down
    const isFastHazard = Math.random() < 0.2;
    const hazardSpeed = isFastHazard 
      ? 4 + Math.random() * 3  // Fast: 4-7 speed
      : 1.5 + Math.random() * 2.5; // Normal: 1.5-4 speed
    
    const hazard: Hazard = {
      id: generateId(),
      x: Math.random() * (CANVAS_WIDTH - HAZARD_SIZE),
      y: -HAZARD_SIZE,
      width: HAZARD_SIZE,
      height: HAZARD_SIZE,
      speed: hazardSpeed,
      type,
    };
    
    hazardsRef.current.push(hazard);
  }, []);

  const createExplosion = useCallback((x: number, y: number, color: string) => {
    const particleCount = 16;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 2.5 + Math.random() * 4;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color,
        size: 4 + Math.random() * 4,
      });
    }
    soundSystem.explosion();
  }, []);

  const spawnPowerUp = useCallback((x: number, y: number) => {
    if (Math.random() > 0.2) return; // 20% chance to drop power-up
    
    const types: PowerUpType[] = ["speed", "shield", "rapid", "life"];
    const weights = [0.3, 0.3, 0.3, 0.1]; // life is rarer
    const rand = Math.random();
    let cumulative = 0;
    let selectedType: PowerUpType = "speed";
    
    for (let i = 0; i < types.length; i++) {
      cumulative += weights[i];
      if (rand < cumulative) {
        selectedType = types[i];
        break;
      }
    }
    
    powerUpsRef.current.push({
      id: generateId(),
      x,
      y,
      width: 16,
      height: 16,
      speed: 1.5,
      type: selectedType,
    });
  }, []);

  const spawnBudAngel = useCallback(() => {
    const gameTimeSec = gameTimeRef.current / 1000;
    // Only spawn after 90 seconds of play
    if (gameTimeSec < 90) return;
    // Only spawn if not recently spawned (min 20 sec between spawns)
    if (gameTimeRef.current - lastBudAngelSpawnRef.current < 20000) return;
    // 4.5% chance per spawn attempt (reduced 10% from 5%)
    if (Math.random() > 0.045) return;
    
    lastBudAngelSpawnRef.current = gameTimeRef.current;
    specialObjectsRef.current.push({
      id: generateId(),
      x: Math.random() * (CANVAS_WIDTH - 28),
      y: -28,
      width: 28,
      height: 28,
      speed: 1.5,
      type: "budAngel",
    });
  }, []);

  const spawnSkull = useCallback(() => {
    // Max once per 30 seconds
    if (gameTimeRef.current - lastSkullSpawnRef.current < 30000) return;
    // 3% chance per spawn attempt
    if (Math.random() > 0.03) return;
    
    lastSkullSpawnRef.current = gameTimeRef.current;
    specialObjectsRef.current.push({
      id: generateId(),
      x: Math.random() * (CANVAS_WIDTH - 24),
      y: -24,
      width: 24,
      height: 24,
      speed: 2 + Math.random() * 1.5,
      type: "skull",
    });
  }, []);

  const startMeteorShower = useCallback(() => {
    const gameTimeSec = gameTimeRef.current / 1000;
    // Only after 90 seconds of play
    if (gameTimeSec < 90) return;
    // Don't start if already active
    if (meteorShowerActiveRef.current) return;
    // Skip storm boost - no meteor showers this life
    const boosts = activeBoostsRef.current;
    if (boosts.skipStormActive) return;
    // Min 15 seconds between showers
    if (gameTimeRef.current - lastMeteorShowerRef.current < 15000) return;
    // 3% chance per check
    if (Math.random() > 0.03) return;
    
    meteorShowerActiveRef.current = true;
    lastMeteorShowerRef.current = gameTimeRef.current;
    whiteHotSpawnedRef.current = false; // Reset white-hot flag for new shower
    // Random duration: 3-6 seconds
    const duration = 3000 + Math.random() * 3000;
    meteorShowerEndRef.current = gameTimeRef.current + duration;
    
    // Spawn initial batch of meteor seeds (5-15 seeds)
    const seedCount = 5 + Math.floor(Math.random() * 11);
    for (let i = 0; i < seedCount; i++) {
      setTimeout(() => {
        if (!meteorShowerActiveRef.current) return;
        // 10% chance for white-hot seed (only 1 per shower max, use persistent flag)
        const isWhiteHot = !whiteHotSpawnedRef.current && Math.random() < 0.1;
        if (isWhiteHot) {
          whiteHotSpawnedRef.current = true;
        }
        meteorSeedsRef.current.push({
          id: generateId(),
          x: Math.random() * CANVAS_WIDTH,
          y: -10 - Math.random() * 50,
          width: isWhiteHot ? 10 : 8,
          height: isWhiteHot ? 14 : 12,
          speed: 4 + Math.random() * 6, // Speed: 4-10
          angle: (Math.random() - 0.5) * 0.5, // Slight diagonal variation
          isWhiteHot,
        });
      }, i * (duration / seedCount / 2)); // Stagger spawns
    }
  }, []);

  const resetGame = useCallback(() => {
    soundSystem.init();
    playerRef.current = {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: CANVAS_HEIGHT - PLAYER_SIZE - 80,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      speed: 5,
    };
    enemiesRef.current = [];
    projectilesRef.current = [];
    hazardsRef.current = [];
    powerUpsRef.current = [];
    particlesRef.current = [];
    specialObjectsRef.current = [];
    difficultyRef.current = 1;
    gameTimeRef.current = 0;
    shootCooldownRef.current = 0;
    spawnCooldownRef.current = 0;
    hazardCooldownRef.current = 0;
    weaponLevelRef.current = 0;
    invincibilityRef.current = 0;
    rapidFireEndRef.current = 0;
    speedBoostEndRef.current = 0;
    sideGunsBoostEndRef.current = 0;
    machineGunBoostEndRef.current = 0;
    shieldEndRef.current = 0;
    lastSkullSpawnRef.current = 0;
    lastBudAngelSpawnRef.current = 0;
    meteorSeedsRef.current = [];
    meteorShowerActiveRef.current = false;
    meteorShowerEndRef.current = 0;
    lastMeteorShowerRef.current = 0;
    whiteHotSpawnedRef.current = false;
    // Reset new gameplay features
    comboCountRef.current = 0;
    comboMultiplierRef.current = 1;
    lastKillTimeRef.current = 0;
    killStreakRef.current = 0;
    totalKillsRef.current = 0;
    bossRef.current = null;
    bossKilledRef.current = false;
    lastBossSpawnRef.current = 0;
    budRageActiveRef.current = false;
    machineGunPreviewRef.current = { active: false, endTime: 0 };
    screenShakeRef.current = { intensity: 0, duration: 0 };
    slowMoRef.current = { active: false, endTime: 0 };
    damageFlashRef.current = { active: false, endTime: 0 };
    waveRef.current = 1;
    waveTimerRef.current = 0;
    // Clear any pending formation timeouts
    formationTimeoutsRef.current.forEach(t => clearTimeout(t));
    formationTimeoutsRef.current = [];
    gameSessionRef.current++; // Invalidate any pending timeouts from previous session
    starSpeedMultiplierRef.current = 1;
    setIsNewHighScore(false);
    
    // Apply boost for Life 1 (slot 0)
    const boosts = activeBoostsRef.current;
    boosts.currentLifeIndex = 0;
    const life1Boost = boosts.slots[0];
    
    // Count extra_life boosts to determine starting lives
    const extraLives = boosts.slots.filter(s => s === 'extra_life').length;
    const startingLives = Math.min(3 + extraLives, 4);
    
    // Apply timed boost for life 1 (if not extra_life or skip_storm)
    if (life1Boost === 'shield_boost') {
      shieldEndRef.current = gameTimeRef.current + BOOST_DURATIONS.shield_boost;
    } else if (life1Boost === 'rapid_fire') {
      rapidFireEndRef.current = gameTimeRef.current + BOOST_DURATIONS.rapid_fire;
    } else if (life1Boost === 'side_guns') {
      sideGunsBoostEndRef.current = gameTimeRef.current + BOOST_DURATIONS.side_guns;
    } else if (life1Boost === 'machine_gun') {
      machineGunBoostEndRef.current = gameTimeRef.current + BOOST_DURATIONS.machine_gun;
    } else if (life1Boost === 'skip_storm') {
      boosts.skipStormActive = true;
    }
    
    setGameState({
      score: 0,
      lives: startingLives,
      wave: 1,
      gameTime: 0,
      isPlaying: true,
      isPaused: false,
      isGameOver: false,
    });
  }, []);

  const endGame = useCallback(() => {
    soundSystem.gameOver();
    const currentHighScore = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : 0;
    setGameState(prev => {
      if (prev.score > currentHighScore) {
        setIsNewHighScore(true);
        setTimeout(() => soundSystem.newHighScore(), 500);
      }
      return {
        ...prev,
        isPlaying: false,
        isGameOver: true,
      };
    });
    setScreen("gameover");
  }, [scores]);

  const togglePause = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      isPaused: !prev.isPaused,
    }));
  }, []);
  
  // Handle boost when player loses a life - apply boost for next life
  const handleLifeLost = useCallback(() => {
    const boosts = activeBoostsRef.current;
    
    // Move to next life slot
    boosts.currentLifeIndex++;
    boosts.skipStormActive = false; // Reset skip storm for new life
    
    // Apply boost for the new life (if we have a slot for it)
    if (boosts.currentLifeIndex < 3) {
      const nextBoost = boosts.slots[boosts.currentLifeIndex];
      
      if (nextBoost === 'shield_boost') {
        shieldEndRef.current = gameTimeRef.current + BOOST_DURATIONS.shield_boost;
      } else if (nextBoost === 'rapid_fire') {
        rapidFireEndRef.current = gameTimeRef.current + BOOST_DURATIONS.rapid_fire;
      } else if (nextBoost === 'side_guns') {
        sideGunsBoostEndRef.current = gameTimeRef.current + BOOST_DURATIONS.side_guns;
      } else if (nextBoost === 'machine_gun') {
        machineGunBoostEndRef.current = gameTimeRef.current + BOOST_DURATIONS.machine_gun;
      } else if (nextBoost === 'skip_storm') {
        boosts.skipStormActive = true;
      }
    }
    
    // Reset weapon level for new life (will be recalculated in update loop)
    weaponLevelRef.current = 0;
  }, []);

  const update = useCallback((deltaTime: number) => {
    if (gameState.isPaused || !gameState.isPlaying) return;

    // Apply slow-mo effect
    const slowMoActive = slowMoRef.current.active && gameTimeRef.current < slowMoRef.current.endTime;
    const effectiveDelta = slowMoActive ? deltaTime * 0.3 : deltaTime;
    
    gameTimeRef.current += effectiveDelta;
    const gameTimeSec = gameTimeRef.current / 1000;
    
    // Weapon upgrades based on time (with boost support)
    // Timed boosts are set at game start and expire after their duration
    const hasSideGunsBoost = sideGunsBoostEndRef.current > gameTimeRef.current;
    const hasMachineGunBoost = machineGunBoostEndRef.current > gameTimeRef.current;
    
    // Determine weapon level based on natural progression + active boosts
    // Priority: Machine gun boost > Natural 4min > Side guns boost > Natural 90s > Natural 60s
    // Calculate natural weapon level first, then apply boosts on top
    let naturalWeaponLevel = 0;
    if (gameTimeSec >= 240) {
      naturalWeaponLevel = 3; // Natural machine gun at 4 min
    } else if (gameTimeSec >= 90) {
      naturalWeaponLevel = 2; // Both side guns at 90s
    } else if (gameTimeSec >= 60) {
      naturalWeaponLevel = 1; // Left gun at 60s
    }
    
    // Apply boosts: take the higher of boost level or natural level
    if (hasMachineGunBoost) {
      weaponLevelRef.current = Math.max(3, naturalWeaponLevel);
    } else if (hasSideGunsBoost) {
      weaponLevelRef.current = Math.max(2, naturalWeaponLevel);
    } else {
      weaponLevelRef.current = naturalWeaponLevel;
    }
    
    const newDifficulty = Math.floor(gameTimeRef.current / DIFFICULTY_INTERVAL) + 1;
    if (newDifficulty !== difficultyRef.current) {
      difficultyRef.current = newDifficulty;
      setGameState(prev => ({ ...prev, wave: newDifficulty }));
    }

    // Star speed increases with game progress
    starSpeedMultiplierRef.current = 1 + (gameTimeSec / 120); // Doubles every 2 minutes
    
    // Screen shake decay
    if (screenShakeRef.current.duration > 0) {
      screenShakeRef.current.duration -= deltaTime;
      if (screenShakeRef.current.duration <= 0) {
        screenShakeRef.current = { intensity: 0, duration: 0 };
      }
    }
    
    // Slow-mo check
    if (slowMoRef.current.active && gameTimeRef.current > slowMoRef.current.endTime) {
      slowMoRef.current.active = false;
    }
    
    // Machine gun preview at 3:30 (210 seconds)
    if (gameTimeSec >= 210 && gameTimeSec < 215 && !machineGunPreviewRef.current.active && weaponLevelRef.current < 3) {
      machineGunPreviewRef.current = { active: true, endTime: gameTimeRef.current + 5000 };
    }
    if (machineGunPreviewRef.current.active && gameTimeRef.current > machineGunPreviewRef.current.endTime) {
      machineGunPreviewRef.current.active = false;
    }
    
    // Combo decay - reset if no kills for 2 seconds
    if (gameTimeRef.current - lastKillTimeRef.current > 2000 && comboCountRef.current > 0) {
      comboCountRef.current = 0;
      comboMultiplierRef.current = 1;
    }
    
    starsRef.current.forEach(star => {
      star.y += star.speed * starSpeedMultiplierRef.current;
      if (star.y > CANVAS_HEIGHT) {
        star.y = -star.size;
        star.x = Math.random() * CANVAS_WIDTH;
      }
    });

    const player = playerRef.current;
    const swipe = swipeTouchRef.current;
    const swipeThreshold = 10;
    const swipeLeft = swipe.active && (swipe.currentX - swipe.startX) < -swipeThreshold;
    const swipeRight = swipe.active && (swipe.currentX - swipe.startX) > swipeThreshold;
    
    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a") || touchRef.current.left || swipeLeft) {
      player.x = Math.max(0, player.x - player.speed);
    }
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("d") || touchRef.current.right || swipeRight) {
      player.x = Math.min(CANVAS_WIDTH - player.width, player.x + player.speed);
    }

    shootCooldownRef.current -= deltaTime;
    invincibilityRef.current = Math.max(0, invincibilityRef.current - deltaTime);
    
    // Faster shooting with machine gun (level 3 or preview active)
    const rapidFireActive = rapidFireEndRef.current > gameTimeRef.current;
    const budRageBonus = budRageActiveRef.current ? 0.75 : 1; // 25% faster when Bud Rage active
    const machineGunActive = weaponLevelRef.current >= 3 || machineGunPreviewRef.current.active;
    const baseDelay = machineGunActive ? 120 : 200;
    const shootDelay = (rapidFireActive ? baseDelay * 0.5 : baseDelay) * budRageBonus;
    if ((keysRef.current.has(" ") || keysRef.current.has("ArrowUp") || touchRef.current.fire) && 
        shootCooldownRef.current <= 0) {
      shoot(true, player.x + player.width / 2, player.y);
      shootCooldownRef.current = shootDelay;
    }

    spawnCooldownRef.current -= deltaTime;
    // Randomized spawn rate: base rate with 50% to 150% variation for unpredictability
    const baseSpawnRate = Math.max(500, 2000 - difficultyRef.current * 150);
    const spawnRateVariation = baseSpawnRate * (0.5 + Math.random()); // 50% to 150%
    if (spawnCooldownRef.current <= 0) {
      // Formation spawning (15% chance after 45 sec)
      if (gameTimeSec >= 45 && Math.random() < 0.15) {
        const formationType = Math.floor(Math.random() * 3);
        const centerX = 50 + Math.random() * (CANVAS_WIDTH - 100);
        // Helper to spawn formation enemy with timeout tracking
        const currentSession = gameSessionRef.current;
        const spawnFormationEnemy = (delay: number, x: number, yOffset: number, speed: number, shootCooldown: number) => {
          const timeoutId = setTimeout(() => {
            // Check if game session is still the same (prevents spawning after reset)
            if (gameSessionRef.current !== currentSession) return;
            const strains: StrainType[] = ["indica", "sativa", "hybrid"];
            const strain = strains[Math.floor(Math.random() * strains.length)];
            const enemy: Enemy = {
              id: generateId(),
              x: Math.max(0, Math.min(CANVAS_WIDTH - ENEMY_SIZE, x)),
              y: -ENEMY_SIZE - yOffset,
              width: ENEMY_SIZE,
              height: ENEMY_SIZE,
              health: difficultyRef.current,
              maxHealth: difficultyRef.current,
              strain,
              speed,
              shootCooldown,
              points: difficultyRef.current,
            };
            enemiesRef.current.push(enemy);
          }, delay);
          formationTimeoutsRef.current.push(timeoutId);
        };
        
        if (formationType === 0) {
          // V-formation (5 enemies)
          for (let i = 0; i < 5; i++) {
            const offsetX = (i - 2) * 35;
            const offsetY = Math.abs(i - 2) * 25;
            spawnFormationEnemy(i * 100, centerX + offsetX, offsetY, 1.5 + difficultyRef.current * 0.15, 1000 + Math.random() * 1000);
          }
        } else if (formationType === 1) {
          // Diagonal line (4 enemies)
          for (let i = 0; i < 4; i++) {
            spawnFormationEnemy(i * 150, centerX + i * 30, i * 20, 1.8 + difficultyRef.current * 0.1, 800 + Math.random() * 800);
          }
        } else {
          // Horizontal line (3 enemies)
          for (let i = 0; i < 3; i++) {
            const offsetX = (i - 1) * 50;
            spawnFormationEnemy(i * 80, centerX + offsetX, 0, 1.2 + difficultyRef.current * 0.2, 1200 + Math.random() * 600);
          }
        }
        spawnCooldownRef.current = spawnRateVariation * 2; // Longer cooldown after formation
      } else {
        spawnEnemy();
        // Sometimes spawn 2 enemies at once (10% chance after 30 sec)
        if (gameTimeSec >= 30 && Math.random() < 0.1) {
          spawnEnemy();
        }
        spawnCooldownRef.current = spawnRateVariation;
      }
    }

    // Hazard spawning - starts after 20 seconds, highly randomized timing
    hazardCooldownRef.current -= deltaTime;
    if (gameTimeSec >= 20) {
      const baseHazardRate = Math.max(1500, 5000 - gameTimeSec * 15);
      // 40% to 160% variation for maximum unpredictability
      const hazardRateVariation = baseHazardRate * (0.4 + Math.random() * 1.2);
      if (hazardCooldownRef.current <= 0) {
        spawnHazard();
        // Sometimes spawn 2 hazards at once (8% chance after 45 sec)
        if (gameTimeSec >= 45 && Math.random() < 0.08) {
          spawnHazard();
        }
        hazardCooldownRef.current = hazardRateVariation;
      }
    }

    // Special object spawning
    spawnBudAngel(); // Only spawns after 90 seconds
    spawnSkull(); // Max once per 30 seconds
    
    // Boss spawning - every 2 minutes (120 seconds), max 1 kill per game
    if (gameTimeSec >= 120 && !bossRef.current && !bossKilledRef.current) {
      if (gameTimeRef.current - lastBossSpawnRef.current >= 120000) {
        lastBossSpawnRef.current = gameTimeRef.current;
        bossRef.current = {
          x: CANVAS_WIDTH / 2 - 40,
          y: -80,
          width: 80,
          height: 60,
          health: 10,
          maxHealth: 10,
          direction: 1,
          spawnTime: gameTimeRef.current,
          shootCooldown: 0,
        };
      }
    }
    
    // Update boss
    if (bossRef.current) {
      const boss = bossRef.current;
      
      // Boss entry animation - move down to position
      if (boss.y < 40) {
        boss.y += 1;
      } else {
        // Side-to-side movement
        boss.x += boss.direction * 2;
        if (boss.x <= 10) {
          boss.direction = 1;
        } else if (boss.x >= CANVAS_WIDTH - boss.width - 10) {
          boss.direction = -1;
        }
        
        // Boss shooting
        boss.shootCooldown -= deltaTime;
        if (boss.shootCooldown <= 0) {
          // Fire 3 projectiles in a spread
          const centerX = boss.x + boss.width / 2;
          for (let angle = -0.3; angle <= 0.3; angle += 0.3) {
            projectilesRef.current.push({
              id: generateId(),
              x: centerX - PROJECTILE_SIZE / 2,
              y: boss.y + boss.height,
              width: PROJECTILE_SIZE,
              height: PROJECTILE_SIZE * 2,
              speed: 5 + Math.abs(angle) * 2,
              isPlayerBullet: false,
            });
          }
          boss.shootCooldown = 800; // Fires every 0.8 seconds
        }
      }
      
      // Boss times out after 30 seconds
      if (gameTimeRef.current - boss.spawnTime > 30000) {
        bossRef.current = null;
      }
    }

    // Update special objects and check collisions
    specialObjectsRef.current = specialObjectsRef.current.filter(obj => {
      obj.y += obj.speed;
      
      if (checkCollision(obj, player)) {
        if (obj.type === "budAngel") {
          // Bud Angel grants 15 seconds of shield (stacks if already active)
          soundSystem.powerUp();
          if (shieldEndRef.current > gameTimeRef.current) {
            // Shield stacking - extend current shield
            shieldEndRef.current += 15000;
          } else {
            shieldEndRef.current = gameTimeRef.current + 15000;
          }
          createExplosion(obj.x + obj.width / 2, obj.y + obj.height / 2, "#88ffff");
          return false;
        } else if (obj.type === "skull") {
          // Skull causes instant game over (unless shielded)
          if (shieldEndRef.current <= gameTimeRef.current) {
            soundSystem.damage();
            damageFlashRef.current = { active: true, endTime: gameTimeRef.current + 150 };
            createExplosion(obj.x + obj.width / 2, obj.y + obj.height / 2, "#006400");
            setGameState(prev => ({ ...prev, lives: 0 }));
            endGame();
            return false;
          }
        }
      }
      
      return obj.y < CANVAS_HEIGHT + obj.height;
    });

    // Update hazards
    hazardsRef.current = hazardsRef.current.filter(hazard => {
      hazard.y += hazard.speed;
      return hazard.y < CANVAS_HEIGHT + hazard.height;
    });

    // Check hazard collisions with player (only if not invincible and no shield)
    // Use a separate loop to ensure we only take one hit per frame
    let tookDamageThisFrame = invincibilityRef.current > 0;
    hazardsRef.current = hazardsRef.current.filter(hazard => {
      if (!tookDamageThisFrame && shieldEndRef.current <= gameTimeRef.current && checkCollision(hazard, player)) {
        tookDamageThisFrame = true;
        soundSystem.damage();
        damageFlashRef.current = { active: true, endTime: gameTimeRef.current + 150 };
        invincibilityRef.current = 1500; // 1.5 seconds of invincibility
        // Reset kill streak and combo on damage
        killStreakRef.current = 0;
        comboCountRef.current = 0;
        comboMultiplierRef.current = 1;
        handleLifeLost();
        setGameState(prev => {
          const newLives = prev.lives - 1;
          if (newLives <= 0) {
            endGame();
          }
          return { ...prev, lives: newLives };
        });
        return false;
      }
      return true;
    });

    enemiesRef.current.forEach(enemy => {
      enemy.y += enemy.speed;
      
      // Unpredictability scaling: 0% until 90sec, then 15% + 2% every 30sec after
      const gameTimeSec = gameTimeRef.current / 1000;
      let unpredictability = 0;
      if (gameTimeSec >= 90) {
        unpredictability = 15 + Math.floor((gameTimeSec - 90) / 30) * 2;
        unpredictability = Math.min(unpredictability, 50); // Cap at 50%
      }
      
      // Apply horizontal drift based on unpredictability
      if (unpredictability > 0 && Math.random() * 100 < unpredictability) {
        const drift = (Math.random() - 0.5) * 4; // -2 to +2 pixels
        enemy.x += drift;
        // Keep enemies within bounds
        enemy.x = Math.max(0, Math.min(CANVAS_WIDTH - enemy.width, enemy.x));
      }
      
      enemy.shootCooldown -= deltaTime;
      
      if (enemy.shootCooldown <= 0) {
        shoot(false, enemy.x + enemy.width / 2, enemy.y);
        enemy.shootCooldown = Math.random() * 2000 + 1500 - difficultyRef.current * 100;
      }
    });

    projectilesRef.current = projectilesRef.current.filter(proj => {
      proj.y += proj.speed;
      return proj.y > -proj.height && proj.y < CANVAS_HEIGHT + proj.height;
    });

    projectilesRef.current = projectilesRef.current.filter(proj => {
      if (proj.isPlayerBullet) {
        // Check for white-hot seed hits
        for (let i = meteorSeedsRef.current.length - 1; i >= 0; i--) {
          const seed = meteorSeedsRef.current[i];
          if (seed.isWhiteHot && checkCollision(proj, seed)) {
            // White-hot seed hit! Grant 5 sec shield + 5 sec rapid fire
            soundSystem.powerUp();
            createExplosion(seed.x + seed.width / 2, seed.y + seed.height / 2, "#ffffff");
            // Shield stacking for white-hot seed
            if (shieldEndRef.current > gameTimeRef.current) {
              shieldEndRef.current += 5000;
            } else {
              shieldEndRef.current = gameTimeRef.current + 5000;
            }
            // Rapid fire stacking
            if (rapidFireEndRef.current > gameTimeRef.current) {
              rapidFireEndRef.current += 5000;
            } else {
              rapidFireEndRef.current = gameTimeRef.current + 5000;
            }
            meteorSeedsRef.current.splice(i, 1);
            return false;
          }
        }
        
        // Check boss collision first
        if (bossRef.current) {
          const boss = bossRef.current;
          if (checkCollision(proj, boss)) {
            boss.health--;
            soundSystem.hit();
            if (boss.health <= 0) {
              // Boss defeated!
              createExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, "#ff00ff");
              createExplosion(boss.x + 20, boss.y + 20, "#ffff00");
              createExplosion(boss.x + boss.width - 20, boss.y + 20, "#00ffff");
              screenShakeRef.current = { intensity: 15, duration: 500 };
              
              // Big score bonus
              const bossPoints = 50;
              setGameState(prev => ({ ...prev, score: prev.score + bossPoints }));
              
              // Grant Bud Rage power-up (permanent 25% faster fire)
              budRageActiveRef.current = true;
              // Also grant 10 second shield
              if (shieldEndRef.current > gameTimeRef.current) {
                shieldEndRef.current += 10000;
              } else {
                shieldEndRef.current = gameTimeRef.current + 10000;
              }
              
              bossRef.current = null;
              bossKilledRef.current = true; // Can only kill one boss per game
            }
            return false;
          }
        }
        
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const enemy = enemiesRef.current[i];
          if (checkCollision(proj, enemy)) {
            enemy.health--;
            soundSystem.hit();
            if (enemy.health <= 0) {
              const enemyColor = strainColors[enemy.strain].fill;
              createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemyColor);
              spawnPowerUp(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
              
              // Combo system - kills within 1.5 seconds build combo
              const timeSinceLastKill = gameTimeRef.current - lastKillTimeRef.current;
              if (timeSinceLastKill < 1500) {
                comboCountRef.current++;
                comboMultiplierRef.current = Math.min(1 + comboCountRef.current * 0.1, 3); // Max 3x multiplier
              } else {
                comboCountRef.current = 0;
                comboMultiplierRef.current = 1;
              }
              lastKillTimeRef.current = gameTimeRef.current;
              killStreakRef.current++;
              totalKillsRef.current++;
              
              // Calculate points with combo multiplier
              const basePoints = enemy.points;
              const finalPoints = Math.round(basePoints * comboMultiplierRef.current);
              
              // Screen shake on combo kills
              if (comboCountRef.current >= 3) {
                screenShakeRef.current = { intensity: 3 + comboCountRef.current, duration: 150 };
              }
              
              setGameState(prev => ({ 
                ...prev, 
                score: prev.score + finalPoints 
              }));
              enemiesRef.current.splice(i, 1);
            }
            return false;
          }
        }
      } else {
        if (!tookDamageThisFrame && shieldEndRef.current <= gameTimeRef.current && checkCollision(proj, player)) {
          tookDamageThisFrame = true;
          soundSystem.damage();
          damageFlashRef.current = { active: true, endTime: gameTimeRef.current + 150 };
          invincibilityRef.current = 1500; // 1.5 seconds of invincibility
          // Reset kill streak and combo on damage
          killStreakRef.current = 0;
          comboCountRef.current = 0;
          comboMultiplierRef.current = 1;
          handleLifeLost();
          setGameState(prev => {
            const newLives = prev.lives - 1;
            if (newLives <= 0) {
              endGame();
            }
            return { ...prev, lives: newLives };
          });
          return false;
        }
      }
      return true;
    });

    enemiesRef.current = enemiesRef.current.filter(enemy => {
      if (!tookDamageThisFrame && shieldEndRef.current <= gameTimeRef.current && checkCollision(enemy, player)) {
        tookDamageThisFrame = true;
        soundSystem.damage();
        damageFlashRef.current = { active: true, endTime: gameTimeRef.current + 150 };
        invincibilityRef.current = 1500; // 1.5 seconds of invincibility
        // Reset kill streak and combo on damage
        killStreakRef.current = 0;
        comboCountRef.current = 0;
        comboMultiplierRef.current = 1;
        handleLifeLost();
        setGameState(prev => {
          const newLives = prev.lives - 1;
          if (newLives <= 0) {
            endGame();
          }
          return { ...prev, lives: newLives };
        });
        return false;
      }
      return enemy.y < CANVAS_HEIGHT + enemy.height;
    });

    // Update particles
    particlesRef.current = particlesRef.current.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.02;
      particle.vy += 0.1; // gravity
      return particle.life > 0;
    });

    // Update power-ups
    powerUpsRef.current = powerUpsRef.current.filter(powerUp => {
      powerUp.y += powerUp.speed;
      
      if (checkCollision(powerUp, player)) {
        soundSystem.powerUp();
        // Trigger slow-mo effect on power-up collection
        slowMoRef.current = { active: true, endTime: gameTimeRef.current + 300 };
        switch (powerUp.type) {
          case "speed":
            speedBoostEndRef.current = gameTimeRef.current + 5000;
            playerRef.current.speed = 8;
            break;
          case "shield":
            // Shield stacking for power-ups
            if (shieldEndRef.current > gameTimeRef.current) {
              shieldEndRef.current += 5000;
            } else {
              shieldEndRef.current = gameTimeRef.current + 5000;
            }
            break;
          case "rapid":
            // Rapid fire stacking
            if (rapidFireEndRef.current > gameTimeRef.current) {
              rapidFireEndRef.current += 5000;
            } else {
              rapidFireEndRef.current = gameTimeRef.current + 5000;
            }
            break;
          case "life":
            setGameState(prev => ({ ...prev, lives: Math.min(prev.lives + 1, 3) }));
            break;
        }
        return false;
      }
      
      return powerUp.y < CANVAS_HEIGHT + powerUp.height;
    });

    // Reset power-up effects when expired
    if (speedBoostEndRef.current > 0 && speedBoostEndRef.current <= gameTimeRef.current) {
      playerRef.current.speed = 5;
      speedBoostEndRef.current = 0;
    }

    // Check for meteor shower spawn
    startMeteorShower();
    
    // End meteor shower if time is up
    if (meteorShowerActiveRef.current && gameTimeRef.current >= meteorShowerEndRef.current) {
      meteorShowerActiveRef.current = false;
    }
    
    // Update meteor seeds
    meteorSeedsRef.current = meteorSeedsRef.current.filter(seed => {
      seed.y += seed.speed;
      seed.x += seed.angle * seed.speed; // Slight diagonal movement
      
      // Check collision with player (only if not invincible and no shield)
      if (!tookDamageThisFrame && shieldEndRef.current <= gameTimeRef.current && checkCollision(seed, player)) {
        tookDamageThisFrame = true;
        soundSystem.damage();
        damageFlashRef.current = { active: true, endTime: gameTimeRef.current + 150 };
        invincibilityRef.current = 1500;
        // Reset kill streak and combo on damage
        killStreakRef.current = 0;
        comboCountRef.current = 0;
        comboMultiplierRef.current = 1;
        handleLifeLost();
        setGameState(prev => {
          const newLives = prev.lives - 1;
          if (newLives <= 0) {
            endGame();
          }
          return { ...prev, lives: newLives };
        });
        return false;
      }
      
      return seed.y < CANVAS_HEIGHT + seed.height;
    });

    setGameState(prev => ({
      ...prev,
      gameTime: Math.floor(gameTimeRef.current / 1000),
    }));
  }, [gameState.isPaused, gameState.isPlaying, gameState.lives, shoot, spawnEnemy, spawnHazard, spawnBudAngel, spawnSkull, startMeteorShower, endGame, createExplosion, spawnPowerUp, handleLifeLost]);

  const drawPixelRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, player: PlayerSprite) => {
    const { x, y, width, height } = player;
    
    ctx.shadowColor = "#00ff00";
    ctx.shadowBlur = 18;
    
    // ===== ICONIC 5-POINT CANNABIS LEAF (50% MORE DETAILED - Sharper, more defined) =====
    const leafCenterX = x + width / 2;
    const leafBaseY = y + height * 0.15;
    
    // CENTER LEAF (tallest, pointing up) - the iconic central finger with enhanced detail
    drawPixelRect(ctx, leafCenterX - 2, leafBaseY - 18, 4, 20, "#15803d");
    drawPixelRect(ctx, leafCenterX - 3, leafBaseY - 16, 6, 16, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 1, leafBaseY - 20, 2, 5, "#16a34a");
    drawPixelRect(ctx, leafCenterX - 0.5, leafBaseY - 21, 1, 2, "#22c55e"); // Sharp tip
    // Center leaf vein - more pronounced
    drawPixelRect(ctx, leafCenterX - 0.5, leafBaseY - 17, 1, 16, "#0d5c28");
    drawPixelRect(ctx, leafCenterX - 0.5, leafBaseY - 15, 1, 2, "#0a4a20"); // Darker vein detail
    // Serrated edges on center leaf - sharper, more defined
    drawPixelRect(ctx, leafCenterX - 4, leafBaseY - 12, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY - 14, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 4, leafBaseY - 8, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY - 10, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 4, leafBaseY - 4, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY - 6, 2, 2, "#22c55e");
    // Additional leaf texture
    drawPixelRect(ctx, leafCenterX - 2, leafBaseY - 13, 1, 1, "#16a34a");
    drawPixelRect(ctx, leafCenterX + 1, leafBaseY - 11, 1, 1, "#16a34a");
    
    // LEFT UPPER LEAF (angled out-left, second from center) - enhanced
    drawPixelRect(ctx, leafCenterX - 16, leafBaseY - 10, 14, 4, "#15803d");
    drawPixelRect(ctx, leafCenterX - 18, leafBaseY - 9, 10, 5, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 14, leafBaseY - 8, 12, 3, "#16a34a");
    drawPixelRect(ctx, leafCenterX - 19, leafBaseY - 8, 2, 2, "#22c55e"); // Sharp tip
    // Vein - thicker
    drawPixelRect(ctx, leafCenterX - 15, leafBaseY - 7, 10, 1, "#0d5c28");
    drawPixelRect(ctx, leafCenterX - 13, leafBaseY - 8, 6, 1, "#0a4a20");
    // Serrations - more defined
    drawPixelRect(ctx, leafCenterX - 19, leafBaseY - 12, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 16, leafBaseY - 13, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 13, leafBaseY - 12, 2, 2, "#22c55e");
    
    // RIGHT UPPER LEAF (angled out-right, second from center) - enhanced
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY - 10, 14, 4, "#15803d");
    drawPixelRect(ctx, leafCenterX + 8, leafBaseY - 9, 10, 5, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY - 8, 12, 3, "#16a34a");
    drawPixelRect(ctx, leafCenterX + 17, leafBaseY - 8, 2, 2, "#22c55e"); // Sharp tip
    // Vein - thicker
    drawPixelRect(ctx, leafCenterX + 5, leafBaseY - 7, 10, 1, "#0d5c28");
    drawPixelRect(ctx, leafCenterX + 7, leafBaseY - 8, 6, 1, "#0a4a20");
    // Serrations - more defined
    drawPixelRect(ctx, leafCenterX + 17, leafBaseY - 12, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 14, leafBaseY - 13, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 11, leafBaseY - 12, 2, 2, "#22c55e");
    
    // LEFT LOWER LEAF (angled down-left, outer finger) - enhanced
    drawPixelRect(ctx, leafCenterX - 14, leafBaseY + 1, 12, 4, "#15803d");
    drawPixelRect(ctx, leafCenterX - 16, leafBaseY + 2, 8, 4, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 12, leafBaseY + 3, 10, 3, "#16a34a");
    drawPixelRect(ctx, leafCenterX - 17, leafBaseY + 3, 2, 2, "#22c55e"); // Sharp tip
    // Vein
    drawPixelRect(ctx, leafCenterX - 13, leafBaseY + 4, 9, 1, "#0d5c28");
    // Serrations
    drawPixelRect(ctx, leafCenterX - 15, leafBaseY - 1, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX - 12, leafBaseY, 2, 2, "#22c55e");
    
    // RIGHT LOWER LEAF (angled down-right, outer finger) - enhanced
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY + 1, 12, 4, "#15803d");
    drawPixelRect(ctx, leafCenterX + 8, leafBaseY + 2, 8, 4, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 2, leafBaseY + 3, 10, 3, "#16a34a");
    drawPixelRect(ctx, leafCenterX + 15, leafBaseY + 3, 2, 2, "#22c55e"); // Sharp tip
    // Vein
    drawPixelRect(ctx, leafCenterX + 4, leafBaseY + 4, 9, 1, "#0d5c28");
    // Serrations
    drawPixelRect(ctx, leafCenterX + 13, leafBaseY - 1, 2, 2, "#22c55e");
    drawPixelRect(ctx, leafCenterX + 10, leafBaseY, 2, 2, "#22c55e");
    
    // LEAF STEM connecting to bud - thicker and more detailed
    drawPixelRect(ctx, leafCenterX - 1.5, leafBaseY - 1, 3, 8, "#166534");
    drawPixelRect(ctx, leafCenterX - 0.5, leafBaseY + 1, 1, 5, "#0d5c28");
    drawPixelRect(ctx, leafCenterX - 1, leafBaseY + 5, 2, 2, "#14532d"); // Base thickening
    
    // ===== MAIN BUD BODY (enhanced detail) =====
    // Outer shape layers
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.2, width * 0.4, height * 0.15, "#22c55e");
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.28, width * 0.6, height * 0.18, "#16a34a");
    drawPixelRect(ctx, x + width * 0.12, y + height * 0.38, width * 0.76, height * 0.22, "#15803d");
    drawPixelRect(ctx, x + width * 0.08, y + height * 0.48, width * 0.84, height * 0.2, "#166534");
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.62, width * 0.7, height * 0.18, "#14532d");
    drawPixelRect(ctx, x + width * 0.22, y + height * 0.75, width * 0.56, height * 0.12, "#0f3d1f");
    
    // Calyx bumps (rounded bud structure)
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.32, width * 0.16, height * 0.12, "#22c55e");
    drawPixelRect(ctx, x + width * 0.68, y + height * 0.32, width * 0.16, height * 0.12, "#22c55e");
    drawPixelRect(ctx, x + width * 0.4, y + height * 0.25, width * 0.2, height * 0.1, "#22c55e");
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.52, width * 0.14, height * 0.1, "#16a34a");
    drawPixelRect(ctx, x + width * 0.6, y + height * 0.52, width * 0.14, height * 0.1, "#16a34a");
    
    // Orange pistils (hairs) - more for realism
    drawPixelRect(ctx, x + width * 0.28, y + height * 0.22, 2, 5, "#f97316");
    drawPixelRect(ctx, x + width * 0.62, y + height * 0.24, 2, 4, "#ea580c");
    drawPixelRect(ctx, x + width * 0.45, y + height * 0.28, 2, 4, "#fb923c");
    drawPixelRect(ctx, x + width * 0.35, y + height * 0.38, 2, 3, "#f97316");
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.4, 2, 4, "#ea580c");
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.45, 2, 3, "#fb923c");
    drawPixelRect(ctx, x + width * 0.72, y + height * 0.42, 2, 4, "#f97316");
    drawPixelRect(ctx, x + width * 0.4, y + height * 0.55, 2, 3, "#ea580c");
    drawPixelRect(ctx, x + width * 0.58, y + height * 0.58, 2, 3, "#fb923c");
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.62, 2, 3, "#f97316");
    
    // Trichome sparkles (frosty crystals) - enhanced
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 4;
    drawPixelRect(ctx, x + width * 0.32, y + height * 0.3, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.58, y + height * 0.32, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.45, y + height * 0.35, 2, 2, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.22, y + height * 0.42, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.68, y + height * 0.45, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.38, y + height * 0.5, 1, 1, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.52, y + height * 0.52, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.28, y + height * 0.58, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.65, y + height * 0.55, 1, 1, "#e0ffe0");
    
    // Cool sunglasses on Dudley Bud - enhanced
    ctx.shadowBlur = 0;
    ctx.shadowColor = "#000000";
    // Frame
    drawPixelRect(ctx, x + width * 0.12, y + height * 0.42, width * 0.76, 4, "#111");
    // Left lens
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.38, width * 0.28, 8, "#000");
    drawPixelRect(ctx, x + width * 0.14, y + height * 0.39, width * 0.3, 6, "#111");
    // Right lens
    drawPixelRect(ctx, x + width * 0.56, y + height * 0.38, width * 0.28, 8, "#000");
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.39, width * 0.3, 6, "#111");
    // Lens shine/reflection
    drawPixelRect(ctx, x + width * 0.18, y + height * 0.39, 3, 2, "#3333aa");
    drawPixelRect(ctx, x + width * 0.59, y + height * 0.39, 3, 2, "#3333aa");
    // Nose bridge
    drawPixelRect(ctx, x + width * 0.44, y + height * 0.43, width * 0.12, 2, "#222");
    
    // Draw side guns based on weapon level
    const weaponLevel = weaponLevelRef.current;
    
    // Left gun (weapon level 1+)
    if (weaponLevel >= 1) {
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 8;
      drawPixelRect(ctx, x - 12, y + 8, 8, 16, "#333");
      drawPixelRect(ctx, x - 11, y + 6, 6, 4, "#555");
      drawPixelRect(ctx, x - 10, y + 4, 4, 3, "#666");
      drawPixelRect(ctx, x - 10, y + 10, 4, 12, "#444");
      drawPixelRect(ctx, x - 9, y + 12, 2, 10, "#00ffff");
      // Gun glow core
      drawPixelRect(ctx, x - 9, y + 8, 2, 2, "#88ffff");
    }
    
    // Right gun (weapon level 2+)
    if (weaponLevel >= 2) {
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 8;
      drawPixelRect(ctx, x + width + 4, y + 8, 8, 16, "#333");
      drawPixelRect(ctx, x + width + 5, y + 6, 6, 4, "#555");
      drawPixelRect(ctx, x + width + 6, y + 4, 4, 3, "#666");
      drawPixelRect(ctx, x + width + 6, y + 10, 4, 12, "#444");
      drawPixelRect(ctx, x + width + 7, y + 12, 2, 10, "#00ffff");
      // Gun glow core
      drawPixelRect(ctx, x + width + 7, y + 8, 2, 2, "#88ffff");
    }
    
    // Double barrel indicator (weapon level 3)
    if (weaponLevel >= 3) {
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 10;
      drawPixelRect(ctx, x + width * 0.32, y - 12, 6, 10, "#cc2222");
      drawPixelRect(ctx, x + width * 0.34, y - 14, 4, 4, "#ff4444");
      drawPixelRect(ctx, x + width * 0.58, y - 12, 6, 10, "#cc2222");
      drawPixelRect(ctx, x + width * 0.6, y - 14, 4, 4, "#ff4444");
      // Energy cores
      drawPixelRect(ctx, x + width * 0.35, y - 10, 2, 2, "#ffaaaa");
      drawPixelRect(ctx, x + width * 0.61, y - 10, 2, 2, "#ffaaaa");
    }
    
    ctx.shadowBlur = 0;
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, enemy: Enemy) => {
    const { x, y, width, height, strain, health, maxHealth } = enemy;
    const colors = strainColors[strain];
    
    // Different colors per strain for variety - enhanced color palette
    const strainDetails: Record<StrainType, { dark: string; mid: string; light: string; pistil: string; pistil2: string; pistil3: string }> = {
      indica: { dark: "#3b0764", mid: "#581c87", light: "#7c3aed", pistil: "#f472b6", pistil2: "#ec4899", pistil3: "#db2777" },
      sativa: { dark: "#052e16", mid: "#14532d", light: "#166534", pistil: "#fbbf24", pistil2: "#f59e0b", pistil3: "#d97706" },
      hybrid: { dark: "#431407", mid: "#7c2d12", light: "#9a3412", pistil: "#fb923c", pistil2: "#f97316", pistil3: "#ea580c" },
    };
    const details = strainDetails[strain];
    
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 12;
    
    // ===== CANNABIS LEAVES (50% more detailed) =====
    // Left leaf cluster - 3 distinct fingers
    drawPixelRect(ctx, x - 10, y + height * 0.2, 6, 3, details.mid);
    drawPixelRect(ctx, x - 8, y + height * 0.18, 4, 2, details.light);
    drawPixelRect(ctx, x - 6, y + height * 0.28, 8, 4, details.mid);
    drawPixelRect(ctx, x - 7, y + height * 0.3, 4, 3, details.light);
    drawPixelRect(ctx, x - 4, y + height * 0.38, 6, 3, details.dark);
    drawPixelRect(ctx, x - 3, y + height * 0.36, 3, 2, details.mid);
    // Left leaf veins
    drawPixelRect(ctx, x - 6, y + height * 0.25, 5, 1, details.dark);
    drawPixelRect(ctx, x - 4, y + height * 0.32, 4, 1, details.dark);
    
    // Right leaf cluster - 3 distinct fingers
    drawPixelRect(ctx, x + width + 4, y + height * 0.2, 6, 3, details.mid);
    drawPixelRect(ctx, x + width + 4, y + height * 0.18, 4, 2, details.light);
    drawPixelRect(ctx, x + width - 2, y + height * 0.28, 8, 4, details.mid);
    drawPixelRect(ctx, x + width + 3, y + height * 0.3, 4, 3, details.light);
    drawPixelRect(ctx, x + width - 2, y + height * 0.38, 6, 3, details.dark);
    drawPixelRect(ctx, x + width, y + height * 0.36, 3, 2, details.mid);
    // Right leaf veins
    drawPixelRect(ctx, x + width + 1, y + height * 0.25, 5, 1, details.dark);
    drawPixelRect(ctx, x + width, y + height * 0.32, 4, 1, details.dark);
    
    // Top sugar leaves - more defined
    drawPixelRect(ctx, x + width * 0.3, y - 6, 4, 7, details.mid);
    drawPixelRect(ctx, x + width * 0.32, y - 8, 3, 4, details.light);
    drawPixelRect(ctx, x + width * 0.6, y - 5, 4, 6, details.mid);
    drawPixelRect(ctx, x + width * 0.62, y - 7, 3, 3, details.light);
    drawPixelRect(ctx, x + width * 0.45, y - 4, 3, 5, details.dark);
    // Sugar leaf veins
    drawPixelRect(ctx, x + width * 0.32, y - 4, 1, 5, details.dark);
    drawPixelRect(ctx, x + width * 0.62, y - 3, 1, 4, details.dark);
    
    // ===== MAIN BUD BODY (50% more layers for depth) =====
    // Core structure
    drawPixelRect(ctx, x + width * 0.38, y - 2, width * 0.24, height * 0.1, colors.fill);
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.05, width * 0.4, height * 0.12, colors.fill);
    drawPixelRect(ctx, x + width * 0.22, y + height * 0.12, width * 0.56, height * 0.14, colors.fill);
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.2, width * 0.7, height * 0.16, colors.fill);
    drawPixelRect(ctx, x + width * 0.1, y + height * 0.3, width * 0.8, height * 0.18, colors.fill);
    drawPixelRect(ctx, x + width * 0.08, y + height * 0.42, width * 0.84, height * 0.16, details.mid);
    drawPixelRect(ctx, x + width * 0.06, y + height * 0.52, width * 0.88, height * 0.14, details.mid);
    drawPixelRect(ctx, x + width * 0.1, y + height * 0.62, width * 0.8, height * 0.12, details.dark);
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.72, width * 0.7, height * 0.12, details.dark);
    drawPixelRect(ctx, x + width * 0.22, y + height * 0.8, width * 0.56, height * 0.1, details.dark);
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.88, width * 0.4, height * 0.08, details.dark);
    
    // Calyx bumps (50% more for realistic bud structure)
    drawPixelRect(ctx, x + width * 0.1, y + height * 0.18, width * 0.16, height * 0.12, colors.glow);
    drawPixelRect(ctx, x + width * 0.74, y + height * 0.18, width * 0.16, height * 0.12, colors.glow);
    drawPixelRect(ctx, x + width * 0.4, y + height * 0.1, width * 0.2, height * 0.1, colors.glow);
    drawPixelRect(ctx, x + width * 0.18, y + height * 0.32, width * 0.14, height * 0.1, colors.glow);
    drawPixelRect(ctx, x + width * 0.68, y + height * 0.32, width * 0.14, height * 0.1, colors.glow);
    drawPixelRect(ctx, x + width * 0.12, y + height * 0.5, width * 0.12, height * 0.08, colors.glow);
    drawPixelRect(ctx, x + width * 0.76, y + height * 0.5, width * 0.12, height * 0.08, colors.glow);
    drawPixelRect(ctx, x + width * 0.35, y + height * 0.58, width * 0.14, height * 0.08, colors.glow);
    drawPixelRect(ctx, x + width * 0.52, y + height * 0.58, width * 0.14, height * 0.08, colors.glow);
    
    // Pistils (50% more hairs for realism)
    drawPixelRect(ctx, x + width * 0.18, y + height * 0.05, 2, 6, details.pistil);
    drawPixelRect(ctx, x + width * 0.72, y + height * 0.06, 2, 5, details.pistil2);
    drawPixelRect(ctx, x + width * 0.32, y + height * 0.02, 2, 5, details.pistil3);
    drawPixelRect(ctx, x + width * 0.58, y + height * 0.04, 2, 6, details.pistil);
    drawPixelRect(ctx, x + width * 0.45, y + height * 0.08, 2, 4, details.pistil2);
    drawPixelRect(ctx, x + width * 0.22, y + height * 0.15, 2, 5, details.pistil);
    drawPixelRect(ctx, x + width * 0.68, y + height * 0.14, 2, 5, details.pistil3);
    drawPixelRect(ctx, x + width * 0.12, y + height * 0.25, 2, 4, details.pistil2);
    drawPixelRect(ctx, x + width * 0.78, y + height * 0.24, 2, 5, details.pistil);
    drawPixelRect(ctx, x + width * 0.35, y + height * 0.2, 2, 4, details.pistil3);
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.22, 2, 4, details.pistil2);
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.38, 2, 4, details.pistil);
    drawPixelRect(ctx, x + width * 0.75, y + height * 0.36, 2, 5, details.pistil3);
    drawPixelRect(ctx, x + width * 0.28, y + height * 0.55, 2, 4, details.pistil2);
    drawPixelRect(ctx, x + width * 0.62, y + height * 0.54, 2, 4, details.pistil);
    drawPixelRect(ctx, x + width * 0.42, y + height * 0.48, 2, 3, details.pistil3);
    drawPixelRect(ctx, x + width * 0.52, y + height * 0.65, 2, 3, details.pistil2);
    drawPixelRect(ctx, x + width * 0.38, y + height * 0.68, 2, 3, details.pistil);
    
    // Trichome sparkles (50% more frosty crystals)
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 5;
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.1, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.65, y + height * 0.12, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.42, y + height * 0.15, 2, 2, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.22, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.75, y + height * 0.24, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.35, y + height * 0.28, 2, 2, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.58, y + height * 0.26, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.35, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.7, y + height * 0.38, 2, 2, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.48, y + height * 0.32, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.12, y + height * 0.48, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.78, y + height * 0.5, 2, 2, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.52, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.58, 1, 1, "#e0ffe0");
    
    // Angry eyes (enhanced detail)
    ctx.shadowBlur = 0;
    // Eye whites
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.38, width * 0.2, height * 0.14, "#fff");
    drawPixelRect(ctx, x + width * 0.58, y + height * 0.38, width * 0.2, height * 0.14, "#fff");
    // Eye outline
    drawPixelRect(ctx, x + width * 0.19, y + height * 0.37, width * 0.22, 1, "#333");
    drawPixelRect(ctx, x + width * 0.57, y + height * 0.37, width * 0.22, 1, "#333");
    // Pupils (red, angry)
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.41, width * 0.12, height * 0.1, "#cc0000");
    drawPixelRect(ctx, x + width * 0.62, y + height * 0.41, width * 0.12, height * 0.1, "#cc0000");
    // Inner pupil
    drawPixelRect(ctx, x + width * 0.28, y + height * 0.43, width * 0.06, height * 0.06, "#880000");
    drawPixelRect(ctx, x + width * 0.65, y + height * 0.43, width * 0.06, height * 0.06, "#880000");
    // Eye glint
    drawPixelRect(ctx, x + width * 0.26, y + height * 0.4, 2, 2, "#ffcccc");
    drawPixelRect(ctx, x + width * 0.63, y + height * 0.4, 2, 2, "#ffcccc");
    // Angry eyebrows - thicker, angled, meaner
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.32, width * 0.25, 4, "#111");
    drawPixelRect(ctx, x + width * 0.58, y + height * 0.32, width * 0.25, 4, "#111");
    drawPixelRect(ctx, x + width * 0.14, y + height * 0.33, width * 0.08, 3, "#222");
    drawPixelRect(ctx, x + width * 0.76, y + height * 0.33, width * 0.08, 3, "#222");
    
    // Health bar
    if (health < maxHealth) {
      const barWidth = width * 0.8;
      const barHeight = 5;
      const barX = x + (width - barWidth) / 2;
      const barY = y - 12;
      
      ctx.shadowBlur = 0;
      drawPixelRect(ctx, barX - 1, barY - 1, barWidth + 2, barHeight + 2, "#111");
      drawPixelRect(ctx, barX, barY, barWidth, barHeight, "#333");
      drawPixelRect(ctx, barX, barY, barWidth * (health / maxHealth), barHeight, "#00ff00");
      // Health bar shine
      drawPixelRect(ctx, barX, barY, barWidth * (health / maxHealth), 1, "#88ff88");
    }
    
    ctx.shadowBlur = 0;
  };

  const drawHazard = (ctx: CanvasRenderingContext2D, hazard: Hazard) => {
    const { x, y, width, height, type } = hazard;
    const time = Date.now();
    const pulse = Math.sin(time / 200) * 0.5;
    
    ctx.shadowBlur = 18;
    
    if (type === "bong") {
      // Bong - tall glass water pipe (ULTRA DETAILED with animation)
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 20;
      
      // Outer glow border
      drawPixelRect(ctx, x + width * 0.16, y + height * 0.04, width * 0.68, height * 0.94, "#0066aa");
      
      // Base with depth (more layers)
      drawPixelRect(ctx, x + width * 0.16, y + height * 0.8, width * 0.68, height * 0.2, "#2266bb");
      drawPixelRect(ctx, x + width * 0.18, y + height * 0.82, width * 0.64, height * 0.18, "#3377dd");
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.8, width * 0.6, height * 0.18, "#4488ff");
      drawPixelRect(ctx, x + width * 0.25, y + height * 0.82, width * 0.5, height * 0.12, "#66aaff");
      // Base highlight (brighter)
      drawPixelRect(ctx, x + width * 0.22, y + height * 0.81, width * 0.18, height * 0.05, "#cceeFF");
      drawPixelRect(ctx, x + width * 0.24, y + height * 0.83, width * 0.1, height * 0.03, "#ffffff");
      
      // Water chamber with glass effect (more depth)
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.46, width * 0.6, height * 0.38, "#4488dd");
      drawPixelRect(ctx, x + width * 0.22, y + height * 0.48, width * 0.56, height * 0.36, "#5599ee");
      drawPixelRect(ctx, x + width * 0.25, y + height * 0.5, width * 0.5, height * 0.32, "#66aaff");
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.52, width * 0.44, height * 0.28, "#88bbff");
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.54, width * 0.36, height * 0.22, "#99ccff");
      // Glass reflections (multiple)
      drawPixelRect(ctx, x + width * 0.25, y + height * 0.5, width * 0.1, height * 0.24, "#cceeFF");
      drawPixelRect(ctx, x + width * 0.27, y + height * 0.52, width * 0.06, height * 0.18, "#ffffff");
      
      // Neck with glass detail (thicker)
      drawPixelRect(ctx, x + width * 0.31, y + height * 0.06, width * 0.38, height * 0.46, "#5588dd");
      drawPixelRect(ctx, x + width * 0.33, y + height * 0.08, width * 0.34, height * 0.44, "#77aaee");
      drawPixelRect(ctx, x + width * 0.35, y + height * 0.1, width * 0.3, height * 0.4, "#88bbff");
      drawPixelRect(ctx, x + width * 0.38, y + height * 0.12, width * 0.24, height * 0.36, "#99ccff");
      // Neck reflection (brighter)
      drawPixelRect(ctx, x + width * 0.35, y + height * 0.1, width * 0.08, height * 0.34, "#cceeFF");
      drawPixelRect(ctx, x + width * 0.37, y + height * 0.12, width * 0.04, height * 0.28, "#ffffff");
      
      // Mouthpiece rim (thicker, more prominent)
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.02, width * 0.44, height * 0.08, "#77aaee");
      drawPixelRect(ctx, x + width * 0.3, y + height * 0.04, width * 0.4, height * 0.06, "#aaccff");
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.05, width * 0.36, height * 0.04, "#ccddff");
      
      // Downstem (more visible)
      drawPixelRect(ctx, x + width * 0.5, y + height * 0.36, width * 0.06, height * 0.28, "#5588dd");
      drawPixelRect(ctx, x + width * 0.52, y + height * 0.38, width * 0.04, height * 0.25, "#77aaee");
      
      // Bowl with herb (larger, more detail)
      drawPixelRect(ctx, x + width * 0.54, y + height * 0.3, width * 0.32, height * 0.2, "#6b4000");
      drawPixelRect(ctx, x + width * 0.56, y + height * 0.32, width * 0.28, height * 0.18, "#8b6914");
      drawPixelRect(ctx, x + width * 0.58, y + height * 0.34, width * 0.24, height * 0.14, "#a0782c");
      // Herb in bowl (more detailed)
      drawPixelRect(ctx, x + width * 0.58, y + height * 0.26, width * 0.24, height * 0.12, "#0d4420");
      drawPixelRect(ctx, x + width * 0.6, y + height * 0.24, width * 0.2, height * 0.1, "#166534");
      drawPixelRect(ctx, x + width * 0.62, y + height * 0.22, width * 0.16, height * 0.08, "#22c55e");
      // Bowl rim (shinier)
      drawPixelRect(ctx, x + width * 0.56, y + height * 0.28, width * 0.28, height * 0.04, "#d4aa50");
      drawPixelRect(ctx, x + width * 0.58, y + height * 0.29, width * 0.24, height * 0.02, "#e8c870");
      
      // Water line with animated bubbles
      drawPixelRect(ctx, x + width * 0.24, y + height * 0.6, width * 0.52, height * 0.14, "#0055cc");
      drawPixelRect(ctx, x + width * 0.26, y + height * 0.62, width * 0.48, height * 0.1, "#0077ee");
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.64, width * 0.44, height * 0.06, "#0099ff");
      // Animated bubbles (pulsing positions)
      const bubbleOffset = Math.sin(time / 150) * 3;
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.56 + bubbleOffset, 4, 4, "#aaddff");
      drawPixelRect(ctx, x + width * 0.45, y + height * 0.54 - bubbleOffset, 3, 3, "#88ccff");
      drawPixelRect(ctx, x + width * 0.55, y + height * 0.58 + bubbleOffset * 0.5, 4, 4, "#aaddff");
      drawPixelRect(ctx, x + width * 0.38, y + height * 0.52 - bubbleOffset * 0.7, 2, 2, "#ccffff");
      drawPixelRect(ctx, x + width * 0.5, y + height * 0.5 + bubbleOffset * 0.8, 3, 3, "#99ddff");
      
      // Smoke coming from top (animated)
      ctx.globalAlpha = 0.4 + pulse * 0.2;
      drawPixelRect(ctx, x + width * 0.42, y - 4 - pulse * 4, 4, 6, "#aaaaaa");
      drawPixelRect(ctx, x + width * 0.48, y - 8 - pulse * 6, 3, 5, "#888888");
      drawPixelRect(ctx, x + width * 0.44, y - 12 - pulse * 8, 3, 4, "#666666");
      ctx.globalAlpha = 1;
      
    } else if (type === "joint") {
      // Lit joint (ULTRA DETAILED with animated smoke)
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 20;
      
      // Outer glow
      drawPixelRect(ctx, x + width * 0.08, y + height * 0.34, width * 0.84, height * 0.32, "#cc440030");
      
      // Paper body with texture (more layers)
      drawPixelRect(ctx, x + width * 0.1, y + height * 0.36, width * 0.78, height * 0.28, "#d8d4c0");
      drawPixelRect(ctx, x + width * 0.12, y + height * 0.38, width * 0.76, height * 0.24, "#e8e4d0");
      drawPixelRect(ctx, x + width * 0.15, y + height * 0.4, width * 0.7, height * 0.2, "#f5f5dc");
      drawPixelRect(ctx, x + width * 0.18, y + height * 0.42, width * 0.64, height * 0.16, "#fffaf0");
      // Paper crease lines (more)
      drawPixelRect(ctx, x + width * 0.22, y + height * 0.43, width * 0.54, 1, "#d8d4c0");
      drawPixelRect(ctx, x + width * 0.25, y + height * 0.46, width * 0.48, 1, "#d0ccc0");
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.49, width * 0.42, 1, "#c8c4b8");
      drawPixelRect(ctx, x + width * 0.3, y + height * 0.52, width * 0.38, 1, "#d0ccc0");
      // Visible herb through paper (more visible)
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.44, width * 0.35, height * 0.1, "#0d4420");
      drawPixelRect(ctx, x + width * 0.3, y + height * 0.45, width * 0.32, height * 0.08, "#166534");
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.46, width * 0.28, height * 0.06, "#228844");
      
      // Filter/tip with spiral detail
      drawPixelRect(ctx, x + width * 0.04, y + height * 0.38, width * 0.16, height * 0.24, "#8b5a00");
      drawPixelRect(ctx, x + width * 0.06, y + height * 0.4, width * 0.14, height * 0.2, "#b8860b");
      drawPixelRect(ctx, x + width * 0.08, y + height * 0.42, width * 0.1, height * 0.16, "#d2691e");
      drawPixelRect(ctx, x + width * 0.09, y + height * 0.44, width * 0.08, height * 0.12, "#daa520");
      // Spiral lines on filter
      drawPixelRect(ctx, x + width * 0.07, y + height * 0.43, width * 0.01, height * 0.14, "#8b5a00");
      drawPixelRect(ctx, x + width * 0.1, y + height * 0.42, width * 0.01, height * 0.16, "#a06000");
      drawPixelRect(ctx, x + width * 0.13, y + height * 0.43, width * 0.01, height * 0.14, "#8b5a00");
      // Filter hole
      drawPixelRect(ctx, x, y + height * 0.44, width * 0.06, height * 0.12, "#1a1a1a");
      drawPixelRect(ctx, x + width * 0.01, y + height * 0.46, width * 0.04, height * 0.08, "#333");
      
      // Lit end with animated ember glow
      const emberPulse = Math.sin(time / 100) * 2;
      ctx.shadowColor = "#ff4400";
      ctx.shadowBlur = 22 + emberPulse;
      drawPixelRect(ctx, x + width * 0.7, y + height * 0.34, width * 0.24, height * 0.32, "#991100");
      drawPixelRect(ctx, x + width * 0.72, y + height * 0.36, width * 0.2, height * 0.28, "#cc3300");
      drawPixelRect(ctx, x + width * 0.74, y + height * 0.38, width * 0.16, height * 0.24, "#ff4400");
      drawPixelRect(ctx, x + width * 0.76, y + height * 0.4, width * 0.12, height * 0.2, "#ff6600");
      drawPixelRect(ctx, x + width * 0.78, y + height * 0.42, width * 0.08, height * 0.16, "#ff9900");
      drawPixelRect(ctx, x + width * 0.8, y + height * 0.44, width * 0.05, height * 0.12, "#ffcc00");
      // Ember core (pulsing)
      ctx.shadowBlur = 25 + emberPulse * 2;
      drawPixelRect(ctx, x + width * 0.81, y + height * 0.46, width * 0.04, height * 0.08, "#ffff88");
      drawPixelRect(ctx, x + width * 0.82, y + height * 0.47, width * 0.02, height * 0.06, "#ffffff");
      
      // Animated smoke wisps (rising and fading)
      ctx.shadowColor = "#888888";
      ctx.shadowBlur = 8;
      const smokeOffset = (time / 30) % 30;
      ctx.globalAlpha = 0.8 - smokeOffset / 50;
      drawPixelRect(ctx, x + width * 0.82, y + height * 0.1 - smokeOffset * 0.8, 3, 12, "#aaaaaa");
      drawPixelRect(ctx, x + width * 0.86, y + height * 0.05 - smokeOffset * 0.6, 2, 10, "#999999");
      drawPixelRect(ctx, x + width * 0.78, y + height * 0.02 - smokeOffset * 0.4, 3, 8, "#888888");
      drawPixelRect(ctx, x + width * 0.9, y + height * 0.12 - smokeOffset * 0.5, 2, 8, "#777777");
      // Wispy curls
      drawPixelRect(ctx, x + width * 0.8, y - smokeOffset * 0.7, 4, 4, "#aaaaaa");
      drawPixelRect(ctx, x + width * 0.88, y - 5 - smokeOffset * 0.3, 3, 3, "#999999");
      drawPixelRect(ctx, x + width * 0.76, y - 8 - smokeOffset * 0.5, 3, 3, "#888888");
      ctx.globalAlpha = 1;
      
    } else if (type === "matches") {
      // Box of matches (ULTRA DETAILED with glowing heads)
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 20;
      
      // Outer glow
      drawPixelRect(ctx, x + width * 0.1, y + height * 0.26, width * 0.8, height * 0.58, "#ff000030");
      
      // Box body with 3D effect (more layers)
      drawPixelRect(ctx, x + width * 0.1, y + height * 0.26, width * 0.8, height * 0.58, "#4b0000");
      drawPixelRect(ctx, x + width * 0.12, y + height * 0.28, width * 0.76, height * 0.54, "#6b0000");
      drawPixelRect(ctx, x + width * 0.15, y + height * 0.3, width * 0.7, height * 0.5, "#8b0000");
      drawPixelRect(ctx, x + width * 0.18, y + height * 0.32, width * 0.64, height * 0.46, "#a52a2a");
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.34, width * 0.6, height * 0.42, "#b22222");
      // Box highlights (glossy)
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.34, width * 0.18, height * 0.32, "#c44444");
      drawPixelRect(ctx, x + width * 0.22, y + height * 0.36, width * 0.08, height * 0.24, "#d46464");
      // Box label area with text-like detail
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.4, width * 0.44, height * 0.22, "#881111");
      drawPixelRect(ctx, x + width * 0.3, y + height * 0.42, width * 0.4, height * 0.18, "#991111");
      // Fake text lines on label
      drawPixelRect(ctx, x + width * 0.34, y + height * 0.45, width * 0.32, 2, "#aa3333");
      drawPixelRect(ctx, x + width * 0.36, y + height * 0.5, width * 0.28, 2, "#aa3333");
      drawPixelRect(ctx, x + width * 0.38, y + height * 0.55, width * 0.24, 2, "#aa3333");
      
      // Strike strip with texture (more detailed)
      drawPixelRect(ctx, x + width * 0.16, y + height * 0.68, width * 0.68, height * 0.14, "#111");
      drawPixelRect(ctx, x + width * 0.18, y + height * 0.7, width * 0.64, height * 0.1, "#222");
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.71, width * 0.6, height * 0.08, "#333");
      // Strip texture dots (more)
      for (let i = 0; i < 7; i++) {
        drawPixelRect(ctx, x + width * (0.22 + i * 0.08), y + height * 0.72, 2, 2, "#444");
        drawPixelRect(ctx, x + width * (0.24 + i * 0.08), y + height * 0.74, 2, 2, "#555");
      }
      
      // Match sticks (5 sticks, more detailed with wood grain)
      const stickPositions = [0.2, 0.32, 0.44, 0.56, 0.68];
      const stickHeights = [0.1, 0.06, 0.12, 0.08, 0.1];
      stickPositions.forEach((pos, i) => {
        const stickY = y + height * stickHeights[i];
        const stickH = height * (0.22 + (i % 2) * 0.04);
        // Wood body
        drawPixelRect(ctx, x + width * pos, stickY, 5, stickH, "#a08050");
        drawPixelRect(ctx, x + width * pos + 1, stickY + 2, 3, stickH - 4, "#c9a06c");
        drawPixelRect(ctx, x + width * pos + 2, stickY + 3, 2, stickH - 6, "#deb887");
        // Wood grain
        drawPixelRect(ctx, x + width * pos + 1, stickY + stickH * 0.3, 1, stickH * 0.4, "#a08050");
      });
      
      // Match heads (larger, more detailed with animated glow)
      const headGlow = Math.sin(time / 150) * 3;
      ctx.shadowBlur = 12 + headGlow;
      ctx.shadowColor = "#ff0000";
      stickPositions.forEach((pos, i) => {
        const headY = y + height * stickHeights[i] - 4;
        // Outer head
        drawPixelRect(ctx, x + width * pos - 2, headY, 10, 10, "#990000");
        drawPixelRect(ctx, x + width * pos - 1, headY + 1, 8, 8, "#cc0000");
        drawPixelRect(ctx, x + width * pos, headY + 2, 6, 6, "#ff2222");
        // Hot spot
        drawPixelRect(ctx, x + width * pos + 1, headY + 3, 3, 3, "#ff6666");
        drawPixelRect(ctx, x + width * pos + 2, headY + 4, 2, 2, "#ffaaaa");
      });
    }
    
    ctx.shadowBlur = 0;
  };

  const drawSpecialObject = (ctx: CanvasRenderingContext2D, obj: SpecialObject) => {
    const { x, y, width, height, type } = obj;
    const time = Date.now();
    
    if (type === "budAngel") {
      // Bud Angel - ULTRA DETAILED glowing angelic bud with animated wings and halo
      const wingFlap = Math.sin(time / 80) * 3;
      const haloGlow = Math.sin(time / 120) * 2;
      const floatOffset = Math.sin(time / 200) * 2;
      
      // Outer divine glow (pulsing)
      ctx.shadowColor = "#88ffff";
      ctx.shadowBlur = 25 + haloGlow * 3;
      
      // Halo ring (animated shimmer)
      ctx.shadowColor = "#ffff00";
      ctx.shadowBlur = 15 + haloGlow * 2;
      drawPixelRect(ctx, x + width * 0.15, y - 8 + floatOffset, width * 0.7, 4, "#ccaa00");
      drawPixelRect(ctx, x + width * 0.18, y - 7 + floatOffset, width * 0.64, 3, "#ffcc00");
      drawPixelRect(ctx, x + width * 0.2, y - 6 + floatOffset, width * 0.6, 3, "#ffff88");
      drawPixelRect(ctx, x + width * 0.25, y - 5 + floatOffset, width * 0.5, 2, "#ffffcc");
      drawPixelRect(ctx, x + width * 0.3, y - 4 + floatOffset, width * 0.4, 2, "#ffffff");
      // Halo sparkles
      const sparkle1 = (time / 50) % 1 > 0.5 ? "#ffffff" : "#ffff88";
      const sparkle2 = (time / 70) % 1 > 0.5 ? "#ffffff" : "#ffff88";
      drawPixelRect(ctx, x + width * 0.2, y - 6 + floatOffset, 3, 3, sparkle1);
      drawPixelRect(ctx, x + width * 0.75, y - 5 + floatOffset, 2, 2, sparkle2);
      
      // Left wing (animated flapping, more detail)
      ctx.shadowColor = "#aaffff";
      ctx.shadowBlur = 18;
      const leftWingX = x - 8 - wingFlap;
      drawPixelRect(ctx, leftWingX, y + height * 0.15 + floatOffset, 12, height * 0.5, "#77bbdd");
      drawPixelRect(ctx, leftWingX + 2, y + height * 0.18 + floatOffset, 10, height * 0.44, "#99ddff");
      drawPixelRect(ctx, leftWingX + 4, y + height * 0.22 + floatOffset, 8, height * 0.36, "#aaddff");
      drawPixelRect(ctx, leftWingX + 6, y + height * 0.26 + floatOffset, 6, height * 0.28, "#ccffff");
      drawPixelRect(ctx, leftWingX + 8, y + height * 0.3 + floatOffset, 4, height * 0.2, "#eeffff");
      // Wing feather details
      drawPixelRect(ctx, leftWingX + 1, y + height * 0.2 + floatOffset, 2, height * 0.35, "#66aacc");
      drawPixelRect(ctx, leftWingX + 4, y + height * 0.18 + floatOffset, 1, height * 0.4, "#88ccee");
      
      // Right wing (animated flapping, more detail)
      const rightWingX = x + width - 4 + wingFlap;
      drawPixelRect(ctx, rightWingX, y + height * 0.15 + floatOffset, 12, height * 0.5, "#77bbdd");
      drawPixelRect(ctx, rightWingX, y + height * 0.18 + floatOffset, 10, height * 0.44, "#99ddff");
      drawPixelRect(ctx, rightWingX, y + height * 0.22 + floatOffset, 8, height * 0.36, "#aaddff");
      drawPixelRect(ctx, rightWingX, y + height * 0.26 + floatOffset, 6, height * 0.28, "#ccffff");
      drawPixelRect(ctx, rightWingX, y + height * 0.3 + floatOffset, 4, height * 0.2, "#eeffff");
      // Wing feather details
      drawPixelRect(ctx, rightWingX + 9, y + height * 0.2 + floatOffset, 2, height * 0.35, "#66aacc");
      drawPixelRect(ctx, rightWingX + 7, y + height * 0.18 + floatOffset, 1, height * 0.4, "#88ccee");
      
      // Main bud body (light green angelic glow, more layers)
      ctx.shadowColor = "#88ff88";
      ctx.shadowBlur = 22;
      drawPixelRect(ctx, x + width * 0.1, y + height * 0.1 + floatOffset, width * 0.8, height * 0.8, "#66aa66");
      drawPixelRect(ctx, x + width * 0.15, y + height * 0.15 + floatOffset, width * 0.7, height * 0.7, "#88cc88");
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.2 + floatOffset, width * 0.6, height * 0.6, "#aaffaa");
      drawPixelRect(ctx, x + width * 0.25, y + height * 0.25 + floatOffset, width * 0.5, height * 0.5, "#ccffcc");
      drawPixelRect(ctx, x + width * 0.3, y + height * 0.3 + floatOffset, width * 0.4, height * 0.4, "#eeffee");
      drawPixelRect(ctx, x + width * 0.35, y + height * 0.35 + floatOffset, width * 0.3, height * 0.3, "#ffffff");
      
      // Calyx bumps (more)
      drawPixelRect(ctx, x + width * 0.05, y + height * 0.3 + floatOffset, width * 0.18, height * 0.25, "#77bb77");
      drawPixelRect(ctx, x + width * 0.08, y + height * 0.32 + floatOffset, width * 0.14, height * 0.2, "#99dd99");
      drawPixelRect(ctx, x + width * 0.77, y + height * 0.3 + floatOffset, width * 0.18, height * 0.25, "#77bb77");
      drawPixelRect(ctx, x + width * 0.78, y + height * 0.32 + floatOffset, width * 0.14, height * 0.2, "#99dd99");
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.05 + floatOffset, width * 0.36, height * 0.15, "#77bb77");
      drawPixelRect(ctx, x + width * 0.35, y + height * 0.08 + floatOffset, width * 0.3, height * 0.1, "#99dd99");
      
      // Animated trichome sparkles
      const sparklePhase = (time / 100) % 3;
      if (sparklePhase < 1) {
        drawPixelRect(ctx, x + width * 0.35, y + height * 0.35 + floatOffset, 3, 3, "#ffffff");
        drawPixelRect(ctx, x + width * 0.55, y + height * 0.45 + floatOffset, 3, 3, "#ffffff");
      } else if (sparklePhase < 2) {
        drawPixelRect(ctx, x + width * 0.45, y + height * 0.55 + floatOffset, 3, 3, "#ffffff");
        drawPixelRect(ctx, x + width * 0.3, y + height * 0.5 + floatOffset, 2, 2, "#ffff88");
      } else {
        drawPixelRect(ctx, x + width * 0.6, y + height * 0.35 + floatOffset, 2, 2, "#ffff88");
        drawPixelRect(ctx, x + width * 0.4, y + height * 0.4 + floatOffset, 3, 3, "#ffffff");
      }
      
    } else if (type === "skull") {
      // Dark green skull and crossbones - ULTRA DETAILED death hazard with animated eyes
      const eyePulse = Math.sin(time / 100) * 2;
      const skullBob = Math.sin(time / 300) * 1.5;
      
      // Ominous outer glow (pulsing red)
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 18 + eyePulse * 2;
      
      // Draw danger aura
      ctx.globalAlpha = 0.3 + eyePulse * 0.1;
      drawPixelRect(ctx, x - 4, y - 4 + skullBob, width + 8, height + 8, "#330000");
      ctx.globalAlpha = 1;
      
      // Skull main shape (dark green, more layers)
      ctx.shadowColor = "#006400";
      ctx.shadowBlur = 20;
      drawPixelRect(ctx, x + width * 0.15, y + height * 0.08 + skullBob, width * 0.7, height * 0.58, "#003300");
      drawPixelRect(ctx, x + width * 0.18, y + height * 0.1 + skullBob, width * 0.64, height * 0.54, "#004400");
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.12 + skullBob, width * 0.6, height * 0.5, "#005500");
      drawPixelRect(ctx, x + width * 0.15, y + height * 0.18 + skullBob, width * 0.7, height * 0.42, "#006600");
      drawPixelRect(ctx, x + width * 0.18, y + height * 0.15 + skullBob, width * 0.64, height * 0.48, "#007700");
      
      // Forehead highlight (more prominent)
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.16 + skullBob, width * 0.44, height * 0.14, "#008800");
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.18 + skullBob, width * 0.36, height * 0.08, "#009900");
      
      // Eye sockets (larger, deeper)
      drawPixelRect(ctx, x + width * 0.2, y + height * 0.26 + skullBob, width * 0.24, height * 0.2, "#000800");
      drawPixelRect(ctx, x + width * 0.22, y + height * 0.28 + skullBob, width * 0.2, height * 0.18, "#001100");
      drawPixelRect(ctx, x + width * 0.56, y + height * 0.26 + skullBob, width * 0.24, height * 0.2, "#000800");
      drawPixelRect(ctx, x + width * 0.58, y + height * 0.28 + skullBob, width * 0.2, height * 0.18, "#001100");
      
      // Animated evil eye glow (pulsing red)
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 12 + eyePulse * 3;
      const eyeSize = 0.1 + eyePulse * 0.01;
      drawPixelRect(ctx, x + width * 0.26, y + height * 0.3 + skullBob, width * eyeSize, height * eyeSize, "#cc0000");
      drawPixelRect(ctx, x + width * 0.28, y + height * 0.32 + skullBob, width * 0.06, height * 0.06, "#ff0000");
      drawPixelRect(ctx, x + width * 0.29, y + height * 0.33 + skullBob, width * 0.04, height * 0.04, "#ff4444");
      drawPixelRect(ctx, x + width * 0.64, y + height * 0.3 + skullBob, width * eyeSize, height * eyeSize, "#cc0000");
      drawPixelRect(ctx, x + width * 0.66, y + height * 0.32 + skullBob, width * 0.06, height * 0.06, "#ff0000");
      drawPixelRect(ctx, x + width * 0.67, y + height * 0.33 + skullBob, width * 0.04, height * 0.04, "#ff4444");
      
      // Nose hole (heart-shaped)
      ctx.shadowBlur = 0;
      drawPixelRect(ctx, x + width * 0.4, y + height * 0.44 + skullBob, width * 0.2, height * 0.12, "#001800");
      drawPixelRect(ctx, x + width * 0.42, y + height * 0.42 + skullBob, width * 0.06, height * 0.06, "#002200");
      drawPixelRect(ctx, x + width * 0.52, y + height * 0.42 + skullBob, width * 0.06, height * 0.06, "#002200");
      
      // Teeth (jaw area, more teeth)
      drawPixelRect(ctx, x + width * 0.22, y + height * 0.54 + skullBob, width * 0.56, height * 0.14, "#005500");
      drawPixelRect(ctx, x + width * 0.24, y + height * 0.55 + skullBob, width * 0.52, height * 0.12, "#006600");
      // Individual teeth
      for (let i = 0; i < 5; i++) {
        drawPixelRect(ctx, x + width * (0.26 + i * 0.1), y + height * 0.56 + skullBob, width * 0.06, height * 0.09, "#002200");
        drawPixelRect(ctx, x + width * (0.27 + i * 0.1), y + height * 0.57 + skullBob, width * 0.04, height * 0.06, "#001800");
      }
      
      // Crossbones behind skull (thicker, more detailed)
      ctx.shadowColor = "#004400";
      ctx.shadowBlur = 10;
      // Left bone (diagonal)
      drawPixelRect(ctx, x - 4, y + height * 0.68 + skullBob, width * 0.4, height * 0.1, "#003300");
      drawPixelRect(ctx, x - 2, y + height * 0.69 + skullBob, width * 0.38, height * 0.08, "#004400");
      drawPixelRect(ctx, x, y + height * 0.7 + skullBob, width * 0.35, height * 0.06, "#006600");
      // Right bone (diagonal)  
      drawPixelRect(ctx, x + width * 0.64, y + height * 0.68 + skullBob, width * 0.4, height * 0.1, "#003300");
      drawPixelRect(ctx, x + width * 0.66, y + height * 0.69 + skullBob, width * 0.36, height * 0.08, "#004400");
      drawPixelRect(ctx, x + width * 0.68, y + height * 0.7 + skullBob, width * 0.32, height * 0.06, "#006600");
      // Cross center
      drawPixelRect(ctx, x + width * 0.32, y + height * 0.73 + skullBob, width * 0.36, height * 0.12, "#004400");
      drawPixelRect(ctx, x + width * 0.35, y + height * 0.75 + skullBob, width * 0.3, height * 0.08, "#005500");
      // Lower bones
      drawPixelRect(ctx, x - 4, y + height * 0.84 + skullBob, width * 0.4, height * 0.1, "#003300");
      drawPixelRect(ctx, x - 2, y + height * 0.85 + skullBob, width * 0.36, height * 0.08, "#004400");
      drawPixelRect(ctx, x + width * 0.64, y + height * 0.84 + skullBob, width * 0.4, height * 0.1, "#003300");
      drawPixelRect(ctx, x + width * 0.66, y + height * 0.85 + skullBob, width * 0.36, height * 0.08, "#004400");
      
      // Bone ends (knobs, larger)
      drawPixelRect(ctx, x - 6, y + height * 0.66 + skullBob, 10, 10, "#005500");
      drawPixelRect(ctx, x - 4, y + height * 0.68 + skullBob, 6, 6, "#007700");
      drawPixelRect(ctx, x + width - 2, y + height * 0.66 + skullBob, 10, 10, "#005500");
      drawPixelRect(ctx, x + width, y + height * 0.68 + skullBob, 6, 6, "#007700");
      drawPixelRect(ctx, x - 6, y + height * 0.86 + skullBob, 10, 10, "#005500");
      drawPixelRect(ctx, x - 4, y + height * 0.88 + skullBob, 6, 6, "#007700");
      drawPixelRect(ctx, x + width - 2, y + height * 0.86 + skullBob, 10, 10, "#005500");
      drawPixelRect(ctx, x + width, y + height * 0.88 + skullBob, 6, 6, "#007700");
    }
    
    ctx.shadowBlur = 0;
  };

  const drawProjectile = (ctx: CanvasRenderingContext2D, proj: Projectile) => {
    if (proj.isPlayerBullet) {
      // Draw particle trail behind projectile
      ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
      ctx.beginPath();
      ctx.arc(proj.x + proj.width / 2, proj.y + proj.height + 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
      ctx.beginPath();
      ctx.arc(proj.x + proj.width / 2, proj.y + proj.height + 7, 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Cannabis seed - realistic teardrop shape with tiger stripes (50% more detail)
      ctx.shadowColor = "#00ff00";
      ctx.shadowBlur = 10;
      
      const cx = proj.x + proj.width / 2;
      const cy = proj.y + proj.height / 2;
      
      // Outer shell - darker brown edge with depth
      drawPixelRect(ctx, proj.x - 1, proj.y + 2, proj.width + 2, proj.height - 4, "#3d2f1e");
      drawPixelRect(ctx, proj.x, proj.y + 1, proj.width, proj.height - 2, "#4a3c28");
      drawPixelRect(ctx, proj.x + 1, proj.y, proj.width - 2, proj.height, "#5c4a1f");
      
      // Main seed body - mottled brown/tan layers
      drawPixelRect(ctx, proj.x + 1, proj.y + 1, proj.width - 2, proj.height - 2, "#7a6445");
      drawPixelRect(ctx, proj.x + 1, proj.y + 2, proj.width - 2, proj.height - 4, "#8b7355");
      drawPixelRect(ctx, proj.x + 2, proj.y + 2, proj.width - 4, proj.height - 4, "#9c8565");
      drawPixelRect(ctx, proj.x + 2, proj.y + 3, proj.width - 4, proj.height - 6, "#a89270");
      
      // Tiger stripe pattern (characteristic of cannabis seeds) - more stripes
      drawPixelRect(ctx, proj.x + 1, proj.y + 2, 1, proj.height - 4, "#3d2f1e");
      drawPixelRect(ctx, proj.x + 2, proj.y + 3, 1, proj.height - 6, "#4a3c28");
      drawPixelRect(ctx, proj.x + proj.width - 2, proj.y + 2, 1, proj.height - 4, "#3d2f1e");
      drawPixelRect(ctx, proj.x + proj.width - 3, proj.y + 3, 1, proj.height - 6, "#4a3c28");
      
      // Central ridge line (more prominent)
      drawPixelRect(ctx, cx - 1, proj.y + 1, 2, proj.height - 2, "#2d1f0e");
      drawPixelRect(ctx, cx - 0.5, proj.y + 2, 1, proj.height - 4, "#3d2f1e");
      
      // Mottled pattern (tiger spotting)
      drawPixelRect(ctx, proj.x + 2, proj.y + 4, 1, 2, "#5c4a1f");
      drawPixelRect(ctx, proj.x + proj.width - 3, proj.y + 5, 1, 2, "#5c4a1f");
      drawPixelRect(ctx, proj.x + 3, proj.y + proj.height - 4, 1, 2, "#5c4a1f");
      
      // Lighter tan highlights on sides (gradient effect)
      drawPixelRect(ctx, proj.x + 1, proj.y + proj.height * 0.25, 1, proj.height * 0.5, "#b8a680");
      drawPixelRect(ctx, proj.x + proj.width - 2, proj.y + proj.height * 0.25, 1, proj.height * 0.5, "#b8a680");
      drawPixelRect(ctx, proj.x + 2, proj.y + proj.height * 0.3, 1, proj.height * 0.3, "#c9b896");
      
      // Pointed tip highlight (seeds are teardrop shaped)
      drawPixelRect(ctx, cx - 1, proj.y + 1, 2, 3, "#c9b896");
      drawPixelRect(ctx, cx - 0.5, proj.y, 1, 2, "#d4c4a0");
      
      // Glossy reflection/sheen (enhanced)
      drawPixelRect(ctx, proj.x + 2, proj.y + 2, 3, 2, "#d4c4a0");
      drawPixelRect(ctx, proj.x + 2, proj.y + 3, 2, 1, "#e0d0b0");
      
      // Bottom point shadow
      drawPixelRect(ctx, cx - 1, proj.y + proj.height - 2, 2, 2, "#2d1f0e");
      
    } else {
      // Enemy projectile - glowing magenta energy ball (50% more detail)
      ctx.shadowColor = "#ff00ff";
      ctx.shadowBlur = 14;
      
      // Outer glow layer
      drawPixelRect(ctx, proj.x - 1, proj.y - 1, proj.width + 2, proj.height + 2, "#aa00aa");
      drawPixelRect(ctx, proj.x, proj.y, proj.width, proj.height, "#cc00cc");
      drawPixelRect(ctx, proj.x + 1, proj.y + 1, proj.width - 2, proj.height - 2, "#ff00ff");
      drawPixelRect(ctx, proj.x + 2, proj.y + 2, proj.width - 4, proj.height - 4, "#ff44ff");
      drawPixelRect(ctx, proj.x + 2, proj.y + 2, proj.width - 4, proj.height - 4, "#ff66ff");
      // Inner glow
      drawPixelRect(ctx, proj.x + 3, proj.y + 3, proj.width - 6, proj.height - 6, "#ff99ff");
      // Core glow (bright white center)
      drawPixelRect(ctx, proj.x + 3, proj.y + 3, 2, 2, "#ffccff");
      drawPixelRect(ctx, proj.x + 3, proj.y + 3, 1, 1, "#ffffff");
    }
    
    ctx.shadowBlur = 0;
  };

  const drawMeteorSeed = (ctx: CanvasRenderingContext2D, seed: MeteorSeed) => {
    const { x, y, width, height, isWhiteHot } = seed;
    const cx = x + width / 2;
    
    if (isWhiteHot) {
      // WHITE-HOT SEED - Glowing bright white with white flame trail
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 25;
      
      // Intense outer glow
      ctx.fillStyle = "#ffffff44";
      ctx.beginPath();
      ctx.arc(cx, y + height / 2, width + 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Secondary glow ring
      ctx.fillStyle = "#ffff8833";
      ctx.beginPath();
      ctx.arc(cx, y + height / 2, width + 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Outer shell - white hot edges
      drawPixelRect(ctx, x - 1, y + 2, width + 2, height - 4, "#ffeecc");
      drawPixelRect(ctx, x, y + 1, width, height - 2, "#ffffff");
      drawPixelRect(ctx, x + 1, y, width - 2, height, "#ffffee");
      
      // Main seed body - bright white
      drawPixelRect(ctx, x + 1, y + 1, width - 2, height - 2, "#ffffff");
      drawPixelRect(ctx, x + 1, y + 2, width - 2, height - 4, "#fffff0");
      drawPixelRect(ctx, x + 2, y + 2, width - 4, height - 4, "#ffffff");
      
      // Tiger stripe pattern (faint on white)
      drawPixelRect(ctx, x + 1, y + 2, 1, height - 4, "#eeddcc");
      drawPixelRect(ctx, x + width - 2, y + 2, 1, height - 4, "#eeddcc");
      
      // Central ridge
      drawPixelRect(ctx, cx - 1, y + 1, 2, height - 2, "#ddccbb");
      
      // White-hot glow on edges
      drawPixelRect(ctx, x, y + 1, 1, height - 2, "#ffffff");
      drawPixelRect(ctx, x + width - 1, y + 1, 1, height - 2, "#ffffff");
      
      // White flame tail trail
      ctx.globalAlpha = 0.7;
      drawPixelRect(ctx, x + 1, y - 10, width - 2, 8, "#ffffff");
      drawPixelRect(ctx, x + 2, y - 18, width - 4, 7, "#ffffcc");
      ctx.globalAlpha = 0.4;
      drawPixelRect(ctx, x + 2, y - 24, width - 4, 5, "#ffff88");
      ctx.globalAlpha = 0.2;
      drawPixelRect(ctx, x + 3, y - 28, width - 6, 4, "#ffff44");
      ctx.globalAlpha = 1;
      
      // Pulsing sparkles around it
      const time = Date.now();
      const sparkleOffset = Math.sin(time / 50) * 3;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx + sparkleOffset, y - 2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - sparkleOffset, y + height + 2, 2, 0, Math.PI * 2);
      ctx.fill();
      
    } else {
      // Regular falling cannabis seed - glowing orange
      ctx.shadowColor = "#ff6600";
      ctx.shadowBlur = 15;
      
      // Outer glow (danger warning)
      ctx.fillStyle = "#ff330033";
      ctx.beginPath();
      ctx.arc(cx, y + height / 2, width + 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Outer shell - darker brown with orange tint (heated from falling)
      drawPixelRect(ctx, x - 1, y + 2, width + 2, height - 4, "#5c3a1e");
      drawPixelRect(ctx, x, y + 1, width, height - 2, "#6a4828");
      drawPixelRect(ctx, x + 1, y, width - 2, height, "#7c5a2f");
      
      // Main seed body
      drawPixelRect(ctx, x + 1, y + 1, width - 2, height - 2, "#8a6a45");
      drawPixelRect(ctx, x + 1, y + 2, width - 2, height - 4, "#9b7b55");
      drawPixelRect(ctx, x + 2, y + 2, width - 4, height - 4, "#ac8c65");
      
      // Tiger stripe pattern
      drawPixelRect(ctx, x + 1, y + 2, 1, height - 4, "#5c3a1e");
      drawPixelRect(ctx, x + width - 2, y + 2, 1, height - 4, "#5c3a1e");
      
      // Central ridge
      drawPixelRect(ctx, cx - 1, y + 1, 2, height - 2, "#4d2f1e");
      
      // Heat glow on edges (falling fast)
      drawPixelRect(ctx, x, y + 1, 1, height - 2, "#ff6600");
      drawPixelRect(ctx, x + width - 1, y + 1, 1, height - 2, "#ff6600");
      
      // Tail trail effect
      ctx.globalAlpha = 0.4;
      drawPixelRect(ctx, x + 2, y - 8, width - 4, 6, "#ff6600");
      drawPixelRect(ctx, x + 3, y - 14, width - 6, 5, "#ff4400");
      ctx.globalAlpha = 0.2;
      drawPixelRect(ctx, x + 3, y - 18, width - 6, 4, "#ff2200");
      ctx.globalAlpha = 1;
    }
    
    ctx.shadowBlur = 0;
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Apply screen shake effect
    const shake = screenShakeRef.current;
    const shakeActive = shake.duration > 0 && shake.intensity > 0;
    if (shakeActive) {
      const shakeX = (Math.random() - 0.5) * shake.intensity * 2;
      const shakeY = (Math.random() - 0.5) * shake.intensity * 2;
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    starsRef.current.forEach(star => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fillRect(Math.floor(star.x), Math.floor(star.y), Math.floor(star.size), Math.floor(star.size));
    });

    if (gameState.isPlaying && !gameState.isGameOver) {
      // Draw particles (explosions)
      particlesRef.current.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      
      // Draw power-ups (ULTRA DETAILED - larger, clearer, animated)
      powerUpsRef.current.forEach(powerUp => {
        const color = powerUpColors[powerUp.type];
        const cx = powerUp.x + powerUp.width / 2;
        const cy = powerUp.y + powerUp.height / 2;
        const time = Date.now();
        
        // Stronger pulsing effect
        const pulse = Math.sin(time / 80) * 3;
        const size = powerUp.width + pulse + 4; // Larger base size
        const outerPulse = Math.sin(time / 120) * 2;
        const rotateAngle = time / 500;
        
        // Spinning outer rays (starburst effect)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotateAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI * 2) / 8;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * (size / 2 + 4), Math.sin(angle) * (size / 2 + 4));
          ctx.lineTo(Math.cos(angle) * (size / 2 + 12 + outerPulse), Math.sin(angle) * (size / 2 + 12 + outerPulse));
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        
        // Outer glow ring (thicker)
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 + 8 + outerPulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Second glow ring
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Main body with thick border
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Inner gradient layers
        ctx.fillStyle = `${color}dd`;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `${color}aa`;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 - 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright center core
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(cx, cy, size / 3.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Sparkle highlights (multiple)
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx - 4, cy - 4, size / 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 3, cy - 5, size / 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Type-specific icon (larger, bolder, with shadow)
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 3;
        ctx.fillStyle = "#000";
        ctx.font = "bold 10px 'Press Start 2P'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const icons: Record<string, string> = { speed: "S", shield: "D", rapid: "R", life: "+" };
        ctx.fillText(icons[powerUp.type] || "?", cx, cy + 1);
        
        // Draw small icon below letter based on type
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        if (powerUp.type === "speed") {
          // Arrow pointing right
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy + 8);
          ctx.lineTo(cx + 5, cy + 8);
          ctx.lineTo(cx + 2, cy + 5);
          ctx.moveTo(cx + 5, cy + 8);
          ctx.lineTo(cx + 2, cy + 11);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#000";
          ctx.stroke();
        } else if (powerUp.type === "life") {
          // Small heart
          ctx.fillStyle = "#ff0000";
          ctx.beginPath();
          ctx.arc(cx - 3, cy + 9, 3, 0, Math.PI * 2);
          ctx.arc(cx + 3, cy + 9, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cx - 6, cy + 10);
          ctx.lineTo(cx, cy + 16);
          ctx.lineTo(cx + 6, cy + 10);
          ctx.fill();
        }
        
        ctx.shadowBlur = 0;
      });
      
      // Flash player when invincible (show every other 100ms)
      const shouldDrawPlayer = invincibilityRef.current <= 0 || 
        Math.floor(invincibilityRef.current / 100) % 2 === 0;
      if (shouldDrawPlayer) {
        // Draw shield effect if active
        if (shieldEndRef.current > gameTimeRef.current) {
          ctx.strokeStyle = "#ffff00";
          ctx.lineWidth = 2;
          ctx.shadowColor = "#ffff00";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(
            playerRef.current.x + playerRef.current.width / 2,
            playerRef.current.y + playerRef.current.height / 2,
            playerRef.current.width / 2 + 8,
            0, Math.PI * 2
          );
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        drawPlayer(ctx, playerRef.current);
      }
      
      enemiesRef.current.forEach(enemy => drawEnemy(ctx, enemy));
      hazardsRef.current.forEach(hazard => drawHazard(ctx, hazard));
      specialObjectsRef.current.forEach(obj => drawSpecialObject(ctx, obj));
      
      // Draw boss if active
      if (bossRef.current) {
        const boss = bossRef.current;
        const time = Date.now();
        
        // Boss body - large menacing bud
        ctx.fillStyle = "#8B0000";
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 15 + Math.sin(time / 100) * 5;
        
        // Main body
        ctx.beginPath();
        ctx.ellipse(boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width / 2, boss.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner glow
        const gradient = ctx.createRadialGradient(
          boss.x + boss.width / 2, boss.y + boss.height / 2, 0,
          boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width / 2
        );
        gradient.addColorStop(0, "#ff4444");
        gradient.addColorStop(0.5, "#aa0000");
        gradient.addColorStop(1, "#550000");
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Evil eyes
        ctx.fillStyle = "#ffff00";
        ctx.shadowColor = "#ffff00";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(boss.x + boss.width * 0.35, boss.y + boss.height * 0.4, 6, 0, Math.PI * 2);
        ctx.arc(boss.x + boss.width * 0.65, boss.y + boss.height * 0.4, 6, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupils
        ctx.fillStyle = "#000000";
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(boss.x + boss.width * 0.35, boss.y + boss.height * 0.4, 3, 0, Math.PI * 2);
        ctx.arc(boss.x + boss.width * 0.65, boss.y + boss.height * 0.4, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Health bar
        ctx.fillStyle = "#333";
        ctx.fillRect(boss.x, boss.y - 15, boss.width, 8);
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(boss.x + 1, boss.y - 14, (boss.width - 2) * (boss.health / boss.maxHealth), 6);
        
        // Boss label
        ctx.font = "6px 'Press Start 2P'";
        ctx.fillStyle = "#ff0000";
        ctx.textAlign = "center";
        ctx.fillText("BOSS", boss.x + boss.width / 2, boss.y - 20);
        
        ctx.shadowBlur = 0;
      }
      projectilesRef.current.forEach(proj => drawProjectile(ctx, proj));
      meteorSeedsRef.current.forEach(seed => drawMeteorSeed(ctx, seed));
      
      // Meteor shower warning indicator
      if (meteorShowerActiveRef.current) {
        ctx.fillStyle = "#ff6600";
        ctx.font = "8px 'Press Start 2P'";
        ctx.textAlign = "center";
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 100) * 0.3;
        ctx.fillText("SEED STORM!", CANVAS_WIDTH / 2, 20);
        ctx.globalAlpha = 1;
      }
      
      // Combo display (top right area)
      if (comboCountRef.current >= 2) {
        const comboText = `${comboCountRef.current}x COMBO!`;
        ctx.font = "7px 'Press Start 2P'";
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffff00";
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 8 + comboCountRef.current;
        ctx.globalAlpha = 0.8 + Math.sin(Date.now() / 80) * 0.2;
        ctx.fillText(comboText, CANVAS_WIDTH - 10, 35);
        // Multiplier display
        ctx.font = "5px 'Press Start 2P'";
        ctx.fillStyle = "#00ffff";
        ctx.fillText(`${comboMultiplierRef.current.toFixed(1)}x PTS`, CANVAS_WIDTH - 10, 45);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      
      // Machine gun preview indicator
      if (machineGunPreviewRef.current.active) {
        ctx.font = "6px 'Press Start 2P'";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff00ff";
        ctx.shadowColor = "#ff00ff";
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 100) * 0.3;
        ctx.fillText("MACHINE GUN PREVIEW!", CANVAS_WIDTH / 2, 55);
        ctx.fillStyle = "#ffffff";
        ctx.font = "5px 'Press Start 2P'";
        ctx.fillText("PERMANENT AT 4:00", CANVAS_WIDTH / 2, 65);
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
      
      // Kill streak display (left side)
      if (killStreakRef.current >= 5) {
        ctx.font = "6px 'Press Start 2P'";
        ctx.textAlign = "left";
        ctx.fillStyle = "#00ff88";
        ctx.shadowColor = "#00ff88";
        ctx.shadowBlur = 5;
        ctx.fillText(`${killStreakRef.current} STREAK`, 10, 45);
        ctx.shadowBlur = 0;
      }
      
      // Bud Rage indicator (permanent power-up from boss kill)
      if (budRageActiveRef.current) {
        ctx.font = "5px 'Press Start 2P'";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ff4444";
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 8 + Math.sin(Date.now() / 100) * 3;
        ctx.fillText("BUD RAGE!", 10, 58);
        ctx.shadowBlur = 0;
      }
      
      // Slow-mo visual effect
      if (slowMoRef.current.active && gameTimeRef.current < slowMoRef.current.endTime) {
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.3;
        ctx.strokeRect(5, 5, CANVAS_WIDTH - 10, CANVAS_HEIGHT - 10);
        ctx.globalAlpha = 1;
      }
      
      // Damage flash effect (red overlay)
      if (damageFlashRef.current.active && gameTimeRef.current < damageFlashRef.current.endTime) {
        const flashProgress = (damageFlashRef.current.endTime - gameTimeRef.current) / 150;
        ctx.fillStyle = `rgba(255, 0, 0, ${flashProgress * 0.4})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else if (damageFlashRef.current.active) {
        damageFlashRef.current.active = false;
      }
    }
    
    // Restore context if screen shake was applied (use local variable to ensure matching save/restore)
    if (shakeActive) {
      ctx.restore();
    }

    if (gameState.isPaused) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.font = "16px 'Press Start 2P'";
      ctx.fillStyle = "#00ffff";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

  }, [gameState.isPlaying, gameState.isGameOver, gameState.isPaused]);

  const gameLoop = useCallback((timestamp: number) => {
    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    update(deltaTime);
    render();

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [update, render]);

  useEffect(() => {
    if (screen === "game" && gameState.isPlaying) {
      lastTimeRef.current = performance.now();
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [screen, gameState.isPlaying, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === "Escape" && screen === "game") {
        togglePause();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    
    // Fix: Reset all controls when window loses focus to prevent stuck movement
    const handleBlur = () => {
      keysRef.current.clear();
      touchRef.current = { left: false, right: false, fire: false };
      swipeTouchRef.current = { startX: 0, currentX: 0, active: false };
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [screen, togglePause]);

  const handleSubmitScore = () => {
    setSubmitError(null);
    if (playerName.trim().length > 0) {
      submitScoreMutation.mutate({
        playerName: playerName.trim().toUpperCase(),
        score: gameState.score,
        wave: gameState.wave,
        playTime: gameState.gameTime * 1000, // Convert seconds to milliseconds for server validation
      });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (screen === "title") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center p-4 overflow-auto">
        <h1 
          className="text-2xl md:text-4xl text-center mb-8 mt-4 animate-pulse"
          style={{ 
            color: "#00ffff", 
            textShadow: "0 0 10px #00ffff, 0 0 20px #ff00ff, 0 0 30px #ff00ff" 
          }}
          data-testid="text-title"
        >
          SEED STORM
        </h1>
        <div className="flex flex-col gap-4 w-full max-w-xs mb-6 mt-2">
          <Button
            onClick={() => {
              // Reset loadout and go to loadout screen
              setLoadout([null, null, null]);
              setScreen("loadout");
            }}
            className="w-full py-8 text-lg font-bold animate-bounce"
            style={{ 
              background: "linear-gradient(135deg, #00ff00, #22c55e)",
              color: "#000",
              boxShadow: "0 0 30px #00ff00, 0 0 60px #00ff00"
            }}
            data-testid="button-play"
          >
            <Play className="w-6 h-6 mr-2" />
            PLAY NOW
          </Button>

          <Button
            onClick={() => setScreen("leaderboard")}
            variant="outline"
            className="w-full py-4 text-sm border-2"
            style={{ borderColor: "#00ffff", color: "#00ffff" }}
            data-testid="button-leaderboard"
          >
            <Trophy className="w-4 h-4 mr-2" />
            LEADERBOARD
          </Button>

          <div className="text-center py-2">
            <p 
              className="text-sm"
              style={{ color: "#00ff00", textShadow: "0 0 8px #00ff00" }}
              data-testid="text-subtitle"
            >
              A Dudley Bud Adventure
            </p>
            <p 
              className="text-[10px] mt-1 whitespace-nowrap"
              style={{ color: "#00ff00", textShadow: "0 0 8px #00ff00" }}
              data-testid="text-tagline"
            >
              Randomness Happens Awe Man LFG
            </p>
          </div>

          <Button
            onClick={() => setScreen("help")}
            variant="outline"
            className="w-full py-4 text-sm border-2"
            style={{ borderColor: "#ffff00", color: "#ffff00" }}
            data-testid="button-how-to-play"
          >
            <HelpCircle className="w-4 h-4 mr-2" />
            HOW TO PLAY
          </Button>

          <Button
            onClick={() => setScreen("shop")}
            variant="outline"
            className="w-full py-4 text-sm border-2"
            style={{ borderColor: "#ff00ff", color: "#ff00ff" }}
            data-testid="button-boost-shop"
          >
            <Zap className="w-4 h-4 mr-2" />
            BOOST SHOP ⭐
          </Button>
        </div>

        {ADS.titleScreen.image ? (
          <a 
            href={ADS.titleScreen.link || "#"} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block mb-4"
            data-testid="link-ad-title"
            onClick={() => {
              fetch('/api/ad-click', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ placement: 'titleScreen' })
              }).catch(() => {});
            }}
          >
            <img 
              src={ADS.titleScreen.image} 
              alt="Advertisement" 
              className="w-[320px] h-[100px] object-cover rounded border-2"
              style={{ borderColor: "#ff00ff" }}
            />
          </a>
        ) : (
          <div 
            className="w-[320px] h-[100px] mb-4 flex items-center justify-center border-2 border-dashed rounded"
            style={{ borderColor: "#00ffff", background: "rgba(0,255,255,0.1)" }}
            data-testid="placeholder-ad-title"
          >
            <p className="text-sm font-bold" style={{ color: "#00ffff" }}>YOUR AD HERE</p>
          </div>
        )}

        <div className="text-center">
          <p className="text-[8px]" style={{ color: "#888" }}>ARROWS/WASD TO MOVE - SPACE TO SHOOT</p>
        </div>

        <div className="mt-4 text-center">
          <p className="text-[8px]" style={{ color: "#888" }}>ad enquiry @dudley420</p>
        </div>

        <div className="mt-2 text-center">
          <a 
            href="https://t.me/SeedStormBot?start=affiliate" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] underline hover:no-underline"
            style={{ color: "#ffff00", textShadow: "0 0 8px #ffff00" }}
            data-testid="link-affiliate"
          >
            AFFILIATE PROGRAM - Earn 10% on referrals
          </a>
        </div>

        {scores.length > 0 && (
          <div className="mt-2 text-center">
            <p className="text-[8px]" style={{ color: "#ff00ff" }}>HIGH SCORE</p>
            <p className="text-sm" style={{ color: "#ffff00" }} data-testid="text-high-score">
              {Math.max(...scores.map(s => s.score))}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (screen === "game") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center py-2 px-2 select-none overflow-x-hidden overflow-y-auto">
        <div 
          className="w-full max-w-[400px] flex items-center justify-between px-2 py-2 mb-2 border-b-2"
          style={{ borderColor: "#ff00ff" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[8px]" style={{ color: "#00ffff" }}>SCORE</span>
            <span className="text-sm" style={{ color: "#00ff00" }} data-testid="text-score">
              {gameState.score.toString().padStart(6, "0")}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[8px]" style={{ color: "#ffff00" }}>TIME</span>
            <span className="text-xs" style={{ color: "#ffff00" }} data-testid="text-time">
              {formatTime(Math.floor(gameState.gameTime))}
            </span>
          </div>
          
          <div className="flex items-center gap-1" data-testid="display-lives">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                className="w-4 h-4"
                fill={i < gameState.lives ? "#ff0000" : "transparent"}
                style={{ color: i < gameState.lives ? "#ff0000" : "#333" }}
              />
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[8px]" style={{ color: "#ff00ff" }}>WAVE</span>
            <span className="text-xs" style={{ color: "#ffff00" }} data-testid="text-wave">
              {gameState.wave}
            </span>
          </div>
        </div>

        <div className="relative w-full flex justify-center" style={{ maxWidth: CANVAS_WIDTH }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border-2 rounded-sm w-full h-auto touch-none"
            style={{ 
              borderColor: "#ff00ff",
              imageRendering: "pixelated",
              maxWidth: CANVAS_WIDTH,
              aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              const touch = e.touches[0];
              swipeTouchRef.current = { startX: touch.clientX, currentX: touch.clientX, active: true };
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              if (swipeTouchRef.current.active) {
                swipeTouchRef.current.currentX = e.touches[0].clientX;
              }
            }}
            onTouchEnd={() => {
              swipeTouchRef.current.active = false;
            }}
            onTouchCancel={() => {
              swipeTouchRef.current.active = false;
            }}
            data-testid="canvas-game"
          />
          
          {gameState.isPaused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Button
                onClick={togglePause}
                className="mb-4"
                style={{ background: "#00ff00", color: "#000" }}
                data-testid="button-resume"
              >
                <Play className="w-4 h-4 mr-2" />
                RESUME
              </Button>
              <Button
                onClick={() => setScreen("title")}
                variant="outline"
                style={{ borderColor: "#ff0000", color: "#ff0000" }}
                data-testid="button-quit"
              >
                QUIT
              </Button>
            </div>
          )}
        </div>

        <div className="w-full max-w-[400px] flex items-center justify-between gap-4 mt-4 px-4">
          <Button
            size="lg"
            className="h-16 px-8"
            style={{ 
              background: "linear-gradient(135deg, #00ff00, #22c55e)",
              color: "#000",
              boxShadow: "0 0 15px #00ff00"
            }}
            onTouchStart={() => (touchRef.current.fire = true)}
            onTouchEnd={() => (touchRef.current.fire = false)}
            onMouseDown={() => (touchRef.current.fire = true)}
            onMouseUp={() => (touchRef.current.fire = false)}
            onMouseLeave={() => (touchRef.current.fire = false)}
            data-testid="button-fire"
          >
            <Target className="w-8 h-8" />
          </Button>
          
          <div className="flex items-center gap-10">
            <Button
              size="lg"
              className="h-16 px-6"
              style={{ background: "#333", color: "#00ffff" }}
              onTouchStart={() => (touchRef.current.left = true)}
              onTouchEnd={() => (touchRef.current.left = false)}
              onMouseDown={() => (touchRef.current.left = true)}
              onMouseUp={() => (touchRef.current.left = false)}
              onMouseLeave={() => (touchRef.current.left = false)}
              data-testid="button-move-left"
            >
              <ChevronLeft className="w-8 h-8" />
            </Button>
            
            <Button
              size="lg"
              className="h-16 px-6"
              style={{ background: "#333", color: "#00ffff" }}
              onTouchStart={() => (touchRef.current.right = true)}
              onTouchEnd={() => (touchRef.current.right = false)}
              onMouseDown={() => (touchRef.current.right = true)}
              onMouseUp={() => (touchRef.current.right = false)}
              onMouseLeave={() => (touchRef.current.right = false)}
              data-testid="button-move-right"
            >
              <ChevronRight className="w-8 h-8" />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <Button
            size="icon"
            variant="ghost"
            onClick={togglePause}
            style={{ color: "#00ffff" }}
            data-testid="button-pause"
          >
            <Pause className="w-5 h-5" />
          </Button>
          <span className="text-[10px]" style={{ color: "#666" }}>
            {formatTime(gameState.gameTime)}
          </span>
        </div>
      </div>
    );
  }

  if (screen === "gameover") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-start p-4 pt-6 pb-8 overflow-y-auto">
        {isNewHighScore && (
          <div 
            className="text-xl mb-4 animate-bounce"
            style={{ 
              color: "#ffff00",
              textShadow: "0 0 10px #ffff00, 0 0 20px #ff00ff, 0 0 30px #00ffff"
            }}
            data-testid="text-new-high-score"
          >
            NEW HIGH SCORE!
          </div>
        )}
        
        <h1 
          className="text-2xl mb-4 animate-pulse"
          style={{ 
            color: "#ff0000",
            textShadow: "0 0 10px #ff0000, 0 0 20px #ff0000"
          }}
          data-testid="text-game-over"
        >
          GAME OVER
        </h1>

        <Card className="p-4 mb-4 border-2 bg-card/80" style={{ borderColor: isNewHighScore ? "#ffff00" : "#ff00ff" }}>
          <div className="text-center space-y-4">
            <div>
              <p className="text-[10px]" style={{ color: "#00ffff" }}>FINAL SCORE</p>
              <p className="text-3xl" style={{ color: "#00ff00" }} data-testid="text-final-score">
                {gameState.score.toString().padStart(6, "0")}
              </p>
            </div>
            
            <div className="flex justify-center gap-8">
              <div>
                <p className="text-[8px]" style={{ color: "#ff00ff" }}>WAVE</p>
                <p className="text-lg" style={{ color: "#ffff00" }} data-testid="text-final-wave">
                  {gameState.wave}
                </p>
              </div>
              <div>
                <p className="text-[8px]" style={{ color: "#ff00ff" }}>TIME</p>
                <p className="text-lg" style={{ color: "#ffff00" }} data-testid="text-final-time">
                  {formatTime(gameState.gameTime)}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {!showNameInput ? (
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              onClick={() => setShowNameInput(true)}
              className="w-full py-4 text-sm"
              style={{ 
                background: "linear-gradient(135deg, #ffff00, #f97316)",
                color: "#000",
                boxShadow: "0 0 15px #ffff00"
              }}
              data-testid="button-save-score"
            >
              <Trophy className="w-4 h-4 mr-2" />
              SAVE SCORE
            </Button>
            
            <Button
              onClick={() => {
                // Clear active boosts - player must select fresh from loadout
                activeBoostsRef.current = {
                  slots: [null, null, null],
                  currentLifeIndex: 0,
                  skipStormActive: false,
                };
                setLoadout([null, null, null]);
                setScreen("loadout");
              }}
              className="w-full py-4 text-sm"
              style={{ 
                background: "linear-gradient(135deg, #00ff00, #22c55e)",
                color: "#000"
              }}
              data-testid="button-play-again"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              PLAY AGAIN
            </Button>
            
            <Button
              onClick={() => {
                // Clear active boosts when going to main menu
                activeBoostsRef.current = {
                  slots: [null, null, null],
                  currentLifeIndex: 0,
                  skipStormActive: false,
                };
                setLoadout([null, null, null]);
                setScreen("title");
              }}
              variant="outline"
              className="w-full py-4 text-sm border-2"
              style={{ borderColor: "#00ffff", color: "#00ffff" }}
              data-testid="button-main-menu"
            >
              MAIN MENU
            </Button>

            {ADS.gameOver.image ? (
              <a 
                href={ADS.gameOver.link || "#"} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block mt-4"
                data-testid="link-ad-gameover"
                onClick={() => {
                  fetch('/api/ad-click', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ placement: 'gameOver' })
                  }).catch(() => {});
                }}
              >
                <img 
                  src={ADS.gameOver.image} 
                  alt="Advertisement" 
                  className="w-[320px] h-[100px] object-cover rounded border-2"
                  style={{ borderColor: "#ff00ff" }}
                />
              </a>
            ) : (
              <div 
                className="w-[320px] h-[100px] mt-4 flex items-center justify-center border-2 border-dashed rounded"
                style={{ borderColor: "#ff00ff", background: "rgba(255,0,255,0.1)" }}
                data-testid="placeholder-ad-gameover"
              >
                <p className="text-sm font-bold" style={{ color: "#ff00ff" }}>YOUR AD HERE</p>
              </div>
            )}
          </div>
        ) : (
          <Card className="p-6 w-full max-w-xs border-2" style={{ borderColor: "#00ffff" }}>
            <p className="text-[10px] mb-4 text-center" style={{ color: "#00ffff" }}>
              ENTER YOUR NAME
            </p>
            {submitError && (
              <p 
                className="text-[9px] mb-3 text-center p-2 rounded"
                style={{ 
                  color: "#ff0000",
                  background: "rgba(255, 0, 0, 0.1)",
                  border: "1px solid #ff0000"
                }}
                data-testid="text-submit-error"
              >
                {submitError}
              </p>
            )}
            <Input
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value.slice(0, 10));
                setSubmitError(null);
              }}
              placeholder="AAA"
              maxLength={10}
              className="text-center text-lg mb-4 uppercase"
              style={{ 
                background: "#111",
                borderColor: submitError ? "#ff0000" : "#ff00ff",
                color: "#00ff00"
              }}
              autoFocus
              data-testid="input-player-name"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => setShowNameInput(false)}
                variant="outline"
                className="flex-1 border-2"
                style={{ borderColor: "#ff0000", color: "#ff0000" }}
                data-testid="button-cancel-save"
              >
                CANCEL
              </Button>
              <Button
                onClick={handleSubmitScore}
                disabled={playerName.trim().length === 0 || submitScoreMutation.isPending}
                className="flex-1"
                style={{ 
                  background: "#00ff00",
                  color: "#000"
                }}
                data-testid="button-confirm-save"
              >
                {submitScoreMutation.isPending ? "..." : "SAVE"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (screen === "leaderboard") {
    const sortedScores = [...scores].sort((a, b) => b.score - a.score);
    
    const tabConfig = {
      daily: { title: "TODAY", color: "#00ffff", icon: "📅" },
      blazed: { title: "BLAZED LEGENDS", color: "#ff6600", icon: "🔥💨" },
      natural: { title: "MR NATURAL", color: "#00ff00", icon: "💎" },
    };
    
    const currentTab = tabConfig[leaderboardTab];
    
    return (
      <div className="min-h-screen bg-background flex flex-col items-center p-4 overflow-auto">
        <h1 
          className="text-lg mb-3"
          style={{ 
            color: currentTab.color,
            textShadow: `0 0 10px ${currentTab.color}`
          }}
          data-testid="text-leaderboard-title"
        >
          {currentTab.icon} {currentTab.title}
        </h1>

        {/* Tab Buttons */}
        <div className="flex gap-1 mb-3 w-full max-w-md">
          <Button
            size="sm"
            onClick={() => setLeaderboardTab("daily")}
            className="flex-1 text-[9px] py-1"
            style={{ 
              background: leaderboardTab === "daily" ? "#00ffff" : "transparent",
              color: leaderboardTab === "daily" ? "#000" : "#00ffff",
              border: "1px solid #00ffff"
            }}
            data-testid="button-tab-daily"
          >
            📅 TODAY
          </Button>
          <Button
            size="sm"
            onClick={() => setLeaderboardTab("blazed")}
            className="flex-1 text-[9px] py-1"
            style={{ 
              background: leaderboardTab === "blazed" ? "#ff6600" : "transparent",
              color: leaderboardTab === "blazed" ? "#000" : "#ff6600",
              border: "1px solid #ff6600"
            }}
            data-testid="button-tab-blazed"
          >
            🔥 BLAZED
          </Button>
          <Button
            size="sm"
            onClick={() => setLeaderboardTab("natural")}
            className="flex-1 text-[9px] py-1"
            style={{ 
              background: leaderboardTab === "natural" ? "#00ff00" : "transparent",
              color: leaderboardTab === "natural" ? "#000" : "#00ff00",
              border: "1px solid #00ff00"
            }}
            data-testid="button-tab-natural"
          >
            💎 PURE
          </Button>
        </div>

        <Card 
          className="w-full max-w-md p-3 border-2 bg-card/80 mb-3"
          style={{ borderColor: currentTab.color }}
        >
          <div className="space-y-1">
            <div 
              className="flex items-center justify-between px-2 py-1 text-[8px]"
              style={{ color: "#666", borderBottom: "1px solid #333" }}
            >
              <span className="w-6">RK</span>
              <span className="w-8 text-center">TYPE</span>
              <span className="flex-1 text-center">PLAYER</span>
              <span className="w-16 text-right">SCORE</span>
              <span className="w-8 text-right">WV</span>
            </div>
            
            {/* Daily Leaderboard */}
            {leaderboardTab === "daily" && (
              dailyScores.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[10px]" style={{ color: "#666" }}>NO SCORES TODAY</p>
                  <p className="text-[8px] mt-1" style={{ color: "#444" }}>Play to be first!</p>
                </div>
              ) : (
                dailyScores.slice(0, 20).map((score, index) => {
                  const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
                  const rankColor = rankColors[index] || "#00ffff";
                  return (
                    <div 
                      key={score.id}
                      className="flex items-center justify-between px-2 py-1 rounded-sm"
                      style={{ 
                        background: index < 3 ? "rgba(255,255,255,0.05)" : "transparent",
                        borderLeft: `3px solid ${rankColor}`
                      }}
                      data-testid={`row-daily-${index}`}
                    >
                      <span className="w-6 text-[10px] font-bold" style={{ color: rankColor }}>
                        {index + 1}
                      </span>
                      <span className="w-8 text-center text-[10px]">
                        {score.usedBoosts ? "🔥💨" : "💎"}
                      </span>
                      <span className="flex-1 text-center text-[9px]" style={{ color: "#00ffff" }}>
                        {score.playerName}
                      </span>
                      <span className="w-16 text-right text-[10px]" style={{ color: "#00ff00" }}>
                        {score.score.toString().padStart(5, "0")}
                      </span>
                      <span className="w-8 text-right text-[9px]" style={{ color: "#ff00ff" }}>
                        {score.wave}
                      </span>
                    </div>
                  );
                })
              )
            )}
            
            {/* Blazed Legends (Boosted All-Time) */}
            {leaderboardTab === "blazed" && (
              boostedScores.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[10px]" style={{ color: "#666" }}>NO BLAZED LEGENDS YET</p>
                  <p className="text-[8px] mt-1" style={{ color: "#ff6600" }}>Use boosts to enter!</p>
                </div>
              ) : (
                boostedScores.slice(0, 10).map((score, index) => {
                  const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
                  const rankColor = rankColors[index] || "#ff6600";
                  return (
                    <div 
                      key={score.id}
                      className="flex items-center justify-between px-2 py-1 rounded-sm"
                      style={{ 
                        background: "rgba(255,102,0,0.1)",
                        borderLeft: `3px solid ${rankColor}`
                      }}
                      data-testid={`row-blazed-${index}`}
                    >
                      <span className="w-6 text-[10px] font-bold" style={{ color: rankColor }}>
                        {index + 1}
                      </span>
                      <span className="w-8 text-center text-[10px]">🔥💨</span>
                      <span className="flex-1 text-center text-[9px]" style={{ color: "#ff6600" }}>
                        {score.playerName}
                      </span>
                      <span className="w-16 text-right text-[10px]" style={{ color: "#ffff00" }}>
                        {score.score.toString().padStart(5, "0")}
                      </span>
                      <span className="w-8 text-right text-[9px]" style={{ color: "#ff00ff" }}>
                        {score.wave}
                      </span>
                    </div>
                  );
                })
              )
            )}
            
            {/* MR NATURAL (Pure All-Time) */}
            {leaderboardTab === "natural" && (
              pureScores.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-[10px]" style={{ color: "#666" }}>NO PURE LEGENDS YET</p>
                  <p className="text-[8px] mt-1" style={{ color: "#00ff00" }}>Play without boosts!</p>
                </div>
              ) : (
                pureScores.slice(0, 10).map((score, index) => {
                  const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
                  const rankColor = rankColors[index] || "#00ff00";
                  return (
                    <div 
                      key={score.id}
                      className="flex items-center justify-between px-2 py-1 rounded-sm"
                      style={{ 
                        background: "rgba(0,255,0,0.1)",
                        borderLeft: `3px solid ${rankColor}`
                      }}
                      data-testid={`row-natural-${index}`}
                    >
                      <span className="w-6 text-[10px] font-bold" style={{ color: rankColor }}>
                        {index + 1}
                      </span>
                      <span className="w-8 text-center text-[10px]">💎</span>
                      <span className="flex-1 text-center text-[9px]" style={{ color: "#00ff00" }}>
                        {score.playerName}
                      </span>
                      <span className="w-16 text-right text-[10px]" style={{ color: "#00ffff" }}>
                        {score.score.toString().padStart(5, "0")}
                      </span>
                      <span className="w-8 text-right text-[9px]" style={{ color: "#ff00ff" }}>
                        {score.wave}
                      </span>
                    </div>
                  );
                })
              )
            )}
          </div>
        </Card>

        {/* Legacy Scores (Fallback for non-Telegram) */}
        {scores.length > 0 && leaderboardTab === "daily" && dailyScores.length === 0 && (
          <Card 
            className="w-full max-w-md p-3 border-2 bg-card/80 mb-3"
            style={{ borderColor: "#ff00ff" }}
          >
            <h3 className="text-[9px] mb-2 text-center" style={{ color: "#888" }}>CLASSIC SCORES</h3>
            <div className="space-y-1">
              {sortedScores.slice(0, 10).map((score, index) => {
                const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
                const rankColor = rankColors[index] || "#00ffff";
                return (
                  <div 
                    key={score.id}
                    className="flex items-center justify-between px-2 py-1 rounded-sm"
                    style={{ borderLeft: `3px solid ${rankColor}` }}
                    data-testid={`row-classic-${index}`}
                  >
                    <span className="w-6 text-[10px] font-bold" style={{ color: rankColor }}>{index + 1}</span>
                    <span className="flex-1 text-center text-[9px]" style={{ color: "#00ffff" }}>{score.playerName}</span>
                    <span className="w-16 text-right text-[10px]" style={{ color: "#00ff00" }}>{score.score}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button
            onClick={() => setScreen("loadout")}
            className="w-full py-5 text-sm"
            style={{ 
              background: "linear-gradient(135deg, #00ff00, #22c55e)",
              color: "#000",
              boxShadow: "0 0 15px #00ff00"
            }}
            data-testid="button-play-from-leaderboard"
          >
            <Play className="w-4 h-4 mr-2" />
            PLAY GAME
          </Button>
          
          <Button
            onClick={() => setScreen("title")}
            variant="outline"
            className="w-full py-4 text-sm border-2"
            style={{ borderColor: "#00ffff", color: "#00ffff" }}
            data-testid="button-back-to-menu"
          >
            BACK TO MENU
          </Button>
        </div>
      </div>
    );
  }

  if (screen === "help") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center p-4 overflow-auto">
        <h1 
          className="text-xl mb-4"
          style={{ 
            color: "#ffff00",
            textShadow: "0 0 10px #ffff00"
          }}
          data-testid="text-help-title"
        >
          HOW TO PLAY
        </h1>

        <div className="w-full max-w-md space-y-4 mb-6">
          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#00ffff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#00ffff" }}>
              <Target className="w-4 h-4" />
              OBJECTIVE
            </h2>
            <p className="text-[10px]" style={{ color: "#aaa" }}>
              Survive as long as possible while shooting down enemy buds. Get the highest score! The timer is a guide - it's not perfect.
            </p>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#00ff00" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#00ff00" }}>
              <Gamepad2 className="w-4 h-4" />
              CONTROLS
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ffff00" }}>Desktop:</span> Arrow keys or WASD to move, Space to shoot</p>
              <p><span style={{ color: "#ffff00" }}>Mobile:</span> FIRE on left, LEFT/RIGHT buttons on right</p>
              <p><span style={{ color: "#ffff00" }}>Pause:</span> Press Escape key</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff00ff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff00ff" }}>
              <Heart className="w-4 h-4" />
              LIVES & DAMAGE
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p>You have <span style={{ color: "#ff0000" }}>3 lives</span></p>
              <p>When hit, you flash for 1.5 seconds (invincible)</p>
              <p>Game Over when all lives are lost</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff6600" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff6600" }}>
              <Crosshair className="w-4 h-4" />
              ENEMIES
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#a855f7" }}>Purple (Indica):</span> 1 hit = 1 point</p>
              <p><span style={{ color: "#22c55e" }}>Green (Sativa):</span> 2 hits = 2 points</p>
              <p><span style={{ color: "#f97316" }}>Orange (Hybrid):</span> 3 hits = 3 points</p>
              <p className="mt-1">Enemies shoot back at you!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#00ffff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#00ffff" }}>
              <Zap className="w-4 h-4" />
              WEAPON UPGRADES
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ffff00" }}>Start:</span> Single center cannon</p>
              <p><span style={{ color: "#ffff00" }}>60 sec:</span> Left side gun added</p>
              <p><span style={{ color: "#ffff00" }}>90 sec:</span> Right side gun added</p>
              <p><span style={{ color: "#ffff00" }}>4 min:</span> Double barrel machine guns!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff8800" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff8800" }}>
              <AlertTriangle className="w-4 h-4" />
              UNPREDICTABILITY
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p>Enemies become more <span style={{ color: "#ff8800" }}>unpredictable</span> over time!</p>
              <p><span style={{ color: "#ffff00" }}>90 sec:</span> 15% chance of horizontal drift</p>
              <p><span style={{ color: "#ffff00" }}>Every 30 sec after:</span> +2% more unpredictable</p>
              <p><span style={{ color: "#ff0000" }}>Max:</span> 50% unpredictability</p>
              <p>Stay alert - enemies won't move in straight lines!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff0000" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff0000" }}>
              <AlertTriangle className="w-4 h-4" />
              HAZARDS
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p>After 20 seconds, hazards start falling:</p>
              <p><span style={{ color: "#4488ff" }}>Bong</span> - <span style={{ color: "#ff6600" }}>Lit Joint</span> - <span style={{ color: "#ff0000" }}>Matches</span></p>
              <p>Avoid them! They damage you on contact.</p>
              <p className="mt-2" style={{ color: "#00ff00" }}>Randomness Sometimes Happens, its apart of the game, Awe Man LFG Game Disorientation and Confusion we call it Glitching, this is a stoner community game, gotta love it</p>
              <p>Spawn rate increases over time!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#88ffff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#88ffff" }}>
              <Shield className="w-4 h-4" />
              BUD ANGEL
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p>A glowing angelic bud with wings and halo!</p>
              <p><span style={{ color: "#88ffff" }}>Appears:</span> After 90 seconds of play</p>
              <p><span style={{ color: "#88ff88" }}>Collect it:</span> Grants 15 seconds of shield!</p>
              <p>Shield protects you from all damage.</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff0000" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff0000" }}>
              <Target className="w-4 h-4" />
              BOSS ENEMY
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ff0000" }}>Spawns:</span> Every 2 minutes of play</p>
              <p><span style={{ color: "#ffff00" }}>10 hits</span> to defeat (stays 30 seconds)</p>
              <p>Moves side-to-side and fires spread shots!</p>
              <p><span style={{ color: "#ff4444" }}>Kill it:</span> Get <span style={{ color: "#ff4444" }}>BUD RAGE</span> power-up!</p>
              <p>Bud Rage = permanent 25% faster fire + 10 sec shield</p>
              <p>Only one boss kill per game (max reward)</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#006400" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#008800" }}>
              <AlertTriangle className="w-4 h-4" />
              SKULL & CROSSBONES
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ff0000" }}>DEADLY!</span> Dark green skull hazard.</p>
              <p><span style={{ color: "#ffff00" }}>Spawns:</span> Max once every 30 seconds</p>
              <p><span style={{ color: "#ff0000" }}>If touched:</span> INSTANT GAME OVER!</p>
              <p>Shield protects you from this hazard.</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff6600" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff6600" }}>
              <Zap className="w-4 h-4" />
              SEED STORM
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ff6600" }}>METEOR SHOWER!</span> Falling cannabis seeds!</p>
              <p><span style={{ color: "#ffff00" }}>Appears:</span> After 90 seconds of play</p>
              <p><span style={{ color: "#ffff00" }}>Duration:</span> Lasts 3-6 seconds</p>
              <p><span style={{ color: "#ff6600" }}>5-15 seeds</span> fall with fire trails</p>
              <p><span style={{ color: "#ff0000" }}>Contact:</span> Lose 1 life (shield protects)</p>
              <p>Warning text "SEED STORM!" appears during event</p>
              <p className="mt-2"><span style={{ color: "#ffffff", textShadow: "0 0 5px #fff" }}>WHITE-HOT SEED:</span> Rare glowing white seed!</p>
              <p><span style={{ color: "#88ff88" }}>Shoot it:</span> Get 5 sec shield + 5 sec rapid fire!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ffff00" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ffff00" }}>
              <Zap className="w-4 h-4" />
              COMBO SYSTEM
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ffff00" }}>Chain kills</span> within 1.5 seconds to build combos!</p>
              <p><span style={{ color: "#00ffff" }}>Multiplier:</span> Up to 3x points per kill</p>
              <p><span style={{ color: "#ff8800" }}>Screen shake</span> on 3+ combo kills</p>
              <p><span style={{ color: "#00ff88" }}>Kill streak</span> counter tracks consecutive kills</p>
              <p>Combo resets after 2 seconds without a kill</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff00ff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff00ff" }}>
              <Zap className="w-4 h-4" />
              MACHINE GUN PREVIEW
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ff00ff" }}>At 3:30</span> - 5 second preview of machine gun!</p>
              <p>Test the double barrel before it's permanent</p>
              <p><span style={{ color: "#ffff00" }}>At 4:00</span> - Machine gun unlocks permanently!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#88ffff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#88ffff" }}>
              <Shield className="w-4 h-4" />
              SHIELD STACKING
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p>Shields <span style={{ color: "#88ff88" }}>STACK</span> when already active!</p>
              <p>Collect multiple Bud Angels to extend duration</p>
              <p>White-hot seed shield also stacks with existing shield</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ffd700" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ffd700" }}>
              <Zap className="w-4 h-4" />
              TELEGRAM STARS BOOSTS
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ffd700" }}>Buy boosts</span> with Telegram Stars - stored in inventory!</p>
              <p><span style={{ color: "#00ff00" }}>Extra Life (3★):</span> Start with +1 life</p>
              <p><span style={{ color: "#00ffff" }}>Shield (3★):</span> 5 sec protection at life start</p>
              <p><span style={{ color: "#ff6600" }}>Rapid Fire (3★):</span> 5 sec fast shots at life start</p>
              <p><span style={{ color: "#ff00ff" }}>Side Guns (5★):</span> 5 sec side guns at life start</p>
              <p><span style={{ color: "#ff0000" }}>Machine Gun (10★):</span> 5 sec dual barrels at life start</p>
              <p><span style={{ color: "#8800ff" }}>Skip Storm (20★):</span> No meteor showers that life</p>
              <p className="mt-1">Assign <span style={{ color: "#ffff00" }}>1 boost per life</span> before each game!</p>
              <p>Unused boosts stay in inventory for next time.</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ff6600" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#ff6600" }}>
              <Trophy className="w-4 h-4" />
              DAILY PRIZE POOL
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#ff6600" }}>Stars spent</span> go into daily prize pool!</p>
              <p><span style={{ color: "#ffd700" }}>Top 3 winners:</span> 25% / 10% / 5%</p>
              <p><span style={{ color: "#00ff00" }}>Random 10 players:</span> 1% each</p>
              <p><span style={{ color: "#ff0000" }}>Minimum:</span> 50 Stars spent daily to activate prizes</p>
              <p>Win Stars just by playing!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#00ffff" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#00ffff" }}>
              <Trophy className="w-4 h-4" />
              LEADERBOARDS
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p><span style={{ color: "#00ffff" }}>TODAY:</span> Daily scores with boost indicators</p>
              <p>- <span>🔥💨</span> = Used boost (BLAZED)</p>
              <p>- <span>💎</span> = No boost (PURE skill)</p>
              <p><span style={{ color: "#ff6600" }}>BLAZED LEGENDS:</span> All-time boosted scores</p>
              <p><span style={{ color: "#00ff00" }}>MR NATURAL:</span> All-time pure (no boost) scores</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#22c55e" }}>
            <h2 className="text-xs mb-2 flex items-center gap-2" style={{ color: "#22c55e" }}>
              <Heart className="w-4 h-4" />
              TIPS
            </h2>
            <div className="space-y-1 text-[10px]" style={{ color: "#aaa" }}>
              <p>Keep moving - standing still makes you a target</p>
              <p>Clear enemies before they reach the bottom</p>
              <p>Watch for hazards after 20 seconds</p>
              <p><span style={{ color: "#ffff00" }}>Chain kills</span> for combo multiplier bonus!</p>
              <p>Survive to 4 minutes for max firepower!</p>
              <p><span style={{ color: "#88ffff" }}>Grab the Bud Angel</span> for shield protection!</p>
              <p><span style={{ color: "#ff0000" }}>Avoid the Skull</span> unless you have a shield!</p>
              <p><span style={{ color: "#ff6600" }}>SEED STORM:</span> Move to edges or shoot the white one!</p>
            </div>
          </Card>

          <Card className="p-4 border-2 bg-card/80" style={{ borderColor: "#ffff00" }}>
            <h2 className="text-xs mb-3 flex items-center gap-2" style={{ color: "#ffff00" }}>
              <Eye className="w-4 h-4" />
              VISUAL GUIDE
            </h2>
            
            <div className="space-y-3">
              <div>
                <p className="text-[10px] mb-2" style={{ color: "#00ff00" }}>ENEMIES (shoot them!)</p>
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full" style={{ background: "radial-gradient(circle, #a855f7 30%, #7c3aed 70%, #5b21b6 100%)", boxShadow: "0 0 6px #a855f7" }} />
                    <span className="text-[8px] mt-1" style={{ color: "#a855f7" }}>Indica</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full" style={{ background: "radial-gradient(circle, #22c55e 30%, #16a34a 70%, #15803d 100%)", boxShadow: "0 0 6px #22c55e" }} />
                    <span className="text-[8px] mt-1" style={{ color: "#22c55e" }}>Sativa</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full" style={{ background: "radial-gradient(circle, #f97316 30%, #ea580c 70%, #c2410c 100%)", boxShadow: "0 0 6px #f97316" }} />
                    <span className="text-[8px] mt-1" style={{ color: "#f97316" }}>Hybrid</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-2" style={{ color: "#ff0000" }}>HAZARDS (avoid!)</p>
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-10 rounded-b-full" style={{ background: "linear-gradient(to bottom, #4488ff 60%, #2266cc 100%)", boxShadow: "0 0 6px #4488ff", borderTop: "3px solid #66aaff" }} />
                    <span className="text-[8px] mt-1" style={{ color: "#4488ff" }}>Bong</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-8 rounded-sm" style={{ background: "linear-gradient(to bottom, #ff6600 20%, #cc4400 50%, #ffffff 90%)", boxShadow: "0 0 6px #ff6600" }} />
                    <span className="text-[8px] mt-1" style={{ color: "#ff6600" }}>Joint</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-8 rounded-sm" style={{ background: "linear-gradient(to bottom, #ff4444 30%, #8B0000 100%)", boxShadow: "0 0 6px #ff0000" }} />
                    <span className="text-[8px] mt-1" style={{ color: "#ff0000" }}>Matches</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-2" style={{ color: "#ff0000" }}>DEADLY (instant game over!)</p>
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle, #1a3d1a 30%, #0d1f0d 100%)", boxShadow: "0 0 8px #ff0000" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <circle cx="12" cy="10" r="8" fill="#0d1f0d" stroke="#1a3d1a" strokeWidth="1"/>
                        <circle cx="8" cy="9" r="2" fill="#ff0000"/>
                        <circle cx="16" cy="9" r="2" fill="#ff0000"/>
                        <ellipse cx="12" cy="14" rx="3" ry="2" fill="#1a1a1a"/>
                        <rect x="6" y="20" width="3" height="6" rx="1" fill="#0d1f0d" stroke="#1a3d1a" strokeWidth="0.5" transform="rotate(-30 7.5 23)"/>
                        <rect x="15" y="20" width="3" height="6" rx="1" fill="#0d1f0d" stroke="#1a3d1a" strokeWidth="0.5" transform="rotate(30 16.5 23)"/>
                      </svg>
                    </div>
                    <span className="text-[8px] mt-1" style={{ color: "#008800" }}>Skull</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-2" style={{ color: "#ff6600" }}>SEED STORM (dodge or shoot white!)</p>
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-12 flex items-center justify-center" style={{ boxShadow: "0 0 10px #ff6600" }}>
                      <svg width="24" height="32" viewBox="0 0 24 32">
                        <ellipse cx="12" cy="20" rx="6" ry="8" fill="#8a6a45" stroke="#5c3a1e" strokeWidth="1"/>
                        <line x1="12" y1="4" x2="12" y2="12" stroke="#ff6600" strokeWidth="2" opacity="0.6"/>
                        <line x1="12" y1="0" x2="12" y2="8" stroke="#ff4400" strokeWidth="2" opacity="0.3"/>
                        <line x1="6" y1="20" x2="18" y2="20" stroke="#4d2f1e" strokeWidth="1"/>
                      </svg>
                    </div>
                    <span className="text-[8px] mt-1" style={{ color: "#ff6600" }}>Meteor Seed</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-12 flex items-center justify-center" style={{ boxShadow: "0 0 15px #ffffff, 0 0 25px #ffffff" }}>
                      <svg width="24" height="32" viewBox="0 0 24 32">
                        <ellipse cx="12" cy="20" rx="6" ry="8" fill="#ffffff" stroke="#eeeeee" strokeWidth="1"/>
                        <line x1="12" y1="4" x2="12" y2="12" stroke="#ffffff" strokeWidth="3" opacity="0.8"/>
                        <line x1="12" y1="0" x2="12" y2="8" stroke="#ffffcc" strokeWidth="2" opacity="0.5"/>
                        <line x1="6" y1="20" x2="18" y2="20" stroke="#ddccbb" strokeWidth="1"/>
                      </svg>
                    </div>
                    <span className="text-[8px] mt-1" style={{ color: "#ffffff", textShadow: "0 0 5px #fff" }}>White-Hot!</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-2" style={{ color: "#88ffff" }}>HELPER (collect!)</p>
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle, #ffffff 20%, #88ffff 60%, #44aaaa 100%)", boxShadow: "0 0 12px #88ffff, 0 0 20px #ffffff" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24">
                        <ellipse cx="12" cy="14" rx="6" ry="5" fill="#88ffff"/>
                        <ellipse cx="6" cy="12" rx="4" ry="3" fill="#aaffff" transform="rotate(-30 6 12)"/>
                        <ellipse cx="18" cy="12" rx="4" ry="3" fill="#aaffff" transform="rotate(30 18 12)"/>
                        <ellipse cx="12" cy="6" rx="4" ry="2" fill="#ffff88" stroke="#ffdd00" strokeWidth="0.5"/>
                      </svg>
                    </div>
                    <span className="text-[8px] mt-1" style={{ color: "#88ffff" }}>Bud Angel</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-2" style={{ color: "#ffff00" }}>POWER-UPS (collect!)</p>
                <div className="flex gap-3 items-center flex-wrap">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#00ffff", color: "#000", boxShadow: "0 0 6px #00ffff" }}>S</div>
                    <span className="text-[8px] mt-1" style={{ color: "#00ffff" }}>Speed</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#ff0000", color: "#fff", boxShadow: "0 0 6px #ff0000" }}>D</div>
                    <span className="text-[8px] mt-1" style={{ color: "#ff0000" }}>Damage</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#ffff00", color: "#000", boxShadow: "0 0 6px #ffff00" }}>R</div>
                    <span className="text-[8px] mt-1" style={{ color: "#ffff00" }}>Rapid</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#00ff00", color: "#000", boxShadow: "0 0 6px #00ff00" }}>+</div>
                    <span className="text-[8px] mt-1" style={{ color: "#00ff00" }}>Life</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] mb-2" style={{ color: "#00ff00" }}>YOU (the player)</p>
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 flex items-center justify-center" style={{ color: "#00ff00" }}>
                      <svg width="32" height="32" viewBox="0 0 32 32">
                        <polygon points="16,2 20,12 30,12 22,18 25,28 16,22 7,28 10,18 2,12 12,12" fill="#00ff00" stroke="#22c55e" strokeWidth="1"/>
                      </svg>
                    </div>
                    <span className="text-[8px] mt-1" style={{ color: "#00ff00" }}>Dudley Bud</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Button
          onClick={() => setScreen("title")}
          variant="outline"
          className="w-full max-w-xs py-6 text-sm border-2"
          style={{ borderColor: "#00ffff", color: "#00ffff" }}
          data-testid="button-back-from-help"
        >
          BACK TO MENU
        </Button>
      </div>
    );
  }

  const updateShopQty = (type: BoostType, delta: number) => {
    setShopQuantities(prev => ({
      ...prev,
      [type]: Math.max(1, Math.min(20, prev[type] + delta))
    }));
  };

  // ==========================================
  // BOOST SHOP SCREEN
  // ==========================================
  if (screen === "shop") {
    const SHOP_BOOSTS: { type: BoostType; icon: string; name: string; desc: string; color: string; textColor: string }[] = [
      { type: "extra_life", icon: "❤️", name: "EXTRA LIFE", desc: "+1 life instant", color: "#00ff00", textColor: "#000" },
      { type: "shield_boost", icon: "🛡️", name: "SHIELD", desc: "5 sec protection", color: "#00ffff", textColor: "#000" },
      { type: "rapid_fire", icon: "⚡", name: "RAPID FIRE", desc: "5 sec fast shots", color: "#ff6600", textColor: "#fff" },
      { type: "side_guns", icon: "🔫", name: "SIDE GUNS", desc: "5 sec extra guns", color: "#ff00ff", textColor: "#fff" },
      { type: "machine_gun", icon: "💥", name: "MACHINE GUN", desc: "5 sec rapid barrels", color: "#ff0000", textColor: "#fff" },
      { type: "skip_storm", icon: "🌀", name: "SKIP STORM", desc: "No meteors this life", color: "#8800ff", textColor: "#fff" },
    ];

    return (
      <div className="min-h-screen bg-background flex flex-col items-center p-4 overflow-auto">
        <h1 
          className="text-xl md:text-2xl text-center mb-4 mt-2"
          style={{ 
            color: "#ff00ff", 
            textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff" 
          }}
          data-testid="text-shop-title"
        >
          ⭐ BOOST SHOP ⭐
        </h1>

        <p className="text-[10px] mb-4 text-center" style={{ color: "#888" }}>
          Buy 1-20 at a time • Use per life • Unused stay in inventory
        </p>

        <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-4">
          {SHOP_BOOSTS.map((boost) => {
            const qty = shopQuantities[boost.type];
            const price = BOOST_PRICES[boost.type];
            const total = price * qty;
            
            return (
              <Card key={boost.type} className="p-3 border-2" style={{ borderColor: boost.color, background: `${boost.color}15` }}>
                <div className="flex flex-col items-center text-center">
                  <span className="text-2xl mb-1">{boost.icon}</span>
                  <p className="text-xs font-bold" style={{ color: boost.color }}>{boost.name}</p>
                  <p className="text-[8px] mb-1" style={{ color: "#aaa" }}>{boost.desc}</p>
                  <p className="text-[10px]" style={{ color: "#ffff00" }}>{price}⭐ each</p>
                  <p className="text-[8px] mb-2" style={{ color: "#888" }}>Owned: {inventory[boost.type]}</p>
                  
                  <div className="flex items-center gap-1 mb-2">
                    <Button 
                      size="sm" 
                      className="w-6 h-6 p-0 text-xs"
                      style={{ background: "#333", color: "#fff" }}
                      onClick={() => updateShopQty(boost.type, -1)}
                      data-testid={`button-qty-minus-${boost.type}`}
                    >-</Button>
                    <span className="text-sm font-bold w-8 text-center" style={{ color: "#fff" }}>{qty}</span>
                    <Button 
                      size="sm" 
                      className="w-6 h-6 p-0 text-xs"
                      style={{ background: "#333", color: "#fff" }}
                      onClick={() => updateShopQty(boost.type, 1)}
                      data-testid={`button-qty-plus-${boost.type}`}
                    >+</Button>
                  </div>
                  
                  <Button 
                    size="sm" 
                    className="w-full text-xs" 
                    style={{ background: boost.color, color: boost.textColor }}
                    onClick={() => handlePurchaseBoost(boost.type, qty)}
                    data-testid={`button-buy-${boost.type}`}
                  >
                    BUY {qty} = {total}⭐
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        <p className="text-[10px] mb-3 text-center" style={{ color: "#ff00ff" }}>
          ⚠️ Max 3 boosts per life - choose wisely!
        </p>

        <div className="w-full max-w-xs mb-4">
          <Card 
            className="p-3 border-2"
            style={{ borderColor: "#00ffff", background: "rgba(0,255,255,0.1)" }}
          >
            <p className="text-[10px] font-bold mb-2" style={{ color: "#00ffff" }}>
              💰 DAILY PRIZES
            </p>
            <p className="text-[9px]" style={{ color: "#888" }}>
              50% of Stars → Prize Pool
            </p>
            <p className="text-[9px]" style={{ color: "#888" }}>
              Top 3: 25% / 10% / 5%
            </p>
            <p className="text-[9px]" style={{ color: "#888" }}>
              Random 10 players: 1% each
            </p>
            <p className="text-[8px] mt-1" style={{ color: "#ffff00" }}>
              Min 50⭐ daily to activate prizes
            </p>
          </Card>
        </div>

        <Button
          onClick={() => setScreen("title")}
          variant="outline"
          className="w-full max-w-xs py-4 text-sm border-2"
          style={{ borderColor: "#00ffff", color: "#00ffff" }}
          data-testid="button-back-from-shop"
        >
          BACK TO MENU
        </Button>
      </div>
    );
  }

  // ==========================================
  // LOADOUT SCREEN (Pre-Game Boost Selection)
  // ==========================================
  if (screen === "loadout") {
    const hasAnyBoosts = inventory.extra_life > 0 || inventory.shield_boost > 0 || inventory.rapid_fire > 0 || 
                         inventory.side_guns > 0 || inventory.machine_gun > 0 || inventory.skip_storm > 0;
    const totalBoostsSelected = loadout.filter(slot => slot !== null).length;

    // Count how many of each boost type are used across all slots
    const getUsedCount = (boostType: BoostType): number => {
      return loadout.filter(slot => slot === boostType).length;
    };

    // Check if we can add a boost type to a slot
    const canAddBoost = (boostType: BoostType): boolean => {
      const inventoryCount = inventory[boostType];
      const usedCount = getUsedCount(boostType);
      return usedCount < inventoryCount;
    };

    // Boost info for display
    const BOOST_INFO: Record<BoostType, { icon: string; label: string; color: string }> = {
      extra_life: { icon: "❤️", label: "+1 LIFE", color: "#00ff00" },
      shield_boost: { icon: "🛡️", label: "SHIELD 5s", color: "#00ffff" },
      rapid_fire: { icon: "⚡", label: "RAPID 5s", color: "#ff6600" },
      side_guns: { icon: "🔫", label: "GUNS 5s", color: "#ff00ff" },
      machine_gun: { icon: "💥", label: "M.GUN 5s", color: "#ff0000" },
      skip_storm: { icon: "🌀", label: "NO STORM", color: "#8800ff" },
    };

    const handleStartGame = async () => {
      // Set up active boosts for the game - copy the loadout to activeBoostsRef
      activeBoostsRef.current = {
        slots: [...loadout] as BoostLoadout,
        currentLifeIndex: 0,
        skipStormActive: false,
      };
      
      // Track if using boosts
      setUsedBoostsThisGame(totalBoostsSelected > 0);
      
      // Deduct boosts from inventory via API
      if (telegramId && totalBoostsSelected > 0) {
        // Count how many of each boost type are in the loadout
        const boostsToUse: Record<string, number> = {};
        loadout.forEach(slot => {
          if (slot) {
            boostsToUse[slot] = (boostsToUse[slot] || 0) + 1;
          }
        });
        
        try {
          const response = await fetch("/api/telegram/use-boosts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              telegramId,
              boosts: boostsToUse,
            }),
          });
          
          if (response.ok) {
            // Update local inventory state
            setInventory(prev => {
              const newInv = { ...prev };
              Object.entries(boostsToUse).forEach(([type, count]) => {
                newInv[type as BoostType] = Math.max(0, newInv[type as BoostType] - count);
              });
              return newInv;
            });
          }
        } catch (error) {
          console.error("Failed to deduct boosts:", error);
        }
      }
      
      // Clear loadout for next game
      setLoadout([null, null, null]);
      
      initStars();
      resetGame();
      setScreen("game");
    };

    // Set boost for a specific life slot
    const setSlotBoost = (slotIndex: number, boost: BoostSlot) => {
      setLoadout(prev => {
        const newLoadout: BoostLoadout = [...prev] as BoostLoadout;
        newLoadout[slotIndex] = boost;
        return newLoadout;
      });
    };

    return (
      <div className="min-h-screen bg-background flex flex-col items-center p-4 overflow-auto">
        <h1 
          className="text-xl md:text-2xl text-center mb-4 mt-2"
          style={{ 
            color: "#00ff00", 
            textShadow: "0 0 10px #00ff00, 0 0 20px #00ff00" 
          }}
          data-testid="text-loadout-title"
        >
          🎮 BOOST PER LIFE
        </h1>

        <p className="text-[10px] mb-4 text-center" style={{ color: "#888" }}>
          Choose 1 boost for each life (or leave empty)
        </p>

        {/* 3 Life Slots */}
        <div className="flex flex-col gap-3 w-full max-w-sm mb-4">
          {[0, 1, 2].map((slotIndex) => (
            <Card key={slotIndex} className="p-3 border-2" style={{ borderColor: loadout[slotIndex] ? BOOST_INFO[loadout[slotIndex]!].color : "#444" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold" style={{ color: "#ffff00" }}>LIFE {slotIndex + 1}</span>
                  {loadout[slotIndex] && (
                    <span className="text-lg">{BOOST_INFO[loadout[slotIndex]!].icon}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {loadout[slotIndex] ? (
                    <>
                      <span className="text-xs font-bold" style={{ color: BOOST_INFO[loadout[slotIndex]!].color }}>
                        {BOOST_INFO[loadout[slotIndex]!].label}
                      </span>
                      <Button 
                        size="sm" 
                        className="w-6 h-6 p-0 ml-2" 
                        style={{ background: "#ff0000" }}
                        onClick={() => setSlotBoost(slotIndex, null)}
                      >
                        X
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs" style={{ color: "#666" }}>No boost</span>
                  )}
                </div>
              </div>
              
              {/* Boost selection buttons */}
              {!loadout[slotIndex] && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(Object.keys(BOOST_INFO) as BoostType[]).map((boostType) => (
                    <Button
                      key={boostType}
                      size="sm"
                      className="px-2 py-1 text-[10px]"
                      style={{ 
                        background: canAddBoost(boostType) ? BOOST_INFO[boostType].color : "#333",
                        color: canAddBoost(boostType) ? "#000" : "#666",
                        opacity: canAddBoost(boostType) ? 1 : 0.5
                      }}
                      disabled={!canAddBoost(boostType)}
                      onClick={() => setSlotBoost(slotIndex, boostType)}
                    >
                      {BOOST_INFO[boostType].icon} {BOOST_INFO[boostType].label}
                    </Button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Inventory display */}
        <Card className="p-2 mb-4 w-full max-w-sm border" style={{ borderColor: "#444" }}>
          <p className="text-[10px] text-center mb-2" style={{ color: "#888" }}>YOUR INVENTORY</p>
          <div className="flex flex-wrap justify-center gap-2">
            {(Object.keys(BOOST_INFO) as BoostType[]).map((boostType) => (
              <div key={boostType} className="flex items-center gap-1">
                <span className="text-xs">{BOOST_INFO[boostType].icon}</span>
                <span className="text-[10px]" style={{ color: inventory[boostType] > 0 ? BOOST_INFO[boostType].color : "#555" }}>
                  {inventory[boostType]}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {totalBoostsSelected > 0 && (
          <p className="text-[10px] mb-4" style={{ color: "#ff00ff" }}>
            🔥💨 Your score will show BOOSTED icon
          </p>
        )}

        <Button
          onClick={handleStartGame}
          className="w-full max-w-xs py-8 text-lg font-bold mb-3"
          style={{ 
            background: "linear-gradient(135deg, #00ff00, #22c55e)",
            color: "#000",
            boxShadow: "0 0 30px #00ff00, 0 0 60px #00ff00"
          }}
          data-testid="button-start-game"
        >
          <Play className="w-6 h-6 mr-2" />
          {totalBoostsSelected > 0 ? `START (${totalBoostsSelected} BOOSTS)` : "START PURE 💎"}
        </Button>

        <Button
          onClick={() => {
            setLoadout([null, null, null]);
            setScreen("title");
          }}
          variant="outline"
          className="w-full max-w-xs py-4 text-sm border-2"
          style={{ borderColor: "#888", color: "#888" }}
          data-testid="button-back-from-loadout"
        >
          BACK TO MENU
        </Button>
      </div>
    );
  }

  return null;
}
