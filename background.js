// 学习通自动刷课插件 - 背景脚本
// 职责：补齐默认配置、更新 badge、处理快捷键。

importScripts('shared/defaults.js', 'shared/dom.js');

const DEFAULT_SETTINGS = globalThis.XXT_DEFAULT_SETTINGS;
const STATUS_KEY = globalThis.XXT_STATUS_KEY;
const HUD_LAYOUT_KEY = globalThis.XXT_HUD_LAYOUT_KEY;
const RELOAD_HINT_KEY = globalThis.XXT_RELOAD_HINT_KEY || 'xxtReloadHint';
const badgeForPausedPhase =
  globalThis.xxtBadgeForPausedPhase ||
  (() => ({ text: '停', color: '#94a3b8', label: '已停止' }));

async function ensureDefaults() {
  const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
}

async function updateBadgeFromState() {
  try {
    const sync = await chrome.storage.sync.get({ isRunning: true });
    const local = await chrome.storage.local.get(STATUS_KEY);
    const status = local[STATUS_KEY];
    const fresh = status && Date.now() - (status.updatedAt || 0) < 20000;

    if (!sync.isRunning) {
      const badge = badgeForPausedPhase(fresh ? status.phase : '');
      await chrome.action.setBadgeText({ text: badge.text });
      await chrome.action.setBadgeBackgroundColor({ color: badge.color });
      await chrome.action.setTitle({
        title: `学习通助手：${(fresh && status && status.detail) || badge.label}`
      });
      return;
    }

    if (fresh) {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      const remain =
        typeof status.remaining === 'number' ? ` · 剩余${status.remaining}` : '';
      await chrome.action.setTitle({
        title: `学习通助手：${status.detail || '运行中'}${remain}`
      });
    } else {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: '学习通自动刷课助手' });
    }
  } catch (error) {
    console.error('更新 badge 失败:', error);
  }
}

async function toggleRun() {
  const current = await chrome.storage.sync.get({ isRunning: true });
  await chrome.storage.sync.set({ isRunning: !current.isRunning });
}

async function showHud() {
  await chrome.storage.sync.set({ showHud: true });
  try {
    const result = await chrome.storage.local.get(HUD_LAYOUT_KEY);
    const layout = result[HUD_LAYOUT_KEY] || {};
    await chrome.storage.local.set({
      [HUD_LAYOUT_KEY]: { ...layout, compact: false }
    });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(async details => {
  try {
    await ensureDefaults();
  } catch (error) {
    console.error('初始化默认配置失败:', error);
  }

  if (details.reason === 'install') {
    console.log('学习通自动刷课助手已安装');
  } else if (details.reason === 'update') {
    console.log('学习通自动刷课助手已更新到', chrome.runtime.getManifest().version);
    try {
      await chrome.storage.local.set({ [RELOAD_HINT_KEY]: Date.now() });
    } catch (_) {}
  }
  await updateBadgeFromState();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadgeFromState();
});

chrome.commands.onCommand.addListener(async command => {
  try {
    if (command === 'toggle-run') {
      await toggleRun();
    } else if (command === 'show-hud') {
      await showHud();
    }
  } catch (error) {
    console.error('快捷键处理失败:', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'STATUS_UPDATE') {
    updateBadgeFromState().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.isRunning || changes.showHud)) {
    updateBadgeFromState();
  }
  if (area === 'local' && changes[STATUS_KEY]) {
    updateBadgeFromState();
  }
});
