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
    autoNext: true
  };

const STATUS_KEY = 'xxtRuntimeStatus';

let settings = { ...DEFAULT_SETTINGS };
let saveTimer = null;
let hintTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadSettings();
  updateUI();
  await refreshLiveStatus();
  // 定期刷新页面状态
  setInterval(refreshLiveStatus, 1500);
});

function bindEvents() {
  bindToggle('toggleAuto', 'isRunning');
  bindToggle('toggleAnswer', 'autoAnswer');
  bindToggle('toggleMute', 'mute');
  bindToggle('toggleSkipQuiz', 'skipQuiz');
  bindToggle('toggleAutoNext', 'autoNext');

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
}

function bindToggle(elementId, key) {
  document.getElementById(elementId).addEventListener('click', () => {
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

  document.getElementById('speedSlider').value = settings.playbackSpeed;
  document.getElementById('speedValue').textContent = settings.playbackSpeed + 'x';

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === settings.playbackSpeed);
  });
}

function setToggle(id, active) {
  document.getElementById(id).classList.toggle('active', !!active);
}

function showSaveHint() {
  const hint = document.getElementById('saveHint');
  hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('show'), 1200);
}
