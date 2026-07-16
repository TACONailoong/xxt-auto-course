import { ITEMS, RECIPES, BLOCK_NAMES, TRADE_OFFERS } from '../core/constants.js';
import { getUnlockedRecipes } from '../systems/Inventory.js';
import { sound } from '../audio/SoundManager.js';

export class UIManager {
  constructor(game) {
    this.game = game;
    this.logTimer = 0;
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  setLoading(progress, text) {
    this.showScreen('loading-screen');
    document.getElementById('loading-fill').style.width = `${progress * 100}%`;
    if (text) document.getElementById('loading-text').textContent = text;
  }

  refreshMission() {
    const stage = this.game.mission.stage;
    document.getElementById('mission-title').textContent = stage.title;
    document.getElementById('mission-objective').textContent = stage.objective;
    document.getElementById('mission-progress').textContent = stage.progress(this.game);
  }

  refreshVitals() {
    const p = this.game.player;
    document.getElementById('hazard-fill').style.width = `${p.hazard}%`;
    document.getElementById('life-fill').style.width = `${p.life}%`;
    document.getElementById('jetpack-fill').style.width = `${(p.jetpackFuel / p.jetpackMax) * 100}%`;
  }

  refreshResources() {
    const strip = document.getElementById('resource-strip');
    const show = ['ferrite_dust', 'sodium', 'carbon', 'dihydrogen', 'oxygen', 'pure_ferrite'];
    strip.innerHTML = show
      .map((id) => {
        const qty = this.game.inventory.count(id);
        if (qty <= 0) return '';
        const def = ITEMS[id];
        return `<div class="res-chip"><span class="name">${def.icon} ${def.name}</span><span class="qty">${qty}</span></div>`;
      })
      .join('');

    // Units + clock
    const uv = document.getElementById('units-value');
    if (uv && this.game.discovery) uv.textContent = this.game.discovery.units.toLocaleString();
    const phase = document.getElementById('time-phase');
    const clock = document.getElementById('time-clock');
    if (phase && this.game.dayNight) {
      phase.textContent = this.game.dayNight.label;
      clock.textContent = this.game.dayNight.clockStr;
    }
  }

  showUnitsGain(n, reason) {
    const el = document.getElementById('units-toast');
    if (!el) return;
    el.textContent = `+${n}u  ${reason || ''}`;
    el.classList.remove('hidden');
    clearTimeout(this._unitsToast);
    this._unitsToast = setTimeout(() => el.classList.add('hidden'), 1800);
  }

  refreshHotbar() {
    const bar = document.getElementById('hotbar');
    const items = this.game.inventory.items.slice(0, 5);
    const sel = this.game.player?.hotbarIndex ?? 0;
    bar.innerHTML = [0, 1, 2, 3, 4]
      .map((i) => {
        const it = items[i];
        const def = it ? ITEMS[it.id] : null;
        return `<div class="hot-slot ${i === sel ? 'active' : ''}" data-slot="${i}">
          <span class="key">${i + 1}</span>
          ${def ? `<span style="color:${def.color}">${def.icon}</span><span>${it.qty}</span>` : ''}
        </div>`;
      })
      .join('');
  }

  log(text, duration = 5) {
    const panel = document.getElementById('log-panel');
    document.getElementById('log-text').textContent = text;
    panel.classList.add('visible');
    this.logTimer = duration;
  }

  update(dt) {
    if (this.logTimer > 0) {
      this.logTimer -= dt;
      if (this.logTimer <= 0) document.getElementById('log-panel').classList.remove('visible');
    }
    this.refreshMission();
    this.refreshVitals();
    this.refreshResources();
    this.refreshHotbar();
    this.refreshShipHud();
    this.refreshTargetInfo();
  }

  refreshShipHud() {
    const shipHud = document.getElementById('ship-hud');
    const inShip = this.game.mode === 'ship_planet' || this.game.mode === 'space' || this.game.mode === 'entering';
    shipHud.classList.toggle('hidden', !inShip);
    if (!inShip) return;
    const ship = this.game.ship;
    document.getElementById('speed-value').textContent = Math.round(Math.abs(ship.speed));
    document.getElementById('pulse-fuel').style.width = `${ship.pulseEngine.fuel}%`;
    document.getElementById('launch-fuel').style.width = `${ship.launchThruster.fuel}%`;
    document.getElementById('sys-pulse').classList.toggle('broken', !ship.pulseEngine.repaired);
    document.getElementById('sys-launch').classList.toggle('broken', !ship.launchThruster.repaired);
    document.getElementById('alt-value').textContent = Math.round(ship.position.y);

    const nav = document.getElementById('space-nav');
    if (nav) {
      if (this.game.mode === 'space' && this.game.space) {
        nav.classList.remove('hidden');
        const info = this.game.space.nearestInfo(ship.position);
        if (info) {
          document.getElementById('nav-target').textContent = info.def.name;
          const d = Math.max(0, Math.round(info.dist));
          document.getElementById('nav-dist').textContent =
            d < 25 ? '大气进入区' : `${d}u`;
          nav.classList.toggle('approach', d < 40);
        }
      } else {
        nav.classList.add('hidden');
      }
    }
  }

  refreshTargetInfo() {
    const el = document.getElementById('target-info');
    if (!el) return;
    if (this.game.mode !== 'planet' || !this.game.player?.targetBlock) {
      el.classList.add('hidden');
      return;
    }
    const { id } = this.game.player.targetBlock;
    const name = BLOCK_NAMES[id];
    if (!name) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.textContent = name;
  }

  setInteract(text) {
    const el = document.getElementById('interact-prompt');
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    document.getElementById('interact-text').textContent = text;
  }

  showScan() {
    const el = document.getElementById('scan-overlay');
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 500);
  }

