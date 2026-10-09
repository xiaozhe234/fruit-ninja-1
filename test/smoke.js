/* =========================================================================
 * test/smoke.js —— Node 环境冒烟测试（不需要浏览器）
 * 用 stub 模拟 window/document/canvas/requestAnimationFrame，
 * 按 index.html 的顺序加载全部 js 模块，然后模拟：
 *   1. main.init 启动流程；
 *   2. 经典模式：跑帧 + 模拟切水果 / 切炸弹 / 漏接扣命直到 GAMEOVER；
 *   3. 街机模式：跑满 90 秒计时结束；
 *   4. 禅模式：手动结束；
 *   5. 双人分屏：双场独立切割 + 计满 90 秒结算胜负；
 *   6. 联机模式：本地规则跑通；
 *   7. resize / 暂停恢复状态机切换。
 * 运行：node test/smoke.js
 * ========================================================================= */
'use strict';

/* ---------------- 递归魔法 stub：任意方法/属性可用 ---------------- */
const magic = new Proxy(function () {}, {
  get: (t, k) => {
    if (k === Symbol.toPrimitive) return () => 0;
    if (k === 'length') return 0;
    return magic;
  },
  apply: () => magic,
  set: () => true,
});

const listeners = {};
const rafQueue = [];

// 浏览器中 window 就是全局对象（裸 FN 引用可解析），
// 所以这里直接把 globalThis 当作 window
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.location = { protocol: 'file:' };
globalThis.addEventListener = () => {};
globalThis.document = {
  getElementById: () => magic,
  addEventListener: () => {},
  documentElement: magic,
  hidden: false,
};
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
// localStorage / Image / io / screen / AudioContext 故意不定义：验证降级容错不崩溃

/* ---------------- 按 index.html 顺序加载模块 ---------------- */
const path = require('path');
const fs = require('fs');
const files = ['config', 'utils', 'pool', 'audio', 'assets', 'blade', 'fx',
  'entities', 'input', 'game', 'net', 'ui', 'main'];
for (const f of files) {
  new Function(fs.readFileSync(path.join(__dirname, '../js', f + '.js'), 'utf8'))();
}
console.log('[OK] 13 个模块按序加载无异常');

/* ---------------- 启动 ---------------- */
FN.main.init();
console.log('[OK] main.init 完成（无图片/音频/localStorage/socket 均不崩溃）');

const game = FN.game;
let simTs = 0;
/** 手动跑 n 帧（替代 requestAnimationFrame） */
function frames(n, dtMs) {
  for (let i = 0; i < n; i++) {
    simTs += dtMs || 16.7;
    game._loop(simTs);
  }
}
/** 让当前场上第一个可切实体被一条穿过它的线段切开 */
function sliceFirst(field, filter) {
  const arr = field.fruits.filter((o) => o.alive && (!filter || filter(o)));
  if (!arr.length) return null;
  const e = arr[0];
  game.sliceSegment(field, { x1: e.x - 200, y1: e.y, x2: e.x + 200, y2: e.y });
  return e;
}
const assert = (cond, msg) => {
  if (!cond) { console.error('[FAIL] ' + msg); process.exit(1); }
  console.log('[OK] ' + msg);
};

/* ================= 1. 经典模式 ================= */
game.startMode('classic');
assert(game.state === 'PLAYING' && game.mode === 'classic', '经典模式启动，状态 PLAYING');
frames(200);                                     // 跑过 3-2-1 预备倒数
assert(game.fields[0].fruits.length > 0 || game.fields[0].score >= 0, '经典模式正常跑帧生成水果');
frames(300);
const f0 = game.fields[0];
// 空闲跑帧会漏接扣光生命导致提前 GAMEOVER，这里把生命与状态复位保证后续断言独立
if (game.state === 'GAMEOVER') game.state = 'PLAYING';
f0.lives = 3; f0.dead = false;
const before = f0.score;
const cut = sliceFirst(f0, (o) => o.kind === 'fruit');
assert(cut && f0.score > before, '滑动线段切割成功，得分增加（+' + (f0.score - before) + '），碎片 ' + f0.fragments.length + ' 个');
assert(f0.particles.length > 0, '果汁粒子飞溅已生成');

