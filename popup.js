// 学习通自动刷课插件 - Popup 脚本

const DEFAULT_SETTINGS =
  (typeof XXT_DEFAULT_SETTINGS !== 'undefined' && XXT_DEFAULT_SETTINGS) ||
  {
    isRunning: true,
    playbackSpeed: 1.5,
    autoAnswer: true,
    mute: true,
    skipQuiz: true,
    autoNext: true,
    dismissIdle: true,
    showHud: true,
    stopWhenDone: true,
    maxChapters: 0,
    maxMinutes: 0
  };

const STATUS_KEY =
  (typeof XXT_STATUS_KEY !== 'undefined' && XXT_STATUS_KEY) || 'xxtRuntimeStatus';
const LOG_KEY = (typeof XXT_LOG_KEY !== 'undefined' && XXT_LOG_KEY) || 'xxtActivityLog';
const STATS_KEY = (typeof XXT_STATS_KEY !== 'undefined' && XXT_STATS_KEY) || 'xxtSessionStats';
const MORE_OPEN_KEY =
  (typeof XXT_MORE_OPEN_KEY !== 'undefined' && XXT_MORE_OPEN_KEY) || 'xxtMoreOpen';

const formatProgress =
  (typeof xxtFormatProgress === 'function' && xxtFormatProgress) ||
  (p => Math.round((Number(p) || 0) * 100));
const formatSessionStats =
  (typeof xxtFormatSessionStats === 'function' && xxtFormatSessionStats) ||
  ((stats) => `本会话 · 切章 ${stats.nextCount || 0} · 答题 ${stats.answerCount || 0}`);
const summarizeOptions =
  (typeof xxtSummarizeOptions === 'function' && xxtSummarizeOptions) ||
  (() => []);
const isHighSpeed =
  (typeof xxtIsHighSpeed === 'function' && xxtIsHighSpeed) ||
  (speed => Number(speed) > 2);
const createEmptyStats =
  (typeof xxtCreateEmptyStats === 'function' && xxtCreateEmptyStats) ||
  (() => ({ nextCount: 0, answerCount: 0, startedAt: Date.now() }));
const pickSettings =
  (typeof xxtPickSettings === 'function' && xxtPickSettings) ||
  ((raw, defaults) => ({ ...defaults, ...(raw || {}) }));

let settings = { ...DEFAULT_SETTINGS };
let saveTimer = null;
let hintTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadSettings();
  await restoreMoreOpen();
  updateUI();
  await refreshLiveStatus();
  await refreshLogs();
  setInterval(refreshLiveStatus, 1500);
  setInterval(refreshLogs, 2000);
});

function bindEvents() {
  bindToggle('toggleAuto', 'isRunning');
  bindToggle('toggleAnswer', 'autoAnswer');
  bindToggle('toggleMute', 'mute');
  bindToggle('toggleSkipQuiz', 'skipQuiz');
  bindToggle('toggleAutoNext', 'autoNext');
  bindToggle('toggleDismissIdle', 'dismissIdle');
  bindToggle('toggleShowHud', 'showHud');
  bindToggle('toggleStopWhenDone', 'stopWhenDone');

  const bindLimitInput = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const value = Math.max(0, Math.min(9999, parseInt(el.value, 10) || 0));
      settings[key] = value;
      el.value = String(value);
      updateUI();
      scheduleSave();
    });
  };
  bindLimitInput('maxChaptersInput', 'maxChapters');
  bindLimitInput('maxMinutesInput', 'maxMinutes');

  document.getElementById('speedSlider').addEventListener('input', event => {
    settings.playbackSpeed = parseFloat(event.target.value);
    updateUI();
    scheduleSave();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.playbackSpeed = parseFloat(btn.dataset.speed);
      updateUI();
      scheduleSave();
    });
  });

  const clearBtn = document.getElementById('clearLogBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ [LOG_KEY]: [] });
      await refreshLogs();
    });
  }

  const more = document.getElementById('moreSettings');
  if (more) {
    more.addEventListener('toggle', async () => {
      try {
        await chrome.storage.local.set({ [MORE_OPEN_KEY]: more.open });
      } catch (_) {}
    });
  }

  const resetStats = () => resetSessionStats();
  const resetStatsBtn = document.getElementById('resetStatsBtn');
  const resetStatsQuickBtn = document.getElementById('resetStatsQuickBtn');
  if (resetStatsBtn) resetStatsBtn.addEventListener('click', resetStats);
  if (resetStatsQuickBtn) resetStatsQuickBtn.addEventListener('click', resetStats);

  const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener('click', async () => {
      settings = { ...DEFAULT_SETTINGS };
      updateUI();
      await chrome.storage.sync.set(settings);
      showSaveHint('已恢复默认设置');
    });
  }

  const exportBtn = document.getElementById('exportSettingsBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportSettings);

  const importBtn = document.getElementById('importSettingsBtn');
  const importInput = document.getElementById('importSettingsInput');
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        settings = pickSettings(raw.settings || raw, DEFAULT_SETTINGS);
        updateUI();
        await chrome.storage.sync.set(settings);
        showSaveHint('设置已导入');
      } catch (error) {
        console.error('导入失败:', error);
        showSaveHint('导入失败，请检查文件');
      } finally {
        importInput.value = '';
      }
    });
  }
}