  toggleInventory(force) {
    const modal = document.getElementById('inventory-modal');
    const open = force ?? modal.classList.contains('hidden');
    if (open) {
      this.closeModals();
      modal.classList.remove('hidden');
      sound.uiOpen();
      this.renderInventory();
    } else {
      modal.classList.add('hidden');
      sound.uiClose();
    }
  }

  renderInventory() {
    const grid = document.getElementById('inventory-grid');
    const slots = [];
    for (let i = 0; i < 24; i++) {
      const it = this.game.inventory.items[i];
      if (it) {
        const def = ITEMS[it.id];
        slots.push(`<div class="inv-slot" title="${def.name}">
          <span class="icon" style="color:${def.color}">${def.icon}</span>
          <span>${def.name}</span>
          <span class="qty">${it.qty}</span>
        </div>`);
      } else {
        slots.push(`<div class="inv-slot"></div>`);
      }
    }
    grid.innerHTML = slots.join('');
  }

  toggleCraft(force) {
    const modal = document.getElementById('craft-modal');
    const open = force ?? modal.classList.contains('hidden');
    if (open) {
      this.closeModals();
      modal.classList.remove('hidden');
      sound.uiOpen();
      this.renderCraft();
    } else {
      modal.classList.add('hidden');
      sound.uiClose();
    }
  }

