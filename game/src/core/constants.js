/** Game constants & item definitions */

export const BLOCK = 1; // world unit = 1 meter block

export const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  FERRITE_ROCK: 7,
  SODIUM_PLANT: 8,
  CARBON_PLANT: 9,
  DIHYDROGEN: 10,
  COPPER_ORE: 11,
  BEDROCK: 12,
  WATER: 13,
  CRYSTAL: 14,
};

export const BLOCK_COLORS = {
  [BLOCKS.GRASS]: 0x4a8c3a,
  [BLOCKS.DIRT]: 0x6b4423,
  [BLOCKS.STONE]: 0x6e737a,
  [BLOCKS.SAND]: 0xc2b280,
  [BLOCKS.LOG]: 0x5c3a1e,
  [BLOCKS.LEAVES]: 0x2d6b2d,
  [BLOCKS.FERRITE_ROCK]: 0x8a9098,
  [BLOCKS.SODIUM_PLANT]: 0xd4a820,
  [BLOCKS.CARBON_PLANT]: 0x2a5c2a,
  [BLOCKS.DIHYDROGEN]: 0x4a9eff,
  [BLOCKS.COPPER_ORE]: 0xb87333,
  [BLOCKS.BEDROCK]: 0x222428,
  [BLOCKS.WATER]: 0x2a6a9a,
  [BLOCKS.CRYSTAL]: 0x7ae0ff,
};

export const BLOCK_NAMES = {
  [BLOCKS.GRASS]: '草方块',
  [BLOCKS.DIRT]: '泥土',
  [BLOCKS.STONE]: '岩石',
  [BLOCKS.SAND]: '沙地',
  [BLOCKS.LOG]: '原木',
  [BLOCKS.LEAVES]: '树叶',
  [BLOCKS.FERRITE_ROCK]: '铁矿岩',
  [BLOCKS.SODIUM_PLANT]: '钠花',
  [BLOCKS.CARBON_PLANT]: '碳素植被',
  [BLOCKS.DIHYDROGEN]: '双氢晶体',
  [BLOCKS.COPPER_ORE]: '铜矿',
  [BLOCKS.WATER]: '水',
  [BLOCKS.CRYSTAL]: '异质晶体',
};

/** Drop tables when mining */
export const BLOCK_DROPS = {
  [BLOCKS.STONE]: { item: 'ferrite_dust', amount: [2, 5] },
  [BLOCKS.FERRITE_ROCK]: { item: 'ferrite_dust', amount: [8, 14] },
  [BLOCKS.SODIUM_PLANT]: { item: 'sodium', amount: [5, 12] },
  [BLOCKS.CARBON_PLANT]: { item: 'carbon', amount: [6, 14] },
  [BLOCKS.LOG]: { item: 'carbon', amount: [4, 8] },
  [BLOCKS.LEAVES]: { item: 'oxygen', amount: [2, 5] },
  [BLOCKS.DIHYDROGEN]: { item: 'dihydrogen', amount: [8, 15] },
  [BLOCKS.COPPER_ORE]: { item: 'copper', amount: [5, 10] },
  [BLOCKS.DIRT]: { item: 'ferrite_dust', amount: [1, 2] },
  [BLOCKS.GRASS]: { item: 'carbon', amount: [1, 2] },
  [BLOCKS.CRYSTAL]: { item: 'dihydrogen', amount: [12, 20] },
};

