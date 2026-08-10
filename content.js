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
      autoQuizSubmit: false,
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
    ((stats, _now, settings) =>
      `本会话 · 切章 ${stats.nextCount || 0} · 答题 ${stats.answerCount || 0}`);
  const recoverStepLabel =
    DOM.recoverStepLabel ||
    (level => ['点击播放', '静音重试', '微调进度', '重新加载'][Math.max(0, (level || 1) - 1)]);
  const createEmptyStats =
    DOM.createEmptyStats || (() => ({ nextCount: 0, answerCount: 0, startedAt: Date.now() }));
  const countRemainingCatalog = DOM.countRemainingCatalog || (() => 0);
  const fingerprintText = DOM.fingerprintText || (t => normalizeText(t).slice(0, 160));
  const shouldStopByLimits = DOM.shouldStopByLimits || (() => ({ stop: false, reason: '' }));
  const quizReadyToSubmit = DOM.quizReadyToSubmit || (() => ({ ready: false, objectiveCount: 0, answeredCount: 0 }));
  const trimSet = DOM.trimSet || ((setLike) => new Set(setLike || []));
  const isManualVerificationText =
    DOM.isManualVerificationText ||
    (text => /人脸|刷脸|安全验证|身份验证|人脸识别/.test(String(text || '')));
  const isProtectedStatusPhase =
    DOM.isProtectedStatusPhase ||
    (phase =>
      ['limit', 'done', 'paused', 'verify', 'stall', 'dead'].includes(String(phase || '')));
  const hasVisibleManualVerification =
    DOM.hasVisibleManualVerification ||
    ((roots, vis) => {
      for (const el of roots || []) {
        if (!el || (vis && !vis(el))) continue;
        if (isManualVerificationText(el.textContent || '')) return true;
      }
      return false;
    });
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
  const RELOAD_HINT_KEY =
    (typeof XXT_RELOAD_HINT_KEY !== 'undefined' && XXT_RELOAD_HINT_KEY) || 'xxtReloadHint';

  class XueXiTongAutoPlayer {
    constructor() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.managedVideos = new WeakSet();
      this.observer = null;
      this.tickTimer = null;
      this.scanTimer = null;
      this.lastAnswerAt = 0;
      this.lastQuizAt = 0;
      this.lastSubmitAt = 0;
      this.lastSubmitConfirmAt = 0;
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
      this.lastRelayAt = 0;
      this.lastActiveTickAt = 0;
      this.lastActivePersistAt = 0;
      this.recoverLevel = 0;
      this.lastRecoverAt = 0;
      this.lastGuardAt = 0;
      this.lastBgHintAt = 0;
      this.lastVerifyCheckAt = 0;
      this.verifyClearHintShown = false;
      this.recoverFailCycles = 0;
      this.goodPlaySince = 0;
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
      this.bindLifecycle();
      this.startObserver();
      this.tickTimer = setInterval(() => this.tick(), 1500);
      if (IS_TOP) {
        this.ensureHud();
        this.refreshChapterTitle();
        this.publishStatus(true);
        this.pushLog('插件已在本页启动');
        this.checkReloadHint();
      }
      this.log('插件已启动', { frame: IS_TOP ? 'top' : 'iframe', ...this.settings });
    }

    log(...args) {
      console.log('[学习通助手]', ...args);
    }

    handleRuntimeError(error, context = '') {
      const msg = (error && error.message) || String(error || '');
      if (
        !isExtensionAlive() ||
        /Extension context invalidated|runtime unavailable/i.test(msg)
      ) {
        this.markDead(msg || context);
        return true;
      }
      this.log('可恢复错误', context, msg);
      return false;
    }

    markDead(reason) {
      if (this.dead) return;
      this.dead = true;
      this.log('扩展上下文失效，停止工作:', reason || '');
      if (IS_TOP) {
        this.status.phase = 'dead';
        this.status.detail = '扩展已失效，请刷新本页';
        this.status.updatedAt = Date.now();
        try {
          chrome.storage.local.set({
            [STATUS_KEY]: { ...this.status, stats: this.stats }
          });
        } catch (_) {}
        try {
          this.ensureHud();
          this.updateHud();
          this.showToast('扩展已失效，请刷新课程页');
        } catch (_) {}
      }
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

    bindLifecycle() {
      document.addEventListener('visibilitychange', () => {
        if (this.dead) return;
        if (document.visibilityState === 'visible') {
          this.tick();
          return;
        }
        if (IS_TOP && this.settings.isRunning && Date.now() - this.lastBgHintAt > 60000) {
          this.lastBgHintAt = Date.now();
          this.showToast('页面进入后台，播放可能被浏览器限速');
        }
      });
      window.addEventListener('focus', () => {
        if (!this.dead) this.tick();
      });
    }

    async checkReloadHint() {
      if (!IS_TOP || !this.ensureAlive()) return;
      try {
        const result = await chrome.storage.local.get(RELOAD_HINT_KEY);
        if (!result[RELOAD_HINT_KEY]) return;
        await chrome.storage.local.remove(RELOAD_HINT_KEY);
        this.showToast('扩展已更新，建议刷新课程页');
        this.pushLog('扩展已更新，建议刷新课程页以加载最新脚本');
      } catch (error) {
        this.handleRuntimeError(error, 'checkReloadHint');
      }
    }

    async loadSettings() {
      if (!this.ensureAlive()) return;
      try {
        const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
      } catch (error) {
        this.handleRuntimeError(error, 'loadSettings');
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
              if (changes.isRunning && prevRunning !== this.settings.isRunning) {
                if (this.settings.isRunning) {
                  this.lastActiveTickAt = 0;
                  this.recoverLevel = 0;
                  this.recoverFailCycles = 0;
                  this.verifyClearHintShown = false;
                  // 先清除粘滞相位，再刷新浮层
                  this.status.phase = 'idle';
                  this.status.detail = '已恢复自动刷课';
                  this.status.updatedAt = Date.now();
                }
              }
              this.ensureHud();
              this.updateHud();
              if (changes.isRunning && prevRunning !== this.settings.isRunning) {
                if (this.settings.isRunning) {
                  this.showToast('已开始自动刷课');
                  this.publishStatus(true);
                } else if (!this.limitPausePending) {
                  if (!isProtectedStatusPhase(this.status.phase)) {
                    this.status.phase = 'paused';
                    this.status.detail = '已暂停自动刷课';
                    this.status.updatedAt = Date.now();
                    this.updateHud();
                    this.publishStatus(true);
                  }
                  this.showToast('已暂停自动刷课');
                }
              }
              if (changes.showHud && !prevHud && this.settings.showHud) {
                this.showToast('已显示状态浮层');
              }
            }
          }
          if (area === 'local' && IS_TOP) {
            if (changes[STATS_KEY]) {
              const next = changes[STATS_KEY].newValue;
              const merged =
                next && typeof next === 'object' ? { ...next } : createEmptyStats();
              merged.activeMs = Math.max(
                Number(merged.activeMs) || 0,
                Number(this.stats.activeMs) || 0
              );
              this.stats = merged;
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
        this.handleRuntimeError(error);
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
        // 仅顶层写入暂停文案，避免 iframe 把 verify/stall 覆盖成普通 paused
        if (IS_TOP && !isProtectedStatusPhase(this.status.phase)) {
          this.setStatus('paused', '已暂停自动刷课');
        }
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
      } else {
        this.relayFrameStatus(true);
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
      } else {
        this.relayFrameStatus(false);
      }
    }

    relayFrameStatus(force = false) {
      const now = Date.now();
      if (!force && now - this.lastRelayAt < 800) return;
      this.lastRelayAt = now;
      try {
        window.parent.postMessage(
          {
            type: 'XXT_FRAME_STATUS',
            force: !!force,
            payload: {
              phase: this.status.phase,
              detail: this.status.detail,
              progress: this.status.progress,
              hasVideo: !!this.status.hasVideo,
              updatedAt: this.status.updatedAt
            }
          },
          '*'
        );
      } catch (_) {}
    }

    applyFrameStatus(payload, force = false) {
      if (!IS_TOP || !payload || typeof payload !== 'object') return;

      // 暂停时默认只同步进度；若 iframe 带来保护相位，补齐暂停原因
      if (!this.settings.isRunning) {
        if (typeof payload.progress === 'number') {
          this.status.progress = payload.progress;
        }
        if (typeof payload.hasVideo === 'boolean') {
          this.status.hasVideo = payload.hasVideo;
        }
        const specificPhases = ['verify', 'stall', 'limit', 'done', 'dead'];
        const hasSpecific = specificPhases.includes(this.status.phase);
        const canAdoptPhase =
          payload.phase &&
          isProtectedStatusPhase(payload.phase) &&
          typeof payload.detail === 'string' &&
          payload.detail &&
          // 勿用普通 paused 覆盖更具体的暂停原因
          !(hasSpecific && payload.phase === 'paused');
        if (canAdoptPhase) {
          const prevDetail = this.status.detail;
          this.status.phase = payload.phase;
          this.status.detail = payload.detail;
          this.status.updatedAt = Date.now();
          this.updateHud();
          this.publishStatus(true);
          if (shouldLogStatusChange(prevDetail, payload.detail)) {
            this.pushLog(payload.detail);
          }
          return;
        }
        this.status.updatedAt = Date.now();
        this.updateHudProgressOnly();
        this.publishStatus(false);
        return;
      }

      const prevDetail = this.status.detail;
      const nextDetail =
        typeof payload.detail === 'string' && payload.detail
          ? payload.detail
          : this.status.detail;
      this.status = {
        ...this.status,
        phase: payload.phase || this.status.phase,
        detail: nextDetail,
        progress:
          typeof payload.progress === 'number'
            ? payload.progress
            : this.status.progress,
        hasVideo:
          typeof payload.hasVideo === 'boolean'
            ? payload.hasVideo
            : this.status.hasVideo,
        updatedAt: Date.now()
      };
      if (force || shouldLogStatusChange(prevDetail, nextDetail)) {
        this.updateHud();
        this.publishStatus(true);
        if (shouldLogStatusChange(prevDetail, nextDetail)) this.pushLog(nextDetail);
      } else {
        this.updateHudProgressOnly();
        this.publishStatus(false);
      }
    }

    accumulateActiveTime() {
      if (!IS_TOP) return;
      const now = Date.now();
      if (!this.settings.isRunning) {
        this.lastActiveTickAt = 0;
        return;
      }
      if (!this.lastActiveTickAt) {
        this.lastActiveTickAt = now;
        return;
      }
      // 后台标签 interval 会被拉长，放宽单次累计上限以免漏计
      const maxDelta = document.visibilityState === 'hidden' ? 30000 : 4000;
      const delta = Math.min(Math.max(0, now - this.lastActiveTickAt), maxDelta);
      this.lastActiveTickAt = now;
      this.stats.activeMs = (Number(this.stats.activeMs) || 0) + delta;
      if (now - this.lastActivePersistAt >= 5000) {
        this.lastActivePersistAt = now;
        this.persistStats();
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
        this.handleRuntimeError(error);
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
        this.handleRuntimeError(error);
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
        this.handleRuntimeError(error);
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
            startedAt: Number(stats.startedAt) || Date.now(),
            activeMs: Number(stats.activeMs) || 0
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
        this.handleRuntimeError(error);
      }
    }

    async bumpStat(key) {
      if (!IS_TOP) {
        // iframe 不直接写统计，转由顶层统一累加，避免多帧并发读改写覆盖计数
        window.parent.postMessage({ type: 'XXT_STATS_BUMP', key }, '*');
        return;
      }
      if (!this.ensureAlive()) return;
      try {
        const result = await chrome.storage.local.get(STATS_KEY);
        const stats = result[STATS_KEY] || createEmptyStats();
        stats[key] = (Number(stats[key]) || 0) + 1;
        stats.activeMs = Math.max(
          Number(stats.activeMs) || 0,
          Number(this.stats.activeMs) || 0
        );
        this.stats = stats;
        await chrome.storage.local.set({ [STATS_KEY]: stats });
        this.publishStatus(true);
        this.updateHud();
        if (key === 'nextCount') await this.enforceLimits();
      } catch (error) {
        this.handleRuntimeError(error);
      }
    }

    async pauseForReason(reason, phase = 'limit') {
      if (!this.settings.isRunning || this.limitPausePending || !this.ensureAlive()) return;
      this.limitPausePending = true;
      try {
        if (!IS_TOP) {
          this.settings.isRunning = false;
          this.status.phase = phase;
          this.status.detail = reason;
          this.status.updatedAt = Date.now();
          try {
            window.parent.postMessage(
              { type: 'XXT_PAUSE_FOR_REASON', reason, phase },
              '*'
            );
          } catch (_) {}
          return;
        }
        this.setStatus(phase, reason);
        this.showToast(reason);
        this.pushLog(reason);
        await chrome.storage.sync.set({ isRunning: false });
      } catch (error) {
        this.handleRuntimeError(error, 'pauseForReason');
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
        await this.pauseForReason('目录已全部完成，已自动暂停', 'done');
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
        <div data-role="compact-view" style="display:none;align-items:center;gap:8px;cursor:pointer;">
          <strong style="font-size:13px;letter-spacing:0.2px;">学习通助手</strong>
          <span data-role="compact-meta" style="opacity:0.8;font-family:'Avenir Next','PingFang SC',sans-serif;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
          <button data-role="compact-toggle" type="button" title="开始/暂停">开始</button>
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
          <div data-role="quick" style="display:flex;gap:6px;margin-top:8px;">
            <button data-role="next" type="button" title="进入下一未完成节">下一节</button>
            <button data-role="reset-stats" type="button" title="重置切章/答题/活跃时长">重置会话</button>
          </div>
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

      const toggleRun = async e => {
        stop(e);
        if (!this.ensureAlive()) return;
        try {
          await chrome.storage.sync.set({ isRunning: !this.settings.isRunning });
        } catch (error) {
          this.handleRuntimeError(error);
        }
      };
      root.querySelector('[data-role="toggle"]').addEventListener('click', toggleRun);
      const compactToggle = root.querySelector('[data-role="compact-toggle"]');
      if (compactToggle) compactToggle.addEventListener('click', toggleRun);

      root.querySelector('[data-role="hide"]').addEventListener('click', async e => {
        stop(e);
        if (!this.ensureAlive()) return;
        try {
          await chrome.storage.sync.set({ showHud: false });
        } catch (error) {
          this.handleRuntimeError(error);
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

      root.querySelector('[data-role="next"]').addEventListener('click', e => {
        stop(e);
        if (this.status.phase === 'verify') {
          this.showToast('请先完成人工验证');
          return;
        }
        const scheduled = this.requestNextChapter('hud-next', { force: true });
        this.showToast(scheduled ? '正在切换下一节…' : '切章冷却中，请稍候');
      });

      root.querySelector('[data-role="reset-stats"]').addEventListener('click', async e => {
        stop(e);
        if (!this.ensureAlive()) return;
        this.stats = createEmptyStats();
        this.lastActiveTickAt = 0;
        this.hadRemaining = false;
        await this.persistStats();
        this.showToast('已重置统计与限流计数');
        this.pushLog('已重置会话统计与限流计数');
        this.updateHud();
        this.publishStatus(true);
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
        this.handleRuntimeError(error);
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

      const compactToggle = this.hud.querySelector('[data-role="compact-toggle"]');
      if (compactToggle) {
        compactToggle.textContent = this.settings.isRunning ? '暂停' : '开始';
      }

      if (isCompact) {
        compactMeta.textContent = this.formatCompactMeta(pct);
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
      stats.textContent = `${formatSessionStats(
        this.stats,
        Date.now(),
        this.settings
      )}${remainText}`;

      if (!this.settings.isRunning || this.status.phase === 'dead') {
        const keepReason =
          isProtectedStatusPhase(this.status.phase) && this.status.detail;
        detail.textContent = keepReason || '已停止';
        meta.textContent =
          this.status.phase === 'dead'
            ? '请刷新课程页后重新启用'
            : this.status.phase === 'stall'
              ? '可点“开始”重试播放'
              : this.status.phase === 'limit'
                ? '重置会话统计后可继续'
                : this.status.phase === 'verify'
                  ? '完成验证后点“开始”继续'
                  : this.status.phase === 'done'
                    ? '目录已学完'
                    : keepReason
                      ? '可点“开始”继续'
                      : '点击“开始”或在扩展弹窗中开启';
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

    formatCompactMeta(pct) {
      const bits = [];
      if (!this.settings.isRunning && isProtectedStatusPhase(this.status.phase)) {
        bits.push((this.status.detail || '已停止').slice(0, 18));
      } else {
        bits.push(this.settings.isRunning ? '运行中' : '已停止');
      }
      bits.push(`${this.settings.playbackSpeed}x`);
      if (this.status.hasVideo) bits.push(`${pct}%`);
      return bits.join(' · ');
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
        compactMeta.textContent = this.formatCompactMeta(pct);
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
      // 匹配优先级固定：学习通播放器（video_html5_api / video-js）优先，
      // 最后才兜底任意 video，避免文档页等场景误接管页面内其他视频
      return (
        document.querySelector('video#video_html5_api') ||
        document.querySelector('video[id*="video_html5"]') ||
        document.querySelector('.video-js video') ||
        document.querySelector('.ans-attach-ct video') ||
        document.querySelector('video') ||
        null
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
      this.recoverLevel = 0;
      this.setStatus('playing', '已接管视频', { hasVideo: true });

      video.addEventListener('play', () => {
        if (this.settings.isRunning) {
          video.playbackRate = this.settings.playbackSpeed;
          if (this.settings.mute) video.muted = true;
          this.setStatus('playing', '正在播放', { hasVideo: true });
        }
      });

      video.addEventListener('playing', () => {
        if (!this.goodPlaySince) this.goodPlaySince = Date.now();
      });

      video.addEventListener('waiting', () => this.onVideoBuffering(video));
      video.addEventListener('stalled', () => this.onVideoBuffering(video));
      video.addEventListener('error', () => this.recoverVideo(video, 'error'));

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
        // 后台标签 interval 可能被限速，用媒体事件驱动恢复检查
        if (this.settings.isRunning) {
          const now = Date.now();
          if (now - this.lastGuardAt >= 2000) {
            this.lastGuardAt = now;
            this.guardVideo(video);
          }
        }
      });

      video.addEventListener('ended', () => {
        this.log('视频播放完成');
        this.recoverLevel = 0;
        this.recoverFailCycles = 0;
        this.goodPlaySince = 0;
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

    onVideoBuffering(video) {
      if (!this.settings.isRunning || !video || video.ended) return;
      if (Date.now() - this.lastRecoverAt < 3000) return;
      this.recoverVideo(video, 'buffer');
    }

    recoverVideo(video, reason) {
      if (!this.settings.isRunning || !video || video.ended) return;
      const now = Date.now();
      if (now - this.lastRecoverAt < 2500) return;
      this.lastRecoverAt = now;
      this.goodPlaySince = 0;
      this.recoverLevel = Math.min((this.recoverLevel || 0) + 1, 4);
      const step = recoverStepLabel(this.recoverLevel);
      this.log('恢复播放:', reason, 'level', this.recoverLevel, step);
      this.setStatus(
        'recover',
        `播放卡顿，恢复 ${this.recoverLevel}/4（${step}）`,
        { hasVideo: true }
      );

      if (this.recoverLevel <= 1) {
        this.clickPlayOverlay();
        this.tryPlay(video);
        return;
      }
      if (this.recoverLevel === 2) {
        video.muted = true;
        this.tryPlay(video);
        return;
      }
      if (this.recoverLevel === 3) {
        try {
          video.currentTime = Math.max(0, (video.currentTime || 0) + 0.25);
        } catch (_) {}
        this.tryPlay(video);
        return;
      }

      // level 4：reload 一轮；连续失败则软暂停，避免无限空转
      this.recoverFailCycles += 1;
      if (this.recoverFailCycles >= 3) {
        this.recoverFailCycles = 0;
        this.recoverLevel = 0;
        this.pauseForReason('多次恢复失败，已自动暂停', 'stall');
        return;
      }
      try {
        const t = video.currentTime || 0;
        video.load();
        video.currentTime = t;
      } catch (_) {}
      if (this.settings.mute) video.muted = true;
      video.playbackRate = this.settings.playbackSpeed;
      this.tryPlay(video);
      this.recoverLevel = 0;
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
        this.accumulateActiveTime();
      }

      if (!this.settings.isRunning) {
        if (IS_TOP) {
          this.maybeHintVerificationCleared();
          this.updateHud();
        }
        return;
      }

      if (this.detectManualVerification()) return;

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
      if (this.settings.autoQuizSubmit) this.checkAndAnswerQuiz();
      this.handleDocumentReading();
      this.dismissJobFinishTip();
    }

    queryVerificationRoots() {
      return document.querySelectorAll(
        [
          '.maskDiv',
          '.popDiv',
          '.dialog',
          '.layui-layer',
          '.layui-layer-dialog',
          '.ant-modal',
          '.vjs-modal-dialog',
          '[role="dialog"]',
          '[class*="face"]',
          '[class*="verify"]'
        ].join(',')
      );
    }

    detectManualVerification() {
      if (!this.settings.isRunning) return false;
      const now = Date.now();
      if (now - this.lastVerifyCheckAt < 2000) return false;
      this.lastVerifyCheckAt = now;

      if (hasVisibleManualVerification([...this.queryVerificationRoots()], isVisible)) {
        this.verifyClearHintShown = false;
        this.pauseForReason('检测到需要人工验证，已自动暂停', 'verify');
        return true;
      }
      return false;
    }

    maybeHintVerificationCleared() {
      if (!IS_TOP || this.settings.isRunning) return;
      if (this.status.phase !== 'verify' || this.verifyClearHintShown) return;
      const now = Date.now();
      if (now - this.lastVerifyCheckAt < 2000) return;
      this.lastVerifyCheckAt = now;
      if (hasVisibleManualVerification([...this.queryVerificationRoots()], isVisible)) {
        return;
      }
      this.verifyClearHintShown = true;
      this.showToast('验证弹窗已消失，可点开始继续');
      // 保留 verify 相位，便于弹窗/badge 继续显示“待验证”
      this.setStatus('verify', '验证已消失，可点开始继续');
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
          this.goodPlaySince = 0;
          if (this.stallLastWall && now - this.stallLastWall >= 8000) {
            this.log('检测到播放卡顿，尝试恢复');
            this.recoverVideo(video, 'stall');
            this.stallLastWall = now;
          }
        } else {
          this.stallLastTime = t;
          this.stallLastWall = now;
          if (!this.goodPlaySince) this.goodPlaySince = now;
          // 连续正常播放约 2 秒后再清零恢复计数，避免微小跳动误重置
          if (
            (this.recoverLevel > 0 || this.recoverFailCycles > 0) &&
            now - this.goodPlaySince >= 2000
          ) {
            this.recoverLevel = 0;
            this.recoverFailCycles = 0;
          }
        }

        const progress = video.duration ? t / video.duration : this.status.progress;
        const playingDetail = '正在播放';
        const recovering = String(this.status.detail || '').includes('恢复');
        if (!recovering && this.status.detail !== playingDetail) {
          this.setStatus('playing', playingDetail, { hasVideo: true, progress });
        } else if (!recovering) {
          this.setProgress(progress);
        }
      }
    }

    handleTopFrameTasks() {
      if (this.switchToVideoTab()) return;

      if (this.settings.skipQuiz && this.isChapterTest() && !this.settings.autoQuizSubmit) {
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
        // 人脸/安全验证弹窗不自动点掉
        if (isManualVerificationText(root.textContent || '')) continue;
        if (clickIfMatch(root)) return true;
      }

      // 兜底扫描：仅处理可见弹窗容器内的按钮，避免误点页面普通控件
      for (const btn of document.querySelectorAll('a, button, .jb_btn')) {
        if (!isVisible(btn)) continue;
        const text = normalizeText(btn.textContent);
        if (!(text === '继续学习' || text === '我知道了')) continue;
        const host = btn.closest(
          '.maskDiv, .popDiv, .dialog, .layui-layer, .ant-modal, [role="dialog"]'
        );
        if (!host || !isVisible(host)) continue;
        if (isManualVerificationText(host.textContent || '')) continue;
        safeClick(btn);
        this.lastIdleDismissAt = Date.now();
        this.setStatus('dialog', `已关闭提示：${text}`);
        return true;
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

    // ---------- 章节测验自动作答 ----------

    findQuizSubmitButton() {
      const selectors = [
        '#submit',
        '.js-submit',
        '.btn.flex-btn.js-submit',
        'input[type="submit"]'
      ];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (isVisible(el)) return el;
        }
      }
      // 文本兜底：仅认“交卷”，避免与弹窗题的“提交”混淆
      for (const el of document.querySelectorAll('a, button, input[type="button"]')) {
        if (!isVisible(el)) continue;
        const text = normalizeText(el.textContent || el.value || '');
        if (text === '交卷' || text.includes('交卷')) return el;
      }
      return null;
    }

    findQuizPage() {
      if (Date.now() - this.lastQuizAt < 2500) return null;
      const containers = document.querySelectorAll('.tkTopic, .TiMu, .tk_topic, .questionLi');
      for (const el of containers) {
        if (!isVisible(el)) continue;
        // 视频弹窗题也复用 .tkTopic 类名，但位于弹出层内，需排除
        if (el.closest('.maskDiv, .popDiv, .ans-videoquiz, .layui-layer')) continue;
        if (!el.querySelector('input[type="radio"], input[type="checkbox"]')) continue;
        // 仅当页面存在交卷按钮时才视为章节测验页
        if (!this.findQuizSubmitButton()) continue;
        return el;
      }
      return null;
    }

    // 收集测验页全部客观题（按选项 name 分组，兼容题目容器结构不一的页面）
    collectQuizQuestions() {
      const groups = new Map();
      const inputs = [
        ...document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      ].filter(
        el => isVisible(el) && !el.closest('.maskDiv, .popDiv, .ans-videoquiz, .layui-layer')
      );
      for (const input of inputs) {
        const key = input.name || input; // 无 name 的选项各自成一组
        let group = groups.get(key);
        if (!group) {
          group = { inputs: [] };
          groups.set(key, group);
        }
        group.inputs.push(input);
      }
      return [...groups.values()].map(group => {
        const radios = group.inputs.filter(el => el.type === 'radio');
        const boxes = group.inputs.filter(el => el.type === 'checkbox');
        return {
          inputs: group.inputs,
          hasOptions: true,
          answered:
            radios.length > 0 ? radios.some(r => r.checked) : boxes.some(c => c.checked)
        };
      });
    }

    checkAndAnswerQuiz() {
      if (!this.settings.isRunning || !this.settings.autoQuizSubmit) return;
      const page = this.findQuizPage();
      if (!page) return;
      this.lastQuizAt = Date.now();

      const questions = this.collectQuizQuestions();
      if (!questions.length) return;

      let changed = false;
      for (const q of questions) {
        if (!q.hasOptions || q.answered) continue;
        const radios = q.inputs.filter(el => el.type === 'radio');
        const checkboxes = q.inputs.filter(el => el.type === 'checkbox');
        if (radios.length > 0) {
          safeClick(radios[Math.floor(Math.random() * radios.length)]);
          changed = true;
        } else if (checkboxes.length > 0) {
          const count = Math.max(1, Math.ceil(checkboxes.length / 2));
          [...checkboxes]
            .sort(() => Math.random() - 0.5)
            .slice(0, count)
            .forEach(box => safeClick(box));
          changed = true;
        }
      }

      const state = quizReadyToSubmit(questions);
      if (changed) {
        this.setStatus('quiz', `正在作答测验（${state.answeredCount}/${state.objectiveCount}）`);
        return;
      }
      if (state.ready) {
        this.setStatus('quiz', '测验已完整作答');
        this.submitQuiz();
      }
    }

    submitQuiz() {
      if (Date.now() - this.lastSubmitAt < 8000) return;
      this.lastSubmitAt = Date.now();
      const btn = this.findQuizSubmitButton();
      if (!btn) return;
      this.log('测验交卷');
      safeClick(btn);
      // 交卷确认弹窗（layui / 原生确认）
      setTimeout(() => {
        this.confirmQuizSubmitOnce();
        if (!IS_TOP) {
          window.parent.postMessage({ type: 'XXT_QUIZ_SUBMITTED' }, '*');
        }
      }, randomDelay(900, 1500));
    }

    confirmQuizSubmitOnce() {
      if (Date.now() - this.lastSubmitConfirmAt < 8000) return;
      this.lastSubmitConfirmAt = Date.now();
      const roots = document.querySelectorAll(
        '.layui-layer, .maskDiv, .popDiv, [role="dialog"], .ant-modal'
      );
      for (const root of roots) {
        if (!isVisible(root)) continue;
        const text = normalizeText(root.textContent || '');
        if (!/交卷|确定要|提交试卷/.test(text)) continue;
        const confirm = [...root.querySelectorAll('a, button, .layui-layer-btn0')].find(el => {
          if (!isVisible(el)) return false;
          const t = normalizeText(el.textContent || '');
          return t === '确定' || t === '确认' || t === '是' || t === '交卷' || t === '提交';
        });
        if (confirm) {
          safeClick(confirm);
          this.log('测验交卷确认:', normalizeText(confirm.textContent || ''));
          return true;
        }
      }
      return false;
    }

    requestNextChapter(reason, { force = false } = {}) {
      if (!force && !this.settings.autoNext) return false;
      if (this.nextPending || Date.now() - this.lastNextAt < 4000) return false;
      this.nextPending = true;
      this.lastNextAt = Date.now();
      this.log('请求切换下一章:', reason);

      const run = async () => {
        try {
          if (IS_TOP) {
            await this.performNextChapter(reason);
          } else {
            window.parent.postMessage({ type: 'XXT_GO_NEXT_CHAPTER', reason }, '*');
            // iframe 本地锁短暂占据，防止同一帧重复上报
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        } catch (error) {
          this.log('切换下一章失败:', error);
        } finally {
          // 顶层：锁持续到切章确认/超时全程结束，避免确认期间重复触发连跳两节
          this.nextPending = false;
        }
      };

      setTimeout(run, randomDelay(200, 800));
      return true;
    }

    getActiveChapterKey() {
      const name = document.querySelector('.posCatalog_active .posCatalog_name');
      return name
        ? (name.getAttribute('title') || name.textContent || '').trim()
        : '';
    }

    waitForChapterChange(beforeKey, timeoutMs = 4000) {
      return new Promise(resolve => {
        const start = Date.now();
        const timer = setInterval(() => {
          const nowKey = this.getActiveChapterKey();
          if (nowKey && beforeKey && nowKey !== beforeKey) {
            clearInterval(timer);
            resolve(true);
            return;
          }
          // 无目录时退化为标题变化或超时
          if (!beforeKey && nowKey) {
            clearInterval(timer);
            resolve(true);
            return;
          }
          if (Date.now() - start >= timeoutMs) {
            clearInterval(timer);
            resolve(false);
          }
        }, 250);
      });
    }

    async performNextChapter(reason = '') {
      const before = this.getActiveChapterKey();
      const result = this.goToNextChapter(reason);
      if (result === 'done') return false;
      if (result !== 'clicked') return false;

      // 测验页或无目录时：点击即视为成功
      if (reason === 'chapter-test' || !before) {
        this.setStatus('next', '已切换到下一节');
        await this.bumpStat('nextCount');
        return true;
      }

      let confirmed = await this.waitForChapterChange(before, 3500);
      if (!confirmed) {
        this.log('切章未确认，尝试备用入口');
        this.clickNextNavButton();
        this.clickNextCatalogItem();
        confirmed = await this.waitForChapterChange(before, 2500);
      }

      if (confirmed) {
        const title = this.refreshChapterTitle() || this.getActiveChapterKey();
        this.setStatus('next', '已确认切换到下一节', { chapter: title });
        await this.bumpStat('nextCount');
        return true;
      }

      this.refreshRemaining();
      if (this.status.remaining === 0 && this.hadRemaining && this.settings.stopWhenDone) {
        await this.pauseForReason('目录已全部完成，已自动暂停', 'done');
        return false;
      }

      this.setStatus('stuck', '切章未生效，请手动点下一节或刷新');
      this.showToast('切章可能未生效，请手动切换');
      return false;
    }

    clickNextNavButton() {
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
          return true;
        }
      }
      return false;
    }

    goToNextChapter(reason = '') {
      if (this.dismissJobFinishTip()) {
        this.setStatus('next', '正在切换下一节…');
        return 'clicked';
      }

      if (reason !== 'chapter-test') {
        if (this.clickNextCatalogItem()) return 'clicked';
      }

      if (this.clickNextNavButton()) {
        this.setStatus('next', '正在切换下一节…');
        return 'clicked';
      }

      if (reason === 'chapter-test' && this.clickNextCatalogItem()) return 'clicked';

      this.refreshRemaining();
      if (typeof this.status.remaining === 'number' && this.status.remaining === 0) {
        this.log('未找到下一章节入口，可能已学完');
        this.setStatus('done', '未找到下一节，可能已全部完成');
        this.showToast('没有更多未完成小节了');
        if (this.settings.stopWhenDone) {
          this.pauseForReason('目录已全部完成，已自动暂停', 'done');
        }
        return 'done';
      }

      this.log('未找到下一章节入口');
      this.setStatus('stuck', '未找到可用下一节入口');
      this.showToast('未找到下一节，可手动切换');
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
      const title = (name.getAttribute('title') || name.textContent || '').trim();
      this.log('目录切换到:', title);
      safeClick(name);
      this.setStatus('next', '正在切换下一节…', { chapter: title });
      return true;
    }
  }

  const player = new XueXiTongAutoPlayer();

  // 仅接受来自学习通域（含 iframe 子域）、教育网域或同源页面的受控消息，忽略第三方页面伪造消息
  const isTrustedMessage = event => {
    if (!event.origin) return true; // 同源消息（event.origin 为空）
    try {
      const host = new URL(event.origin).hostname.toLowerCase();
      return (
        host === 'chaoxing.com' ||
        host.endsWith('.chaoxing.com') ||
        host === 'fx361.com' ||
        host.endsWith('.fx361.com') ||
        host === 'edu.cn' ||
        host.endsWith('.edu.cn')
      );
    } catch (_) {
      return false;
    }
  };

  window.addEventListener('message', async event => {
    if (!event.data || !IS_TOP || player.dead) return;
    if (!isTrustedMessage(event)) return;
    if (event.data.type === 'XXT_GO_NEXT_CHAPTER' && player.settings.isRunning) {
      player.requestNextChapter(event.data.reason || 'iframe');
    } else if (event.data.type === 'XXT_STATS_BUMP') {
      // iframe 统计上报：由顶层统一累加写 storage（单写者模型）
      await player.bumpStat(String(event.data.key || ''));
    } else if (event.data.type === 'XXT_STATS_UPDATED') {
      await player.loadStats();
      player.publishStatus(true);
      player.updateHud();
    } else if (event.data.type === 'XXT_FRAME_STATUS') {
      player.applyFrameStatus(event.data.payload, !!event.data.force);
    } else if (event.data.type === 'XXT_PAUSE_FOR_REASON') {
      await player.pauseForReason(
        event.data.reason || '已自动暂停',
        event.data.phase || 'limit'
      );
    } else if (event.data.type === 'XXT_QUIZ_SUBMITTED') {
      // iframe 测验交卷完成，稍候跳转结果页后自动切下一节
      player.setStatus('quiz', '测验已交卷，准备下一节');
      setTimeout(() => player.requestNextChapter('quiz-submitted'), randomDelay(3000, 4500));
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