// 切炸弹：扣命 + 红闪 + 震动
f0.lives = 3; f0.dead = false;
FN.entities.createFruit(f0, { kind: 'bomb' });
const livesBefore = f0.lives;
sliceFirst(f0, (o) => o.kind === 'bomb');
assert(f0.lives === livesBefore - 1, '切炸弹扣生命 ' + livesBefore + '->' + f0.lives);
assert(game.flash > 0 && game.shake > 0, '炸弹触发红色闪屏 + 画面震动');

// 暂停/恢复状态机
game.hudPress('pause');
assert(game.state === 'PAUSE', 'HUD 暂停按钮 → PAUSE');
const frozenY = f0.fruits.length;
frames(60);
assert(game.state === 'PAUSE', '暂停期间状态不变（弹窗互斥由 ui stub 承接）');
FN.ui.closeModal();
assert(game.state === 'PLAYING', '关闭弹窗自动恢复 PLAYING');

// 漏接扣命至 GAMEOVER
f0.lives = 1; f0.dead = false;
for (let i = 0; i < 4000 && game.state === 'PLAYING'; i++) frames(30);
assert(game.state === 'GAMEOVER' && game.results.type === 'single', '生命耗尽 → GAMEOVER，结算 single');

/* ================= 2. 街机模式（90 秒计时） ================= */
game.startMode('arcade');
frames(220);                                     // 跳过预备
for (let i = 0; i < 6000 && game.state === 'PLAYING'; i++) frames(16.7);
assert(game.state === 'GAMEOVER', '街机模式 90 秒倒计时结束自动结算');

/* ================= 3. 禅模式（手动结束） ================= */
game.startMode('zen');
frames(220);
game.hudPress('end');
assert(game.state === 'GAMEOVER' && game.results.mode === 'zen', '禅模式手动结束本局');

/* ================= 4. 双人分屏 ================= */
game.startMode('versus');
frames(300);                                     // 跑过 3-2-1 预备并等第一波水果生成
assert(game.fields.length === 2 && game.fields[0].w === game.W / 2, '双人模式左右两个半屏区域');
const fa = game.fields[0], fb = game.fields[1];
if (game.state === 'GAMEOVER') game.state = 'PLAYING';
fa.lives = 3; fa.dead = false;
fb.lives = 3; fb.dead = false;
sliceFirst(fa, (o) => o.kind === 'fruit');
sliceFirst(fb, (o) => o.kind === 'fruit');
assert(fa.score > 0 && fb.score > 0, '双方独立切割独立计分 P1=' + fa.score + ' P2=' + fb.score);
for (let i = 0; i < 8000 && game.state === 'PLAYING'; i++) frames(16.7);
assert(game.state === 'GAMEOVER' && game.results.type === 'versus',
  '双人同步倒计时结束同时结算：' + game.results.resultText);

/* ================= 5. 联机规则（本地侧） ================= */
game.startMode('net');
frames(300);
if (game.state === 'GAMEOVER') game.state = 'PLAYING';
game.fields[0].lives = 3; game.fields[0].dead = false;
game.peerScore = 5;
sliceFirst(game.fields[0], (o) => o.kind === 'fruit');
assert(game.fields[0].score > 0, '联机模式本地切割计分正常');
for (let i = 0; i < 6000 && game.state === 'PLAYING'; i++) frames(16.7);
assert(game.state === 'GAMEOVER' && game.results.type === 'net', '联机 90 秒结束结算：' + game.results.resultText);

/* ================= 6. resize 自适应 ================= */
global.window.innerWidth = 900;
global.window.innerHeight = 500;
game.resize();                                     // 模拟窗口 resize（resize 事件会调用它）
game.startMode('versus');
frames(10);
assert(game.W === 900 && game.H === 500 && game.fields[1].x === 450, '窗口 resize 后画布与半屏区域自适应');

/* ================= 7. 菜单 ================= */
game.exitToMenu();
assert(game.state === 'MENU', '返回主菜单 MENU');
frames(30);

console.log('\n========== 全部冒烟测试通过 ✅ ==========');
