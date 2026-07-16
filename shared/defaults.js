// 共享默认配置（popup / content script / background 共用）
// 通过 manifest / importScripts / script 标签加载，不依赖打包工具。

const XXT_DEFAULT_SETTINGS = {
  isRunning: true,
  playbackSpeed: 1.5,
  autoAnswer: true,
  mute: true,
  skipQuiz: true,
  autoNext: true,
  dismissIdle: true,
  showHud: true
};

const XXT_STATUS_KEY = 'xxtRuntimeStatus';
const XXT_LOG_KEY = 'xxtActivityLog';
const XXT_LOG_LIMIT = 40;
const XXT_HUD_LAYOUT_KEY = 'xxtHudLayout';
const XXT_STATS_KEY = 'xxtSessionStats';
const XXT_MORE_OPEN_KEY = 'xxtMoreOpen';

if (typeof globalThis !== 'undefined') {
  globalThis.XXT_DEFAULT_SETTINGS = XXT_DEFAULT_SETTINGS;
  globalThis.XXT_STATUS_KEY = XXT_STATUS_KEY;
  globalThis.XXT_LOG_KEY = XXT_LOG_KEY;
  globalThis.XXT_LOG_LIMIT = XXT_LOG_LIMIT;
  globalThis.XXT_HUD_LAYOUT_KEY = XXT_HUD_LAYOUT_KEY;
  globalThis.XXT_STATS_KEY = XXT_STATS_KEY;
  globalThis.XXT_MORE_OPEN_KEY = XXT_MORE_OPEN_KEY;
}
