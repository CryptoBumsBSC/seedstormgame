import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Trash2, AlertTriangle, Shield, RefreshCw } from "lucide-react";

interface ScoreWithStats {
  id: number;
  playerName: string;
  score: number;
  wave: number;
  playTime: number;
  pointsPerSecond: number;
  createdAt: string;
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");

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

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#00ff00" }}>
            SEED STORM ADMIN
          </h1>
          <Button 
            onClick={() => refetch()} 
            variant="outline"
            className="gap-2"
            data-testid="button-refresh-scores"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        <Card className="p-4 mb-4 border-2" style={{ borderColor: "#ffff00", background: "rgba(255,255,0,0.1)" }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "#ffff00" }}>
            <AlertTriangle className="w-4 h-4" />
            <span>Scores highlighted in RED have suspicious points-per-second ratio (over 2 pts/sec)</span>
          </div>
        </Card>

        {isLoading ? (
          <p style={{ color: "#aaa" }}>Loading scores...</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-7 gap-2 text-xs font-bold p-2" style={{ color: "#00ffff" }}>
              <span>RANK</span>
              <span>NAME</span>
              <span>SCORE</span>
              <span>WAVE</span>
              <span>TIME</span>
              <span>PTS/SEC</span>
              <span>ACTION</span>
            </div>
            {scores.map((score, index) => {
              const isSuspicious = score.pointsPerSecond > 2;
              return (
                <Card 
                  key={score.id}
                  className="grid grid-cols-7 gap-2 p-2 items-center text-sm border"
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
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
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
