// 学习通自动刷课插件 - 内容脚本
// 通过 manifest 的 all_frames 注入到每一个 frame。
// 顶层页面负责：状态浮层、目录切换、步骤页签、测验跳过、防挂机弹窗。
// 内层 frame 负责：视频接管、答题、文档滚动。

(() => {
  'use strict';

  if (window.__xxtAutoPlayerLoaded) return;
  window.__xxtAutoPlayerLoaded = true;

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

  const IS_TOP = window.top === window.self;
  const STATUS_KEY =
    (typeof XXT_STATUS_KEY !== 'undefined' && XXT_STATUS_KEY) || 'xxtRuntimeStatus';
  const LOG_KEY = (typeof XXT_LOG_KEY !== 'undefined' && XXT_LOG_KEY) || 'xxtActivityLog';
  const LOG_LIMIT = (typeof XXT_LOG_LIMIT !== 'undefined' && XXT_LOG_LIMIT) || 40;

  class XueXiTongAutoPlayer {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.managedVideos = new WeakSet();
      this.observer = null;
      this.tickTimer = null;
      this.lastAnswerAt = 0;
      this.lastNextAt = 0;
      this.lastDocScrollAt = 0;
      this.lastIdleDismissAt = 0;
      this.nextPending = false;
      this.stallLastTime = 0;
      this.stallLastWall = 0;
      this.status = {
        phase: 'idle',
        detail: '等待课程页面…',
        hasVideo: false,
        progress: 0,
        updatedAt: Date.now()
      };
      this.hud = null;
      this.init();
    }

    async init() {
      await this.loadSettings();
      this.watchSettingsChanges();
      this.startObserver();
      this.tickTimer = setInterval(() => this.tick(), 1500);
      if (IS_TOP) {
        this.ensureHud();
        this.publishStatus();
        this.pushLog('插件已在本页启动');
      }
      this.log('插件已启动', { frame: IS_TOP ? 'top' : 'iframe', ...this.settings });
    }

    log(...args) {
      console.log('[学习通助手]', ...args);
    }

    randomDelay(minMs, maxMs) {
      return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
    }

    async loadSettings() {
      try {
        const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
      } catch (error) {
        this.log('加载设置失败:', error);
      }
    }

    watchSettingsChanges() {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
          if (changes[key]) this.settings[key] = changes[key].newValue;
        }
        this.applySettings();
        if (IS_TOP) {
          this.ensureHud();
          this.updateHud();
        }
      });
    }

    applySettings() {
      const video = this.findVideo();
      if (!video) return;
      if (this.settings.isRunning) {
        video.playbackRate = this.settings.playbackSpeed;
        if (this.settings.mute) video.muted = true;
        if (video.paused && !video.ended) this.tryPlay(video);
      } else if (!video.paused) {
        video.pause();
        this.setStatus('paused', '已暂停自动刷课');
      }
    }

    setStatus(phase, detail, extra = {}) {
      const prevDetail = this.status.detail;
      this.status = {
        ...this.status,
        phase,
        detail,
        ...extra,
        updatedAt: Date.now()
      };
      if (IS_TOP) {
        this.updateHud();
        this.publishStatus();
        if (detail && detail !== prevDetail) this.pushLog(detail);
      }
    }

    async publishStatus() {
      if (!IS_TOP) return;
      try {
        await chrome.storage.local.set({
          [STATUS_KEY]: {
            ...this.status,
            settings: {
              isRunning: this.settings.isRunning,
              playbackSpeed: this.settings.playbackSpeed
            }
          }
        });
        chrome.runtime
          .sendMessage({
            type: 'STATUS_UPDATE',
            isRunning: this.settings.isRunning,
            phase: this.status.phase,
            detail: this.status.detail
          })
          .catch(() => {});
      } catch (_) {
        // 扩展上下文失效时忽略
      }
    }

    async pushLog(message) {
      if (!IS_TOP || !message) return;
      try {
        const result = await chrome.storage.local.get(LOG_KEY);
        const list = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
        list.unshift({ t: Date.now(), message: String(message) });
        await chrome.storage.local.set({ [LOG_KEY]: list.slice(0, LOG_LIMIT) });
      } catch (_) {}
    }

    // ---------- 页面状态浮层（仅顶层） ----------

    ensureHud() {
      if (!IS_TOP || !document.documentElement) return;

      if (!this.settings.showHud) {
        if (this.hud) {
          this.hud.remove();
          this.hud = null;
        }
        return;
      }

      if (this.hud) return;

      const root = document.createElement('div');
      root.id = 'xxt-assistant-hud';
      Object.assign(root.style, {
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: '2147483646',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        fontSize: '12px',
        color: '#fff',
        background: 'rgba(26, 26, 46, 0.92)',
        borderRadius: '12px',
        padding: '12px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(8px)',
        minWidth: '200px',
        pointerEvents: 'auto',
        transition: 'opacity 0.2s ease',
        userSelect: 'none'
      });
      root.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <div style="font-weight:600;">学习通助手</div>
          <div style="display:flex;gap:6px;">
            <button data-role="toggle" type="button" style="border:none;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;background:#334155;color:#fff;">暂停</button>
            <button data-role="hide" type="button" style="border:none;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;background:#334155;color:#fff;">隐藏</button>
          </div>
        </div>
        <div data-role="detail" style="opacity:0.9;line-height:1.4;">初始化中…</div>
        <div data-role="meta" style="margin-top:6px;opacity:0.7;"></div>
      `;

      root.querySelector('[data-role="toggle"]').addEventListener('click', async e => {
        e.stopPropagation();
        try {
          await chrome.storage.sync.set({ isRunning: !this.settings.isRunning });
        } catch (_) {}
      });
      root.querySelector('[data-role="hide"]').addEventListener('click', async e => {
        e.stopPropagation();
        try {
          await chrome.storage.sync.set({ showHud: false });
        } catch (_) {}
      });

      document.documentElement.appendChild(root);
      this.hud = root;
      this.updateHud();
    }

    updateHud() {
      if (!this.settings.showHud) {
        if (this.hud) {
          this.hud.remove();
          this.hud = null;
        }
        return;
      }
      if (!this.hud) return;

      const detail = this.hud.querySelector('[data-role="detail"]');
      const meta = this.hud.querySelector('[data-role="meta"]');
      const toggle = this.hud.querySelector('[data-role="toggle"]');

      toggle.textContent = this.settings.isRunning ? '暂停' : '开始';
      if (!this.settings.isRunning) {
        detail.textContent = '已停止';
        meta.textContent = '点击“开始”或在扩展弹窗中开启';
        this.hud.style.opacity = '0.7';
        return;
      }
      this.hud.style.opacity = '1';
      detail.textContent = this.status.detail || '运行中';
      const parts = [`${this.settings.playbackSpeed}x`];
      if (this.status.hasVideo && this.status.progress > 0) {
        parts.push(`${Math.round(this.status.progress * 100)}%`);
      }
      if (this.settings.mute) parts.push('静音');
      meta.textContent = parts.join(' · ');
    }

    // ---------- 视频检测与接管 ----------

    startObserver() {
      this.scanForVideos();
      const root = document.body || document.documentElement;
      if (!root) return;
      this.observer = new MutationObserver(() => this.scanForVideos());
      this.observer.observe(root, { childList: true, subtree: true });
    }

    findVideo() {
      return (
        document.querySelector('video#video_html5_api') ||
        document.querySelector('video[id*="video_html5"]') ||
        document.querySelector('video')
      );
    }

    scanForVideos() {
      document.querySelectorAll('video').forEach(video => {
        if (!this.managedVideos.has(video)) {
          this.managedVideos.add(video);
          this.setupVideo(video);
        }
      });
    }

    setupVideo(video) {
      this.log('检测到视频，开始接管');
      this.setStatus('playing', '已接管视频', { hasVideo: true });

      video.addEventListener('play', () => {
        if (this.settings.isRunning) {
          video.playbackRate = this.settings.playbackSpeed;
          if (this.settings.mute) video.muted = true;
          this.setStatus('playing', '正在播放', { hasVideo: true });
        }
      });

      video.addEventListener('ratechange', () => {
        if (
          this.settings.isRunning &&
          Math.abs(video.playbackRate - this.settings.playbackSpeed) > 0.01
        ) {
          video.playbackRate = this.settings.playbackSpeed;
        }
      });

      video.addEventListener('timeupdate', () => {
        if (!video.duration) return;
        this.status.progress = video.currentTime / video.duration;
        this.status.hasVideo = true;
      });

      video.addEventListener('ended', () => {
        this.log('视频播放完成');
        this.setStatus('next', '视频结束，准备下一节', { hasVideo: true, progress: 1 });
        if (this.settings.isRunning && this.settings.autoNext) {
          setTimeout(
            () => this.requestNextChapter('video-ended'),
            this.randomDelay(1200, 2200)
          );
        }
      });

      if (this.settings.isRunning) {
        if (this.settings.mute) video.muted = true;
        video.playbackRate = this.settings.playbackSpeed;
        this.tryPlay(video);
      }
    }

    tryPlay(video) {
      if (this.settings.mute) video.muted = true;
      const playPromise = video.play();
      if (!playPromise || !playPromise.catch) return;
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(err => {
          this.log('自动播放被阻止，尝试点击播放按钮:', err && err.name);
          this.clickPlayOverlay();
        });
      });
    }

    clickPlayOverlay() {
      const selectors = [
        '[title="播放视频"]',
        '.vjs-big-play-button',
        '.playButton',
        '.ans-video-play',
        'button.vjs-play-control'
      ];
      for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn && this.isVisible(btn)) {
          this.safeClick(btn);
          this.log('已点击播放按钮:', selector);
          return true;
        }
      }
      return false;
    }

    // ---------- 主循环 ----------

    tick() {
      // 浮层始终可更新；停止时仍允许通过浮层重新开启
      if (IS_TOP) {
        this.ensureHud();
        this.updateHud();
      }

      if (!this.settings.isRunning) return;

      if (IS_TOP) {
        if (this.settings.dismissIdle) this.dismissIdleDialogs();
        this.handleTopFrameTasks();
        if (Date.now() - this.status.updatedAt > 2000) this.publishStatus();
      }

      this.scanForVideos();
      this.clickPlayOverlay();

      const video = this.findVideo();
      if (video) this.guardVideo(video);

      if (this.settings.autoAnswer) this.checkAndAnswerQuestion();
      this.handleDocumentReading();
      this.dismissJobFinishTip();
    }

    guardVideo(video) {
      if (Math.abs(video.playbackRate - this.settings.playbackSpeed) > 0.01) {
        video.playbackRate = this.settings.playbackSpeed;
      }
      if (this.settings.mute && !video.muted) video.muted = true;

      if (video.paused && !video.ended && video.readyState >= 2) {
        this.tryPlay(video);
      }

      if (!video.paused && !video.ended) {
        const now = Date.now();
        const t = video.currentTime || 0;
        if (Math.abs(t - this.stallLastTime) < 0.05) {
          if (this.stallLastWall && now - this.stallLastWall >= 8000) {
            this.log('检测到播放卡顿，尝试恢复');
            this.tryPlay(video);
            this.stallLastWall = now;
          }
        } else {
          this.stallLastTime = t;
          this.stallLastWall = now;
        }
        this.setStatus('playing', '正在播放', {
          hasVideo: true,
          progress: video.duration ? t / video.duration : this.status.progress
        });
      }
    }

    handleTopFrameTasks() {
      if (this.switchToVideoTab()) return;

      if (this.settings.skipQuiz && this.isChapterTest()) {
        this.setStatus('skip', '跳过章节测验');
        this.requestNextChapter('chapter-test');
        return;
      }

      if (this.settings.autoNext && this.isCurrentJobFinished()) {
        this.setStatus('next', '任务点已完成，切换下一节');
        this.requestNextChapter('job-finished');
      }
    }

    currentStepTitle() {
      const el = document.querySelector('.prev_title');
      return el ? (el.getAttribute('title') || el.textContent || '').trim() : '';
    }

    isChapterTest() {
      const title = this.currentStepTitle();
      return title === '章节测验' || title.includes('测验');
    }

    switchToVideoTab() {
      const title = this.currentStepTitle();
      if (title === '视频' || title === '章节测验') return false;

      const tabs = document.querySelectorAll('.prev_white');
      for (const tab of tabs) {
        if (!this.isVisible(tab)) continue;
        const text = (tab.textContent || '').replace(/\s+/g, '');
        if (text === '2视频' || text === '视频' || text.endsWith('视频')) {
          this.log('切换到视频页签:', text);
          this.safeClick(tab);
          this.setStatus('navigate', '已切换到视频步骤');
          return true;
        }
      }
      return false;
    }

    isCurrentJobFinished() {
      const active = document.querySelector('.posCatalog_active');
      if (active) {
        const tip = active.querySelector('.prevHoverTips');
        const text = (tip && tip.textContent) || '';
        if (text.includes('已完成')) return true;
      }
      const jobIcons = document.querySelectorAll('.ans-job-icon');
      if (jobIcons.length === 0) return false;
      const unfinished = document.querySelectorAll(
        '.ans-attach-ct:not(.ans-job-finished) .ans-job-icon'
      );
      return unfinished.length === 0;
    }

    // ---------- 防挂机 / 提示弹窗 ----------

    dismissIdleDialogs() {
      if (Date.now() - this.lastIdleDismissAt < 2500) return false;

      const keywords = ['继续学习', '我知道了', '知道了', '继续', '关闭'];
      const roots = document.querySelectorAll(
        '.maskDiv, .popDiv, .dialog-mask, .el-message-box, .el-dialog, .ant-modal, .layui-layer'
      );

      const clickIfMatch = (root) => {
        const buttons = root.querySelectorAll('a, button, .jb_btn, .btn, span, div');
        for (const btn of buttons) {
          if (!this.isVisible(btn)) continue;
          const text = (btn.textContent || '').replace(/\s+/g, '');
          if (!text || text.length > 12) continue;
          if (keywords.some(k => text === k || text.includes(k))) {
            // 避免误点目录/导航里的“下一节”
            if (btn.closest('#coursetree, .posCatalog_select')) continue;
            this.safeClick(btn);
            this.lastIdleDismissAt = Date.now();
            this.log('已关闭提示弹窗:', text);
            this.setStatus('dialog', `已关闭提示：${text}`);
            return true;
          }
        }
        return false;
      };

      for (const root of roots) {
        if (!this.isVisible(root) && !root.classList.contains('maskDiv')) continue;
        // maskDiv 有时 opacity/尺寸特殊，只要包含关键词按钮就点
        if (clickIfMatch(root)) return true;
      }

      // 兜底：全局找“继续学习”
      for (const btn of document.querySelectorAll('a, button, .jb_btn')) {
        const text = (btn.textContent || '').replace(/\s+/g, '');
        if ((text === '继续学习' || text === '我知道了') && this.isVisible(btn)) {
          this.safeClick(btn);
          this.lastIdleDismissAt = Date.now();
          this.setStatus('dialog', `已关闭提示：${text}`);
          return true;
        }
      }
      return false;
    }

    dismissJobFinishTip() {
      const tipNext = document.querySelector(
        '.jb_btn.jb_btn_92.fr.fs14.nextChapter, .maskDiv .nextChapter, .nextChapter'
      );
      if (tipNext && this.isVisible(tipNext)) {
        this.log('点击完成提示中的下一章按钮');
        this.safeClick(tipNext);
        return true;
      }
      return false;
    }

    // ---------- 文档阅读 ----------

    handleDocumentReading() {
      const boxes = document.querySelectorAll('.fileBox, .imgLook, .doc-reader, #img');
      if (!boxes.length) return;
      if (Date.now() - this.lastDocScrollAt < 2000) return;
      this.lastDocScrollAt = Date.now();

      for (const box of boxes) {
        if (!this.isVisible(box)) continue;
        const scrollable =
          box.querySelector('.scrollbar, .imgLook, .reader-container') || box;
        const canScroll = scrollable.scrollHeight > scrollable.clientHeight + 20;
        if (canScroll) {
          const nearBottom =
            scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 40;
          if (nearBottom) {
            if (this.settings.autoNext) this.requestNextChapter('document-done');
          } else {
            scrollable.scrollTop = Math.min(
              scrollable.scrollTop + Math.max(200, scrollable.clientHeight * 0.8),
              scrollable.scrollHeight
            );
            this.setStatus('reading', '正在阅读文档');
          }
        }
        break;
      }
    }

    // ---------- 自动答题 ----------

    checkAndAnswerQuestion() {
      if (Date.now() - this.lastAnswerAt < 3000) return;
      const dialog = this.findQuestionDialog();
      if (!dialog) return;
      if (this.answerQuestion(dialog)) {
        this.lastAnswerAt = Date.now();
        this.setStatus('answer', '已自动作答弹窗题');
      }
    }

    findQuestionDialog() {
      const selectors = [
        '.ans-timelineobjects',
        '.ans-videoquiz',
        '.tkTopic',
        '.TiKu_dialog',
        '.popDiv',
        '.ans-videoquizwrap'
      ];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (
            this.isVisible(el) &&
            el.querySelector(
              'input[type="radio"], input[type="checkbox"], .ans-videoquiz-opt'
            )
          ) {
            return el;
          }
        }
      }
      const anyInput = document.querySelector('input[type="radio"], input[type="checkbox"]');
      if (anyInput && this.isVisible(anyInput)) {
        return anyInput.closest('form, .tkTopic, .ans-videoquiz, div') || document.body;
      }
      return null;
    }

    isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    safeClick(el) {
      if (!el) return;
      try {
        el.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
        );
        if (typeof el.click === 'function') el.click();
      } catch (_) {
        try {
          el.click();
        } catch (__) {}
      }
    }

    answerQuestion(container) {
      try {
        const optionNodes = [
          ...container.querySelectorAll(
            'input[type="radio"], input[type="checkbox"], .ans-videoquiz-opt, .answerOption, li.option'
          )
        ].filter(el => this.isVisible(el));

        const radios = optionNodes.filter(
          el => el.matches && el.matches('input[type="radio"]')
        );
        const checkboxes = optionNodes.filter(
          el => el.matches && el.matches('input[type="checkbox"]')
        );
        const customOpts = optionNodes.filter(
          el =>
            !el.matches ||
            (!el.matches('input[type="radio"]') && !el.matches('input[type="checkbox"]'))
        );

        let selected = false;

        if (radios.length > 0) {
          if (!radios.some(r => r.checked)) {
            this.safeClick(radios[Math.floor(Math.random() * radios.length)]);
            this.log('自动答题：随机单选');
          }
          selected = true;
        } else if (checkboxes.length > 0) {
          if (!checkboxes.some(c => c.checked)) {
            const count = Math.max(1, Math.ceil(checkboxes.length / 2));
            [...checkboxes]
              .sort(() => Math.random() - 0.5)
              .slice(0, count)
              .forEach(box => this.safeClick(box));
            this.log('自动答题：随机多选');
          }
          selected = true;
        } else if (customOpts.length > 0) {
          this.safeClick(customOpts[Math.floor(Math.random() * customOpts.length)]);
          this.log('自动答题：点击自定义选项');
          selected = true;
        }

        if (!selected) return false;
        setTimeout(
          () => this.clickSubmitButton(container),
          this.randomDelay(500, 900)
        );
        return true;
      } catch (error) {
        this.log('自动答题失败:', error);
        return false;
      }
    }

    clickSubmitButton(container) {
      const keywords = ['提交', '确定', '确认', '关闭', '继续学习', '下一题'];
      const candidates = [
        ...container.querySelectorAll(
          'a, button, input[type="button"], input[type="submit"], .btnSubmit, .ans-videoquiz-submit'
        ),
        ...document.querySelectorAll('.ans-videoquiz-submit, .btnSubmit, .popBtn')
      ];

      for (const btn of candidates) {
        const text = (btn.textContent || btn.value || '').trim();
        if (keywords.some(k => text.includes(k)) && this.isVisible(btn)) {
          this.safeClick(btn);
          this.log('自动答题：已点击提交 -', text);
          return;
        }
      }
    }

    // ---------- 章节切换 ----------

    requestNextChapter(reason) {
      if (!this.settings.autoNext) return;
      if (this.nextPending || Date.now() - this.lastNextAt < 4000) return;
      this.nextPending = true;
      this.lastNextAt = Date.now();
      this.log('请求切换下一章:', reason);

      const run = () => {
        if (IS_TOP) {
          this.goToNextChapter(reason);
        } else {
          try {
            window.parent.postMessage({ type: 'XXT_GO_NEXT_CHAPTER', reason }, '*');
          } catch (error) {
            this.log('通知顶层切换失败:', error);
          }
        }
        setTimeout(() => {
          this.nextPending = false;
        }, 4000);
      };

      // 轻微随机延迟，避免节奏过于机械
      setTimeout(run, this.randomDelay(200, 800));
    }

    goToNextChapter(reason = '') {
      if (this.dismissJobFinishTip()) return;

      // 视频结束/任务完成：优先走目录树（更稳定）；测验页优先点官方下一节
      if (reason !== 'chapter-test') {
        if (this.clickNextCatalogItem()) return;
      }

      const nextSelectors = [
        '#prevNextFocusNext',
        '#right1',
        '.prev_next.next',
        '.jb_btn.js-next',
        '.nextChapter',
        '.next_chapter',
        'a[title="下一节"]',
        'div[title="下一节"]',
        '.orientationright'
      ];
      for (const selector of nextSelectors) {
        const btn = document.querySelector(selector);
        if (btn && this.isVisible(btn)) {
          this.log('点击下一节按钮:', selector);
          this.safeClick(btn);
          this.setStatus('next', '已切换到下一节');
          return;
        }
      }

      if (reason === 'chapter-test' && this.clickNextCatalogItem()) return;

      this.log('未找到下一章节入口，可能已学完');
      this.setStatus('done', '未找到下一节，可能已全部完成');
    }

    clickNextCatalogItem() {
      const tree = document.querySelector('#coursetree');
      if (!tree) return false;

      const items = [...tree.querySelectorAll('.posCatalog_select:not(.firstLayer)')];
      if (!items.length) return false;

      let activeIndex = items.findIndex(el => el.classList.contains('posCatalog_active'));
      if (activeIndex < 0) activeIndex = -1;

      for (let i = activeIndex + 1; i < items.length; i++) {
        const item = items[i];
        const tip = item.querySelector('.prevHoverTips');
        const tipText = (tip && tip.textContent) || '';
        if (tipText.includes('已完成')) continue;

        const name = item.querySelector('.posCatalog_name');
        if (name) {
          this.log('目录切换到:', name.getAttribute('title') || name.textContent);
          this.safeClick(name);
          this.setStatus('next', '已从目录进入下一节');
          return true;
        }
      }
      return false;
    }
  }

  const player = new XueXiTongAutoPlayer();

  window.addEventListener('message', event => {
    if (
      event.data &&
      event.data.type === 'XXT_GO_NEXT_CHAPTER' &&
      IS_TOP &&
      player.settings.isRunning
    ) {
      player.requestNextChapter(event.data.reason || 'iframe');
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    if (message.type === 'GET_STATUS') {
      sendResponse({
        ...player.settings,
        ...player.status,
        hasVideo: !!player.findVideo(),
        isTop: IS_TOP
      });
      return false;
    }
    if (message.type === 'PING') {
      sendResponse({ ok: true, isTop: IS_TOP });
      return false;
    }
    return false;
  });
})();
