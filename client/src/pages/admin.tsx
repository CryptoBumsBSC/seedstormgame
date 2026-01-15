import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, Shield, RefreshCw, Users, DollarSign, Trophy, Gift, Send } from "lucide-react";

interface ScoreWithStats {
  id: number;
  playerName: string;
  score: number;
  wave: number;
  playTime: number;
  pointsPerSecond: number;
  createdAt: string;
}

interface TelegramPlayer {
  id: number;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  totalGames: number;
  totalStarsSpent: number;
  totalStarsWon: number;
  highScore: number;
  firstPlayed: string;
  lastPlayed: string;
}

interface RevenueStats {
  totalStarsSpent: number;
  todayStarsSpent: number;
  ownerEarnings: number;
  todayOwnerEarnings: number;
  totalPlayers: number;
  activePlayers: number;
  purchaseBreakdown: {
    side_guns: number;
    machine_gun: number;
    skip_storm: number;
  };
}

interface PrizePoolInfo {
  date: string;
  totalSpent: number;
  prizePool: number;
  ownerShare: number;
  thresholdMet: boolean;
  distributed: boolean;
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"scores" | "players" | "revenue" | "prizes">("scores");
  const [manualPayoutPlayer, setManualPayoutPlayer] = useState("");
  const [manualPayoutAmount, setManualPayoutAmount] = useState("");
  const [creditTelegramId, setCreditTelegramId] = useState("");
  const [creditBoostType, setCreditBoostType] = useState("");
  const [creditQuantity, setCreditQuantity] = useState("");
  const [creditUsername, setCreditUsername] = useState("");

