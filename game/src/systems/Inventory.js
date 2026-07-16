import { ITEMS, RECIPES } from '../core/constants.js';

export class Inventory {
  constructor(slots = 24) {
    this.slots = slots;
    /** @type {{id:string, qty:number}[]} */
    this.items = [];
  }

  count(id) {
    return this.items.filter((i) => i.id === id).reduce((s, i) => s + i.qty, 0);
  }

  has(id, qty = 1) {
    return this.count(id) >= qty;
  }

  add(id, qty = 1) {
    if (!ITEMS[id]) return false;
    const existing = this.items.find((i) => i.id === id);
    if (existing) {
      existing.qty += qty;
      return true;
    }
    if (this.items.length >= this.slots) return false;
    this.items.push({ id, qty });
    return true;
  }

  remove(id, qty = 1) {
    let left = qty;
    for (let i = this.items.length - 1; i >= 0 && left > 0; i--) {
      if (this.items[i].id !== id) continue;
      const take = Math.min(left, this.items[i].qty);
      this.items[i].qty -= take;
      left -= take;
      if (this.items[i].qty <= 0) this.items.splice(i, 1);
    }
    return left === 0;
  }

  canCraft(recipe) {
    return recipe.cost.every((c) => this.has(c.item, c.qty));
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    for (const c of recipe.cost) this.remove(c.item, c.qty);
    this.add(recipe.result.item, recipe.result.qty);
    return true;
  }

  /** Refine ferrite_dust -> pure_ferrite if player has portable_refiner */
  refine(amount = 50) {
    if (!this.has('portable_refiner', 1) && !this.refinerAvailable) return false;
    if (!this.has('ferrite_dust', amount)) return false;
    if (!this.has('carbon', 10)) return false;
    this.remove('ferrite_dust', amount);
    this.remove('carbon', 10);
    this.add('pure_ferrite', amount);
    return true;
  }
}

export function getUnlockedRecipes(flags) {
  return RECIPES.filter((r) => {
    if (r.unlock === 'start') return true;
    if (r.unlock === 'refiner') return flags.unlockedRefiner || flags.diagnosed;
    if (r.unlock === 'flight') return flags.canFly || flags.spaceTutorial;
    if (r.unlock === 'hyperdrive') return flags.unlockedHyperdrive || flags.enteredSecondPlanet || flags.hyperdriveInstalled;
    return false;
  });
}
