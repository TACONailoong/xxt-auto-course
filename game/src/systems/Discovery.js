/**
 * Discovery / Units economy — NMS-style scan rewards
 */
export class DiscoverySystem {
  constructor(game) {
    this.game = game;
    this.units = 0;
    this.discoveries = [];
    this.scanProgress = 0;
    this.scanning = null;
  }

  addUnits(n, reason) {
    this.units += n;
    this.game.ui?.showUnitsGain?.(n, reason);
    return this.units;
  }

  /** Begin / continue hold-scan on a target */
  updateScan(dt, target) {
    if (!target) {
      this.scanProgress = 0;
      this.scanning = null;
      return null;
    }
    const key = target.key;
    if (this.scanning !== key) {
      this.scanning = key;
      this.scanProgress = 0;
    }
    this.scanProgress += dt;
    if (this.scanProgress >= (target.duration || 1.6)) {
      this.scanProgress = 0;
      this.scanning = null;
      return this._complete(target);
    }
    return { progress: this.scanProgress / (target.duration || 1.6), target };
  }

  _complete(target) {
    if (target.kind === 'fauna') {
      const result = this.game.fauna.discover(target.creature);
      if (!result) {
        this.game.log(`已发现：${target.creature.type.name}`);
        return { already: true, name: target.creature.type.name };
      }
      this.discoveries.push({ type: 'fauna', ...result, at: Date.now() });
      this.addUnits(result.units, result.name);
      this.game.log(`新发现 · ${result.name}（${result.temper} · ${result.diet}）+${result.units}u`);
      return { new: true, ...result };
    }
    if (target.kind === 'flora') {
      const result = this.game.fauna.discoverFlora(target.floraId);
      if (!result) {
        this.game.log(`已记录：${target.label}`);
        return { already: true, name: target.label };
      }
      this.discoveries.push({ type: 'flora', ...result, at: Date.now() });
      this.addUnits(result.units, result.name);
      this.game.log(`植物分析 · ${result.name}〔${result.element}〕+${result.units}u`);
      return { new: true, ...result };
    }
    if (target.kind === 'mineral') {
      const id = target.mineralId;
      if (this._minerals?.has(id)) {
        return { already: true, name: target.label };
      }
      this._minerals = this._minerals || new Set();
      this._minerals.add(id);
      const units = target.units || 100;
      this.addUnits(units, target.label);
      this.discoveries.push({ type: 'mineral', name: target.label, units, at: Date.now() });
      this.game.log(`矿物记录 · ${target.label} +${units}u`);
      return { new: true, name: target.label, units };
    }
    return null;
  }
}
