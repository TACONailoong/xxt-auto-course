// 学习通自动刷课插件 - 内容脚本
// 功能：自动播放视频、倍速播放、自动答题、自动切换下一章节
// 说明：学习通的视频播放器位于嵌套 iframe 中，本脚本通过 manifest 的
// all_frames 配置注入到每一个 frame，各 frame 独立处理自己内部的视频。

(() => {
  'use strict';

  // 同一个 frame 重复注入时直接跳过
  if (window.__xxtAutoPlayerLoaded) return;
  window.__xxtAutoPlayerLoaded = true;

  const DEFAULT_SETTINGS = {
    isRunning: true,
    playbackSpeed: 1.5,
    autoAnswer: true
  };

  class XueXiTongAutoPlayer {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      // 记录已绑定过事件的视频，避免重复绑定监听器
      this.managedVideos = new WeakSet();
      this.observer = null;
      this.tickTimer = null;
      this.lastAnswerAt = 0;
      this.init();
    }

    async init() {
      await this.loadSettings();
      this.watchSettingsChanges();
      this.startObserver();
      // 周期巡检：补救自动播放被暂停、倍速被播放器改回等情况
      this.tickTimer = setInterval(() => this.tick(), 2000);
      this.log('插件已启动', this.settings);
    }

    log(...args) {
      console.log('[学习通助手]', ...args);
    }

    async loadSettings() {
      try {
        const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
      } catch (error) {
        // 扩展上下文失效（如扩展被重载）时保持默认设置
        this.log('加载设置失败:', error);
      }
    }

    // 通过 storage 变更同步设置，弹窗保存后所有 frame 都能立即生效
    watchSettingsChanges() {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (changes[key]) {
            this.settings[key] = changes[key].newValue;
          }
        }
        this.applySettings();
      });
    }

    applySettings() {
      const video = this.findVideo();
      if (!video) return;
      if (this.settings.isRunning) {
        video.playbackRate = this.settings.playbackSpeed;
        if (video.paused && !video.ended) {
          this.tryPlay(video);
        }
      } else if (!video.paused) {
        video.pause();
      }
    }

    startObserver() {
      this.scanForVideos();
      const root = document.body || document.documentElement;
      if (!root) return;
      this.observer = new MutationObserver(() => this.scanForVideos());
      this.observer.observe(root, { childList: true, subtree: true });
    }

    findVideo() {
      return document.querySelector('video');
    }

    scanForVideos() {
      const videos = document.querySelectorAll('video');
      for (const video of videos) {
        if (!this.managedVideos.has(video)) {
          this.managedVideos.add(video);
          this.setupVideo(video);
        }
      }
    }

    setupVideo(video) {
      this.log('检测到视频，开始接管');

      video.addEventListener('play', () => {
        if (this.settings.isRunning) {
          video.playbackRate = this.settings.playbackSpeed;
        }
      });

      // 播放器把倍速改回去时再改回来
      video.addEventListener('ratechange', () => {
        if (
          this.settings.isRunning &&
          Math.abs(video.playbackRate - this.settings.playbackSpeed) > 0.01
        ) {
          video.playbackRate = this.settings.playbackSpeed;
        }
      });

      video.addEventListener('ended', () => {
        this.log('视频播放完成');
        if (this.settings.isRunning) {
          setTimeout(() => this.goToNextChapter(), 2000);
        }
      });

      if (this.settings.isRunning) {
        video.playbackRate = this.settings.playbackSpeed;
        this.tryPlay(video);
      }
    }

    // 浏览器自动播放策略可能拦截有声播放，被拦截时改为静音播放
    tryPlay(video) {
      const playPromise = video.play();
      if (!playPromise || !playPromise.catch) return;
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(err => {
          this.log('自动播放被浏览器阻止，请手动点击一次播放:', err && err.name);
        });
      });
    }

    tick() {
      if (!this.settings.isRunning) return;

      const video = this.findVideo();
      if (video) {
        if (Math.abs(video.playbackRate - this.settings.playbackSpeed) > 0.01) {
          video.playbackRate = this.settings.playbackSpeed;
        }
        // 视频被暂停（如答题弹窗关闭后未恢复）时自动继续播放
        if (video.paused && !video.ended && video.readyState >= 2) {
          this.tryPlay(video);
        }
      }

      if (this.settings.autoAnswer) {
        this.checkAndAnswerQuestion();
      }
    }

    // ---------- 自动答题 ----------

    checkAndAnswerQuestion() {
      // 距上次作答太近则跳过，避免重复点击同一道题
      if (Date.now() - this.lastAnswerAt < 3000) return;

      const dialog = this.findQuestionDialog();
      if (!dialog) return;

      const answered = this.answerQuestion(dialog);
      if (answered) {
        this.lastAnswerAt = Date.now();
      }
    }

    findQuestionDialog() {
      // 学习通视频内答题弹窗常见容器
      const selectors = [
        '.ans-timelineobjects',
        '.ans-videoquiz',
        '.tkTopic',
        '.TiKu_dialog',
        '.popDiv'
      ];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (this.isVisible(el) && el.querySelector('input[type="radio"], input[type="checkbox"]')) {
            return el;
          }
        }
      }
      // 兜底：页面上任何可见的、带选项的区域
      const anyInput = document.querySelector('input[type="radio"], input[type="checkbox"]');
      if (anyInput && this.isVisible(anyInput)) {
        return anyInput.closest('form, div') || document.body;
      }
      return null;
    }

    isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    answerQuestion(container) {
      try {
        const radios = [...container.querySelectorAll('input[type="radio"]')].filter(el =>
          this.isVisible(el)
        );
        const checkboxes = [...container.querySelectorAll('input[type="checkbox"]')].filter(el =>
          this.isVisible(el)
        );

        let selected = false;

        if (radios.length > 0) {
          if (!radios.some(r => r.checked)) {
            const pick = radios[Math.floor(Math.random() * radios.length)];
            pick.click();
            this.log('自动答题：随机选择了一个单选答案');
          }
          selected = true;
        } else if (checkboxes.length > 0) {
          if (!checkboxes.some(c => c.checked)) {
            const count = Math.max(1, Math.ceil(checkboxes.length / 2));
            const shuffled = [...checkboxes].sort(() => Math.random() - 0.5);
            shuffled.slice(0, count).forEach(box => box.click());
            this.log('自动答题：随机选择了多选答案');
          }
          selected = true;
        }

        if (!selected) return false;

        // 延迟点击提交按钮，等待选项状态生效
        setTimeout(() => this.clickSubmitButton(container), 600);
        return true;
      } catch (error) {
        this.log('自动答题失败:', error);
        return false;
      }
    }

    clickSubmitButton(container) {
      const keywords = ['提交', '确定', '确认', '关闭', '继续学习'];
      const candidates = [
        ...container.querySelectorAll('a, button, input[type="button"], input[type="submit"], .btnSubmit')
      ];
      for (const btn of candidates) {
        const text = (btn.textContent || btn.value || '').trim();
        if (keywords.some(k => text.includes(k)) && this.isVisible(btn)) {
          btn.click();
          this.log('自动答题：已点击提交按钮 -', text);
          return;
        }
      }
    }

    // ---------- 章节切换 ----------

    goToNextChapter() {
      const selectors = [
        '#prevNextFocusNext',
        '.prev_next.next',
        '.jb_btn.js-next',
        '.nextChapter',
        '.next_chapter',
        'a[title="下一节"]',
        'div[title="下一节"]',
        '.orientationright'
      ];

      // 章节切换按钮在顶层页面，iframe 内找不到时通知顶层处理
      for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn && this.isVisible(btn)) {
          this.log('切换到下一章节:', selector);
          btn.click();
          return;
        }
      }

      if (window.top !== window.self) {
        try {
          window.parent.postMessage({ type: 'XXT_GO_NEXT_CHAPTER' }, '*');
        } catch (error) {
          this.log('通知顶层页面切换章节失败:', error);
        }
      } else {
        this.log('未找到下一章节按钮，可能已是最后一节');
      }
    }
  }

  const player = new XueXiTongAutoPlayer();

  // 接收 iframe 发来的"切换下一章"请求（只在顶层页面处理）
  window.addEventListener('message', event => {
    if (event.data && event.data.type === 'XXT_GO_NEXT_CHAPTER' && window.top === window.self) {
      player.goToNextChapter();
    }
  });

  // 响应弹窗的状态查询
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'GET_STATUS') {
      sendResponse({
        ...player.settings,
        hasVideo: !!player.findVideo()
      });
    }
    // 同步应答，无需保持消息通道
    return false;
  });
})();
