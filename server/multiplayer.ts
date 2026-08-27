import type { IncomingMessage, Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

type PeerRole = "host" | "guest";

type Peer = {
  ws: WebSocket;
  roomId: string;
  playerId: string;
  name: string;
  role: PeerRole;
  joinedAt: number;
};

type Room = {
  id: string;
  createdAt: number;
  host?: Peer;
  guest?: Peer;
};

const rooms = new Map<string, Room>();
const MAX_MESSAGE_BYTES = 128 * 1024;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeRoomId(value: unknown) {
  const roomId = String(value || "").trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(roomId) ? roomId : null;
}

function safeSend(peer: Peer | undefined, payload: unknown) {
  if (!peer || peer.ws.readyState !== WebSocket.OPEN) return;
  peer.ws.send(JSON.stringify(payload));
}

function roomState(room: Room) {
  return {
    type: "room-state",
    roomId: room.id,
    host: room.host ? { id: room.host.playerId, name: room.host.name } : null,
    guest: room.guest ? { id: room.guest.playerId, name: room.guest.name } : null,
    ready: Boolean(room.host && room.guest),
  };
}

function broadcastRoomState(room: Room) {
  const payload = roomState(room);
  safeSend(room.host, payload);
  safeSend(room.guest, payload);
}

function verifyTelegramInitData(initData: string, claimedPlayerId: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  // Web/local development remains usable without a bot token. Production Telegram
  // should always set TELEGRAM_BOT_TOKEN so player identity is cryptographically verified.
  if (!botToken) return true;
  if (!initData) return false;

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");
    if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) return false;

    const authDate = Number(params.get("auth_date") || "0");
    const now = Math.floor(Date.now() / 1000);
    if (!authDate || authDate > now + 60 || now - authDate > 24 * 60 * 60) return false;

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
    const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    const a = Buffer.from(receivedHash, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

    const rawUser = params.get("user");
    if (!rawUser) return false;
    const user = JSON.parse(rawUser) as { id?: number | string };
    return String(user.id || "") === claimedPlayerId;
  } catch {
    return false;
  }
}

function getOrCreateRoom(roomId: string) {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const room: Room = { id: roomId, createdAt: Date.now() };
  rooms.set(roomId, room);
  return room;
}

function removePeer(peer: Peer) {
  const room = rooms.get(peer.roomId);
  if (!room) return;
  if (room.host?.ws === peer.ws) room.host = undefined;
  if (room.guest?.ws === peer.ws) room.guest = undefined;

  const survivor = room.host || room.guest;
  if (survivor) {
    safeSend(survivor, { type: "peer-disconnected", role: peer.role });
    broadcastRoomState(room);
  } else {
    rooms.delete(room.id);
  }
}

function cleanExpiredRooms() {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [id, room] of rooms) {
    if (room.createdAt < cutoff && !room.host && !room.guest) rooms.delete(id);
  }
}

/**
 * Attach Seed Storm's two-player relay to the existing HTTP server.
 *
 * Player 1 is the authoritative simulation host. Player 2 sends compact input
 * messages and receives shared match snapshots. The relay never trusts a client
 * supplied Telegram id when TELEGRAM_BOT_TOKEN is configured: initData is checked
 * before the peer is admitted to a room.
 *
 * This first version intentionally keeps room fan-out in process. It is ideal for
 * development and low-volume play. Before prize-bearing multiplayer is enabled,
 * swap the relay transport behind this module for shared pub/sub so rooms remain
 * reliable across horizontally scaled instances.
 */
export function attachMultiplayerServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    let pathname = "";
    try {
      pathname = new URL(request.url || "/", "http://seedstorm.local").pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== "/api/multiplayer/ws") return;
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  wss.on("connection", (ws) => {
    let peer: Peer | null = null;
    let authenticated = false;

    const authTimer = setTimeout(() => {
      if (!authenticated) ws.close(4401, "Join timeout");
    }, 10_000);

    ws.on("message", (data) => {
      if (data.byteLength > MAX_MESSAGE_BYTES) {
        ws.close(4409, "Message too large");
        return;
      }

      let message: any;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!authenticated) {
        if (message?.type !== "join") {
          ws.close(4401, "Join required");
          return;
        }

        const roomId = normalizeRoomId(message.roomId);
        const role: PeerRole | null = message.role === "host" || message.role === "guest" ? message.role : null;
        const playerId = String(message.playerId || "").slice(0, 64);
        const name = String(message.name || "Player").trim().slice(0, 32) || "Player";
        const initData = String(message.initData || "");
        if (!roomId || !role || !playerId || !verifyTelegramInitData(initData, playerId)) {
          ws.close(4403, "Invalid player identity or room");
          return;
        }

        const room = getOrCreateRoom(roomId);
        const current = role === "host" ? room.host : room.guest;
        const opposite = role === "host" ? room.guest : room.host;

        if (current && current.playerId !== playerId && current.ws.readyState === WebSocket.OPEN) {
          ws.close(4409, `${role} slot already occupied`);
          return;
        }
        if (opposite?.playerId === playerId) {
          ws.close(4409, "Player already occupies the other slot");
          return;
        }
        if (current && current.ws !== ws) current.ws.close(4410, "Reconnected elsewhere");

        peer = { ws, roomId, playerId, name, role, joinedAt: Date.now() };
        if (role === "host") room.host = peer;
        else room.guest = peer;

        authenticated = true;
        clearTimeout(authTimer);
        safeSend(peer, { type: "joined", roomId, role });
        broadcastRoomState(room);
        cleanExpiredRooms();
        return;
      }

      if (!peer) return;
      const room = rooms.get(peer.roomId);
      if (!room) return;

      if (message?.type === "ping") {
        safeSend(peer, { type: "pong", t: Date.now() });
        return;
      }

      if (peer.role === "guest" && message?.type === "input") {
        const input = message.input || {};
        safeSend(room.host, {
          type: "input",
          input: {
            left: Boolean(input.left),
            right: Boolean(input.right),
            fire: Boolean(input.fire),
          },
          seq: Number(message.seq || 0),
        });
        return;
      }

      if (peer.role === "host" && ["snapshot", "match-start", "match-end", "event"].includes(message?.type)) {
        safeSend(room.guest, message);
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (peer) removePeer(peer);
    });

    ws.on("error", () => {
      if (peer) removePeer(peer);
    });
  });

  return wss;
}
