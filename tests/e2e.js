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
        /切章\s*[1-9]/.test(statsText) && /答题\s*[1-9]/.test(statsText),
        statsText
      );

      const online = await popup.$eval('#nowPanel', el => el.classList.contains('is-online'));
      check('弹窗处于已连接态', online);

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
    }

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
