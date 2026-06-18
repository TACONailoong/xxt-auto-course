// 学习通自动刷课插件 - Popup 脚本

// 状态变量
let settings = {
  isRunning: false,
  playbackSpeed: 1.5,
  autoAnswer: true
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  updateUI();
});

// 从存储加载设置
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['isRunning', 'playbackSpeed', 'autoAnswer']);
    settings.isRunning = result.isRunning ?? true;
    settings.playbackSpeed = result.playbackSpeed ?? 1.5;
    settings.autoAnswer = result.autoAnswer ?? true;
    updateUI();
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 保存设置到存储
async function saveSettings() {
  try {
    await chrome.storage.sync.set({
      isRunning: settings.isRunning,
      playbackSpeed: settings.playbackSpeed,
      autoAnswer: settings.autoAnswer
    });

    // 向当前标签页的内容脚本发送更新
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_SETTINGS',
        settings: settings
      }).catch(err => {
        console.log('发送消息失败:', err);
      });
    }

    showNotification('设置已保存！');
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

// 更新UI显示
function updateUI() {
  // 更新状态指示器
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  if (settings.isRunning) {
    statusDot.classList.add('active');
    statusText.classList.add('active');
    statusText.textContent = '插件运行中';
  } else {
    statusDot.classList.remove('active');
    statusText.classList.remove('active');
    statusText.textContent = '插件已停止';
  }

  // 更新开关状态
  const toggleAuto = document.getElementById('toggleAuto');
  const toggleAnswer = document.getElementById('toggleAnswer');

  if (settings.isRunning) {
    toggleAuto.classList.add('active');
  } else {
    toggleAuto.classList.remove('active');
  }

  if (settings.autoAnswer) {
    toggleAnswer.classList.add('active');
  } else {
    toggleAnswer.classList.remove('active');
  }

  // 更新倍速显示
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');

  speedSlider.value = settings.playbackSpeed;
  speedValue.textContent = settings.playbackSpeed + 'x';

  // 更新预设按钮状态
  updatePresetButtons();
}

// 更新预设按钮状态
function updatePresetButtons() {
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    const btnSpeed = parseFloat(btn.textContent);
    if (btnSpeed === settings.playbackSpeed) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 切换自动刷课开关
function toggleAuto() {
  settings.isRunning = !settings.isRunning;
  updateUI();
}

// 切换自动答题开关
function toggleAnswer() {
  settings.autoAnswer = !settings.autoAnswer;
  updateUI();
}

// 更新倍速值
function updateSpeed() {
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');

  settings.playbackSpeed = parseFloat(speedSlider.value);
  speedValue.textContent = settings.playbackSpeed + 'x';
  updatePresetButtons();
}

// 设置固定倍速
function setSpeed(speed) {
  settings.playbackSpeed = speed;
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');

  speedSlider.value = speed;
  speedValue.textContent = speed + 'x';
  updatePresetButtons();
}

// 显示通知
function showNotification(message) {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    animation: slideDown 0.3s ease;
  `;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(notification);

  // 2秒后移除通知
  setTimeout(() => {
    notification.style.animation = 'slideDown 0.3s ease reverse';
    setTimeout(() => {
      notification.remove();
      style.remove();
    }, 300);
  }, 2000);
}
