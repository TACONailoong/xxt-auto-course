import * as THREE from 'three';

/**
 * Screen-space waypoint arrows + distance readout (NMS style)
 */
export class WaypointHUD {
  constructor(game) {
    this.game = game;
    this.el = null;
  }

  ensure() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.id = 'waypoint-hud';
    document.getElementById('game-ui').appendChild(this.el);
  }

  update() {
    this.ensure();
    const g = this.game;
    const targets = [];

    if (g.shipMarker?.visible && g.mode === 'planet') {
      targets.push({
        pos: g.ship.position.clone().add(new THREE.Vector3(0, 3, 0)),
        label: '星舰',
        color: '#e8a832',
      });
    }
    if (g.buildingMarker?.visible && g.mode === 'planet' && !g.flags.hermeticTaken) {
      targets.push({
        pos: g.building.position.clone().add(new THREE.Vector3(0, 5, 0)),
        label: '废弃建筑',
        color: '#3ecfb4',
      });
    }
    if (g.mode === 'space' || g.mode === 'entering') {
      for (const p of g.space.planets) {
        if (p.def.id === g.currentPlanetId && g.spaceGrace > 0) continue;
        targets.push({
          pos: p.mesh.position.clone(),
          label: p.def.name,
          color: '#' + p.def.color.toString(16).padStart(6, '0'),
        });
      }
    }

    const cam = g.camera;
    const origin = g.mode === 'planet' ? g.player.position : g.ship.position;
    this.el.innerHTML = targets
      .map((t) => {
        const ndc = t.pos.clone().project(cam);
        const dist = origin.distanceTo(t.pos);
        let x = (ndc.x * 0.5 + 0.5) * 100;
        let y = (-ndc.y * 0.5 + 0.5) * 100;
        const behind = ndc.z > 1;
        if (behind || x < 0 || x > 100 || y < 0 || y > 100) {
          // Edge clamp
          const angle = Math.atan2(ndc.y, ndc.x);
          x = 50 + Math.cos(angle) * 42;
          y = 50 - Math.sin(angle) * 38;
        }
        x = Math.max(4, Math.min(96, x));
        y = Math.max(8, Math.min(88, y));
        return `<div class="wp-marker" style="left:${x}%;top:${y}%;--wp:${t.color}">
          <div class="wp-diamond"></div>
          <div class="wp-info"><span>${t.label}</span><span>${dist < 1000 ? dist.toFixed(0) : (dist / 1000).toFixed(1) + 'k'}u</span></div>
        </div>`;
      })
      .join('');
  }
}