export const ITEMS = {
  ferrite_dust: { id: 'ferrite_dust', name: '铁尘', icon: '▣', color: '#9aa3ad' },
  pure_ferrite: { id: 'pure_ferrite', name: '纯铁', icon: '◆', color: '#c8d0d8' },
  sodium: { id: 'sodium', name: '钠', icon: '✦', color: '#e8c040' },
  carbon: { id: 'carbon', name: '碳', icon: '●', color: '#4a6a4a' },
  oxygen: { id: 'oxygen', name: '氧', icon: '○', color: '#80c0ff' },
  dihydrogen: { id: 'dihydrogen', name: '双氢', icon: '◇', color: '#4a9eff' },
  copper: { id: 'copper', name: '铜', icon: '■', color: '#b87333' },
  chromatic_metal: { id: 'chromatic_metal', name: '色谱金属', icon: '◈', color: '#e060ff' },
  metal_plating: { id: 'metal_plating', name: '金属镀层', icon: '▤', color: '#a8b0b8' },
  hermetic_seal: { id: 'hermetic_seal', name: '密封环', icon: '◎', color: '#3ecfb4' },
  dihydrogen_jelly: { id: 'dihydrogen_jelly', name: '双氢凝胶', icon: '◉', color: '#60b0ff' },
  carbon_nanotubes: { id: 'carbon_nanotubes', name: '碳纳米管', icon: '≡', color: '#5a8a5a' },
  portable_refiner: { id: 'portable_refiner', name: '便携精炼机', icon: '⚙', color: '#e8a832' },
  launch_fuel: { id: 'launch_fuel', name: '发射燃料', icon: '▲', color: '#ff8040' },
};

export const RECIPES = [
  {
    id: 'metal_plating',
    name: '金属镀层',
    result: { item: 'metal_plating', qty: 1 },
    cost: [{ item: 'ferrite_dust', qty: 50 }],
    unlock: 'start',
    desc: '修复脉冲引擎所需',
  },
  {
    id: 'dihydrogen_jelly',
    name: '双氢凝胶',
    result: { item: 'dihydrogen_jelly', qty: 1 },
    cost: [{ item: 'dihydrogen', qty: 40 }],
    unlock: 'start',
    desc: '修复发射推进器',
  },
  {
    id: 'carbon_nanotubes',
    name: '碳纳米管',
    result: { item: 'carbon_nanotubes', qty: 1 },
    cost: [{ item: 'carbon', qty: 50 }],
    unlock: 'start',
    desc: '用于分析面罩与工具',
  },
  {
    id: 'portable_refiner',
    name: '便携精炼机',
    result: { item: 'portable_refiner', qty: 1 },
    cost: [
      { item: 'metal_plating', qty: 1 },
      { item: 'oxygen', qty: 30 },
    ],
    unlock: 'refiner',
    desc: '将铁尘精炼为纯铁',
  },
  {
    id: 'launch_fuel',
    name: '发射燃料',
    result: { item: 'launch_fuel', qty: 1 },
    cost: [
      { item: 'dihydrogen', qty: 20 },
      { item: 'metal_plating', qty: 1 },
    ],
    unlock: 'flight',
    desc: '补充发射推进燃料',
  },
];

