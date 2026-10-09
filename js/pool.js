/* =========================================================================
 * pool.js —— 简易对象池
 * 复用 水果 / 碎片 / 粒子 / 飘字 对象，避免每帧大量 new 导致 GC 卡顿。
 * 用法：const o = pool.obtain();  ...使用...  pool.release(o);
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.Pool = class Pool {
    constructor(factory) {
      this._factory = factory;   // 对象工厂：池空时 new 一个
      this._free = [];           // 空闲对象列表
    }
    obtain() { return this._free.length ? this._free.pop() : this._factory(); }
    release(obj) { this._free.push(obj); }
  };

  /* 全局共享的对象池（单线程渲染，跨区域共享没有问题） */
  FN.pools = {
    fruit:    new FN.Pool(() => ({ kind: '', type: '', bonusType: null, x: 0, y: 0, vx: 0, vy: 0, r: 0, rot: 0, vrot: 0, alive: false })),
    fragment: new FN.Pool(() => ({ type: '', x: 0, y: 0, vx: 0, vy: 0, r: 0, cutAngle: 0, side: 1, rot: 0, spin: 0, alive: false })),
    particle: new FN.Pool(() => ({ kind: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', grav: 900, alive: false })),
    ftext:    new FN.Pool(() => ({ x: 0, y: 0, text: '', color: '#fff', size: 20, life: 0, maxLife: 1, vy: -46, alive: false })),
  };
})();
