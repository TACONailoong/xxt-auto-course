/**
 * 端到端测试：用 Chromium 加载扩展，验证核心能力。
 *
 * 依赖：
 *   npm install puppeteer-core
 *   npx @puppeteer/browsers install chromium@latest --path ./browsers
 *   ffmpeg -y -f lavfi -i testsrc=duration=30:size=320x240:rate=10 -c:v libvpx -an tests/fixtures/test.webm
 *
 * 用法：
 *   node tests/mock-server.js &
 *   CHROME_PATH=... node tests/e2e.js
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

    // 顶层浮层存在
    const hudExists = await page.$eval('#xxt-assistant-hud', el => !!el).catch(() => false);
    check('页面状态浮层已显示', hudExists);

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
      check('即时保存后倍速变为 2x', newRate !== null && Math.abs(newRate - 2) < 0.01, `rate=${newRate}`);
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
    check('章节测验自动跳过', nextClicks > 0 || quizLogs.some(l => l.includes('跳过章节测验')), `clicks=${nextClicks}`);
  } catch (error) {
    console.error('测试执行出错:', error);
    failures.push('执行异常');
  } finally {
    await browser.close();
  }

  console.log(failures.length === 0 ? '\n全部通过' : `\n失败项: ${failures.join(', ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
})();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
