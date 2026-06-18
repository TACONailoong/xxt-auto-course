// 学习通自动刷课插件 - 内容脚本 (content.js)
// 修复：支持 iframe 视频、学习通自定义 DOM、事件分发、SPA 导航

(function () {
  'use strict';

  // 避免在同一 frame 中重复初始化
  if (window.__XXT_AUTO_PLAYER_LOADED__) return;
  window.__XXT_AUTO_PLAYER_LOADED__ = true;

  const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // 触发真实点击事件（兼容 Vue/React 框架的事件监听）
  function realClick(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      el.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
      }));
      el.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
      }));
      el.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
      }));
      return true;
    } catch (e) {
      try {
        el.click();
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  // 判断元素是否可见
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || +style.opacity === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  class AutoPlayer {
    constructor() {
      this.settings = {
        isRunning: false,
        playbackSpeed: 1.5,
        autoAnswer: true,
        answerMode: 'random',
        apiUrl: '',
        apiKey: ''
      };
      this.currentVideo = null;
      this.answeredQuestionIds = new Set();
      this.isAnswering = false;
      this.lastAnswerAttempt = 0;
      this.speedLockInterval = null;
      this.observer = null;
      this.quizBank = null;
      this.init();
    }

    async init() {
      await this.loadSettings();
      await this.loadQuizBank();
      this.startWatching();
      this.startNavigationWatch();
      // 定期检查是否需要播放视频（处理延迟加载）
      setInterval(() => {
        if (this.settings.isRunning) {
          this.ensureVideoPlaying();
        }
      }, 3000);

      // 定期检查是否需要切换章节
      setInterval(() => {
        if (this.settings.isRunning) {
          this.checkAndGoNext();
        }
      }, 5000);

      console.log('%c[学习通自动刷课] 已启用', 'color:#10b981;font-weight:bold', this.settings);
    }

    async loadSettings() {
      try {
        const result = await chrome.storage.sync.get([
          'isRunning', 'playbackSpeed', 'autoAnswer',
          'answerMode', 'apiUrl', 'apiKey'
        ]);
        this.settings.isRunning = result.isRunning ?? false;
        this.settings.playbackSpeed = result.playbackSpeed ?? 1.5;
        this.settings.autoAnswer = result.autoAnswer ?? true;
        this.settings.answerMode = result.answerMode ?? 'random';
        this.settings.apiUrl = result.apiUrl ?? '';
        this.settings.apiKey = result.apiKey ?? '';
      } catch (e) {
        console.error('[学习通自动刷课] 加载设置失败', e);
      }
    }

    async loadQuizBank() {
      try {
        const url = chrome.runtime.getURL('quiz-bank.json');
        const response = await fetch(url);
        if (response.ok) {
          this.quizBank = await response.json();
        }
      } catch (e) {
        // 题库加载失败不影响主流程
      }
    }

    // 设置观察者监听 DOM 变化
    startWatching() {
      // 立即执行一次
      this.detectAndSetupVideo();
      this.detectAndAnswerQuestion();

      if (this.observer) return;
      this.observer = new MutationObserver(() => {
        this.detectAndSetupVideo();
        this.detectAndAnswerQuestion();
      });
      this.observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
    }

    // 监听 URL 变化（SPA 导航）
    startNavigationWatch() {
      let lastUrl = location.href;
      setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          this.currentVideo = null;
          this.answeredQuestionIds.clear();
          // URL 变化后延迟重新检测
          setTimeout(() => this.detectAndSetupVideo(), 2000);
        }
      }, 2000);
    }

    // 查找视频元素（包括在 iframe 中）
    findVideoElement() {
      // 1. 直接在当前文档查找
      let video = document.querySelector('video');
      if (video && isVisible(video)) return video;

      // 2. 查找多个可能的 video 容器
      const videoSelectors = [
        'video',
        '.ans-attach-ct video',
        '.ans-video video',
        '.video-box video',
        '.video-wrapper video',
        '.player video',
        '.video-player video',
        '.vjs-tech',
        '#video_html5_api',
        'video.video-js'
      ];

      for (const sel of videoSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      }

      // 3. 遍历所有 video
      const allVideos = document.querySelectorAll('video');
      for (const v of allVideos) {
        if (isVisible(v) && v.src) return v;
      }

      return null;
    }

    // 检测并设置视频
    detectAndSetupVideo() {
      if (!this.settings.isRunning) return;

      const video = this.findVideoElement();
      if (video && video !== this.currentVideo) {
        this.currentVideo = video;
        this.setupVideo(video);
        console.log('[学习通自动刷课] 找到视频元素');
      }
    }

    setupVideo(video) {
      if (!video) return;

      // 倍速锁定 - 定期强制设置倍速
      if (this.speedLockInterval) clearInterval(this.speedLockInterval);
      this.speedLockInterval = setInterval(() => {
        if (this.currentVideo && this.settings.isRunning) {
          if (this.currentVideo.playbackRate !== this.settings.playbackSpeed) {
            try {
              this.currentVideo.playbackRate = this.settings.playbackSpeed;
            } catch (e) {
              try {
                Object.defineProperty(this.currentVideo, 'playbackRate', {
                  value: this.settings.playbackSpeed,
                  writable: true
                });
              } catch (e2) {}
            }
          }
        }
      }, 1000);

      // 尝试播放
      setTimeout(() => {
        video.playbackRate = this.settings.playbackSpeed;
        if (video.paused && this.settings.isRunning) {
          const playPromise = video.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(err => {
              console.log('[学习通自动刷课] 自动播放被阻止，尝试模拟点击');
              // 尝试模拟点击播放按钮
              const playBtn = document.querySelector('.vjs-big-play-button, .play-btn, .play-btn-icon, [class*="play"]');
              if (playBtn && isVisible(playBtn)) realClick(playBtn);
            });
          }
        }
      }, randomDelay(500, 1500));

      // 监听视频事件
      video.addEventListener('play', () => {
        video.playbackRate = this.settings.playbackSpeed;
      });
      video.addEventListener('ratechange', () => {
        if (video.playbackRate !== this.settings.playbackSpeed) {
          video.playbackRate = this.settings.playbackSpeed;
        }
      });
      video.addEventListener('timeupdate', () => {
        // 持续锁定倍速
        if (video.playbackRate !== this.settings.playbackSpeed) {
          try { video.playbackRate = this.settings.playbackSpeed; } catch (e) {}
        }
        // 检查答题
        if (this.settings.autoAnswer) {
          this.detectAndAnswerQuestion();
        }
      });
      video.addEventListener('ended', () => {
        console.log('[学习通自动刷课] 视频播放完成，准备进入下一节');
        setTimeout(() => {
          this.goToNextChapter();
        }, 1500);
      });
      video.addEventListener('pause', () => {
        // 如果视频被暂停但不是因为结束，尝试恢复播放
        if (!video.ended && this.settings.isRunning) {
          setTimeout(() => {
            // 检查是否有答题弹窗阻挡
            const hasPopup = this.hasAnswerPopup();
            if (!hasPopup && this.settings.isRunning) {
              video.play().catch(() => {});
            }
          }, 1000);
        }
      });
    }

    // 确保视频正在播放
    ensureVideoPlaying() {
      if (!this.currentVideo) {
        this.detectAndSetupVideo();
      }
      if (this.currentVideo && this.currentVideo.paused && !this.currentVideo.ended && this.settings.isRunning) {
        const hasPopup = this.hasAnswerPopup();
        if (!hasPopup) {
          this.currentVideo.play().catch(() => {});
        }
      }
    }

    // 是否有答题弹窗
    hasAnswerPopup() {
      const popupSelectors = [
        '.ans-videoquiz-title',
        '.ans-videoquiz-wrap',
        '.ans-videoquiz-opt',
        '.ans-popup-tips',
        '[class*="videoquiz"]',
        '[class*="quiz"]',
        '.ans-ques',
        '.ans-question'
      ];
      for (const sel of popupSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return true;
      }
      return false;
    }

    // 检测是否有题目，并答题
    detectAndAnswerQuestion() {
      if (!this.settings.isRunning || !this.settings.autoAnswer) return;
      if (this.isAnswering) return;

      // 节流：至少间隔 1 秒才检查一次
      const now = Date.now();
      if (now - this.lastAnswerAttempt < 1500) return;
      this.lastAnswerAttempt = now;

      const questionInfo = this.findQuestion();
      if (!questionInfo) return;

      // 防止重复答同一题（通过选项数量 + 题目前几个字符）
      const qId = `${questionInfo.options.length}_${questionInfo.text.substring(0, 20)}`;
      if (this.answeredQuestionIds.has(qId)) return;

      console.log('[学习通自动刷课] 检测到题目:', questionInfo.text.substring(0, 30));
      this.isAnswering = true;
      this.answeredQuestionIds.add(qId);

      this.answerQuestion(questionInfo).then(() => {
        setTimeout(() => {
          this.isAnswering = false;
        }, 2000);
      }).catch(() => {
        this.isAnswering = false;
      });
    }

    // 查找题目
    findQuestion() {
      // 遍历所有可能的题目容器
      const quizContainers = [
        '.ans-videoquiz-wrap',
        '.ans-videoquiz-title',
        '.ans-videoquiz-question',
        '.ans-paper-quiz',
        '.ans-tiku',
        '[class*="quiz"]',
        '[class*="question"]',
        '.ans-question',
        '.ans-ques'
      ];

      let questionText = '';
      let options = [];

      // 1. 获取题目文本
      const textSelectors = [
        '.ans-videoquiz-title',
        '.ans-videoquiz-question .title',
        '.ans-videoquiz-question-title',
        '[class*="question-title"]',
        '.quiz_question',
        '.question-title',
        '.question_text',
        '.ans-question-text',
        'h3',
        '.title'
      ];
      for (const sel of textSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el) && el.textContent.trim().length > 2) {
          questionText = el.textContent.trim();
          break;
        }
      }

      // 2. 获取选项（支持多种结构：自定义 radio、input[type=radio]、li、div）
      options = this.findOptions();

      if (options.length > 0) {
        return { text: questionText, options: options };
      }
      return null;
    }

    // 查找选项
    findOptions() {
      const options = [];
      const seen = new Set();

      // 方法1：查找原生 radio
      const radios = document.querySelectorAll('input[type="radio"]');
      radios.forEach(r => {
        if (isVisible(r) && !seen.has(r)) {
          seen.add(r);
          options.push({ element: r, text: r.parentElement?.textContent?.trim() || '', type: 'radio' });
        }
      });

      // 方法2：查找原生 checkbox
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(c => {
        if (isVisible(c) && !seen.has(c)) {
          seen.add(c);
          options.push({ element: c, text: c.parentElement?.textContent?.trim() || '', type: 'checkbox' });
        }
      });

      // 方法3：查找学习通风格的自定义选项
      const customOptionSelectors = [
        '.ans-videoquiz-opt',
        '[class*="videoquiz-opt"]',
        '[class*="quiz-option"]',
        '[class*="quiz_option"]',
        '[class*="option-item"]',
        '.ans-opt',
        '.option-item'
      ];

      for (const sel of customOptionSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if (isVisible(el) && !seen.has(el)) {
            seen.add(el);
            options.push({ element: el, text: el.textContent.trim(), type: 'custom' });
          }
        });
      }

      // 方法4：查找包含字母 A. B. C. D. 等的选项
      const labelSelectors = ['li', '.choice', '.choices div'];
      for (const sel of labelSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if (isVisible(el) && !seen.has(el)) {
            const text = el.textContent.trim();
            if (/^[A-F][\.、\)]/.test(text) || /^[（(][A-F][）)]/.test(text)) {
              seen.add(el);
              options.push({ element: el, text: text, type: 'custom' });
            }
          }
        });
      }

      return options;
    }

    // 执行答题逻辑
    async answerQuestion(questionInfo) {
      const { options } = questionInfo;
      const mode = this.settings.answerMode;

      let selectedIndex = -1;
      let selectedIndices = []; // 多选题

      // 尝试从题库匹配
      if (mode === 'bank' && this.quizBank && this.quizBank.questions) {
        const matched = this.matchQuizBank(questionInfo.text);
        if (matched) {
          if (matched.answer && matched.answer.length === 1) {
            const idx = matched.answer.toUpperCase().charCodeAt(0) - 65;
            if (idx >= 0 && idx < options.length) {
              selectedIndex = idx;
              console.log('[学习通自动刷课] 题库匹配，选择:', String.fromCharCode(65 + idx));
            }
          } else if (matched.answer && matched.answer.length > 1) {
            for (const ch of matched.answer.toUpperCase()) {
              const idx = ch.charCodeAt(0) - 65;
              if (idx >= 0 && idx < options.length) {
                selectedIndices.push(idx);
              }
            }
            console.log('[学习通自动刷课] 题库匹配（多选），选择:', matched.answer);
          }
        }
      }

      // AI 答题模式
      if (mode === 'ai' && this.settings.apiUrl && this.settings.apiKey && selectedIndex === -1 && selectedIndices.length === 0) {
        try {
          const aiAnswer = await this.askAI(questionInfo.text, questionInfo.options);
          if (aiAnswer) {
            const aiAnswerUpper = aiAnswer.toUpperCase();
            if (aiAnswerUpper.length === 1) {
              const idx = aiAnswerUpper.charCodeAt(0) - 65;
              if (idx >= 0 && idx < options.length) {
                selectedIndex = idx;
                console.log('[学习通自动刷课] AI 选择:', aiAnswerUpper);
              }
            } else {
              for (const ch of aiAnswerUpper) {
                const idx = ch.charCodeAt(0) - 65;
                if (idx >= 0 && idx < options.length) {
                  selectedIndices.push(idx);
                }
              }
              if (selectedIndices.length > 0) {
                console.log('[学习通自动刷课] AI 选择（多选）:', aiAnswerUpper);
              }
            }
          }
        } catch (e) {
          console.log('[学习通自动刷课] AI 调用失败，回退随机');
        }
      }

      // 回退到随机
      if (selectedIndex === -1 && selectedIndices.length === 0) {
        selectedIndex = Math.floor(Math.random() * options.length);
        console.log('[学习通自动刷课] 随机选择:', String.fromCharCode(65 + selectedIndex));
      }

      // 执行点击
      setTimeout(() => {
        if (selectedIndex >= 0) {
          realClick(options[selectedIndex].element);
        } else if (selectedIndices.length > 0) {
          selectedIndices.forEach(i => realClick(options[i].element));
        }

        // 提交答案
        setTimeout(() => this.submitAnswer(), randomDelay(800, 1500));
      }, randomDelay(400, 1000));
    }

    // 匹配题库
    matchQuizBank(questionText) {
      if (!this.quizBank?.questions) return null;
      for (const q of this.quizBank.questions) {
        if (q.keywords && Array.isArray(q.keywords)) {
          const matched = q.keywords.some(kw => questionText.includes(kw));
          if (matched) return q;
        }
      }
      return null;
    }

    // 调用 AI
    async askAI(questionText, options) {
      const optionText = options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt.text.substring(0, 100)}`).join('\n');
      const prompt = `题目：${questionText}\n\n选项：\n${optionText}\n\n请只输出正确选项的字母（如 A、B、C、D，多选则如 AB、ACD），不要其他内容。`;

      try {
        const response = await fetch(this.settings.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.settings.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 30
          })
        });

        if (!response.ok) return null;
        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content?.trim() || '';
        const match = answer.match(/[A-F]+/);
        return match ? match[0] : null;
      } catch (e) {
        return null;
      }
    }

    // 提交答案
    submitAnswer() {
      const submitSelectors = [
        '.ans-videoquiz-submit',
        '[class*="submit"]',
        'button:has(> span)',
        '.ans-videoquiz-btn',
        '.btn-primary'
      ];

      // 1. 按文字匹配
      const allButtons = document.querySelectorAll('button, [role="button"], .btn, [class*="btn"]');
      for (const btn of allButtons) {
        const text = btn.textContent?.trim() || '';
        if (isVisible(btn)) {
          if (/提交|确定|下一题|继续|完成|确认/.test(text)) {
            realClick(btn);
            console.log('[学习通自动刷课] 点击提交:', text);
            return;
          }
        }
      }

      // 2. 按 CSS 类匹配
      for (const sel of submitSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
          realClick(el);
          return;
        }
      }
    }

    // 检查并切换到下一章（当视频播放完成或当前章节已看完）
    checkAndGoNext() {
      if (this.currentVideo && !this.currentVideo.ended) return;
      // 检查进度条是否已满
      if (this.currentVideo) {
        if (this.currentVideo.ended) this.goToNextChapter();
      }
    }

    // 切换到下一章节
    goToNextChapter() {
      const nextSelectors = [
        '.jb_btn.js-next',
        '.nextChapter',
        '.next-chapter',
        '[class*="next-chapter"]',
        '.nextChapter_btn',
        '.chapter-next',
        'a[title*="下一节"]',
        'a[title*="下一"]',
        'button[aria-label*="下一节"]',
        '.prev_next .next',
        '.chapter-item.active + .chapter-item a',
        '.ans-job-next'
      ];

      // 1. 尝试各种选择器
      for (const sel of nextSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
          console.log('[学习通自动刷课] 点击下一章:', sel);
          realClick(el);
          this.currentVideo = null;
          return;
        }
      }

      // 2. 按文字匹配
      const allClickable = document.querySelectorAll('a, button, [role="button"], .btn, div');
      for (const el of allClickable) {
        const text = el.textContent?.trim() || '';
        if (isVisible(el) && /下一节|下一章|下一节|下一题|下一讲|^下$/.test(text) && text.length < 10) {
          console.log('[学习通自动刷课] 文字匹配下一章:', text);
          realClick(el);
          this.currentVideo = null;
          return;
        }
      }

      // 3. 尝试在侧边栏目录中找到当前项并点击下一个
      try {
        const chapterItems = document.querySelectorAll('.chapter-item, .catalog-item, [class*="chapter"], [class*="catalog"]');
        let foundActive = false;
        for (const item of chapterItems) {
          if (foundActive && isVisible(item)) {
            const link = item.querySelector('a, button') || item;
            realClick(link);
            this.currentVideo = null;
            return;
          }
          if (item.classList.contains('active') || item.classList.contains('playing')) {
            foundActive = true;
          }
        }
      } catch (e) {}

      console.log('[学习通自动刷课] 未找到下一章按钮，可能已是最后一节');
    }

    // 更新设置
    updateSettings(newSettings) {
      Object.assign(this.settings, newSettings);
      console.log('[学习通自动刷课] 设置已更新', this.settings);

      // 立即应用倍速
      if (this.currentVideo) {
        try {
          this.currentVideo.playbackRate = this.settings.playbackSpeed;
        } catch (e) {}
      }

      // 如果开启运行，立即检测视频
      if (this.settings.isRunning) {
        this.detectAndSetupVideo();
      }
    }
  }

  // 启动
  let player = null;
  const startPlayer = () => {
    if (player) return;
    player = new AutoPlayer();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPlayer, { once: true });
  } else {
    startPlayer();
  }

  // 监听 popup 消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_SETTINGS') {
      if (player) {
        player.updateSettings(message.settings);
      }
      sendResponse({ success: true });
      return true;
    }
    if (message.type === 'GET_STATUS') {
      sendResponse({
        isRunning: player?.settings.isRunning ?? false,
        playbackSpeed: player?.settings.playbackSpeed ?? 1.5,
        hasVideo: !!player?.currentVideo
      });
      return true;
    }
  });
})();