async function exportSettings() {
  try {
    const payload = {
      app: 'xuexitong-auto-player',
      version: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xuexitong-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSaveHint('设置已导出');
  } catch (error) {
    console.error('导出失败:', error);
    showSaveHint('导出失败');
  }
}

async function resetSessionStats() {
  const empty = createEmptyStats();
  try {
    await chrome.storage.local.set({ [STATS_KEY]: empty });
    const statsRow = document.getElementById('statsRow');
    if (statsRow) statsRow.textContent = formatSessionStats(empty);
    showSaveHint('会话统计已重置');
  } catch (error) {
    console.error('重置统计失败:', error);
  }
}

async function restoreMoreOpen() {
  const more = document.getElementById('moreSettings');
  if (!more) return;
  try {
    const result = await chrome.storage.local.get(MORE_OPEN_KEY);
    if (result[MORE_OPEN_KEY]) more.open = true;
  } catch (_) {}
}

function bindToggle(elementId, key) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const toggle = () => {
    settings[key] = !settings[key];
    updateUI();
    scheduleSave();
  };

  el.addEventListener('click', toggle);
  el.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    settings = { ...DEFAULT_SETTINGS, ...stored };
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSettings, 120);
}

async function saveSettings() {
  try {
    await chrome.storage.sync.set(settings);
    showSaveHint();
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

async function refreshLiveStatus() {
  const liveDetail = document.getElementById('liveDetail');
  const liveChapter = document.getElementById('liveChapter');
  const liveProgress = document.getElementById('liveProgress');
  const nowPanel = document.getElementById('nowPanel');
  const nowKicker = document.getElementById('nowKicker');
  const statsRow = document.getElementById('statsRow');
  const remainRow = document.getElementById('remainRow');

  try {
    const result = await chrome.storage.local.get([STATUS_KEY, STATS_KEY]);
    const status = result[STATUS_KEY];
    const stats = result[STATS_KEY] || (status && status.stats) || createEmptyStats();
    statsRow.textContent = formatSessionStats(stats);

    if (!status || Date.now() - (status.updatedAt || 0) > 15000) {
      liveChapter.textContent = '尚未连接课程页';
      liveDetail.textContent = '打开学习通播放页后，这里会显示实时进度';
      liveProgress.style.width = '0%';
      nowPanel.classList.add('is-offline');
      nowPanel.classList.remove('is-online');
      nowKicker.textContent = '等待连接';
      if (remainRow) remainRow.hidden = true;
      return;
    }

    nowPanel.classList.remove('is-offline');
    nowPanel.classList.add('is-online');
    const phase = status.phase || '';
    if (!settings.isRunning) {
      if (phase === 'verify') nowKicker.textContent = '待人工验证';
      else if (phase === 'limit') nowKicker.textContent = '已达上限';
      else if (phase === 'done') nowKicker.textContent = '已学完';
      else if (phase === 'stall') nowKicker.textContent = '播放异常';
      else nowKicker.textContent = '已暂停';
    } else {
      nowKicker.textContent = '正在学习';
    }
    liveChapter.textContent = status.chapter || '未识别当前章节';
    const pct = formatProgress(status.progress);
    const detail =
      status.detail || (settings.isRunning ? '运行中' : '已暂停自动刷课');
    const parts = [detail];
    if (status.hasVideo && pct > 0) parts.push(`${pct}%`);
    liveDetail.textContent = parts.join(' · ');
    liveProgress.style.width = `${pct}%`;

    if (remainRow) {
      if (typeof status.remaining === 'number') {
        remainRow.hidden = false;
        remainRow.textContent = `目录剩余未完成：${status.remaining}`;
      } else {
        remainRow.hidden = true;
      }
    }
  } catch (error) {
    liveChapter.textContent = '状态读取失败';
    liveDetail.textContent = '请重新打开扩展弹窗试试';
    nowPanel.classList.add('is-offline');
    nowPanel.classList.remove('is-online');
  }
}

async function refreshLogs() {
  const listEl = document.getElementById('logList');
  if (!listEl) return;
  try {
    const result = await chrome.storage.local.get(LOG_KEY);
    const list = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
    if (!list.length) {
      listEl.innerHTML = '<li class="empty">暂无活动记录</li>';
      return;
    }
    listEl.innerHTML = list
      .slice(0, 8)
      .map(item => {
        const time = formatTime(item.t);
        const msg = escapeHtml(item.message || '');
        return `<li><span class="time">${time}</span><span class="msg">${msg}</span></li>`;
      })
      .join('');
  } catch (error) {
    listEl.innerHTML = '<li class="empty">日志读取失败</li>';
  }
}

function formatTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateOptionChips() {
  const box = document.getElementById('optionChips');
  if (!box) return;
  const chips = summarizeOptions(settings);
  box.innerHTML = chips.map(text => `<span>${escapeHtml(text)}</span>`).join('');
}

function updateUI() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const hero = document.querySelector('.hero');
  const speedWarn = document.getElementById('speedWarn');

  if (statusDot) statusDot.classList.toggle('active', settings.isRunning);
  statusText.classList.toggle('active', settings.isRunning);
  statusText.textContent = settings.isRunning ? '插件运行中' : '插件已停止';
  if (hero) hero.dataset.state = settings.isRunning ? 'running' : 'stopped';

  setToggle('toggleAuto', settings.isRunning);
  setToggle('toggleAnswer', settings.autoAnswer);
  setToggle('toggleMute', settings.mute);
  setToggle('toggleSkipQuiz', settings.skipQuiz);
  setToggle('toggleAutoNext', settings.autoNext);
  setToggle('toggleDismissIdle', settings.dismissIdle);
  setToggle('toggleShowHud', settings.showHud);
  setToggle('toggleStopWhenDone', settings.stopWhenDone);

  const maxChaptersInput = document.getElementById('maxChaptersInput');
  const maxMinutesInput = document.getElementById('maxMinutesInput');
  if (maxChaptersInput) maxChaptersInput.value = String(Number(settings.maxChapters) || 0);
  if (maxMinutesInput) maxMinutesInput.value = String(Number(settings.maxMinutes) || 0);

  document.getElementById('speedSlider').value = settings.playbackSpeed;
  document.getElementById('speedValue').textContent = settings.playbackSpeed + 'x';
  if (speedWarn) speedWarn.hidden = !isHighSpeed(settings.playbackSpeed);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === settings.playbackSpeed);
  });

  updateOptionChips();
}

function setToggle(id, active) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('active', !!active);
  el.setAttribute('aria-checked', active ? 'true' : 'false');
}

function showSaveHint(message) {
  const hint = document.getElementById('saveHint');
  hint.textContent = message || '已自动保存';
  hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('show'), 1200);
}
