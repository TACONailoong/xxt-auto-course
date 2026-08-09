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
    // 仅调用原生 click：一次事件派发会同时触发 JS 监听器与原生行为
    // （checkbox/radio 切换、button 提交、链接跳转等）。
    // 此前 dispatchEvent + el.click 双调用会导致按钮被连点两次。
    el.click();
    return true;
  } catch (_) {
    try {
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
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
  const n = Array.isArray(items) ? items.length : 0;
  if (!n) return null;
  const start = Number.isInteger(activeIndex) ? activeIndex : -1;
  // 先向后找，再从头回绕，跳过当前项与已完成项
  for (let offset = 1; offset <= n; offset++) {
    const i = start < 0 ? offset - 1 : (start + offset) % n;
    if (start >= 0 && i === start) continue;
    const tipText = String((items[i] && items[i].tipText) || '');
    if (tipText.includes('已完成')) continue;
    return { index: i, item: items[i] };
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

function xxtFormatSessionStats(stats, now = Date.now(), settings = null) {
  const nextCount = Number(stats && stats.nextCount) || 0;
  const answerCount = Number(stats && stats.answerCount) || 0;
  const startedAt = Number(stats && stats.startedAt) || now;
  const activeMs = Number(stats && stats.activeMs);
  const durationMs =
    Number.isFinite(activeMs) && activeMs >= 0 ? activeMs : now - startedAt;
  const duration = xxtFormatDuration(durationMs);
  const maxChapters = Number(settings && settings.maxChapters) || 0;
  const maxMinutes = Number(settings && settings.maxMinutes) || 0;
  if (maxChapters > 0 || maxMinutes > 0) {
    const parts = [`本会话 · ${duration}`];
    if (maxChapters > 0) parts.push(`切章 ${nextCount}/${maxChapters}`);
    else parts.push(`切章 ${nextCount}`);
    if (maxMinutes > 0) {
      const usedMin = Math.floor(
        Math.max(0, Number.isFinite(activeMs) ? activeMs : 0) / 60000
      );
      parts.push(`活跃 ${usedMin}/${maxMinutes}分`);
    }
    parts.push(`答题 ${answerCount}`);
    return parts.join(' · ');
  }
  return `本会话 · ${duration} · 切章 ${nextCount} · 答题 ${answerCount}`;
}

function xxtRecoverStepLabel(level) {
  const labels = ['点击播放', '静音重试', '微调进度', '重新加载'];
  const idx = Math.max(1, Math.min(4, Number(level) || 1)) - 1;
  return labels[idx];
}

function xxtIsManualVerificationText(text) {
  const t = String(text || '');
  return /人脸|刷脸|拍照验证|安全验证|请完成认证|身份验证|人脸识别|请允许.*摄像头/.test(
    t
  );
}

function xxtIsProtectedStatusPhase(phase) {
  return ['limit', 'done', 'paused', 'verify', 'stall', 'dead'].includes(
    String(phase || '')
  );
}

function xxtHasVisibleManualVerification(roots, isVisibleFn) {
  const list = Array.isArray(roots) ? roots : [];
  const visible = typeof isVisibleFn === 'function' ? isVisibleFn : () => true;
  for (const el of list) {
    if (!el || !visible(el)) continue;
    const text = el.textContent || '';
    if (!text || text.length > 2000) continue;
    if (xxtIsManualVerificationText(text)) return true;
  }
  return false;
}

function xxtBadgeForPausedPhase(phase) {
  switch (String(phase || '')) {
    case 'verify':
      return { text: '验', color: '#f59e0b', label: '待人工验证' };
    case 'stall':
      return { text: '卡', color: '#ef4444', label: '播放异常' };
    case 'limit':
      return { text: '满', color: '#94a3b8', label: '已达上限' };
    case 'done':
      return { text: '完', color: '#64748b', label: '已学完' };
    case 'dead':
      return { text: '!', color: '#ef4444', label: '请刷新课程页' };
    default:
      return { text: '停', color: '#94a3b8', label: '已停止' };
  }
}

function xxtSummarizeOptions(settings) {
  const chips = [];
  if (settings.autoAnswer) chips.push('答题');
  if (settings.mute) chips.push('静音');
  if (settings.skipQuiz) chips.push('跳过测验');
  if (settings.autoNext) chips.push('自动下一节');
  if (settings.dismissIdle) chips.push('防挂机');
  if (settings.showHud) chips.push('浮层');
  if (settings.stopWhenDone) chips.push('学完即停');
  const maxChapters = Number(settings.maxChapters) || 0;
  const maxMinutes = Number(settings.maxMinutes) || 0;
  if (maxChapters > 0) chips.push(`限${maxChapters}节`);
  if (maxMinutes > 0) chips.push(`限${maxMinutes}分`);
  return chips;
}

function xxtShouldStopByLimits(stats, settings, now = Date.now()) {
  const maxChapters = Number(settings && settings.maxChapters) || 0;
  const maxMinutes = Number(settings && settings.maxMinutes) || 0;
  const nextCount = Number(stats && stats.nextCount) || 0;
  const startedAt = Number(stats && stats.startedAt) || now;
  const activeMs = Number(stats && stats.activeMs);

  if (maxChapters > 0 && nextCount >= maxChapters) {
    return {
      stop: true,
      reason: `已达本会话切章上限（${maxChapters}）`
    };
  }
  if (maxMinutes > 0) {
    // 优先用活跃学习时长；旧会话无 activeMs 时回退墙钟时间
    const elapsedMin =
      Number.isFinite(activeMs) && activeMs >= 0
        ? activeMs / 60000
        : (now - startedAt) / 60000;
    if (elapsedMin >= maxMinutes) {
      return {
        stop: true,
        reason: `已达本会话时长上限（${maxMinutes}分钟）`
      };
    }
  }
  return { stop: false, reason: '' };
}

function xxtTrimSet(setLike, limit) {
  const arr = [...(setLike || [])];
  if (arr.length <= limit) return new Set(arr);
  return new Set(arr.slice(arr.length - Math.max(1, limit)));
}

function xxtIsHighSpeed(speed) {
  return Number(speed) > 2;
}

function xxtCreateEmptyStats(now = Date.now()) {
  return { nextCount: 0, answerCount: 0, startedAt: now, activeMs: 0 };
}

function xxtCountRemainingCatalog(items) {
  if (!Array.isArray(items)) return 0;
  let count = 0;
  for (const item of items) {
    const tipText = String((item && item.tipText) || '').trim();
    // 提示未加载时不计，避免剩余数被空 tip 虚高
    if (!tipText) continue;
    if (!tipText.includes('已完成')) count += 1;
  }
  return count;
}

function xxtFingerprintText(text, maxLen = 160) {
  return xxtNormalizeText(text).slice(0, maxLen);
}

function xxtPickSettings(raw, defaults) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const def = defaults[key];
    let val = src[key];
    if (typeof def === 'boolean') {
      val = !!val;
    } else if (typeof def === 'number') {
      val = Number(val);
      if (!Number.isFinite(val)) val = def;
    } else if (typeof def === 'string') {
      val = val == null ? def : String(val);
    }
    out[key] = val;
  }
  return out;
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
  recoverStepLabel: xxtRecoverStepLabel,
  summarizeOptions: xxtSummarizeOptions,
  isHighSpeed: xxtIsHighSpeed,
  createEmptyStats: xxtCreateEmptyStats,
  countRemainingCatalog: xxtCountRemainingCatalog,
  fingerprintText: xxtFingerprintText,
  pickSettings: xxtPickSettings,
  shouldStopByLimits: xxtShouldStopByLimits,
  trimSet: xxtTrimSet,
  isManualVerificationText: xxtIsManualVerificationText,
  isProtectedStatusPhase: xxtIsProtectedStatusPhase,
  hasVisibleManualVerification: xxtHasVisibleManualVerification,
  badgeForPausedPhase: xxtBadgeForPausedPhase
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
    xxtRecoverStepLabel,
    xxtSummarizeOptions,
    xxtIsHighSpeed,
    xxtCreateEmptyStats,
    xxtCountRemainingCatalog,
    xxtFingerprintText,
    xxtPickSettings,
    xxtShouldStopByLimits,
    xxtTrimSet,
    xxtIsManualVerificationText,
    xxtIsProtectedStatusPhase,
    xxtHasVisibleManualVerification,
    xxtBadgeForPausedPhase
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = XXT_DOM;
}
