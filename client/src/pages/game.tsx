import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAccount } from "wagmi";
import { WalletConnect } from "@/components/WalletConnect";
import type { 
  GameState, 
  PlayerSprite, 
  Enemy, 
  Projectile, 
  Star, 
  StrainType,
  Score 
} from "@shared/schema";
import { Heart, ChevronLeft, ChevronRight, Target, Trophy, Play, Pause, RotateCcw, Copy, Check, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Screen = "title" | "game" | "gameover" | "leaderboard";

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const PLAYER_SIZE = 32;
const ENEMY_SIZE = 28;
const PROJECTILE_SIZE = 6;
const DIFFICULTY_INTERVAL = 15000;

const strainColors: Record<StrainType, { fill: string; glow: string }> = {
  indica: { fill: "#9333ea", glow: "#c084fc" },
  sativa: { fill: "#22c55e", glow: "#86efac" },
  hybrid: { fill: "#f97316", glow: "#fdba74" },
};

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [referrerAddress, setReferrerAddress] = useState<string | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);
  
  const { address, isConnected } = useAccount();
  const { toast } = useToast();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref && ref.length === 42 && ref.startsWith("0x")) {
      setReferrerAddress(ref);
    }
  }, []);

  const copyReferralLink = () => {
    if (address) {
      const link = `${window.location.origin}?ref=${address}`;
      navigator.clipboard.writeText(link);
      setCopiedReferral(true);
      toast({ title: "Referral link copied!" });
      setTimeout(() => setCopiedReferral(false), 2000);
    }
  };

  const handlePaymentSuccess = useCallback((newSessionId: string) => {
    setSessionId(newSessionId);
  }, []);

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
  const shootCooldownRef = useRef<number>(0);
  const spawnCooldownRef = useRef<number>(0);
  const difficultyRef = useRef<number>(1);
  const gameTimeRef = useRef<number>(0);

  const { data: scores = [] } = useQuery<Score[]>({
    queryKey: ["/api/scores"],
  });

  const submitScoreMutation = useMutation({
    mutationFn: async (data: { playerName: string; score: number; wave: number; playTime: number }) => {
      return apiRequest("POST", "/api/scores", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
      setShowNameInput(false);
      setScreen("leaderboard");
    },
  });

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
    
    const enemy: Enemy = {
      id: generateId(),
      x: Math.random() * (CANVAS_WIDTH - ENEMY_SIZE),
      y: -ENEMY_SIZE,
      width: ENEMY_SIZE,
      height: ENEMY_SIZE,
      health,
      maxHealth: health,
      strain,
      speed: 1 + difficultyRef.current * 0.2,
      shootCooldown: Math.random() * 2000 + 1000,
      points: health,
    };
    
    enemiesRef.current.push(enemy);
  }, []);

  const shoot = useCallback((isPlayer: boolean, x: number, y: number) => {
    const projectile: Projectile = {
      id: generateId(),
      x: x - PROJECTILE_SIZE / 2,
      y: isPlayer ? y - PROJECTILE_SIZE : y + ENEMY_SIZE,
      width: PROJECTILE_SIZE,
      height: PROJECTILE_SIZE * 2,
      speed: isPlayer ? -10 : 4 + difficultyRef.current * 0.5,
      isPlayerBullet: isPlayer,
    };
    projectilesRef.current.push(projectile);
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

  const resetGame = useCallback(() => {
    playerRef.current = {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: CANVAS_HEIGHT - PLAYER_SIZE - 80,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      speed: 5,
    };
    enemiesRef.current = [];
    projectilesRef.current = [];
    difficultyRef.current = 1;
    gameTimeRef.current = 0;
    shootCooldownRef.current = 0;
    spawnCooldownRef.current = 0;
    
    setGameState({
      score: 0,
      lives: 3,
      wave: 1,
      gameTime: 0,
      isPlaying: true,
      isPaused: false,
      isGameOver: false,
    });
  }, []);

  const startGame = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const response = await apiRequest("POST", `/api/sessions/${sessionId}/start`, {});
      const data = await response.json();
      
      if (data.success) {
        initStars();
        resetGame();
        setScreen("game");
      } else {
        toast({ title: "Failed to start game", variant: "destructive" });
        setSessionId(null);
      }
    } catch {
      toast({ title: "Session error", variant: "destructive" });
      setSessionId(null);
    }
  }, [initStars, resetGame, sessionId, toast]);

  const endGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      isPlaying: false,
      isGameOver: true,
    }));
    setScreen("gameover");
  }, []);

  const togglePause = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      isPaused: !prev.isPaused,
    }));
  }, []);

  const update = useCallback((deltaTime: number) => {
    if (gameState.isPaused || !gameState.isPlaying) return;

    gameTimeRef.current += deltaTime;
    const newDifficulty = Math.floor(gameTimeRef.current / DIFFICULTY_INTERVAL) + 1;
    if (newDifficulty !== difficultyRef.current) {
      difficultyRef.current = newDifficulty;
      setGameState(prev => ({ ...prev, wave: newDifficulty }));
    }

    starsRef.current.forEach(star => {
      star.y += star.speed;
      if (star.y > CANVAS_HEIGHT) {
        star.y = -star.size;
        star.x = Math.random() * CANVAS_WIDTH;
      }
    });

    const player = playerRef.current;
    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a") || touchRef.current.left) {
      player.x = Math.max(0, player.x - player.speed);
    }
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("d") || touchRef.current.right) {
      player.x = Math.min(CANVAS_WIDTH - player.width, player.x + player.speed);
    }

    shootCooldownRef.current -= deltaTime;
    if ((keysRef.current.has(" ") || keysRef.current.has("ArrowUp") || touchRef.current.fire) && 
        shootCooldownRef.current <= 0) {
      shoot(true, player.x + player.width / 2, player.y);
      shootCooldownRef.current = 200;
    }

    spawnCooldownRef.current -= deltaTime;
    const spawnRate = Math.max(500, 2000 - difficultyRef.current * 150);
    if (spawnCooldownRef.current <= 0) {
      spawnEnemy();
      spawnCooldownRef.current = spawnRate;
    }

    enemiesRef.current.forEach(enemy => {
      enemy.y += enemy.speed;
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
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const enemy = enemiesRef.current[i];
          if (checkCollision(proj, enemy)) {
            enemy.health--;
            if (enemy.health <= 0) {
              setGameState(prev => ({ 
                ...prev, 
                score: prev.score + enemy.points 
              }));
              enemiesRef.current.splice(i, 1);
            }
            return false;
          }
        }
      } else {
        if (checkCollision(proj, player)) {
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
      if (checkCollision(enemy, player)) {
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

    setGameState(prev => ({
      ...prev,
      gameTime: Math.floor(gameTimeRef.current / 1000),
    }));
  }, [gameState.isPaused, gameState.isPlaying, shoot, spawnEnemy, endGame]);

  const drawPixelRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D, player: PlayerSprite) => {
    const { x, y, width, height } = player;
    
    ctx.shadowColor = "#00ff00";
    ctx.shadowBlur = 12;
    
    // Cannabis leaves pointing out (iconic 5-point pattern)
    // Left leaf
    drawPixelRect(ctx, x - 4, y + height * 0.3, 6, 3, "#15803d");
    drawPixelRect(ctx, x - 6, y + height * 0.25, 4, 2, "#166534");
    drawPixelRect(ctx, x - 2, y + height * 0.4, 4, 2, "#22c55e");
    
    // Right leaf
    drawPixelRect(ctx, x + width - 2, y + height * 0.3, 6, 3, "#15803d");
    drawPixelRect(ctx, x + width + 2, y + height * 0.25, 4, 2, "#166534");
    drawPixelRect(ctx, x + width - 2, y + height * 0.4, 4, 2, "#22c55e");
    
    // Top leaf
    drawPixelRect(ctx, x + width * 0.4, y - 6, 3, 8, "#15803d");
    drawPixelRect(ctx, x + width * 0.5, y - 4, 3, 6, "#166534");
    
    // Main bud body (dense, rounded shape)
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.1, width * 0.5, height * 0.2, "#22c55e");
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.2, width * 0.7, height * 0.35, "#16a34a");
    drawPixelRect(ctx, x + width * 0.1, y + height * 0.35, width * 0.8, height * 0.35, "#15803d");
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.6, width * 0.6, height * 0.25, "#166534");
    
    // Orange pistils (hairs) scattered on bud
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.15, 2, 3, "#f97316");
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.2, 2, 3, "#ea580c");
    drawPixelRect(ctx, x + width * 0.4, y + height * 0.35, 2, 2, "#f97316");
    drawPixelRect(ctx, x + width * 0.65, y + height * 0.4, 2, 3, "#ea580c");
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.45, 2, 2, "#f97316");
    drawPixelRect(ctx, x + width * 0.5, y + height * 0.5, 2, 3, "#ea580c");
    
    // Trichome sparkles (frosty crystals)
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 3;
    drawPixelRect(ctx, x + width * 0.35, y + height * 0.25, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.6, y + height * 0.3, 1, 1, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.45, y + height * 0.45, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.7, y + height * 0.5, 1, 1, "#e0ffe0");
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.55, 1, 1, "#ffffff");
    
    // Cool sunglasses on Dudley Bud
    ctx.shadowBlur = 0;
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.38, width * 0.7, 3, "#000");
    drawPixelRect(ctx, x + width * 0.18, y + height * 0.35, width * 0.25, 6, "#000");
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.35, width * 0.25, 6, "#000");
    // Lens shine
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.36, 2, 2, "#4444ff");
    drawPixelRect(ctx, x + width * 0.57, y + height * 0.36, 2, 2, "#4444ff");
    
    ctx.shadowBlur = 0;
  };

  const drawEnemy = (ctx: CanvasRenderingContext2D, enemy: Enemy) => {
    const { x, y, width, height, strain, health, maxHealth } = enemy;
    const colors = strainColors[strain];
    
    // Different colors per strain for variety
    const strainDetails: Record<StrainType, { dark: string; pistil: string }> = {
      indica: { dark: "#581c87", pistil: "#f472b6" }, // Deep purple with pink hairs
      sativa: { dark: "#14532d", pistil: "#fbbf24" }, // Dark green with gold hairs
      hybrid: { dark: "#7c2d12", pistil: "#fb923c" }, // Brown-orange with orange hairs
    };
    const details = strainDetails[strain];
    
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 8;
    
    // Cannabis leaves on enemy buds
    // Left leaf
    drawPixelRect(ctx, x - 3, y + height * 0.35, 5, 2, details.dark);
    drawPixelRect(ctx, x - 5, y + height * 0.3, 3, 2, details.dark);
    
    // Right leaf  
    drawPixelRect(ctx, x + width - 2, y + height * 0.35, 5, 2, details.dark);
    drawPixelRect(ctx, x + width + 2, y + height * 0.3, 3, 2, details.dark);
    
    // Main bud body (dense cannabis nug shape)
    drawPixelRect(ctx, x + width * 0.3, y, width * 0.4, height * 0.15, colors.fill);
    drawPixelRect(ctx, x + width * 0.2, y + height * 0.1, width * 0.6, height * 0.25, colors.fill);
    drawPixelRect(ctx, x + width * 0.1, y + height * 0.25, width * 0.8, height * 0.35, colors.fill);
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.5, width * 0.7, height * 0.3, details.dark);
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.7, width * 0.5, height * 0.2, details.dark);
    
    // Calyx bumps (the rounded parts of buds)
    drawPixelRect(ctx, x + width * 0.15, y + height * 0.3, width * 0.2, height * 0.15, colors.glow);
    drawPixelRect(ctx, x + width * 0.65, y + height * 0.3, width * 0.2, height * 0.15, colors.glow);
    drawPixelRect(ctx, x + width * 0.4, y + height * 0.2, width * 0.2, height * 0.12, colors.glow);
    
    // Pistils (colored hairs) 
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.15, 2, 4, details.pistil);
    drawPixelRect(ctx, x + width * 0.6, y + height * 0.18, 2, 3, details.pistil);
    drawPixelRect(ctx, x + width * 0.45, y + height * 0.25, 2, 3, details.pistil);
    drawPixelRect(ctx, x + width * 0.3, y + height * 0.4, 2, 3, details.pistil);
    drawPixelRect(ctx, x + width * 0.55, y + height * 0.45, 2, 4, details.pistil);
    drawPixelRect(ctx, x + width * 0.7, y + height * 0.35, 2, 3, details.pistil);
    
    // Trichome sparkles
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 2;
    drawPixelRect(ctx, x + width * 0.35, y + height * 0.22, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.5, y + height * 0.35, 2, 2, "#ffffff");
    drawPixelRect(ctx, x + width * 0.65, y + height * 0.28, 1, 1, "#ffffff");
    drawPixelRect(ctx, x + width * 0.4, y + height * 0.5, 1, 1, "#ffffff");
    
    // Angry eyes (these buds are enemies!)
    ctx.shadowBlur = 0;
    drawPixelRect(ctx, x + width * 0.25, y + height * 0.4, width * 0.15, height * 0.1, "#fff");
    drawPixelRect(ctx, x + width * 0.6, y + height * 0.4, width * 0.15, height * 0.1, "#fff");
    drawPixelRect(ctx, x + width * 0.28, y + height * 0.42, width * 0.08, height * 0.06, "#ff0000");
    drawPixelRect(ctx, x + width * 0.63, y + height * 0.42, width * 0.08, height * 0.06, "#ff0000");
    // Angry eyebrows
    drawPixelRect(ctx, x + width * 0.22, y + height * 0.36, width * 0.18, 2, "#000");
    drawPixelRect(ctx, x + width * 0.6, y + height * 0.36, width * 0.18, 2, "#000");
    
    // Health bar
    if (health < maxHealth) {
      const barWidth = width * 0.8;
      const barHeight = 4;
      const barX = x + (width - barWidth) / 2;
      const barY = y - 10;
      
      ctx.shadowBlur = 0;
      drawPixelRect(ctx, barX, barY, barWidth, barHeight, "#333");
      drawPixelRect(ctx, barX, barY, barWidth * (health / maxHealth), barHeight, "#00ff00");
    }
    
    ctx.shadowBlur = 0;
  };

  const drawProjectile = (ctx: CanvasRenderingContext2D, proj: Projectile) => {
    if (proj.isPlayerBullet) {
      // Cannabis seed - brown oval with stripe
      ctx.shadowColor = "#00ff00";
      ctx.shadowBlur = 6;
      
      // Seed body (brown/tan teardrop)
      drawPixelRect(ctx, proj.x, proj.y, proj.width, proj.height, "#8b6914");
      drawPixelRect(ctx, proj.x + 1, proj.y + 1, proj.width - 2, proj.height - 2, "#a67c00");
      // Stripe down the middle
      drawPixelRect(ctx, proj.x + 2, proj.y + 2, 2, proj.height - 4, "#654321");
      // Highlight
      drawPixelRect(ctx, proj.x + 1, proj.y + 1, 1, 2, "#d4a017");
    } else {
      // Enemy projectile - glowing magenta energy ball
      ctx.shadowColor = "#ff00ff";
      ctx.shadowBlur = 8;
      
      drawPixelRect(ctx, proj.x, proj.y, proj.width, proj.height, "#ff00ff");
      drawPixelRect(ctx, proj.x + 1, proj.y + 1, proj.width - 2, proj.height - 2, "#ff66ff");
      // Core glow
      drawPixelRect(ctx, proj.x + 2, proj.y + 2, 2, 2, "#ffffff");
    }
    
    ctx.shadowBlur = 0;
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    starsRef.current.forEach(star => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fillRect(Math.floor(star.x), Math.floor(star.y), Math.floor(star.size), Math.floor(star.size));
    });

    if (gameState.isPlaying && !gameState.isGameOver) {
      drawPlayer(ctx, playerRef.current);
      
      enemiesRef.current.forEach(enemy => drawEnemy(ctx, enemy));
      projectilesRef.current.forEach(proj => drawProjectile(ctx, proj));
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

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [screen, togglePause]);

  const handleSubmitScore = () => {
    if (playerName.trim().length > 0) {
      submitScoreMutation.mutate({
        playerName: playerName.trim().toUpperCase(),
        score: gameState.score,
        wave: gameState.wave,
        playTime: gameState.gameTime,
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 overflow-hidden">
        <div className="relative">
          <h1 
            className="text-2xl md:text-4xl text-center mb-2 animate-pulse"
            style={{ 
              color: "#00ffff", 
              textShadow: "0 0 10px #00ffff, 0 0 20px #ff00ff, 0 0 30px #ff00ff" 
            }}
            data-testid="text-title"
          >
            SEED STORM
          </h1>
          <p 
            className="text-xs text-center mb-8"
            style={{ color: "#ff00ff" }}
            data-testid="text-subtitle"
          >
            A DUDLEY BUD ADVENTURE
          </p>
        </div>

        <Card className="p-6 mb-6 border-2 bg-card/80 backdrop-blur" style={{ borderColor: "#ff00ff" }}>
          <div className="flex flex-col items-center gap-4">
            <div 
              className="w-16 h-16 rounded-md flex items-center justify-center"
              style={{ 
                background: "linear-gradient(135deg, #22c55e, #15803d)",
                boxShadow: "0 0 15px #00ff00" 
              }}
            >
              <Target className="w-8 h-8" style={{ color: "#000" }} />
            </div>
            <div className="text-center">
              <p className="text-xs mb-2" style={{ color: "#00ffff" }}>PLAY AS DUDLEY BUD</p>
              <p className="text-[10px]" style={{ color: "#ff00ff" }}>SHOOT SEEDS AT ENEMY BUDS</p>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <WalletConnect 
            onPaymentSuccess={handlePaymentSuccess}
            referrerAddress={referrerAddress}
          />
          
          {sessionId && (
            <Button
              onClick={startGame}
              className="w-full py-6 text-sm animate-pulse"
              style={{ 
                background: "linear-gradient(135deg, #00ff00, #22c55e)",
                color: "#000",
                boxShadow: "0 0 20px #00ff00, inset 0 2px 0 rgba(255,255,255,0.3), inset 0 -2px 0 rgba(0,0,0,0.3)"
              }}
              data-testid="button-start-game"
            >
              <Play className="w-4 h-4 mr-2" />
              START GAME
            </Button>
          )}
          
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

          {isConnected && address && (
            <Button
              onClick={copyReferralLink}
              variant="outline"
              className="w-full py-4 text-xs border-2"
              style={{ borderColor: "#ff00ff", color: "#ff00ff" }}
              data-testid="button-copy-referral"
            >
              {copiedReferral ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  COPIED!
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 mr-2" />
                  SHARE REFERRAL LINK (10% BACK)
                </>
              )}
            </Button>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-[8px] mb-1" style={{ color: "#666" }}>CONTROLS</p>
          <p className="text-[8px]" style={{ color: "#888" }}>ARROWS / WASD TO MOVE</p>
          <p className="text-[8px]" style={{ color: "#888" }}>SPACE TO SHOOT</p>
        </div>

        {scores.length > 0 && (
          <div className="mt-6 text-center">
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
      <div className="min-h-screen bg-background flex flex-col items-center py-2 px-2 select-none">
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

        <div className="relative" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border-2 rounded-sm"
            style={{ 
              borderColor: "#ff00ff",
              imageRendering: "pixelated"
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
            className="flex-1 h-16"
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
            className="flex-1 h-16"
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
          
          <Button
            size="lg"
            className="flex-1 h-16"
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 
          className="text-2xl mb-8 animate-pulse"
          style={{ 
            color: "#ff0000",
            textShadow: "0 0 10px #ff0000, 0 0 20px #ff0000"
          }}
          data-testid="text-game-over"
        >
          GAME OVER
        </h1>

        <Card className="p-6 mb-8 border-2 bg-card/80" style={{ borderColor: "#ff00ff" }}>
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
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <Button
              onClick={() => setShowNameInput(true)}
              className="w-full py-6 text-sm"
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
              onClick={startGame}
              className="w-full py-6 text-sm"
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
              onClick={() => setScreen("title")}
              variant="outline"
              className="w-full py-6 text-sm border-2"
              style={{ borderColor: "#00ffff", color: "#00ffff" }}
              data-testid="button-main-menu"
            >
              MAIN MENU
            </Button>
          </div>
        ) : (
          <Card className="p-6 w-full max-w-xs border-2" style={{ borderColor: "#00ffff" }}>
            <p className="text-[10px] mb-4 text-center" style={{ color: "#00ffff" }}>
              ENTER YOUR NAME
            </p>
            <Input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 10))}
              placeholder="AAA"
              maxLength={10}
              className="text-center text-lg mb-4 uppercase"
              style={{ 
                background: "#111",
                borderColor: "#ff00ff",
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
    
    return (
      <div className="min-h-screen bg-background flex flex-col items-center p-4">
        <h1 
          className="text-xl mb-6"
          style={{ 
            color: "#ffff00",
            textShadow: "0 0 10px #ffff00"
          }}
          data-testid="text-leaderboard-title"
        >
          LEADERBOARD
        </h1>

        <Card 
          className="w-full max-w-md p-4 border-2 bg-card/80 mb-6"
          style={{ borderColor: "#ff00ff" }}
        >
          <div className="space-y-2">
            <div 
              className="flex items-center justify-between px-2 py-1 text-[8px]"
              style={{ color: "#666", borderBottom: "1px solid #333" }}
            >
              <span className="w-8">RANK</span>
              <span className="flex-1 text-center">PLAYER</span>
              <span className="w-20 text-right">SCORE</span>
              <span className="w-12 text-right">WAVE</span>
            </div>
            
            {sortedScores.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[10px]" style={{ color: "#666" }}>
                  NO SCORES YET
                </p>
                <p className="text-[8px] mt-2" style={{ color: "#444" }}>
                  BE THE FIRST TO PLAY!
                </p>
              </div>
            ) : (
              sortedScores.slice(0, 10).map((score, index) => {
                const rankColors = ["#ffd700", "#c0c0c0", "#cd7f32"];
                const rankColor = rankColors[index] || "#00ffff";
                
                return (
                  <div 
                    key={score.id}
                    className="flex items-center justify-between px-2 py-2 rounded-sm"
                    style={{ 
                      background: index < 3 ? "rgba(255,255,255,0.05)" : "transparent",
                      borderLeft: `3px solid ${rankColor}`
                    }}
                    data-testid={`row-score-${index}`}
                  >
                    <span 
                      className="w-8 text-xs font-bold"
                      style={{ color: rankColor }}
                    >
                      {index + 1}
                    </span>
                    <span 
                      className="flex-1 text-center text-[10px]"
                      style={{ color: "#00ffff" }}
                    >
                      {score.playerName}
                    </span>
                    <span 
                      className="w-20 text-right text-xs"
                      style={{ color: "#00ff00" }}
                    >
                      {score.score.toString().padStart(6, "0")}
                    </span>
                    <span 
                      className="w-12 text-right text-[10px]"
                      style={{ color: "#ff00ff" }}
                    >
                      W{score.wave}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <Button
            onClick={startGame}
            className="w-full py-6 text-sm"
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
            className="w-full py-6 text-sm border-2"
            style={{ borderColor: "#00ffff", color: "#00ffff" }}
            data-testid="button-back-to-menu"
          >
            BACK TO MENU
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
