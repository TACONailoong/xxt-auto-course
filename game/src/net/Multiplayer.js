import * as THREE from 'three';
import { createPlayerAvatar, createStarship } from '../models/ShipModel.js';

export class Multiplayer {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.id = null;
    this.remotes = new Map();
    this.sendTimer = 0;
    this.connected = false;
  }

  connect(name) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const host = location.hostname || 'localhost';
    // Dev: vite proxies /ws; direct fallback to :3001
    const urls = [
      `${proto}://${host}:${location.port || 5173}/ws`,
      `${proto}://${host}:3001/ws`,
    ];
    this._tryConnect(urls, 0, name);
  }

  _tryConnect(urls, i, name) {
    if (i >= urls.length) {
      console.warn('[VOXBOUND] Multiplayer offline — single player mode');
      this.game.ui.setOnline(1);
      return;
    }
    try {
      const ws = new WebSocket(urls[i]);
      ws.onopen = () => {
        this.ws = ws;
        this.connected = true;
        const color = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
        ws.send(JSON.stringify({ type: 'join', name, color, x: 0, y: 40, z: 0 }));
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onclose = () => {
        if (this.ws === ws) {
          this.connected = false;
          this.ws = null;
        }
        if (!this.connected && i + 1 < urls.length) {
          this._tryConnect(urls, i + 1, name);
        }
      };
      ws.onmessage = (ev) => this._onMessage(JSON.parse(ev.data));
    } catch {
      this._tryConnect(urls, i + 1, name);
    }
  }

  _onMessage(data) {
    if (data.type === 'welcome') {
      this.id = data.id;
      for (const p of data.players) {
        if (p.id !== this.id) this._spawnRemote(p);
      }
      this.game.ui.setOnline(data.players.length);
    }
    if (data.type === 'roster') {
      this.game.ui.setOnline(data.count);
    }
    if (data.type === 'player_join') {
      if (data.player.id !== this.id) this._spawnRemote(data.player);
    }
    if (data.type === 'player_leave') {
      this._removeRemote(data.id);
    }
    if (data.type === 'player_state') {
      this._updateRemote(data);
    }
  }

  _spawnRemote(p) {
    if (this.remotes.has(p.id)) return;
    const color = parseInt((p.color || '#3ecfb4').replace('#', ''), 16);
    const avatar = createPlayerAvatar(color);
    const ship = createStarship({ hull: color, scale: 1, accent: 0xe8a832 });
    ship.visible = false;
    this.game.scene.add(avatar);
    this.game.scene.add(ship);
    this.remotes.set(p.id, { avatar, ship, data: p });
  }

  _removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.game.scene.remove(r.avatar);
    this.game.scene.remove(r.ship);
    this.remotes.delete(id);
  }

  _updateRemote(data) {
    let r = this.remotes.get(data.id);
    if (!r) {
      this._spawnRemote({ id: data.id, color: '#3ecfb4', name: 'TRAVELLER' });
      r = this.remotes.get(data.id);
    }
    r.data = { ...r.data, ...data };
    const mesh = data.ship ? r.ship : r.avatar;
    r.avatar.visible = !data.ship;
    r.ship.visible = !!data.ship;
    mesh.position.set(data.x, data.y, data.z);
    mesh.rotation.y = data.yaw || 0;
  }

  update(dt) {
    this.sendTimer += dt;
    if (!this.ws || this.ws.readyState !== 1 || this.sendTimer < 0.05) return;
    this.sendTimer = 0;
    const g = this.game;
    const inShip = g.mode === 'ship_planet' || g.mode === 'space' || g.mode === 'entering';
    const pos = inShip ? g.ship.position : g.player.position;
    const yaw = inShip ? g.ship.yaw : g.player.yaw;
    this.ws.send(
      JSON.stringify({
        type: 'state',
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw,
        mode: g.mode,
        ship: inShip,
      })
    );
  }
}
