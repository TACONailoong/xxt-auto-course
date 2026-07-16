// 学习通自动刷课插件 - 背景脚本
// 职责：首次安装/升级时写入（补齐）默认配置。

importScripts('shared/defaults.js');

const DEFAULT_SETTINGS = globalThis.XXT_DEFAULT_SETTINGS;

chrome.runtime.onInstalled.addListener(async details => {
  try {
    const current = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    // 只补齐缺失键，不覆盖用户已有设置
    const merged = { ...DEFAULT_SETTINGS, ...current };
    await chrome.storage.sync.set(merged);
  } catch (error) {
    console.error('初始化默认配置失败:', error);
  }

  if (details.reason === 'install') {
    console.log('学习通自动刷课助手已安装');
  } else if (details.reason === 'update') {
    console.log('学习通自动刷课助手已更新到', chrome.runtime.getManifest().version);
  }
});
