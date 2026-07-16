// 学习通自动刷课插件 - 背景脚本
// 职责：补齐默认配置；根据运行状态更新扩展图标 badge。

importScripts('shared/defaults.js');

const DEFAULT_SETTINGS = globalThis.XXT_DEFAULT_SETTINGS;
const STATUS_KEY = globalThis.XXT_STATUS_KEY;

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
      await chrome.action.setBadgeText({ text: '停' });
      await chrome.action.setBadgeBackgroundColor({ color: '#94a3b8' });
      await chrome.action.setTitle({ title: '学习通助手：已停止' });
      return;
    }

    if (fresh) {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      await chrome.action.setTitle({
        title: `学习通助手：${status.detail || '运行中'}`
      });
    } else {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setTitle({ title: '学习通自动刷课助手' });
    }
  } catch (error) {
    console.error('更新 badge 失败:', error);
  }
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
  }
  await updateBadgeFromState();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadgeFromState();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'STATUS_UPDATE') {
    updateBadgeFromState().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.isRunning) {
    updateBadgeFromState();
  }
  if (area === 'local' && changes[STATUS_KEY]) {
    updateBadgeFromState();
  }
});
