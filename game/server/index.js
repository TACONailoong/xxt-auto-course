import { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);

// Serve built files in production
app.use(express.static(path.join(__dirname, '../dist')));

const wss = new WebSocketServer({ server, path: '/ws' });

/** @type {Map<string, {id:string,name:string,x:number,y:number,z:number,yaw:number,mode:string,ship:boolean,color:string}>} */
const players = new Map();

function broadcast(data, exceptId = null) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.playerId !== exceptId) {
      client.send(msg);
    }
  }
}

function roster() {
  return [...players.values()];
}

wss.on('connection', (ws) => {
  let playerId = null;

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === 'join') {
      playerId = data.id || `p_${Math.random().toString(36).slice(2, 9)}`;
      ws.playerId = playerId;
      const color = data.color || `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
      players.set(playerId, {
        id: playerId,
        name: (data.name || 'TRAVELLER').slice(0, 16),
        x: data.x || 0,
        y: data.y || 40,
        z: data.z || 0,
        yaw: 0,
        mode: 'planet',
        ship: false,
        color,
      });
      ws.send(JSON.stringify({ type: 'welcome', id: playerId, players: roster() }));
      broadcast({ type: 'player_join', player: players.get(playerId) }, playerId);
      broadcast({ type: 'roster', count: players.size });
      return;
    }

    if (!playerId || !players.has(playerId)) return;
    const p = players.get(playerId);

    if (data.type === 'state') {
      Object.assign(p, {
        x: data.x ?? p.x,
        y: data.y ?? p.y,
        z: data.z ?? p.z,
        yaw: data.yaw ?? p.yaw,
        mode: data.mode ?? p.mode,
        ship: !!data.ship,
      });
      broadcast({
        type: 'player_state',
        id: playerId,
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, mode: p.mode, ship: p.ship,
      }, playerId);
    }

    if (data.type === 'chat') {
      broadcast({
        type: 'chat',
        id: playerId,
        name: p.name,
        text: String(data.text || '').slice(0, 120),
      });
    }

    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', t: data.t }));
    }
  });

  ws.on('close', () => {
    if (playerId && players.has(playerId)) {
      players.delete(playerId);
      broadcast({ type: 'player_leave', id: playerId });
      broadcast({ type: 'roster', count: players.size });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[VOXBOUND] Multiplayer server on :${PORT}`);
});
