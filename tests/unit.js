// 不依赖浏览器的单元测试
const assert = require('assert');
const path = require('path');
const DOM = require(path.join(__dirname, '..', 'shared', 'dom.js'));

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL: ${name} — ${error.message}`);
  }
}

test('formatProgress 边界', () => {
  assert.strictEqual(DOM.formatProgress(0), 0);
  assert.strictEqual(DOM.formatProgress(0.5), 50);
  assert.strictEqual(DOM.formatProgress(1), 100);
  assert.strictEqual(DOM.formatProgress(1.5), 100);
  assert.strictEqual(DOM.formatProgress(-1), 0);
});

test('clamp', () => {
  assert.strictEqual(DOM.clamp(5, 0, 10), 5);
  assert.strictEqual(DOM.clamp(-1, 0, 10), 0);
  assert.strictEqual(DOM.clamp(99, 0, 10), 10);
});

test('normalizeText', () => {
  assert.strictEqual(DOM.normalizeText(' 继 续\n学习 '), '继续学习');
});

test('randomDelay 落在区间内', () => {
  for (let i = 0; i < 50; i++) {
    const n = DOM.randomDelay(100, 200);
    assert.ok(n >= 100 && n <= 200);
  }
});

test('pickNextCatalogItem 跳过已完成', () => {
  const items = [
    { tipText: '已完成', title: 'a' },
    { tipText: '未完成', title: 'b' },
    { tipText: '未完成', title: 'c' }
  ];
  const picked = DOM.pickNextCatalogItem(items, 0);
  assert.strictEqual(picked.index, 1);
  assert.strictEqual(picked.item.title, 'b');
});

test('pickNextCatalogItem 从当前之后继续', () => {
  const items = [
    { tipText: '未完成', title: 'a' },
    { tipText: '已完成', title: 'b' },
    { tipText: '未完成', title: 'c' }
  ];
  const picked = DOM.pickNextCatalogItem(items, 0);
  assert.strictEqual(picked.index, 2);
  assert.strictEqual(picked.item.title, 'c');
});

test('pickNextCatalogItem 没有下一节返回 null', () => {
  const items = [
    { tipText: '未完成', title: 'a' },
    { tipText: '已完成', title: 'b' }
  ];
  assert.strictEqual(DOM.pickNextCatalogItem(items, 0), null);
});

test('pickNextCatalogItem 回绕到更早的未完成节', () => {
  const items = [
    { tipText: '未完成', title: 'a' },
    { tipText: '已完成', title: 'b' },
    { tipText: '未完成', title: 'c' }
  ];
  const picked = DOM.pickNextCatalogItem(items, 2);
  assert.strictEqual(picked.index, 0);
  assert.strictEqual(picked.item.title, 'a');
});

test('shouldLogStatusChange', () => {
  assert.strictEqual(DOM.shouldLogStatusChange('a', 'b'), true);
  assert.strictEqual(DOM.shouldLogStatusChange('a', 'a'), false);
  assert.strictEqual(DOM.shouldLogStatusChange('a', ''), false);
});

test('formatDuration', () => {
  assert.strictEqual(DOM.formatDuration(5000), '5秒');
  assert.strictEqual(DOM.formatDuration(65000), '1分5秒');
  assert.strictEqual(DOM.formatDuration(3661000), '1小时1分');
});

test('formatSessionStats', () => {
  const text = DOM.formatSessionStats(
    { nextCount: 2, answerCount: 1, startedAt: Date.now() - 600000, activeMs: 5000 },
    Date.now()
  );
  assert.ok(text.includes('切章 2'));
  assert.ok(text.includes('答题 1'));
  assert.ok(text.includes('5秒'), text);
});

test('formatSessionStats 含限流配额', () => {
  const text = DOM.formatSessionStats(
    { nextCount: 2, answerCount: 1, startedAt: Date.now(), activeMs: 120000 },
    Date.now(),
    { maxChapters: 5, maxMinutes: 30 }
  );
  assert.ok(text.includes('切章 2/5'), text);
  assert.ok(text.includes('活跃 2/30分'), text);
});

test('recoverStepLabel', () => {
  assert.strictEqual(DOM.recoverStepLabel(1), '点击播放');
  assert.strictEqual(DOM.recoverStepLabel(4), '重新加载');
});

test('isManualVerificationText', () => {
  assert.strictEqual(DOM.isManualVerificationText('请完成人脸识别'), true);
  assert.strictEqual(DOM.isManualVerificationText('安全验证'), true);
  assert.strictEqual(DOM.isManualVerificationText('继续学习'), false);
});

test('isProtectedStatusPhase', () => {
  assert.strictEqual(DOM.isProtectedStatusPhase('limit'), true);
  assert.strictEqual(DOM.isProtectedStatusPhase('verify'), true);
  assert.strictEqual(DOM.isProtectedStatusPhase('stall'), true);
  assert.strictEqual(DOM.isProtectedStatusPhase('playing'), false);
});

test('hasVisibleManualVerification', () => {
  const roots = [
    { textContent: '继续学习', visible: true },
    { textContent: '请完成人脸识别', visible: true }
  ];
  assert.strictEqual(
    DOM.hasVisibleManualVerification(roots, el => el.visible),
    true
  );
  assert.strictEqual(
    DOM.hasVisibleManualVerification(
      [{ textContent: '继续学习', visible: true }],
      el => el.visible
    ),
    false
  );
});

test('badgeForPausedPhase', () => {
  assert.strictEqual(DOM.badgeForPausedPhase('verify').text, '验');
  assert.strictEqual(DOM.badgeForPausedPhase('stall').text, '卡');
  assert.strictEqual(DOM.badgeForPausedPhase('limit').text, '满');
  assert.strictEqual(DOM.badgeForPausedPhase('done').text, '完');
  assert.strictEqual(DOM.badgeForPausedPhase('').text, '停');
});

test('summarizeOptions', () => {
  const chips = DOM.summarizeOptions({
    autoAnswer: true,
    mute: true,
    skipQuiz: false,
    autoNext: true,
    dismissIdle: false,
    showHud: true,
    stopWhenDone: true,
    maxChapters: 5,
    maxMinutes: 30
  });
  assert.deepStrictEqual(chips, [
    '答题',
    '静音',
    '自动下一节',
    '浮层',
    '学完即停',
    '限5节',
    '限30分'
  ]);
});

test('summarizeOptions 含测验作答', () => {
  const chips = DOM.summarizeOptions({
    autoAnswer: true,
    autoQuizSubmit: true,
    skipQuiz: true,
    mute: false,
    autoNext: false,
    dismissIdle: false,
    showHud: false,
    stopWhenDone: false,
    maxChapters: 0,
    maxMinutes: 0
  });
  assert.ok(chips.includes('测验作答'), chips.join(','));
  assert.ok(chips.includes('答题'), chips.join(','));
});

test('shouldStopByLimits 切章上限', () => {
  const result = DOM.shouldStopByLimits(
    { nextCount: 3, startedAt: Date.now() },
    { maxChapters: 3, maxMinutes: 0 }
  );
  assert.strictEqual(result.stop, true);
  assert.ok(result.reason.includes('切章上限'));
});

test('shouldStopByLimits 时长上限（活跃时长）', () => {
  const now = Date.now();
  const result = DOM.shouldStopByLimits(
    { nextCount: 0, startedAt: now, activeMs: 6 * 60000 },
    { maxChapters: 0, maxMinutes: 5 },
    now
  );
  assert.strictEqual(result.stop, true);
  assert.ok(result.reason.includes('时长上限'));
});

test('shouldStopByLimits 暂停时间不计入活跃时长', () => {
  const now = Date.now();
  const result = DOM.shouldStopByLimits(
    { nextCount: 0, startedAt: now - 60 * 60000, activeMs: 2 * 60000 },
    { maxChapters: 0, maxMinutes: 5 },
    now
  );
  assert.strictEqual(result.stop, false);
});

test('shouldStopByLimits 未超限', () => {
  const now = Date.now();
  const result = DOM.shouldStopByLimits(
    { nextCount: 1, startedAt: now, activeMs: 0 },
    { maxChapters: 5, maxMinutes: 30 },
    now
  );
  assert.strictEqual(result.stop, false);
});

test('trimSet 超限裁剪保留末尾', () => {
  const trimmed = DOM.trimSet([1, 2, 3, 4, 5], 3);
  assert.deepStrictEqual([...trimmed], [3, 4, 5]);
});

test('trimSet 未超限原样', () => {
  const trimmed = DOM.trimSet(['a', 'b'], 5);
  assert.deepStrictEqual([...trimmed], ['a', 'b']);
});

test('isHighSpeed', () => {
  assert.strictEqual(DOM.isHighSpeed(2), false);
  assert.strictEqual(DOM.isHighSpeed(2.25), true);
});

test('createEmptyStats', () => {
  const stats = DOM.createEmptyStats(123);
  assert.deepStrictEqual(stats, {
    nextCount: 0,
    answerCount: 0,
    startedAt: 123,
    activeMs: 0
  });
});

test('countRemainingCatalog', () => {
  const items = [
    { tipText: '未完成' },
    { tipText: '已完成' },
    { tipText: '未完成' },
    { tipText: '' }
  ];
  // 空 tip 不计，避免目录提示未加载时虚高
  assert.strictEqual(DOM.countRemainingCatalog(items), 2);
});

test('fingerprintText', () => {
  assert.strictEqual(DOM.fingerprintText(' 题 目 A '), '题目A');
});

test('pickSettings 只合并已知键', () => {
  const defaults = { isRunning: true, playbackSpeed: 1.5, mute: true };
  const picked = DOM.pickSettings(
    { playbackSpeed: 2, mute: false, evil: 1 },
    defaults
  );
  assert.deepStrictEqual(picked, { isRunning: true, playbackSpeed: 2, mute: false });
});

test('pickSettings 强制类型', () => {
  const defaults = { isRunning: true, playbackSpeed: 1.5, maxChapters: 0 };
  const picked = DOM.pickSettings(
    { isRunning: 0, playbackSpeed: '2.5', maxChapters: '3' },
    defaults
  );
  assert.strictEqual(picked.isRunning, false);
  assert.strictEqual(picked.playbackSpeed, 2.5);
  assert.strictEqual(picked.maxChapters, 3);
});

test('quizReadyToSubmit 全部客观题已作答', () => {
  const state = DOM.quizReadyToSubmit([
    { hasOptions: true, answered: true },
    { hasOptions: true, answered: true }
  ]);
  assert.deepStrictEqual(state, { ready: true, objectiveCount: 2, answeredCount: 2 });
});

test('quizReadyToSubmit 存在未答客观题不可交卷', () => {
  const state = DOM.quizReadyToSubmit([
    { hasOptions: true, answered: true },
    { hasOptions: true, answered: false }
  ]);
  assert.strictEqual(state.ready, false);
  assert.strictEqual(state.objectiveCount, 2);
  assert.strictEqual(state.answeredCount, 1);
});

test('quizReadyToSubmit 全主观题不可交卷', () => {
  const state = DOM.quizReadyToSubmit([
    { hasOptions: false, answered: true },
    { hasOptions: false, answered: true }
  ]);
  assert.strictEqual(state.ready, false);
  assert.strictEqual(state.objectiveCount, 0);
});

test('quizReadyToSubmit 客观题+主观题混合：主观题不算门槛', () => {
  const state = DOM.quizReadyToSubmit([
    { hasOptions: true, answered: true },
    { hasOptions: false, answered: true }
  ]);
  assert.strictEqual(state.ready, true);
  assert.strictEqual(state.objectiveCount, 1);
  assert.strictEqual(state.answeredCount, 1);
});

console.log(failed === 0 ? '\n单元测试全部通过' : `\n单元测试失败: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
