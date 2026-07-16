// 学习通自动刷课插件 - 内容脚本
// 顶层：浮层、目录切章、页签、测验跳过、防挂机弹窗
// iframe：视频接管、答题、文档滚动

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
      showHud: true,
      stopWhenDone: true,
      maxChapters: 0,
      maxMinutes: 0
    };

  const DOM = (typeof XXT_DOM !== 'undefined' && XXT_DOM) || {};
  const isVisible = DOM.isVisible || (() => false);
  const safeClick = DOM.safeClick || (() => false);
  const randomDelay = DOM.randomDelay || ((a, b) => a);
  const formatProgress = DOM.formatProgress || (p => Math.round((p || 0) * 100));
  const normalizeText = DOM.normalizeText || (t => String(t || '').replace(/\s+/g, ''));
  const pickNextCatalogItem = DOM.pickNextCatalogItem;
  const shouldLogStatusChange = DOM.shouldLogStatusChange || ((a, b) => a !== b);
  const isExtensionAlive = DOM.isExtensionAlive || (() => true);
  const formatSessionStats =
    DOM.formatSessionStats ||
    ((stats) =>
      `本会话 · 切章 ${stats.nextCount || 0} · 答题 ${stats.answerCount || 0}`);
  const createEmptyStats =
    DOM.createEmptyStats || (() => ({ nextCount: 0, answerCount: 0, startedAt: Date.now() }));
  const countRemainingCatalog = DOM.countRemainingCatalog || (() => 0);
  const fingerprintText = DOM.fingerprintText || (t => normalizeText(t).slice(0, 160));
  const shouldStopByLimits = DOM.shouldStopByLimits || (() => ({ stop: false, reason: '' }));
  const trimSet = DOM.trimSet || ((setLike) => new Set(setLike || []));
  const FINGERPRINT_LIMIT =
    (typeof XXT_FINGERPRINT_LIMIT !== 'undefined' && XXT_FINGERPRINT_LIMIT) || 80;

  const IS_TOP = window.top === window.self;
  const STATUS_KEY =
    (typeof XXT_STATUS_KEY !== 'undefined' && XXT_STATUS_KEY) || 'xxtRuntimeStatus';
  const LOG_KEY = (typeof XXT_LOG_KEY !== 'undefined' && XXT_LOG_KEY) || 'xxtActivityLog';
  const LOG_LIMIT = (typeof XXT_LOG_LIMIT !== 'undefined' && XXT_LOG_LIMIT) || 40;
  const HUD_LAYOUT_KEY =
    (typeof XXT_HUD_LAYOUT_KEY !== 'undefined' && XXT_HUD_LAYOUT_KEY) || 'xxtHudLayout';
  const STATS_KEY = (typeof XXT_STATS_KEY !== 'undefined' && XXT_STATS_KEY) || 'xxtSessionStats';

  class XueXiTongAutoPlayer {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.managedVideos = new WeakSet();
      this.observer = null;
      this.tickTimer = null;
      this.scanTimer = null;
      this.lastAnswerAt = 0;
      this.lastNextAt = 0;
      this.lastDocScrollAt = 0;
      this.lastIdleDismissAt = 0;
      this.lastPlayClickAt = 0;
      this.lastPublishAt = 0;
      this.nextPending = false;
      this.stallLastTime = 0;
      this.stallLastWall = 0;
      this.dead = false;
      this.hudLayout = { left: null, top: null, compact: false };
      this.stats = createEmptyStats();
      this.dragState = null;
      this.hudDragBound = false;
      this.answeredFingerprints = new Set();
      this.toastTimer = null;
      this.hadRemaining = false;
      this.limitPausePending = false;
      this.status = {
        phase: 'idle',
        detail: '等待课程页面…',
        chapter: '',
        remaining: null,
        hasVideo: false,
        progress: 0,
        updatedAt: Date.now()
      };
      this.hud = null;
      this.init();
    }

    async init() {
      await this.loadSettings();
      if (IS_TOP) {
        await this.loadHudLayout();
        await this.loadStats();
      }
      this.watchSettingsChanges();
      this.startObserver();
      this.tickTimer = setInterval(() => this.tick(), 1500);
      if (IS_TOP) {
        this.ensureHud();
        this.refreshChapterTitle();
        this.publishStatus(true);
        this.pushLog('插件已在本页启动');
      }
      this.log('插件已启动', { frame: IS_TOP ? 'top' : 'iframe', ...this.settings });
    }

    log(...args) {
      console.log('[学习通助手]', ...args);
    }

    markDead(reason) {
      if (this.dead) return;
      this.dead = true;
      this.log('扩展上下文失效，停止工作:', reason || '');
      if (this.tickTimer) clearInterval(this.tickTimer);
      if (this.scanTimer) clearTimeout(this.scanTimer);
      if (this.observer) this.observer.disconnect();
      this.tickTimer = null;
      this.scanTimer = null;
      this.observer = null;
    }

    ensureAlive() {
      if (this.dead) return false;
      if (!isExtensionAlive()) {
        this.markDead('runtime unavailable');
        return false;
      }
      return true;
    }

    async loadSettings() {
      if (!this.ensureAlive()) return;
      try {
        const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
      } catch (error) {
        this.markDead(error && error.message);
      }
    }

    watchSettingsChanges() {
      if (!this.ensureAlive()) return;
      try {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (!this.ensureAlive()) return;
          if (area === 'sync') {
            const prevRunning = this.settings.isRunning;
            const prevHud = this.settings.showHud;
            for (const key of Object.keys(DEFAULT_SETTINGS)) {
              if (changes[key]) this.settings[key] = changes[key].newValue;
            }
            this.applySettings();
            if (IS_TOP) {
              this.ensureHud();
              this.updateHud();
              if (changes.isRunning && prevRunning !== this.settings.isRunning) {
                this.showToast(this.settings.isRunning ? '已开始自动刷课' : '已暂停自动刷课');
              }
              if (changes.showHud && !prevHud && this.settings.showHud) {
                this.showToast('已显示状态浮层');
              }
            }
          }
          if (area === 'local' && IS_TOP) {
            if (changes[STATS_KEY]) {
              const next = changes[STATS_KEY].newValue;
              this.stats = next && typeof next === 'object' ? next : createEmptyStats();
              this.updateHud();
              this.publishStatus(true);
            }
            if (changes[HUD_LAYOUT_KEY] && changes[HUD_LAYOUT_KEY].newValue) {
              this.hudLayout = {
                ...this.hudLayout,
                ...changes[HUD_LAYOUT_KEY].newValue
              };
              this.applyHudPosition();
              this.updateHud();
            }
          }
        });
      } catch (error) {
        this.markDead(error && error.message);
      }
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
        this.publishStatus(true);
        if (shouldLogStatusChange(prevDetail, detail)) this.pushLog(detail);
      }
    }

    // 高频进度更新：只改本地状态，按节流上报
    setProgress(progress, extra = {}) {
      this.status.progress = progress;
      this.status.hasVideo = true;
      Object.assign(this.status, extra);
      this.status.updatedAt = Date.now();
      if (IS_TOP) {
        this.updateHudProgressOnly();
        this.publishStatus(false);
      }
    }

    async publishStatus(force = false) {
      if (!IS_TOP || !this.ensureAlive()) return;
      const now = Date.now();
      if (!force && now - this.lastPublishAt < 2000) return;
      this.lastPublishAt = now;
      try {
        await chrome.storage.local.set({
          [STATUS_KEY]: {
            ...this.status,
            stats: this.stats,
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
      } catch (error) {
        this.markDead(error && error.message);
      }
    }

    async pushLog(message) {
      if (!IS_TOP || !message || !this.ensureAlive()) return;
      try {
        const result = await chrome.storage.local.get(LOG_KEY);
        const list = Array.isArray(result[LOG_KEY]) ? result[LOG_KEY] : [];
        list.unshift({ t: Date.now(), message: String(message) });
        await chrome.storage.local.set({ [LOG_KEY]: list.slice(0, LOG_LIMIT) });
      } catch (error) {
        this.markDead(error && error.message);
      }
    }

    refreshChapterTitle() {
      if (!IS_TOP) return '';
      const name = document.querySelector('.posCatalog_active .posCatalog_name');
      const title = name
        ? (name.getAttribute('title') || name.textContent || '').trim()
        : '';
      if (title && title !== this.status.chapter) {
        this.status.chapter = title;
      }
      this.refreshRemaining();
      return this.status.chapter;
    }

    refreshRemaining() {
      if (!IS_TOP) return null;
      const tree = document.querySelector('#coursetree');
      if (!tree) {
        this.status.remaining = null;
        return null;
      }
      const items = [...tree.querySelectorAll('.posCatalog_select:not(.firstLayer)')].map(
        el => ({
          tipText:
            (el.querySelector('.prevHoverTips') &&
              el.querySelector('.prevHoverTips').textContent) ||
            ''
        })
      );
      this.status.remaining = countRemainingCatalog(items);
      if (this.status.remaining > 0) this.hadRemaining = true;
      return this.status.remaining;
    }

    showToast(message) {
      if (!IS_TOP || !message || !document.documentElement) return;
      let toast = document.getElementById('xxt-assistant-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'xxt-assistant-toast';
        Object.assign(toast.style, {
          position: 'fixed',
          left: '50%',
          bottom: '88px',
          transform: 'translateX(-50%) translateY(8px)',
          zIndex: '2147483647',
          padding: '10px 14px',
          borderRadius: '10px',
          background: 'rgba(20, 86, 71, 0.94)',
          color: '#f4fbf8',
          fontSize: '12px',
          fontFamily: '"Avenir Next","PingFang SC","Microsoft YaHei UI",sans-serif',
          boxShadow: '0 8px 24px rgba(20,35,31,0.28)',
          opacity: '0',
          transition: 'opacity 180ms ease, transform 180ms ease',
          pointerEvents: 'none',
          maxWidth: '80vw',
          textAlign: 'center'
        });
        document.documentElement.appendChild(toast);
      }
      toast.textContent = message;
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(8px)';
      }, 2200);
    }

    // ---------- HUD ----------

    async loadHudLayout() {
      try {
        const result = await chrome.storage.local.get(HUD_LAYOUT_KEY);
        const layout = result[HUD_LAYOUT_KEY];
        if (layout && typeof layout === 'object') {
          this.hudLayout = {
            left: Number.isFinite(layout.left) ? layout.left : null,
            top: Number.isFinite(layout.top) ? layout.top : null,
            compact: !!layout.compact
          };
        }
      } catch (_) {}
    }

    async saveHudLayout() {
      if (!this.ensureAlive()) return;
      try {
        await chrome.storage.local.set({ [HUD_LAYOUT_KEY]: this.hudLayout });
      } catch (error) {
        this.markDead(error && error.message);
      }
    }

    async loadStats() {
      try {
        const result = await chrome.storage.local.get(STATS_KEY);
        const stats = result[STATS_KEY];
        if (stats && typeof stats === 'object') {
          this.stats = {
            nextCount: Number(stats.nextCount) || 0,
            answerCount: Number(stats.answerCount) || 0,
            startedAt: Number(stats.startedAt) || Date.now()
          };
        } else {
          await this.persistStats();
        }
      } catch (_) {}
    }

    async persistStats() {
      if (!IS_TOP || !this.ensureAlive()) return;
      try {
        await chrome.storage.local.set({ [STATS_KEY]: this.stats });
      } catch (error) {
        this.markDead(error && error.message);
      }
    }

    async bumpStat(key) {
      if (!this.ensureAlive()) return;
      try {
        const result = await chrome.storage.local.get(STATS_KEY);
        const stats = result[STATS_KEY] || {
          nextCount: 0,
          answerCount: 0,
          startedAt: Date.now()
        };
        stats[key] = (Number(stats[key]) || 0) + 1;
        this.stats = stats;
        await chrome.storage.local.set({ [STATS_KEY]: stats });
        if (IS_TOP) {
          this.publishStatus(true);
          this.updateHud();
          if (key === 'nextCount') await this.enforceLimits();
        } else {
          window.parent.postMessage({ type: 'XXT_STATS_UPDATED' }, '*');
        }
      } catch (error) {
        this.markDead(error && error.message);
      }
    }

    async pauseForReason(reason) {
      if (!this.settings.isRunning || this.limitPausePending || !this.ensureAlive()) return;
      this.limitPausePending = true;
      try {
        this.setStatus('limit', reason);
        this.showToast(reason);
        this.pushLog(reason);
        await chrome.storage.sync.set({ isRunning: false });
      } catch (error) {
        this.markDead(error && error.message);
      } finally {
        setTimeout(() => {
          this.limitPausePending = false;
        }, 1500);
      }
    }

    async enforceLimits() {
      if (!IS_TOP || !this.settings.isRunning) return;
      const limit = shouldStopByLimits(this.stats, this.settings);
      if (limit.stop) {
        await this.pauseForReason(limit.reason);
        return true;
      }
      return false;
    }

    async enforceCompletionStop() {
      if (!IS_TOP || !this.settings.isRunning || !this.settings.stopWhenDone) return;
      if (this.hadRemaining && this.status.remaining === 0) {
        await this.pauseForReason('目录已全部完成，已自动暂停');
      }
    }

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
      root.innerHTML = `
        <div data-role="compact-view" style="display:none;align-items:center;gap:10px;cursor:pointer;">
          <strong style="font-size:13px;letter-spacing:0.2px;">学习通助手</strong>
          <span data-role="compact-meta" style="opacity:0.8;font-family:'Avenir Next','PingFang SC',sans-serif;"></span>
        </div>
        <div data-role="full-view">
          <div data-role="drag" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;cursor:grab;">
            <div style="font-weight:700;font-size:14px;letter-spacing:0.3px;">学习通助手</div>
            <div style="display:flex;gap:6px;">
              <button data-role="compact" type="button" title="收起">收起</button>
              <button data-role="toggle" type="button">暂停</button>
              <button data-role="hide" type="button">隐藏</button>
            </div>
          </div>
          <div data-role="chapter" style="opacity:0.78;font-size:11px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
          <div data-role="detail" style="opacity:0.96;line-height:1.4;font-family:'Avenir Next','PingFang SC',sans-serif;">初始化中…</div>
          <div data-role="bar" style="margin-top:9px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px;overflow:hidden;">
            <div data-role="bar-fill" style="height:100%;width:0%;background:#7dd3b5;transition:width 0.25s ease;"></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-family:'Avenir Next','PingFang SC',sans-serif;">
            <div data-role="meta" style="opacity:0.72;"></div>
            <div style="display:flex;gap:4px;">
              <button data-role="speed-down" type="button" title="减速">−</button>
              <button data-role="speed-up" type="button" title="加速">+</button>
            </div>
          </div>
          <div data-role="stats" style="margin-top:6px;opacity:0.68;font-size:11px;font-family:'Avenir Next','PingFang SC',sans-serif;"></div>
        </div>
      `;

      Object.assign(root.style, {
        position: 'fixed',
        zIndex: '2147483646',
        fontFamily:
          '"Source Han Serif SC","Noto Serif CJK SC","Songti SC","PingFang SC",serif',
        fontSize: '12px',
        color: '#f4fbf8',
        background: 'linear-gradient(145deg, rgba(20,86,71,0.94), rgba(31,122,102,0.90))',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '14px',
        padding: '12px 14px',
        boxShadow: '0 10px 28px rgba(20,35,31,0.28)',
        backdropFilter: 'blur(10px)',
        minWidth: '228px',
        maxWidth: '300px',
        pointerEvents: 'auto',
        transition: 'opacity 0.2s ease',
        userSelect: 'none'
      });

      root.querySelectorAll('button').forEach(btn => {
        Object.assign(btn.style, {
          border: '1px solid rgba(255,255,255,0.22)',
          borderRadius: '7px',
          padding: '4px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          fontFamily: 'inherit',
          lineHeight: '1'
        });
      });

      this.bindHudEvents(root);
      document.documentElement.appendChild(root);
      this.hud = root;
      this.applyHudPosition();
      this.updateHud();
    }

    bindHudEvents(root) {
      const stop = e => e.stopPropagation();

      root.querySelector('[data-role="toggle"]').addEventListener('click', async e => {
        stop(e);
        if (!this.ensureAlive()) return;
        try {
          await chrome.storage.sync.set({ isRunning: !this.settings.isRunning });
        } catch (error) {
          this.markDead(error && error.message);
        }
      });

      root.querySelector('[data-role="hide"]').addEventListener('click', async e => {
        stop(e);
        if (!this.ensureAlive()) return;
        try {
          await chrome.storage.sync.set({ showHud: false });
        } catch (error) {
          this.markDead(error && error.message);
        }
      });

      root.querySelector('[data-role="compact"]').addEventListener('click', async e => {
        stop(e);
        this.hudLayout.compact = true;
        await this.saveHudLayout();
        this.updateHud();
      });

      root.querySelector('[data-role="speed-down"]').addEventListener('click', e => {
        stop(e);
        this.adjustSpeed(-0.25);
      });
      root.querySelector('[data-role="speed-up"]').addEventListener('click', e => {
        stop(e);
        this.adjustSpeed(0.25);
      });

      const dragHandle = root.querySelector('[data-role="drag"]');
      dragHandle.addEventListener('mousedown', e => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const rect = root.getBoundingClientRect();
        this.dragState = {
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top
        };
        dragHandle.style.cursor = 'grabbing';
      });
      dragHandle.addEventListener('dblclick', async e => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        this.hudLayout.left = null;
        this.hudLayout.top = null;
        await this.saveHudLayout();
        this.applyHudPosition();
        this.pushLog('浮层位置已复位');
      });

      root.querySelector('[data-role="compact-view"]').addEventListener('mousedown', e => {
        e.preventDefault();
        const rect = root.getBoundingClientRect();
        this.dragState = {
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          fromCompact: true,
          moved: false,
          startX: e.clientX,
          startY: e.clientY
        };
      });

      if (!this.hudDragBound) {
        this.hudDragBound = true;
        window.addEventListener('mousemove', e => this.onHudDragMove(e));
        window.addEventListener('mouseup', () => this.onHudDragEnd());
      }
    }

    onHudDragMove(e) {
      if (!this.dragState || !this.hud) return;
      const left = Math.min(
        window.innerWidth - 40,
        Math.max(8, e.clientX - this.dragState.offsetX)
      );
      const top = Math.min(
        window.innerHeight - 40,
        Math.max(8, e.clientY - this.dragState.offsetY)
      );
      if (
        this.dragState.fromCompact &&
        (Math.abs(e.clientX - this.dragState.startX) > 4 ||
          Math.abs(e.clientY - this.dragState.startY) > 4)
      ) {
        this.dragState.moved = true;
      }
      this.hudLayout.left = left;
      this.hudLayout.top = top;
      this.applyHudPosition();
    }

    async onHudDragEnd() {
      if (!this.dragState || !this.hud) return;
      const wasCompactClick =
        this.dragState.fromCompact && !this.dragState.moved && this.hudLayout.compact;
      this.dragState = null;
      const handle = this.hud.querySelector('[data-role="drag"]');
      if (handle) handle.style.cursor = 'grab';
      await this.saveHudLayout();
      if (wasCompactClick) {
        this.hudLayout.compact = false;
        await this.saveHudLayout();
        this.updateHud();
      }
    }

    applyHudPosition() {
      if (!this.hud) return;
      if (Number.isFinite(this.hudLayout.left) && Number.isFinite(this.hudLayout.top)) {
        this.hud.style.left = `${this.hudLayout.left}px`;
        this.hud.style.top = `${this.hudLayout.top}px`;
        this.hud.style.right = 'auto';
        this.hud.style.bottom = 'auto';
      } else {
        this.hud.style.left = 'auto';
        this.hud.style.top = 'auto';
        this.hud.style.right = '16px';
        this.hud.style.bottom = '16px';
      }
    }

    async adjustSpeed(delta) {
      if (!this.ensureAlive()) return;
      const next = Math.min(
        4,
        Math.max(0.5, Math.round((this.settings.playbackSpeed + delta) * 4) / 4)
      );
      try {
        await chrome.storage.sync.set({ playbackSpeed: next });
      } catch (error) {
        this.markDead(error && error.message);
      }
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

      const full = this.hud.querySelector('[data-role="full-view"]');
      const compact = this.hud.querySelector('[data-role="compact-view"]');
      const detail = this.hud.querySelector('[data-role="detail"]');
      const meta = this.hud.querySelector('[data-role="meta"]');
      const chapter = this.hud.querySelector('[data-role="chapter"]');
      const toggle = this.hud.querySelector('[data-role="toggle"]');
      const fill = this.hud.querySelector('[data-role="bar-fill"]');
      const stats = this.hud.querySelector('[data-role="stats"]');
      const compactMeta = this.hud.querySelector('[data-role="compact-meta"]');

      this.refreshChapterTitle();
      const pct = formatProgress(this.status.progress);
      const isCompact = !!this.hudLayout.compact;

      full.style.display = isCompact ? 'none' : 'block';
      compact.style.display = isCompact ? 'flex' : 'none';
      this.hud.style.minWidth = isCompact ? '0' : '228px';
      this.hud.style.padding = isCompact ? '10px 12px' : '12px 14px';

      if (isCompact) {
        const bits = [
          this.settings.isRunning ? '运行中' : '已停止',
          `${this.settings.playbackSpeed}x`
        ];
        if (this.status.hasVideo) bits.push(`${pct}%`);
        compactMeta.textContent = bits.join(' · ');
        this.hud.style.opacity = this.settings.isRunning ? '1' : '0.75';
        return;
      }

      chapter.textContent = this.status.chapter || '未识别当前章节';
      toggle.textContent = this.settings.isRunning ? '暂停' : '开始';
      fill.style.width = `${pct}%`;
      const remainText =
        typeof this.status.remaining === 'number'
          ? ` · 剩余 ${this.status.remaining}`
          : '';
      stats.textContent = `${formatSessionStats(this.stats)}${remainText}`;

      if (!this.settings.isRunning) {
        detail.textContent = '已停止';
        meta.textContent = '点击“开始”或在扩展弹窗中开启';
        this.hud.style.opacity = '0.75';
        return;
      }

      this.hud.style.opacity = '1';
      detail.textContent = this.status.detail || '运行中';
      const parts = [`${this.settings.playbackSpeed}x`];
      if (this.status.hasVideo) parts.push(`${pct}%`);
      if (this.settings.mute) parts.push('静音');
      meta.textContent = parts.join(' · ');
    }

    updateHudProgressOnly() {
      if (!this.hud || !this.settings.showHud) return;
      const pct = formatProgress(this.status.progress);
      const fill = this.hud.querySelector('[data-role="bar-fill"]');
      const meta = this.hud.querySelector('[data-role="meta"]');
      const compactMeta = this.hud.querySelector('[data-role="compact-meta"]');
      if (fill) fill.style.width = `${pct}%`;
      if (meta && this.settings.isRunning && !this.hudLayout.compact) {
        const parts = [`${this.settings.playbackSpeed}x`, `${pct}%`];
        if (this.settings.mute) parts.push('静音');
        meta.textContent = parts.join(' · ');
      }
      if (compactMeta && this.hudLayout.compact) {
        const bits = [
          this.settings.isRunning ? '运行中' : '已停止',
          `${this.settings.playbackSpeed}x`,
          `${pct}%`
        ];
        compactMeta.textContent = bits.join(' · ');
      }
    }

    // ---------- 视频 ----------

    startObserver() {
      this.scheduleScan();
      const root = document.body || document.documentElement;
      if (!root) return;
      this.observer = new MutationObserver(() => this.scheduleScan());
      this.observer.observe(root, { childList: true, subtree: true });
    }

    scheduleScan() {
      if (this.scanTimer) return;
      this.scanTimer = setTimeout(() => {
        this.scanTimer = null;
        this.scanForVideos();
      }, 300);
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
        this.setProgress(video.currentTime / video.duration);
      });

      video.addEventListener('ended', () => {
        this.log('视频播放完成');
        this.setStatus('next', '视频结束，准备下一节', { hasVideo: true, progress: 1 });
        if (this.settings.isRunning && this.settings.autoNext) {
          setTimeout(
            () => this.requestNextChapter('video-ended'),
            randomDelay(1200, 2200)
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
      if (Date.now() - this.lastPlayClickAt < 3000) return false;
      const selectors = [
        '[title="播放视频"]',
        '.vjs-big-play-button',
        '.playButton',
        '.ans-video-play',
        'button.vjs-play-control'
      ];
      for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (btn && isVisible(btn)) {
          this.lastPlayClickAt = Date.now();
          safeClick(btn);
          this.log('已点击播放按钮:', selector);
          return true;
        }
      }
      return false;
    }

    // ---------- 主循环 ----------

    tick() {
      if (!this.ensureAlive()) return;

      if (IS_TOP) {
        this.ensureHud();
        this.refreshChapterTitle();
      }

      if (!this.settings.isRunning) {
        if (IS_TOP) this.updateHud();
        return;
      }

      if (IS_TOP) {
        this.enforceLimits();
        this.enforceCompletionStop();
        if (this.settings.dismissIdle) this.dismissIdleDialogs();
        this.handleTopFrameTasks();
        this.publishStatus(false);
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

        const progress = video.duration ? t / video.duration : this.status.progress;
        // 仅在文案变化时打完整状态，避免每秒刷日志
        if (this.status.detail !== '正在播放') {
          this.setStatus('playing', '正在播放', { hasVideo: true, progress });
        } else {
          this.setProgress(progress);
        }
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
        if (!isVisible(tab)) continue;
        const text = normalizeText(tab.textContent);
        if (text === '2视频' || text === '视频' || text.endsWith('视频')) {
          this.log('切换到视频页签:', text);
          safeClick(tab);
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

    dismissIdleDialogs() {
      if (Date.now() - this.lastIdleDismissAt < 2500) return false;

      const keywords = ['继续学习', '我知道了', '知道了', '继续', '关闭'];
      const roots = document.querySelectorAll(
        '.maskDiv, .popDiv, .dialog-mask, .el-message-box, .el-dialog, .ant-modal, .layui-layer'
      );

      const clickIfMatch = root => {
        const buttons = root.querySelectorAll('a, button, .jb_btn, .btn, span, div');
        for (const btn of buttons) {
          if (!isVisible(btn)) continue;
          const text = normalizeText(btn.textContent);
          if (!text || text.length > 12) continue;
          if (keywords.some(k => text === k || text.includes(k))) {
            if (btn.closest('#coursetree, .posCatalog_select')) continue;
            safeClick(btn);
            this.lastIdleDismissAt = Date.now();
            this.log('已关闭提示弹窗:', text);
            this.setStatus('dialog', `已关闭提示：${text}`);
            return true;
          }
        }
        return false;
      };

      for (const root of roots) {
        if (!isVisible(root) && !root.classList.contains('maskDiv')) continue;
        if (clickIfMatch(root)) return true;
      }

      for (const btn of document.querySelectorAll('a, button, .jb_btn')) {
        const text = normalizeText(btn.textContent);
        if ((text === '继续学习' || text === '我知道了') && isVisible(btn)) {
          safeClick(btn);
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
      if (tipNext && isVisible(tipNext)) {
        this.log('点击完成提示中的下一章按钮');
        safeClick(tipNext);
        return true;
      }
      return false;
    }

    handleDocumentReading() {
      const boxes = document.querySelectorAll('.fileBox, .imgLook, .doc-reader, #img');
      if (!boxes.length) return;
      if (Date.now() - this.lastDocScrollAt < 2000) return;
      this.lastDocScrollAt = Date.now();

      for (const box of boxes) {
        if (!isVisible(box)) continue;
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

    checkAndAnswerQuestion() {
      if (Date.now() - this.lastAnswerAt < 3000) return;
      const dialog = this.findQuestionDialog();
      if (!dialog) return;

      const fp = fingerprintText(dialog.textContent || '');
      if (fp && this.answeredFingerprints.has(fp)) {
        // 同一题已处理过，只尝试再次点提交
        this.clickSubmitButton(dialog);
        this.lastAnswerAt = Date.now();
        return;
      }

      const result = this.answerQuestion(dialog);
      if (result && result.handled) {
        this.lastAnswerAt = Date.now();
        this.setStatus('answer', '已自动作答弹窗题');
        if (result.fresh) {
          if (fp) {
            this.answeredFingerprints.add(fp);
            if (this.answeredFingerprints.size > FINGERPRINT_LIMIT) {
              this.answeredFingerprints = trimSet(
                this.answeredFingerprints,
                Math.floor(FINGERPRINT_LIMIT / 2)
              );
            }
          }
          this.bumpStat('answerCount');
        }
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
            isVisible(el) &&
            el.querySelector(
              'input[type="radio"], input[type="checkbox"], .ans-videoquiz-opt'
            )
          ) {
            return el;
          }
        }
      }
      const anyInput = document.querySelector('input[type="radio"], input[type="checkbox"]');
      if (anyInput && isVisible(anyInput)) {
        return anyInput.closest('form, .tkTopic, .ans-videoquiz, div') || document.body;
      }
      return null;
    }

    answerQuestion(container) {
      try {
        const optionNodes = [
          ...container.querySelectorAll(
            'input[type="radio"], input[type="checkbox"], .ans-videoquiz-opt, .answerOption, li.option'
          )
        ].filter(el => isVisible(el));

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

        let handled = false;
        let fresh = false;

        if (radios.length > 0) {
          handled = true;
          if (!radios.some(r => r.checked)) {
            safeClick(radios[Math.floor(Math.random() * radios.length)]);
            this.log('自动答题：随机单选');
            fresh = true;
          }
        } else if (checkboxes.length > 0) {
          handled = true;
          if (!checkboxes.some(c => c.checked)) {
            const count = Math.max(1, Math.ceil(checkboxes.length / 2));
            [...checkboxes]
              .sort(() => Math.random() - 0.5)
              .slice(0, count)
              .forEach(box => safeClick(box));
            this.log('自动答题：随机多选');
            fresh = true;
          }
        } else if (customOpts.length > 0) {
          // 自定义选项难以判断是否已选，仅首次点击计为新作答
          const marked = container.dataset.xxtAnswered === '1';
          handled = true;
          if (!marked) {
            safeClick(customOpts[Math.floor(Math.random() * customOpts.length)]);
            container.dataset.xxtAnswered = '1';
            this.log('自动答题：点击自定义选项');
            fresh = true;
          }
        }

        if (!handled) return { handled: false, fresh: false };
        setTimeout(() => this.clickSubmitButton(container), randomDelay(500, 900));
        return { handled: true, fresh };
      } catch (error) {
        this.log('自动答题失败:', error);
        return { handled: false, fresh: false };
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
        if (keywords.some(k => text.includes(k)) && isVisible(btn)) {
          safeClick(btn);
          this.log('自动答题：已点击提交 -', text);
          return;
        }
      }
    }

    requestNextChapter(reason) {
      if (!this.settings.autoNext) return;
      if (this.nextPending || Date.now() - this.lastNextAt < 4000) return;
      this.nextPending = true;
      this.lastNextAt = Date.now();
      this.log('请求切换下一章:', reason);

      const run = () => {
        if (IS_TOP) {
          const moved = this.goToNextChapter(reason);
          if (moved) this.bumpStat('nextCount');
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

      setTimeout(run, randomDelay(200, 800));
    }

    goToNextChapter(reason = '') {
      if (this.dismissJobFinishTip()) return true;

      if (reason !== 'chapter-test') {
        if (this.clickNextCatalogItem()) return true;
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
        if (btn && isVisible(btn)) {
          this.log('点击下一节按钮:', selector);
          safeClick(btn);
          this.setStatus('next', '已切换到下一节');
          return true;
        }
      }

      if (reason === 'chapter-test' && this.clickNextCatalogItem()) return true;

      this.log('未找到下一章节入口，可能已学完');
      this.setStatus('done', '未找到下一节，可能已全部完成');
      this.showToast('没有更多未完成小节了');
      if (this.settings.stopWhenDone) {
        this.pauseForReason('目录已全部完成，已自动暂停');
      }
      return false;
    }

    clickNextCatalogItem() {
      const tree = document.querySelector('#coursetree');
      if (!tree) return false;

      const nodes = [...tree.querySelectorAll('.posCatalog_select:not(.firstLayer)')];
      if (!nodes.length) return false;

      const items = nodes.map(el => ({
        el,
        tipText: (el.querySelector('.prevHoverTips') &&
          el.querySelector('.prevHoverTips').textContent) ||
          '',
        nameEl: el.querySelector('.posCatalog_name')
      }));

      let activeIndex = nodes.findIndex(el => el.classList.contains('posCatalog_active'));
      if (activeIndex < 0) activeIndex = -1;

      const picked = pickNextCatalogItem
        ? pickNextCatalogItem(items, activeIndex)
        : null;

      if (!picked || !picked.item || !picked.item.nameEl) return false;

      const name = picked.item.nameEl;
      this.log('目录切换到:', name.getAttribute('title') || name.textContent);
      safeClick(name);
      this.setStatus('next', '已从目录进入下一节', {
        chapter: (name.getAttribute('title') || name.textContent || '').trim()
      });
      return true;
    }
  }

  const player = new XueXiTongAutoPlayer();

  window.addEventListener('message', async event => {
    if (!event.data || !IS_TOP || player.dead) return;
    if (event.data.type === 'XXT_GO_NEXT_CHAPTER' && player.settings.isRunning) {
      player.requestNextChapter(event.data.reason || 'iframe');
    } else if (event.data.type === 'XXT_STATS_UPDATED') {
      await player.loadStats();
      player.publishStatus(true);
      player.updateHud();
    }
  });

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || player.dead) return false;
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
      if (message.type === 'SHOW_TOAST' && IS_TOP) {
        player.showToast(message.message || '');
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  } catch (_) {
    player.markDead('onMessage unavailable');
  }
})();
