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

const XXT_DOM = {
  isVisible: xxtIsVisible,
  safeClick: xxtSafeClick,
  randomDelay: xxtRandomDelay,
  clamp: xxtClamp,
  formatProgress: xxtFormatProgress,
  normalizeText: xxtNormalizeText,
  pickNextCatalogItem: xxtPickNextCatalogItem,
  shouldLogStatusChange: xxtShouldLogStatusChange,
  isExtensionAlive: xxtIsExtensionAlive
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
    xxtIsExtensionAlive
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = XXT_DOM;
}
