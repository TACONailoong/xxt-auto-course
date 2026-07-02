// 学习通自动刷课插件 - Popup 脚本
// 注意：MV3 扩展页面禁止内联脚本，所有事件都在这里通过 addEventListener 绑定。

const DEFAULT_SETTINGS = {
  isRunning: true,
  playbackSpeed: 1.5,
  autoAnswer: true
};

let settings = { ...DEFAULT_SETTINGS };
let notificationTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadSettings();
  updateUI();
});

function bindEvents() {
  document.getElementById('toggleAuto').addEventListener('click', () => {
    settings.isRunning = !settings.isRunning;
    updateUI();
  });

  document.getElementById('toggleAnswer').addEventListener('click', () => {
    settings.autoAnswer = !settings.autoAnswer;
    updateUI();
  });

  document.getElementById('speedSlider').addEventListener('input', event => {
    settings.playbackSpeed = parseFloat(event.target.value);
    updateUI();
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.playbackSpeed = parseFloat(btn.dataset.speed);
      updateUI();
    });
  });

  document.getElementById('saveBtn').addEventListener('click', saveSettings);
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    settings = { ...DEFAULT_SETTINGS, ...stored };
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

async function saveSettings() {
  try {
    // 内容脚本监听 storage.onChanged，保存后所有页面（含 iframe）立即生效
    await chrome.storage.sync.set(settings);
    showNotification('设置已保存！');
  } catch (error) {
    console.error('保存设置失败:', error);
    showNotification('保存失败，请重试');
  }
}

function updateUI() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  statusDot.classList.toggle('active', settings.isRunning);
  statusText.classList.toggle('active', settings.isRunning);
  statusText.textContent = settings.isRunning ? '插件运行中' : '插件已停止';

  document.getElementById('toggleAuto').classList.toggle('active', settings.isRunning);
  document.getElementById('toggleAnswer').classList.toggle('active', settings.autoAnswer);

  document.getElementById('speedSlider').value = settings.playbackSpeed;
  document.getElementById('speedValue').textContent = settings.playbackSpeed + 'x';

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === settings.playbackSpeed);
  });
}

function showNotification(message) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.classList.add('show');

  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    notification.classList.remove('show');
  }, 2000);
}
