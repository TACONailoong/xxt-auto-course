// 学习通自动刷课插件 - 内容脚本
// 功能：自动播放视频、倍速播放、自动答题、下一章自动切换

class XueXiTongAutoPlayer {
  constructor() {
    this.isRunning = false;
    this.playbackSpeed = 1.5; // 默认倍速
    this.autoAnswer = true; // 自动答题
    this.currentVideo = null;
    this.observer = null;
    this.init();
  }

  async init() {
    // 等待页面加载完成
    await this.waitForPageReady();
    // 加载用户设置
    await this.loadSettings();
    // 开始监听视频
    this.startVideoObserver();
    // 初始化完成
    console.log('学习通自动刷课插件已启动', {
      isRunning: this.isRunning,
      playbackSpeed: this.playbackSpeed,
      autoAnswer: this.autoAnswer
    });
  }

  // 等待页面准备就绪
  async waitForPageReady() {
    return new Promise(resolve => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 1000); // 额外等待1秒确保元素加载
      } else {
        window.addEventListener('load', () => {
          setTimeout(resolve, 1000);
        });
      }
    });
  }

  // 从存储加载设置
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['isRunning', 'playbackSpeed', 'autoAnswer']);
      this.isRunning = result.isRunning ?? true;
      this.playbackSpeed = result.playbackSpeed ?? 1.5;
      this.autoAnswer = result.autoAnswer ?? true;
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  // 监听视频元素
  startVideoObserver() {
    // 初始检测
    this.detectAndSetupVideo();

    // 监听DOM变化，处理动态加载的视频
    this.observer = new MutationObserver(() => {
      this.detectAndSetupVideo();
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 检测并设置视频
  detectAndSetupVideo() {
    if (!this.isRunning) return;

    // 尝试多种选择器找到视频
    const videoSelectors = [
      'video',
      '.ans-attach-ct video',
      '.video  video',
      '#video',
      '.ans-video-player video'
    ];

    let video = null;
    for (const selector of videoSelectors) {
      video = document.querySelector(selector);
      if (video) break;
    }

    if (video && video !== this.currentVideo) {
      this.currentVideo = video;
      this.setupVideo(video);
    }
  }

  // 设置视频播放器
  setupVideo(video) {
    if (!video) return;

    // 设置播放速度
    video.playbackRate = this.playbackSpeed;

    // 如果视频未播放，自动播放
    if (video.paused && this.isRunning) {
      video.play().catch(err => {
        console.log('自动播放被阻止:', err);
      });
    }

    // 监听视频播放事件
    video.addEventListener('play', () => {
      video.playbackRate = this.playbackSpeed;
      this.onVideoPlay(video);
    });

    // 监听视频进度更新
    video.addEventListener('timeupdate', () => {
      this.onTimeUpdate(video);
    });

    // 监听视频结束
    video.addEventListener('ended', () => {
      this.onVideoEnded(video);
    });

    // 监听倍速设置
    video.addEventListener('ratechange', () => {
      if (video.playbackRate !== this.playbackSpeed) {
        video.playbackRate = this.playbackSpeed;
      }
    });
  }

  // 视频开始播放
  onVideoPlay(video) {
    console.log('视频开始播放，倍速:', this.playbackSpeed);
    // 持续确保倍速设置
    setInterval(() => {
      if (video.playbackRate !== this.playbackSpeed) {
        video.playbackRate = this.playbackSpeed;
      }
    }, 1000);
  }

  // 视频进度更新
  onTimeUpdate(video) {
    // 检测答题弹窗
    if (this.autoAnswer) {
      this.checkAndAnswerQuestion();
    }
  }

  // 检测并答题
  checkAndAnswerQuestion() {
    // 学习通答题弹窗的选择器
    const questionSelectors = [
      '.answer-tag', // 答题标签
      '.TiKu_dialog', // 题库弹窗
      '.ans-video-quiz', // 视频答题
      '.ans-paper-quiz', // 试卷答题
      '.quiz_option', // 答题选项
      'input[type="radio"]', // 单选按钮
      'input[type="checkbox"]' // 多选按钮
    ];

    let questionElement = null;
    for (const selector of questionSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // 过滤掉隐藏的元素
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            questionElement = el;
            break;
          }
        }
        if (questionElement) break;
      }
    }

    if (questionElement) {
      this.autoAnswerQuestion();
    }
  }

  // 自动答题逻辑
  autoAnswerQuestion() {
    // 尝试点击第一个选项（常见策略）
    try {
      // 查找所有单选按钮和复选框
      const radios = document.querySelectorAll('input[type="radio"]');
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');

      if (radios.length > 0) {
        // 随机选择答案（模拟）
        const randomIndex = Math.floor(Math.random() * radios.length);
        radios[randomIndex].click();
        console.log('自动答题：已选择单选答案');
      } else if (checkboxes.length > 0) {
        // 多选题：尝试选择多个选项
        const indices = [];
        const numToSelect = Math.ceil(checkboxes.length / 2);
        while (indices.length < numToSelect) {
          const idx = Math.floor(Math.random() * checkboxes.length);
          if (!indices.includes(idx)) {
            indices.push(idx);
          }
        }
        indices.forEach(idx => checkboxes[idx].click());
        console.log('自动答题：已选择多选答案');
      }

      // 尝试点击确认按钮
      const confirmButtons = document.querySelectorAll('button');
      for (const btn of confirmButtons) {
        const text = btn.textContent?.trim();
        if (text === '确定' || text === '提交' || text === '下一题') {
          setTimeout(() => btn.click(), 500);
          break;
        }
      }
    } catch (error) {
      console.log('自动答题失败:', error);
    }
  }

  // 视频播放结束
  onVideoEnded(video) {
    console.log('视频播放完成');

    // 尝试自动切换到下一个视频/章节
    setTimeout(() => {
      this.goToNextChapter();
    }, 1500);
  }

  // 切换到下一章节
  goToNextChapter() {
    // 尝试多种选择器
    const nextButtonSelectors = [
      '.jb_btn.js-next',
      '.nextBtn',
      '.next_chapter',
      '.next',
      'button[data-type="next"]',
      'a[title="下一节"]',
      'div[aria-label="下一节"]',
      '.catalog_next'
    ];

    for (const selector of nextButtonSelectors) {
      const nextBtn = document.querySelector(selector);
      if (nextBtn) {
        console.log('找到下一章节按钮:', selector);
        nextBtn.click();
        // 等待视频加载
        setTimeout(() => {
          this.detectAndSetupVideo();
        }, 3000);
        break;
      }
    }
  }

  // 更新设置
  updateSettings(settings) {
    if (settings.isRunning !== undefined) {
      this.isRunning = settings.isRunning;
    }
    if (settings.playbackSpeed !== undefined) {
      this.playbackSpeed = settings.playbackSpeed;
    }
    if (settings.autoAnswer !== undefined) {
      this.autoAnswer = settings.autoAnswer;
    }

    // 应用新的倍速设置
    if (this.currentVideo) {
      this.currentVideo.playbackRate = this.playbackSpeed;
    }
  }
}

// 初始化插件
let autoPlayer = null;

// 等待DOM加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    autoPlayer = new XueXiTongAutoPlayer();
  });
} else {
  autoPlayer = new XueXiTongAutoPlayer();
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_SETTINGS') {
    if (autoPlayer) {
      autoPlayer.updateSettings(message.settings);
      sendResponse({ success: true });
    }
  } else if (message.type === 'GET_STATUS') {
    sendResponse({
      isRunning: autoPlayer?.isRunning ?? false,
      playbackSpeed: autoPlayer?.playbackSpeed ?? 1.5,
      autoAnswer: autoPlayer?.autoAnswer ?? true
    });
  }
  return true;
});