  const { data: scores = [], isLoading, refetch } = useQuery<ScoreWithStats[]>({
    queryKey: ["/api/admin/scores"],
    queryFn: async () => {
      const res = await fetch("/api/admin/scores", {
        headers: { "x-admin-password": password }
      });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: players = [], refetch: refetchPlayers } = useQuery<TelegramPlayer[]>({
    queryKey: ["/api/admin/telegram/players"],
    queryFn: async () => {
      const res = await fetch("/api/admin/telegram/players", {
        headers: { "x-admin-password": password }
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: revenue, refetch: refetchRevenue } = useQuery<RevenueStats>({
    queryKey: ["/api/admin/telegram/revenue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/telegram/revenue", {
        headers: { "x-admin-password": password }
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: prizePool, refetch: refetchPrize } = useQuery<PrizePoolInfo>({
    queryKey: ["/api/admin/telegram/prize-pool"],
    queryFn: async () => {
      const res = await fetch("/api/admin/telegram/prize-pool", {
        headers: { "x-admin-password": password }
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/scores/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": password }
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scores"] });
    }
  });

  const distributePrizesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/distribute-prizes", {
        method: "POST",
        headers: { 
          "x-admin-password": password,
          "Content-Type": "application/json"
        }
      });
      if (!res.ok) throw new Error("Failed to distribute");
      return res.json();
    },
    onSuccess: () => {
      refetchPrize();
      refetchPlayers();
    }
  });

  const manualPayoutMutation = useMutation({
    mutationFn: async ({ telegramId, starsAmount }: { telegramId: string; starsAmount: number }) => {
      const res = await fetch("/api/admin/manual-payout", {
        method: "POST",
        headers: { 
          "x-admin-password": password,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ telegramId, starsAmount })
      });
      if (!res.ok) throw new Error("Failed to send payout");
      return res.json();
    },
    onSuccess: () => {
      refetchPlayers();
      setManualPayoutPlayer("");
      setManualPayoutAmount("");
      alert("Payout sent successfully!");
    }
  });

  const creditBoostsMutation = useMutation({
    mutationFn: async ({ telegramId, boostType, quantity, username }: { telegramId: string; boostType: string; quantity: number; username?: string }) => {
      const res = await fetch("/api/admin/credit-boosts", {
        method: "POST",
        headers: { 
          "x-admin-password": password,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ telegramId, boostType, quantity, username })
      });
      if (!res.ok) throw new Error("Failed to credit boosts");
      return res.json();
    },
    onSuccess: (data) => {
      refetchPlayers();
      setCreditTelegramId("");
      setCreditBoostType("");
      setCreditQuantity("");
      setCreditUsername("");
      alert(`Successfully credited boosts! Inventory: ${JSON.stringify(data.inventory)}`);
    }
  });

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/admin/scores", {
        headers: { "x-admin-password": password }
      });
      if (res.ok) {
        setIsAuthenticated(true);
        setError("");
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Connection error");
    }
  };

  const handleDelete = (id: number, playerName: string) => {
    if (confirm(`Delete score by ${playerName}?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleDistribute = () => {
    if (confirm("Distribute today's prize pool to winners? This will also clear the classic leaderboard.")) {
      distributePrizesMutation.mutate();
    }
  };

  const handleManualPayout = () => {
    const amount = parseInt(manualPayoutAmount);
    if (!manualPayoutPlayer || !amount || amount <= 0) {
      alert("Please select a player and enter a valid Stars amount");
      return;
    }
    if (confirm(`Send ${amount} Stars to ${manualPayoutPlayer}?`)) {
      manualPayoutMutation.mutate({ telegramId: manualPayoutPlayer, starsAmount: amount });
    }
  };

  const handleCreditBoosts = () => {
    const quantity = parseInt(creditQuantity);
    if (!creditTelegramId || !creditBoostType || !quantity || quantity <= 0) {
      alert("Please enter Telegram ID, boost type, and quantity");
      return;
    }
    if (confirm(`Credit ${quantity}x ${creditBoostType} to ${creditTelegramId}${creditUsername ? ` (@${creditUsername})` : ''}?`)) {
      creditBoostsMutation.mutate({ 
        telegramId: creditTelegramId, 
        boostType: creditBoostType, 
        quantity,
        username: creditUsername || undefined
      });
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <Card className="p-6 w-full max-w-sm bg-card border-2" style={{ borderColor: "#00ff00" }}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-6 h-6" style={{ color: "#00ff00" }} />
            <h1 className="text-xl font-bold" style={{ color: "#00ff00" }}>ADMIN LOGIN</h1>
          </div>
          <Input
            type="password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="mb-4"
            data-testid="input-admin-password"
          />
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <Button 
            onClick={handleLogin} 
            className="w-full"
            style={{ background: "#00ff00", color: "#000" }}
            data-testid="button-admin-login"
          >
            LOGIN
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold" style={{ color: "#00ff00" }}>
            SEED STORM ADMIN
          </h1>
          <Button 
            onClick={() => {
              refetch();
              refetchPlayers();
              refetchRevenue();
              refetchPrize();
            }} 
            variant="outline"
            className="gap-2"
            data-testid="button-refresh-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh All
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            size="sm"
            onClick={() => setActiveTab("scores")}
            style={{ 
              background: activeTab === "scores" ? "#00ff00" : "transparent",
              color: activeTab === "scores" ? "#000" : "#00ff00",
              border: "1px solid #00ff00"
            }}
            data-testid="button-tab-scores"
          >
            <Trophy className="w-4 h-4 mr-1" />
            Scores
          </Button>
          <Button
            size="sm"
            onClick={() => setActiveTab("players")}
            style={{ 
              background: activeTab === "players" ? "#00ffff" : "transparent",
              color: activeTab === "players" ? "#000" : "#00ffff",
              border: "1px solid #00ffff"
            }}
            data-testid="button-tab-players"
          >
            <Users className="w-4 h-4 mr-1" />
            Players
          </Button>
          <Button
            size="sm"
            onClick={() => setActiveTab("revenue")}
            style={{ 
              background: activeTab === "revenue" ? "#ffd700" : "transparent",
              color: activeTab === "revenue" ? "#000" : "#ffd700",
              border: "1px solid #ffd700"
            }}
            data-testid="button-tab-revenue"
          >
            <DollarSign className="w-4 h-4 mr-1" />
            Revenue
          </Button>
          <Button
            size="sm"
            onClick={() => setActiveTab("prizes")}
            style={{ 
              background: activeTab === "prizes" ? "#ff6600" : "transparent",
              color: activeTab === "prizes" ? "#000" : "#ff6600",
              border: "1px solid #ff6600"
            }}
            data-testid="button-tab-prizes"
          >
            <Gift className="w-4 h-4 mr-1" />
            Prize Pool
          </Button>
        </div>

        {/* Scores Tab */}
        {activeTab === "scores" && (
          <>
            <Card className="p-3 mb-4 border" style={{ borderColor: "#ffff00", background: "rgba(255,255,0,0.1)" }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: "#ffff00" }}>
                <AlertTriangle className="w-4 h-4" />
                <span>RED = suspicious (over 2 pts/sec)</span>
              </div>
            </Card>

            {isLoading ? (
              <p style={{ color: "#aaa" }}>Loading scores...</p>
            ) : (
              <div className="space-y-1 overflow-x-auto">
                <div className="grid grid-cols-7 gap-2 text-xs font-bold p-2 min-w-[600px]" style={{ color: "#00ffff" }}>
                  <span>RK</span>
                  <span>NAME</span>
                  <span>SCORE</span>
                  <span>WAVE</span>
                  <span>TIME</span>
                  <span>PTS/S</span>
                  <span>DEL</span>
                </div>
                {scores.map((score, index) => {
                  const isSuspicious = score.pointsPerSecond > 2;
                  return (
                    <Card 
                      key={score.id}
                      className="grid grid-cols-7 gap-2 p-2 items-center text-xs border min-w-[600px]"
                      style={{ 
                        borderColor: isSuspicious ? "#ff0000" : "#333",
                        background: isSuspicious ? "rgba(255,0,0,0.1)" : "transparent"
                      }}
                      data-testid={`row-score-${score.id}`}
                    >
                      <span style={{ color: "#888" }}>#{index + 1}</span>
                      <span style={{ color: "#00ff00" }}>{score.playerName}</span>
                      <span style={{ color: "#ffff00" }}>{score.score}</span>
                      <span style={{ color: "#aaa" }}>{score.wave}</span>
                      <span style={{ color: "#aaa" }}>{formatTime(score.playTime)}</span>
                      <span style={{ color: isSuspicious ? "#ff0000" : "#aaa" }}>
                        {score.pointsPerSecond.toFixed(2)}
                      </span>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(score.id, score.playerName)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${score.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Players Tab */}
        {activeTab === "players" && (
          <div className="space-y-2 overflow-x-auto">
            <div className="text-xs mb-2" style={{ color: "#888" }}>
              Total: {players.length} Telegram players
            </div>
            <div className="grid grid-cols-8 gap-1 text-[10px] font-bold p-2 min-w-[700px]" style={{ color: "#00ffff" }}>
              <span>@USERNAME</span>
              <span>ID</span>
              <span>GAMES</span>
              <span>SPENT</span>
              <span>WON</span>
              <span>HIGH</span>
              <span>FIRST</span>
              <span>LAST</span>
            </div>
            {players.length === 0 ? (
              <p className="text-sm py-4" style={{ color: "#666" }}>No Telegram players yet</p>
            ) : (
              players.map((player) => (
                <Card 
                  key={player.id}
                  className="grid grid-cols-8 gap-1 p-2 items-center text-[10px] border min-w-[700px]"
                  style={{ borderColor: "#333" }}
                  data-testid={`row-player-${player.id}`}
                >
                  <span style={{ color: "#00ffff" }}>
                    {player.username ? `@${player.username}` : player.firstName || "Unknown"}
                  </span>
                  <span style={{ color: "#666" }}>{player.telegramId}</span>
                  <span style={{ color: "#aaa" }}>{player.totalGames}</span>
                  <span style={{ color: "#ffd700" }}>{player.totalStarsSpent} Stars</span>
                  <span style={{ color: "#00ff00" }}>{player.totalStarsWon} Stars</span>
                  <span style={{ color: "#ff00ff" }}>{player.highScore}</span>
                  <span style={{ color: "#666" }}>{formatDate(player.firstPlayed)}</span>
                  <span style={{ color: "#888" }}>{formatDate(player.lastPlayed)}</span>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === "revenue" && (
          <div className="space-y-4">
            {!revenue ? (
              <p style={{ color: "#666" }}>No revenue data yet</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="p-3 border" style={{ borderColor: "#ffd700" }}>
                    <p className="text-[10px]" style={{ color: "#888" }}>TOTAL SPENT</p>
                    <p className="text-lg font-bold" style={{ color: "#ffd700" }}>{revenue.totalStarsSpent} Stars</p>
                  </Card>
                  <Card className="p-3 border" style={{ borderColor: "#00ff00" }}>
                    <p className="text-[10px]" style={{ color: "#888" }}>TODAY SPENT</p>
                    <p className="text-lg font-bold" style={{ color: "#00ff00" }}>{revenue.todayStarsSpent} Stars</p>
                  </Card>
                  <Card className="p-3 border" style={{ borderColor: "#ff6600" }}>
                    <p className="text-[10px]" style={{ color: "#888" }}>OWNER TOTAL</p>
                    <p className="text-lg font-bold" style={{ color: "#ff6600" }}>{revenue.ownerEarnings} Stars</p>
                  </Card>
                  <Card className="p-3 border" style={{ borderColor: "#ff00ff" }}>
                    <p className="text-[10px]" style={{ color: "#888" }}>OWNER TODAY</p>
                    <p className="text-lg font-bold" style={{ color: "#ff00ff" }}>{revenue.todayOwnerEarnings} Stars</p>
                  </Card>
                </div>

                <Card className="p-4 border" style={{ borderColor: "#00ffff" }}>
                  <h3 className="text-sm mb-3" style={{ color: "#00ffff" }}>PURCHASE BREAKDOWN</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Side Guns (100 Stars)</span>
                      <span style={{ color: "#00ff00" }}>{revenue.purchaseBreakdown.side_guns} purchases</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Machine Gun (500 Stars)</span>
                      <span style={{ color: "#ff00ff" }}>{revenue.purchaseBreakdown.machine_gun} purchases</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Skip Storm (100 Stars)</span>
                      <span style={{ color: "#ff6600" }}>{revenue.purchaseBreakdown.skip_storm} purchases</span>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border" style={{ borderColor: "#00ff00" }}>
                  <h3 className="text-sm mb-3" style={{ color: "#00ff00" }}>PLAYER STATS</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Total Players</span>
                      <span style={{ color: "#00ffff" }}>{revenue.totalPlayers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Active Today</span>
                      <span style={{ color: "#00ff00" }}>{revenue.activePlayers}</span>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Prize Pool Tab */}
        {activeTab === "prizes" && (
          <div className="space-y-4">
            {!prizePool ? (
              <p style={{ color: "#666" }}>No prize pool data yet</p>
            ) : (
              <>
                <Card className="p-4 border" style={{ borderColor: prizePool.thresholdMet ? "#00ff00" : "#ff0000" }}>
                  <h3 className="text-sm mb-3" style={{ color: "#ff6600" }}>TODAY'S PRIZE POOL</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Date</span>
                      <span style={{ color: "#00ffff" }}>{prizePool.date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Total Stars Spent</span>
                      <span style={{ color: "#ffd700" }}>{prizePool.totalSpent} Stars</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Prize Pool (50%)</span>
                      <span style={{ color: "#00ff00" }}>{prizePool.prizePool} Stars</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Owner Share (50%)</span>
                      <span style={{ color: "#ff6600" }}>{prizePool.ownerShare} Stars</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Threshold (30 Stars)</span>
                      <span style={{ color: prizePool.thresholdMet ? "#00ff00" : "#ff0000" }}>
                        {prizePool.thresholdMet ? "MET" : "NOT MET"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: "#aaa" }}>Distributed</span>
                      <span style={{ color: prizePool.distributed ? "#00ff00" : "#ffff00" }}>
                        {prizePool.distributed ? "YES" : "PENDING"}
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border" style={{ borderColor: "#ffff00" }}>
                  <h3 className="text-sm mb-3" style={{ color: "#ffff00" }}>PRIZE DISTRIBUTION</h3>
                  <div className="space-y-2 text-xs mb-4" style={{ color: "#aaa" }}>
                    <p>Top 3 Winners: 25% / 10% / 5%</p>
                    <p>Random 10 Players: 1% each</p>
                    <p>Unclaimed: Goes to owner</p>
                    <p className="text-[10px]" style={{ color: "#ff6600" }}>Clears classic leaderboard after distribution</p>
                  </div>
                  <Button
                    onClick={handleDistribute}
                    disabled={prizePool.distributed || !prizePool.thresholdMet || distributePrizesMutation.isPending}
                    style={{ 
                      background: prizePool.distributed ? "#666" : "#ff6600",
                      color: "#000"
                    }}
                    data-testid="button-distribute-prizes"
                  >
                    <Gift className="w-4 h-4 mr-2" />
                    {prizePool.distributed ? "ALREADY DISTRIBUTED" : "DISTRIBUTE PRIZES"}
                  </Button>
                </Card>

                <Card className="p-4 border" style={{ borderColor: "#00ff00" }}>
                  <h3 className="text-sm mb-3" style={{ color: "#00ff00" }}>MANUAL PAYOUT</h3>
                  <div className="space-y-2 text-xs mb-4" style={{ color: "#aaa" }}>
                    <p>Send Stars directly to a player (separate from prize pool)</p>
                  </div>
                  <div className="space-y-3">
                    <Select value={manualPayoutPlayer} onValueChange={setManualPayoutPlayer}>
                      <SelectTrigger className="w-full" data-testid="select-payout-player">
                        <SelectValue placeholder="Select a player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map((player) => (
                          <SelectItem key={player.telegramId} value={player.telegramId}>
                            {player.username ? `@${player.username}` : player.firstName || player.telegramId} - {player.totalStarsWon}★ won
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Stars amount"
                      value={manualPayoutAmount}
                      onChange={(e) => setManualPayoutAmount(e.target.value)}
                      min="1"
                      data-testid="input-payout-amount"
                    />
                    <Button
                      onClick={handleManualPayout}
                      disabled={!manualPayoutPlayer || !manualPayoutAmount || manualPayoutMutation.isPending}
                      style={{ background: "#00ff00", color: "#000" }}
                      className="w-full"
                      data-testid="button-send-payout"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {manualPayoutMutation.isPending ? "SENDING..." : "SEND PAYOUT"}
                    </Button>
                  </div>
                </Card>

                <Card className="p-4 border" style={{ borderColor: "#ff00ff" }}>
                  <h3 className="text-sm mb-3" style={{ color: "#ff00ff" }}>CREDIT BOOSTS (FREE)</h3>
                  <div className="space-y-2 text-xs mb-4" style={{ color: "#aaa" }}>
                    <p>Add boosts to a player's inventory without charging Stars</p>
                    <p style={{ color: "#ff6600" }}>Use for refunds or compensation</p>
                    <p style={{ color: "#00ffff" }}>Max 99 per boost type in inventory</p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="text"
                      placeholder="Telegram User ID (numeric)"
                      value={creditTelegramId}
                      onChange={(e) => setCreditTelegramId(e.target.value)}
                      data-testid="input-credit-telegram-id"
                    />
                    <Input
                      type="text"
                      placeholder="Username (optional, e.g. TheRealityBroker)"
                      value={creditUsername}
                      onChange={(e) => setCreditUsername(e.target.value)}
                      data-testid="input-credit-username"
                    />
                    <Select value={creditBoostType} onValueChange={setCreditBoostType}>
                      <SelectTrigger className="w-full" data-testid="select-credit-boost-type">
                        <SelectValue placeholder="Select boost type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="extra_life">Extra Life</SelectItem>
                        <SelectItem value="shield_boost">Shield Boost</SelectItem>
                        <SelectItem value="rapid_fire">Rapid Fire</SelectItem>
                        <SelectItem value="side_guns">Side Guns</SelectItem>
                        <SelectItem value="machine_gun">Machine Gun</SelectItem>
                        <SelectItem value="skip_storm">Skip Storm</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Quantity"
                      value={creditQuantity}
                      onChange={(e) => setCreditQuantity(e.target.value)}
                      min="1"
                      data-testid="input-credit-quantity"
                    />
                    <Button
                      onClick={handleCreditBoosts}
                      disabled={!creditTelegramId || !creditBoostType || !creditQuantity || creditBoostsMutation.isPending}
                      style={{ background: "#ff00ff", color: "#000" }}
                      className="w-full"
                      data-testid="button-credit-boosts"
                    >
                      <Gift className="w-4 h-4 mr-2" />
                      {creditBoostsMutation.isPending ? "CREDITING..." : "CREDIT BOOSTS"}
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
            data-testid="button-back-to-game"
          >
            Back to Game
          </Button>
        </div>
      </div>
    </div>
  );
}