/** Mission stages mirroring NMS Awakenings early flow */
export const MISSION_STAGES = [
  {
    id: 'awaken',
    title: '觉醒',
    objective: '我在陌生星球醒来。采集铁尘修复扫描器。',
    check: (g) => g.inventory.count('ferrite_dust') >= 75,
    onComplete: (g) => {
      if (g.inventory.count('ferrite_dust') >= 75) {
        g.inventory.remove('ferrite_dust', 75);
      }
      g.flags.scannerRepaired = true;
      g.log('扫描器已修复。按 R 搜索坠毁星舰信号…');
    },
    progress: (g) => `铁尘 ${Math.min(75, g.inventory.count('ferrite_dust'))}/75`,
  },
  {
    id: 'find_ship',
    title: '觉醒',
    objective: '使用扫描器定位坠毁星舰，前往标记点。',
    check: (g) => g.flags.nearShip,
    onComplete: (g) => {
      g.log('发现受损星舰。进入驾驶舱进行诊断。');
    },
    progress: (g) => (g.flags.scannedShip ? '星舰已标记 — 向标记行进' : '按 R 扫描'),
  },
  {
    id: 'diagnose',
    title: '星舰修复：临界维护',
    objective: '进入星舰，诊断脉冲引擎与发射推进器。',
    check: (g) => g.flags.diagnosed,
    onComplete: (g) => {
      g.log('脉冲引擎与发射推进器离线。需要镀层、密封环、纯铁与双氢凝胶。');
    },
    progress: () => '按 F 进入星舰',
  },
  {
    id: 'metal_plating',
    title: '星舰修复：脉冲引擎',
    objective: '制作金属镀层（50铁尘），安装到脉冲引擎。',
    check: (g) => g.ship.pulseEngine.hasPlating,
    onComplete: (g) => {
      g.log('金属镀层已安装。检查求救信标以获取密封环坐标。');
    },
    progress: (g) =>
      g.inventory.has('metal_plating', 1) || g.ship.pulseEngine.hasPlating
        ? '打开星舰面板安装镀层'
        : `铁尘 ${g.inventory.count('ferrite_dust')}/50 · 按 C 制作`,
  },
  {
    id: 'hermetic',
    title: '星舰修复：密封环',
    objective: '调查求救信标，前往废弃建筑取得密封环。',
    check: (g) => g.ship.pulseEngine.repaired,
    onComplete: (g) => {
      g.log('脉冲引擎已修复！接下来修复发射推进器。');
      g.flags.unlockedRefiner = true;
    },
    progress: (g) => {
      if (g.inventory.has('hermetic_seal', 1)) return '返回星舰安装密封环';
      if (g.flags.beaconRead) return '前往黄色信标 — 废弃建筑';
      return '调查星舰旁的求救信标';
    },
  },
  {
    id: 'launch_parts',
    title: '星舰修复：发射推进',
    objective: '制作双氢凝胶，并用精炼机将铁尘炼成纯铁。',
    check: (g) => g.ship.launchThruster.repaired,
    onComplete: (g) => {
      g.log('星舰系统恢复！补充燃料后即可离星。');
      g.flags.canFly = true;
    },
    progress: (g) => {
      const jelly = g.ship.launchThruster.hasJelly || g.inventory.has('dihydrogen_jelly', 1);
      const ferrite = g.ship.launchThruster.hasFerrite || g.inventory.count('pure_ferrite') >= 50;
      return `凝胶 ${jelly ? '✓' : '…'} · 纯铁 ${ferrite ? '✓' : `${g.inventory.count('pure_ferrite')}/50`}`;
    },
  },
  {
    id: 'liftoff',
    title: '离开行星',
    objective: '进入星舰，按住空格升空，冲出大气层。',
    check: (g) => g.mode === 'space',
    onComplete: (g) => {
      g.log('进入深空。测试脉冲引擎，飞向邻近行星。');
      g.flags.spaceTutorial = true;
    },
    progress: () => '按住 Space 升空 · Shift 加速',
  },
  {
    id: 'explore_space',
    title: '测试星舰系统',
    objective: '在太空中飞行，接近另一颗行星并进入大气层。',
    check: (g) => g.flags.enteredSecondPlanet,
    onComplete: (g) => {
      g.log('信号源在此。探索这颗方块世界，建立你的航迹。');
    },
    progress: () => '飞向标记行星 · 俯冲进入大气',
  },
  {
    id: 'free',
    title: '无尽航迹',
    objective: '自由探索方块宇宙。采集、建造、与其他旅行者相遇。',
    check: () => false,
    onComplete: () => {},
    progress: () => 'WASD 飞行 · F 降落 · R 扫描',
  },
];

export const PLANETS = [
  {
    id: 'awakening',
    name: '觉醒之境',
    seed: 42,
    biome: 'lush',
    color: 0x3a8c4a,
    atmosphere: 0x6ab0d0,
    hazard: 'heat',
    radius: 80,
    orbit: { angle: 0, distance: 0 },
  },
  {
    id: 'amber_waste',
    name: '琥珀荒原',
    seed: 1337,
    biome: 'desert',
    color: 0xc2a050,
    atmosphere: 0xd4a060,
    hazard: 'heat',
    radius: 70,
    orbit: { angle: 2.1, distance: 420 },
  },
  {
    id: 'frost_shard',
    name: '霜裂晶星',
    seed: 9001,
    biome: 'frozen',
    color: 0xa0c8e0,
    atmosphere: 0x80b0d0,
    hazard: 'cold',
    radius: 65,
    orbit: { angle: 4.4, distance: 580 },
  },
];
