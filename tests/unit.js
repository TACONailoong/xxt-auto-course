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

test('shouldLogStatusChange', () => {
  assert.strictEqual(DOM.shouldLogStatusChange('a', 'b'), true);
  assert.strictEqual(DOM.shouldLogStatusChange('a', 'a'), false);
  assert.strictEqual(DOM.shouldLogStatusChange('a', ''), false);
});

console.log(failed === 0 ? '\n单元测试全部通过' : `\n单元测试失败: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
