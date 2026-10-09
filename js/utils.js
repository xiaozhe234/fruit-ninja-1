/* =========================================================================
 * utils.js —— 通用工具函数 + localStorage 安全封装
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.utils = {

    clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },

    lerp(a, b, t) { return a + (b - a) * t; },

    /* [a, b) 浮点随机 */
    rand(a, b) { return a + Math.random() * (b - a); },

    /* [a, b] 整数随机（含两端） */
    randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },

    /* 数组随机取一个元素 */
    choice(arr) { return arr[(Math.random() * arr.length) | 0]; },

    /**
     * 点 (px,py) 到线段 (x1,y1)-(x2,y2) 的最短距离
     * —— 切割判定的核心数学：轨迹线段 vs 水果圆形包围盒
     */
    segPointDist(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const cx = x1 + t * dx, cy = y1 + t * dy;
      const ex = px - cx, ey = py - cy;
      return Math.sqrt(ex * ex + ey * ey);
    },

    /* 两条线段夹角（刀光切割方向，用于生成两半碎片） */
    segAngle(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); },

    now() { return performance.now(); },
  };

  /* ---------- localStorage 安全封装：隐私模式 / file:// 异常时静默降级 ---------- */
  FN.store = {
    get(key, defVal) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? defVal : JSON.parse(v);
      } catch (e) { return defVal; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 资源异常不阻断游戏 */ }
    },
    /* 读 / 写 各模式最高分 */
    getBest(modeKey) {
      const v = FN.store.get(FN.CONFIG.STORAGE.best[modeKey], 0);
      return typeof v === 'number' && isFinite(v) ? v : 0;
    },
    setBest(modeKey, score) { FN.store.set(FN.CONFIG.STORAGE.best[modeKey], score); },
  };
})();
