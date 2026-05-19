import { useLocation } from "wouter";
import WebApp from "@twa-dev/sdk";

export default function Hub() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{
        background: "#000",
        fontFamily: "'Press Start 2P', monospace",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
        @keyframes pulse-title { 0%,100%{opacity:1;} 50%{opacity:0.7;} }
        @keyframes float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
        @keyframes scanline {
          0%{background-position:0 0;}
          100%{background-position:0 100%;}
        }
        .scanlines {
          pointer-events:none;
          position:fixed;
          inset:0;
          background:repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 3px,
            rgba(0,0,0,0.18) 3px,
            rgba(0,0,0,0.18) 4px
          );
          z-index:50;
        }
        .game-card:hover {
          transform: scale(1.04);
          transition: transform 0.15s ease;
        }
        .game-card {
          transition: transform 0.15s ease;
          cursor: pointer;
        }
      `}</style>

      <div className="scanlines" />

      <div className="relative z-10 flex flex-col items-center px-4 w-full max-w-sm">
        <h1
          style={{
            color: "#00ffff",
            textShadow: "0 0 10px #00ffff, 0 0 30px #00ffff",
            fontSize: "clamp(18px, 5vw, 28px)",
            animation: "pulse-title 2s ease-in-out infinite",
            letterSpacing: "4px",
            marginBottom: "6px",
            textAlign: "center",
          }}
        >
          ARCADE HUB
        </h1>
        <p style={{ color: "#ff00ff", fontSize: "8px", marginBottom: "36px", letterSpacing: "2px" }}>
          CHOOSE YOUR GAME
        </p>

        {/* SEED STORM */}
        <div
          className="game-card"
          style={{
            width: "100%",
            border: "2px solid #00ff00",
            boxShadow: "0 0 18px #00ff0066, inset 0 0 18px #00ff0011",
            background: "rgba(0,255,0,0.06)",
            borderRadius: "4px",
            padding: "20px",
            marginBottom: "20px",
          }}
          onClick={() => setLocation("/seed-storm")}
          data-testid="card-seed-storm"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
            <span style={{ fontSize: "36px" }}>🌿</span>
            <div>
              <div style={{ color: "#00ff00", fontSize: "14px", textShadow: "0 0 8px #00ff00", marginBottom: "4px" }}>
                SEED STORM
              </div>
              <div style={{ color: "#88ff88", fontSize: "7px", lineHeight: "1.6" }}>
                Galaga-style shooter
              </div>
            </div>
          </div>
          <div style={{ color: "#666", fontSize: "7px", lineHeight: "1.8", marginBottom: "14px" }}>
            🌱 Shoot cannabis seeds at enemy buds<br />
            ⚡ Score-based weapon unlocks<br />
            🏆 Daily &amp; all-time leaderboards
          </div>
          <div
            style={{
              background: "linear-gradient(135deg, #00ff00, #22c55e)",
              color: "#000",
              textAlign: "center",
              padding: "10px",
              fontSize: "10px",
              fontFamily: "'Press Start 2P', monospace",
              borderRadius: "2px",
            }}
          >
            ▶ PLAY NOW
          </div>
        </div>

        {/* PHOTON WARS */}
        <div
          className="game-card"
          style={{
            width: "100%",
            border: "2px solid #6600ff",
            boxShadow: "0 0 18px #6600ff66, inset 0 0 18px #6600ff11",
            background: "rgba(102,0,255,0.06)",
            borderRadius: "4px",
            padding: "20px",
            marginBottom: "32px",
          }}
          onClick={() => setLocation("/photon-wars")}
          data-testid="card-photon-wars"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
            <span style={{ fontSize: "36px" }}>⚡</span>
            <div>
              <div style={{ color: "#aa44ff", fontSize: "14px", textShadow: "0 0 8px #aa44ff", marginBottom: "4px" }}>
                PHOTON WARS
              </div>
              <div style={{ color: "#cc88ff", fontSize: "7px", lineHeight: "1.6" }}>
                Space Invaders arcade
              </div>
            </div>
          </div>
          <div style={{ color: "#666", fontSize: "7px", lineHeight: "1.8", marginBottom: "14px" }}>
            👾 Classic invader formations<br />
            💥 Neon explosions &amp; screen shake<br />
            🏆 Daily &amp; all-time leaderboards
          </div>
          <div
            style={{
              background: "linear-gradient(135deg, #6600ff, #aa44ff)",
              color: "#fff",
              textAlign: "center",
              padding: "10px",
              fontSize: "10px",
              fontFamily: "'Press Start 2P', monospace",
              borderRadius: "2px",
            }}
          >
            ▶ PLAY NOW
          </div>
        </div>

        <p style={{ color: "#333", fontSize: "7px", letterSpacing: "1px" }}>
          ARROWS/WASD · SPACE TO SHOOT · ESC PAUSE
        </p>
      </div>
    </div>
  );
}