  renderCraft() {
    const list = document.getElementById('craft-list');
    const recipes = getUnlockedRecipes(this.game.flags);
    const canRefine =
      this.game.inventory.has('ferrite_dust', 50) &&
      this.game.inventory.has('carbon', 10) &&
      (this.game.inventory.has('portable_refiner', 1) || this.game.flags.refinerBuilt);

    const refineRow = `
      <div class="craft-row ${canRefine ? 'can' : 'locked'}" data-refine="1">
        <div class="craft-info">
          <div class="name">精炼 · 纯铁 ×50</div>
          <div class="cost">铁尘×50 + 碳×10（燃料）· 需要便携精炼机</div>
        </div>
        <button class="craft-btn">精炼</button>
      </div>`;

    list.innerHTML =
      recipes
        .map((r) => {
          const can = this.game.inventory.canCraft(r);
          const cost = r.cost.map((c) => `${ITEMS[c.item].name}×${c.qty}`).join(' + ');
          return `<div class="craft-row ${can ? 'can' : 'locked'}" data-recipe="${r.id}">
            <div class="craft-info">
              <div class="name">${ITEMS[r.result.item].icon} ${r.name}</div>
              <div class="cost">${cost} — ${r.desc}</div>
            </div>
            <button class="craft-btn">制作</button>
          </div>`;
        })
        .join('') + refineRow;

    list.querySelectorAll('.craft-row').forEach((row) => {
      row.addEventListener('click', () => {
        if (row.classList.contains('locked')) return;
        if (row.dataset.refine) {
          if (this.game.inventory.refine(50)) {
            sound.craft();
            this.game.log('精炼完成：获得纯铁 ×50');
            this.renderCraft();
          }
          return;
        }
        const recipe = RECIPES.find((r) => r.id === row.dataset.recipe);
        if (recipe && this.game.inventory.craft(recipe)) {
          sound.craft();
          this.game.log(`制作完成：${recipe.name}`);
          if (recipe.id === 'portable_refiner') {
            this.game.flags.refinerBuilt = true;
            this.game.inventory.refinerAvailable = true;
          }
          this.renderCraft();
        }
      });
    });
  }

  toggleShipPanel(force) {
    const modal = document.getElementById('ship-panel');
    const open = force ?? modal.classList.contains('hidden');
    if (open) {
      this.closeModals();
      modal.classList.remove('hidden');
      sound.uiOpen();
      this.renderShipPanel();
    } else {
      modal.classList.add('hidden');
      sound.uiClose();
    }
  }

