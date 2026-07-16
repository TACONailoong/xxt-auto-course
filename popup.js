// 学习通自动刷课插件 - Popup 脚本
// 设置变更立即写入 storage.sync，内容脚本通过 onChanged 实时生效。

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
    showHud: true
  };

const STATUS_KEY =
  (typeof XXT_STATUS_KEY !== 'undefined' && XXT_STATUS_KEY) || 'xxtRuntimeStatus';
const LOG_KEY = (typeof XXT_LOG_KEY !== 'undefined' && XXT_LOG_KEY) || 'xxtActivityLog';

let settings = { ...DEFAULT_SETTINGS };
let saveTimer = null;
let hintTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadSettings();
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
}

function bindToggle(elementId, key) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener('click', () => {
    settings[key] = !settings[key];
    updateUI();
    scheduleSave();
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
  try {
    const result = await chrome.storage.local.get(STATUS_KEY);
    const status = result[STATUS_KEY];
    if (!status || Date.now() - (status.updatedAt || 0) > 15000) {
      liveDetail.textContent = '尚未检测到活跃课程页（打开学习通播放页后显示）';
      return;
    }
    const parts = [status.detail || '运行中'];
    if (status.hasVideo && status.progress > 0) {
      parts.push(`进度 ${Math.round(status.progress * 100)}%`);
    }
    liveDetail.textContent = parts.join(' · ');
  } catch (error) {
    liveDetail.textContent = '状态读取失败';
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

function updateUI() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  statusDot.classList.toggle('active', settings.isRunning);
  statusText.classList.toggle('active', settings.isRunning);
  statusText.textContent = settings.isRunning ? '插件运行中' : '插件已停止';

  setToggle('toggleAuto', settings.isRunning);
  setToggle('toggleAnswer', settings.autoAnswer);
  setToggle('toggleMute', settings.mute);
  setToggle('toggleSkipQuiz', settings.skipQuiz);
  setToggle('toggleAutoNext', settings.autoNext);
  setToggle('toggleDismissIdle', settings.dismissIdle);
  setToggle('toggleShowHud', settings.showHud);

  document.getElementById('speedSlider').value = settings.playbackSpeed;
  document.getElementById('speedValue').textContent = settings.playbackSpeed + 'x';

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === settings.playbackSpeed);
  });
}

function setToggle(id, active) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('active', !!active);
}

function showSaveHint() {
  const hint = document.getElementById('saveHint');
  hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('show'), 1200);
}
