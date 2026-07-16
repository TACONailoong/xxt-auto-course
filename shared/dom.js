// 可复用的 DOM / 工具函数（content script 与单元测试共用）

function xxtIsVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function xxtSafeClick(el) {
  if (!el) return false;
  try {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    if (typeof el.click === 'function') el.click();
    return true;
  } catch (_) {
    try {
      el.click();
      return true;
    } catch (__) {
      return false;
    }
  }
}

function xxtRandomDelay(minMs, maxMs) {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function xxtClamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function xxtFormatProgress(progress) {
  const p = xxtClamp(Number(progress) || 0, 0, 1);
  return Math.round(p * 100);
}

function xxtNormalizeText(text) {
  return String(text || '').replace(/\s+/g, '').trim();
}

function xxtPickNextCatalogItem(items, activeIndex) {
  const start = Number.isInteger(activeIndex) ? activeIndex : -1;
  for (let i = start + 1; i < items.length; i++) {
    const item = items[i];
    const tipText = item.tipText || '';
    if (String(tipText).includes('已完成')) continue;
    return { index: i, item };
  }
  return null;
}

function xxtShouldLogStatusChange(prevDetail, nextDetail) {
  if (!nextDetail) return false;
  return nextDetail !== prevDetail;
}

function xxtIsExtensionAlive() {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

function xxtFormatDuration(ms) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}小时${m}分`;
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

function xxtFormatSessionStats(stats, now = Date.now()) {
  const nextCount = Number(stats && stats.nextCount) || 0;
  const answerCount = Number(stats && stats.answerCount) || 0;
  const startedAt = Number(stats && stats.startedAt) || now;
  const duration = xxtFormatDuration(now - startedAt);
  return `本会话 · ${duration} · 切章 ${nextCount} · 答题 ${answerCount}`;
}

function xxtSummarizeOptions(settings) {
  const chips = [];
  if (settings.autoAnswer) chips.push('答题');
  if (settings.mute) chips.push('静音');
  if (settings.skipQuiz) chips.push('跳过测验');
  if (settings.autoNext) chips.push('自动下一节');
  if (settings.dismissIdle) chips.push('防挂机');
  if (settings.showHud) chips.push('浮层');
  return chips;
}

function xxtIsHighSpeed(speed) {
  return Number(speed) > 2;
}

function xxtCreateEmptyStats(now = Date.now()) {
  return { nextCount: 0, answerCount: 0, startedAt: now };
}

const XXT_DOM = {
  isVisible: xxtIsVisible,
  safeClick: xxtSafeClick,
  randomDelay: xxtRandomDelay,
  clamp: xxtClamp,
  formatProgress: xxtFormatProgress,
  normalizeText: xxtNormalizeText,
  pickNextCatalogItem: xxtPickNextCatalogItem,
  shouldLogStatusChange: xxtShouldLogStatusChange,
  isExtensionAlive: xxtIsExtensionAlive,
  formatDuration: xxtFormatDuration,
  formatSessionStats: xxtFormatSessionStats,
  summarizeOptions: xxtSummarizeOptions,
  isHighSpeed: xxtIsHighSpeed,
  createEmptyStats: xxtCreateEmptyStats
};

if (typeof globalThis !== 'undefined') {
  globalThis.XXT_DOM = XXT_DOM;
  Object.assign(globalThis, {
    xxtIsVisible,
    xxtSafeClick,
    xxtRandomDelay,
    xxtClamp,
    xxtFormatProgress,
    xxtNormalizeText,
    xxtPickNextCatalogItem,
    xxtShouldLogStatusChange,
    xxtIsExtensionAlive,
    xxtFormatDuration,
    xxtFormatSessionStats,
    xxtSummarizeOptions,
    xxtIsHighSpeed,
    xxtCreateEmptyStats
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = XXT_DOM;
}