  renderShipPanel() {
    const ship = this.game.ship;
    const el = document.getElementById('ship-status');
    const pulseOk = ship.pulseEngine.repaired;
    const launchOk = ship.launchThruster.repaired;
    const hyperOk = ship.hyperdrive?.installed;

    el.innerHTML = `
      <div class="ship-part ${pulseOk ? 'ok' : 'broken'}" data-part="pulse">
        <div class="part-name">脉冲引擎 ${pulseOk ? '· 在线' : '· 离线'}</div>
        <div class="part-req">
          金属镀层 ${ship.pulseEngine.hasPlating ? '✓' : '✗'} ·
          密封环 ${ship.pulseEngine.hasSeal ? '✓' : '✗'} ·
          燃料 ${Math.round(ship.pulseEngine.fuel)}%
        </div>
        <div class="part-req" style="margin-top:0.35rem;color:var(--amber)">点击安装可用部件</div>
      </div>
      <div class="ship-part ${launchOk ? 'ok' : 'broken'}" data-part="launch">
        <div class="part-name">发射推进器 ${launchOk ? '· 在线' : '· 离线'}</div>
        <div class="part-req">
          双氢凝胶 ${ship.launchThruster.hasJelly ? '✓' : '✗'} ·
          纯铁×50 ${ship.launchThruster.hasFerrite ? '✓' : '✗'} ·
          燃料 ${Math.round(ship.launchThruster.fuel)}%
        </div>
        <div class="part-req" style="margin-top:0.35rem;color:var(--amber)">点击安装可用部件</div>
      </div>
      ${
        this.game.flags.unlockedHyperdrive || hyperOk
          ? `<div class="ship-part ${hyperOk ? 'ok' : 'broken'}" data-part="hyper">
              <div class="part-name">超空间核心 ${hyperOk ? '· 在线' : '· 待安装'}</div>
              <div class="part-req">色谱金属核心 ${hyperOk ? '✓' : '✗'} · 深空脉冲加速</div>
              <div class="part-req" style="margin-top:0.35rem;color:var(--amber)">点击安装超空间核心</div>
            </div>`
          : ''
      }
      ${
        ship.repaired
          ? `<div class="ship-part ok refuel-row">
              <div class="part-name">燃料补给</div>
              <div class="part-req">发射燃料加注推进器 · 双氢×25 加注脉冲</div>
              <div class="refuel-btns">
                <button class="craft-btn" data-refuel="launch">加注发射</button>
                <button class="craft-btn" data-refuel="pulse">加注脉冲</button>
              </div>
            </div>`
          : ''
      }
    `;

    el.querySelectorAll('[data-part]').forEach((part) => {
      part.addEventListener('click', () => {
        const which = part.dataset.part;
        let ok = false;
        if (which === 'pulse') {
          ok = ship.tryInstallPlating(this.game.inventory) || ship.tryInstallSeal(this.game.inventory);
        } else if (which === 'launch') {
          ok = ship.tryInstallJelly(this.game.inventory) || ship.tryInstallFerrite(this.game.inventory);
        } else if (which === 'hyper') {
          ok = ship.tryInstallHyperdrive(this.game.inventory);
          if (ok) {
            this.game.flags.hyperdriveInstalled = true;
            this.game.log('超空间核心已安装。');
          }
        }
        if (ok && which !== 'hyper') this.game.log('部件已安装。');
        this.renderShipPanel();
      });
    });

    el.querySelectorAll('[data-refuel]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const which = btn.dataset.refuel;
        let ok = false;
        if (which === 'launch') ok = ship.tryRefuelLaunch(this.game.inventory);
        if (which === 'pulse') ok = ship.tryRefuelPulse(this.game.inventory);
        this.game.log(ok ? '燃料已加注。' : '无法加注（缺少材料或已满）。');
        this.renderShipPanel();
      });
    });
  }

  toggleTrade(force) {
    const modal = document.getElementById('trade-modal');
    if (!modal) return;
    const open = force ?? modal.classList.contains('hidden');
    if (open) {
      this.closeModals();
      modal.classList.remove('hidden');
      sound.uiOpen();
      this.renderTrade();
    } else {
      modal.classList.add('hidden');
      sound.uiClose();
    }
  }

  renderTrade() {
    const list = document.getElementById('trade-list');
    const units = this.game.discovery?.units || 0;
    document.getElementById('trade-units').textContent = units.toLocaleString();
    list.innerHTML = TRADE_OFFERS.map((o) => {
      const can = units >= o.cost;
      return `<div class="craft-row ${can ? 'can' : 'locked'}" data-trade="${o.id}">
        <div class="craft-info">
          <div class="craft-name">${o.name}</div>
          <div class="craft-cost">${o.cost.toLocaleString()} Units</div>
        </div>
        <button class="craft-btn">购买</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-trade]').forEach((row) => {
      row.addEventListener('click', () => {
        const offer = TRADE_OFFERS.find((o) => o.id === row.dataset.trade);
        if (!offer) return;
        if ((this.game.discovery?.units || 0) < offer.cost) {
          this.game.log('Units 不足。');
          return;
        }
        this.game.discovery.units -= offer.cost;
        this.game.inventory.add(offer.give.item, offer.give.qty);
        sound.collect();
        this.game.log(`购入 ${offer.name}（-${offer.cost}u）。`);
        this.renderTrade();
        this.refreshResources();
      });
    });
  }

  showEntry(planetName, coords) {
    const el = document.getElementById('entry-overlay');
    el.classList.remove('hidden');
    document.querySelector('.entry-text').textContent = `进入大气层 · ${planetName}`;
    document.getElementById('entry-coords').textContent = coords;
  }

  hideEntry() {
    document.getElementById('entry-overlay').classList.add('hidden');
  }

  setOnline(count) {
    document.getElementById('online-count').textContent = count;
  }

  anyModalOpen() {
    return (
      !document.getElementById('inventory-modal').classList.contains('hidden') ||
      !document.getElementById('craft-modal').classList.contains('hidden') ||
      !document.getElementById('ship-panel').classList.contains('hidden') ||
      !document.getElementById('trade-modal')?.classList.contains('hidden')
    );
  }

  closeModals() {
    document.getElementById('inventory-modal').classList.add('hidden');
    document.getElementById('craft-modal').classList.add('hidden');
    document.getElementById('ship-panel').classList.add('hidden');
    document.getElementById('trade-modal')?.classList.add('hidden');
  }
}
