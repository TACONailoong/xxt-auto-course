/**
 * 端到端测试：用 Chromium 加载扩展，验证核心能力。
 *
 * 用法：npm test
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '..');
const CHROME_PATH =
  process.env.CHROME_PATH ||
  findChromium() ||
  '/usr/local/bin/google-chrome';

function findChromium() {
  const base = path.join(__dirname, 'browsers', 'chromium');
  if (!fs.existsSync(base)) return null;
  const versions = fs.readdirSync(base);
  for (const v of versions) {
    const candidate = path.join(base, v, 'chrome-linux', 'chrome');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--host-resolver-rules=MAP *.chaoxing.com 127.0.0.1',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const failures = [];
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failures.push(name);
  };

  try {
    const swTarget = await browser
      .waitForTarget(t => t.type() === 'service_worker' && t.url().includes('background.js'), {
        timeout: 10000
      })
      .catch(() => null);
    check('扩展 service worker 已注册', !!swTarget, swTarget ? swTarget.url() : '未找到');
    const extId = swTarget ? new URL(swTarget.url()).host : null;

    const page = await browser.newPage();
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    await page.goto('http://test.chaoxing.com:8080/', {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await sleep(4500);

    check('内容脚本已注入', logs.some(l => l.includes('[学习通助手]')));
    check('检测到 iframe 内视频', logs.some(l => l.includes('检测到视频')));
    check('自动切换到视频页签', logs.some(l => l.includes('切换到视频页签')));

    const hudExists = await page.$eval('#xxt-assistant-hud', el => !!el).catch(() => false);
    check('页面状态浮层已显示', hudExists);

    const hudMeta = await page
      .evaluate(() => {
        const hud = document.querySelector('#xxt-assistant-hud');
        if (!hud) return null;
        return {
          hasToggle: !!hud.querySelector('[data-role="toggle"]'),
          hasBar: !!hud.querySelector('[data-role="bar-fill"]'),
          chapter: (hud.querySelector('[data-role="chapter"]') || {}).textContent || ''
        };
      })
      .catch(() => null);
    check('浮层包含暂停按钮', !!(hudMeta && hudMeta.hasToggle));
    check('浮层包含进度条', !!(hudMeta && hudMeta.hasBar));
    check(
      '浮层显示当前章节',
      !!(hudMeta && hudMeta.chapter.includes('第一课')),
      hudMeta && hudMeta.chapter
    );

    const hasCompact = await page
      .$eval('#xxt-assistant-hud [data-role="compact"]', el => !!el)
      .catch(() => false);
    check('浮层支持收起', hasCompact);

    const hasSpeedBtns = await page
      .evaluate(() => {
        const hud = document.querySelector('#xxt-assistant-hud');
        return !!(
          hud &&
          hud.querySelector('[data-role="speed-up"]') &&
          hud.querySelector('[data-role="speed-down"]')
        );
      })
      .catch(() => false);
    check('浮层支持快捷调速', hasSpeedBtns);

    const hasQuickActions = await page
      .evaluate(() => {
        const hud = document.querySelector('#xxt-assistant-hud');
        return !!(
          hud &&
          hud.querySelector('[data-role="next"]') &&
          hud.querySelector('[data-role="reset-stats"]')
        );
      })
      .catch(() => false);
    check('浮层支持下一节与重置会话', hasQuickActions);

    const hasCompactToggle = await page
      .$eval('#xxt-assistant-hud [data-role="compact-toggle"]', el => !!el)
      .catch(() => false);
    check('收起态提供快捷启停按钮', hasCompactToggle);

    let videoState = null;
    for (const f of page.frames()) {
      videoState = await f
        .evaluate(() => {
          const v = document.querySelector('video');
          return v ? { rate: v.playbackRate, paused: v.paused, muted: v.muted } : null;
        })
        .catch(() => null);
      if (videoState) break;
    }
    check(
      '视频倍速为默认 1.5x',
      videoState && Math.abs(videoState.rate - 1.5) < 0.01,
      JSON.stringify(videoState)
    );
    check('视频已自动播放', videoState && videoState.paused === false, JSON.stringify(videoState));
    check('默认静音播放', videoState && videoState.muted === true, JSON.stringify(videoState));

    // iframe 进度应同步到顶层浮层
    await sleep(2500);
    let hudProgress = 0;
    for (let i = 0; i < 6; i++) {
      hudProgress = await page
        .evaluate(() => {
          const fill = document.querySelector('#xxt-assistant-hud [data-role="bar-fill"]');
          if (!fill) return 0;
          const w = fill.style.width || '0%';
          return parseFloat(w) || 0;
        })
        .catch(() => 0);
      if (hudProgress > 0) break;
      await sleep(1000);
    }
    check('浮层进度已从 iframe 同步', hudProgress > 0, `progress=${hudProgress}%`);

    // 防挂机弹窗
    await page.evaluate(() => window.__showIdle());
    await sleep(3500);
    const idleDismissed = await page.evaluate(() => window.__idleDismissed === true);
    check('防挂机弹窗已自动关闭', idleDismissed);

    // 答题弹窗
    for (const f of page.frames()) {
      const shown = await f
        .evaluate(() => {
          if (typeof window.__showQuiz === 'function') {
            window.__showQuiz();
            return true;
          }
          return false;
        })
        .catch(() => false);
      if (shown) break;
    }
    await sleep(4000);
    check('自动答题触发', logs.some(l => l.includes('自动答题')));

    // 任务完成后走目录切章（跳过已完成项）
    await page.evaluate(() => window.__markFinished());
    await sleep(5500);
    const catalogTarget = await page.evaluate(() => window.__catalogClicked);
    check(
      '任务完成后从目录切到下一未完成节',
      catalogTarget === '1.2 第二课',
      `clicked=${catalogTarget}`
    );

    if (extId) {
      const popup = await browser.newPage();
      const popupErrors = [];
      popup.on('pageerror', e => popupErrors.push(String(e)));
      popup.on('console', msg => {
        if (msg.type() === 'error') popupErrors.push(msg.text());
      });
      await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'load' });
      await sleep(1000);
      check('弹窗无 JS/CSP 错误', popupErrors.length === 0, popupErrors.join('; '));

      const statusText = await popup.$eval('#statusText', el => el.textContent);
      check('弹窗显示运行中', statusText === '插件运行中', statusText);

      const brand = await popup.$eval('.brand-text h1', el => el.textContent);
      check('弹窗品牌标题可见', brand.includes('学习通助手'), brand);

      const moreExists = await popup.$eval('details.more', el => !!el).catch(() => false);
      check('次要选项已折叠收纳', moreExists);

      const logText = await popup.$eval('#logList', el => el.textContent);
      check('弹窗显示活动日志', logText && !logText.includes('暂无活动记录'), logText.slice(0, 80));

      const chapterText = await popup.$eval('#liveChapter', el => el.textContent);
      check('弹窗显示章节名', chapterText.includes('第一课') || chapterText.includes('第二课'), chapterText);

      const statsText = await popup.$eval('#statsRow', el => el.textContent);
      check(
        '弹窗显示会话统计',
        /切章\s*[1-9]/.test(statsText) && /答题\s*1\b/.test(statsText),
        statsText
      );

      const chips = await popup.$eval('#optionChips', el => el.textContent);
      check(
        '折叠区显示选项摘要',
        chips.includes('静音') && chips.includes('答题') && chips.includes('学完即停'),
        chips
      );

      const stopWhenDoneExists = await popup
        .$eval('#toggleStopWhenDone', el => !!el)
        .catch(() => false);
      check('弹窗提供学完自动暂停开关', stopWhenDoneExists);

      const maxChaptersExists = await popup
        .$eval('#maxChaptersInput', el => el.type === 'number')
        .catch(() => false);
      const maxMinutesExists = await popup
        .$eval('#maxMinutesInput', el => el.type === 'number')
        .catch(() => false);
      check('弹窗提供会话限流输入', maxChaptersExists && maxMinutesExists);

      const footerText = await popup.$eval('.footer', el => el.textContent);
      check('弹窗版本为 1.13.0', footerText.includes('v1.13.0'), footerText);

      const liveProgressWidth = await popup.$eval('#liveProgress', el => el.style.width || '0%');
      const livePct = parseFloat(liveProgressWidth) || 0;
      check('弹窗进度条反映播放进度', livePct > 0, `width=${liveProgressWidth}`);

      await popup.click('.preset-btn[data-speed="3"]');
      await sleep(200);
      const warnHidden = await popup.$eval('#speedWarn', el => el.hidden);
      check('高倍速显示风险提示', warnHidden === false);

      const online = await popup.$eval('#nowPanel', el => el.classList.contains('is-online'));
      check('弹窗处于已连接态', online);

      const remainText = await popup.$eval('#remainRow', el => el.textContent);
      const remainHidden = await popup.$eval('#remainRow', el => el.hidden);
      check(
        '弹窗显示剩余未完成数',
        !remainHidden && /剩余未完成：\s*[1-9]/.test(remainText),
        remainText
      );

      const shortcutHint = await popup.$eval('.shortcut-hint', el => el.textContent);
      check('弹窗展示快捷键说明', shortcutHint.includes('Alt+Shift+S'), shortcutHint);

      const exportExists = await popup.$eval('#exportSettingsBtn', el => !!el).catch(() => false);
      check('支持导出设置入口', exportExists);

      // 恢复到 2x，供后续即时保存断言使用
      await popup.click('.preset-btn[data-speed="2"]');

      const aria = await popup.$eval('#toggleAuto', el => el.getAttribute('aria-checked'));
      check('开关具备无障碍属性', aria === 'true' || aria === 'false', `aria-checked=${aria}`);

      // 即时保存：改倍速无需点保存按钮
      await popup.click('.preset-btn[data-speed="2"]');
      await sleep(2500);

      let newRate = null;
      for (const f of page.frames()) {
        newRate = await f
          .evaluate(() => {
            const v = document.querySelector('video');
            return v ? v.playbackRate : null;
          })
          .catch(() => null);
        if (newRate !== null) break;
      }
      check(
        '即时保存后倍速变为 2x',
        newRate !== null && Math.abs(newRate - 2) < 0.01,
        `rate=${newRate}`
      );

      // badge：通过 service worker 执行查询
      const worker = swTarget.worker ? await swTarget.worker() : null;
      if (worker) {
        const badge = await worker.evaluate(async () => {
          return await chrome.action.getBadgeText({});
        });
        check('扩展图标 badge 为 ON', badge === 'ON', `badge=${badge}`);
      } else {
        check('扩展图标 badge 为 ON', false, '无法访问 service worker');
      }

      await popup.close();
    }

    // 人脸/人工验证：仅检测并暂停，不绕过
    await page.evaluate(() => window.__showFace());
    await sleep(3500);
    const afterFace = await page.evaluate(() => {
      const detail = document.querySelector('#xxt-assistant-hud [data-role="detail"]');
      const toggle = document.querySelector('#xxt-assistant-hud [data-role="toggle"]');
      return {
        detail: (detail && detail.textContent) || '',
        toggle: (toggle && toggle.textContent) || ''
      };
    });
    let facePausedInStorage = false;
    const faceWorker = swTarget && swTarget.worker ? await swTarget.worker() : null;
    if (faceWorker) {
      facePausedInStorage = await faceWorker.evaluate(async () => {
        const sync = await chrome.storage.sync.get({ isRunning: true });
        return sync.isRunning === false;
      });
    }
    check(
      '检测到人工验证后自动暂停',
      facePausedInStorage &&
        afterFace.toggle === '开始' &&
        /人工验证|人脸/.test(afterFace.detail),
      JSON.stringify({ ...afterFace, facePausedInStorage })
    );

    if (faceWorker) {
      const verifyBadge = await faceWorker.evaluate(async () => {
        return await chrome.action.getBadgeText({});
      });
      check('验证暂停后 badge 为验', verifyBadge === '验', `badge=${verifyBadge}`);
    }

    // 弹窗应实时反映自动暂停相位
    const popupLive = await browser.newPage();
    await popupLive.goto(`chrome-extension://${extId}/popup.html`, {
      waitUntil: 'load'
    });
    await sleep(1000);
    const liveKicker = await popupLive.$eval('#nowKicker', el => el.textContent);
    const liveStatus = await popupLive.$eval('#statusText', el => el.textContent);
    check(
      '弹窗实时显示待人工验证',
      /待人工验证|验证/.test(liveKicker) && liveStatus.includes('停止'),
      `kicker=${liveKicker}; status=${liveStatus}`
    );
    await popupLive.close();

    // 验证弹窗消失后提示可继续（不自动绕过）
    await page.evaluate(() => {
      const mask = document.getElementById('faceMask');
      if (mask) mask.style.display = 'none';
    });
    await sleep(3500);
    const afterClear = await page.evaluate(() => {
      const detail = document.querySelector('#xxt-assistant-hud [data-role="detail"]');
      const toast = document.getElementById('xxt-assistant-toast');
      return {
        detail: (detail && detail.textContent) || '',
        toast: (toast && toast.textContent) || ''
      };
    });
    check(
      '验证消失后提示可继续',
      /验证已消失|可点开始/.test(afterClear.detail) ||
        /验证.*消失|可点开始/.test(afterClear.toast),
      JSON.stringify(afterClear)
    );

    // 恢复运行，供后续测验页用例使用
    if (faceWorker) {
      await faceWorker.evaluate(async () => {
        await chrome.storage.sync.set({ isRunning: true });
      });
    }
    await sleep(800);

    // 恢复后粘滞相位应被清除，浮层不再卡在验证文案
    await sleep(2000);
    const afterResume = await page.evaluate(() => {
      const detail = document.querySelector('#xxt-assistant-hud [data-role="detail"]');
      const toggle = document.querySelector('#xxt-assistant-hud [data-role="toggle"]');
      return {
        detail: (detail && detail.textContent) || '',
        toggle: (toggle && toggle.textContent) || ''
      };
    });
    check(
      '恢复运行后清除验证粘滞状态',
      afterResume.toggle === '暂停' && !/人工验证/.test(afterResume.detail),
      JSON.stringify(afterResume)
    );

    // 测验页跳过
    const quizPage = await browser.newPage();
    const quizLogs = [];
    quizPage.on('console', msg => quizLogs.push(msg.text()));
    await quizPage.goto('http://test.chaoxing.com:8080/quiz', {
      waitUntil: 'networkidle0',
      timeout: 15000
    });
    await sleep(4000);
    const nextClicks = await quizPage.evaluate(() => window.__nextClicks || 0);
    check(
      '章节测验自动跳过',
      nextClicks > 0 || quizLogs.some(l => l.includes('跳过章节测验')),
      `clicks=${nextClicks}`
    );
  } catch (error) {
    console.error('测试执行出错:', error);
    failures.push('执行异常');
  } finally {
    await browser.close();
  }

  console.log(failures.length === 0 ? '\n全部通过' : `\n失败项: ${failures.join(', ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
})();
