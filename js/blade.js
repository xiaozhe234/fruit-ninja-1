/* =========================================================================
 * blade.js —— 刀光轨迹
 * · 收集鼠标 / 触摸滑动轨迹点，多点二次贝塞尔平滑插值；
 * · 发光描边（shadowBlur）+ 白色内核，玩家1黄色 / 玩家2蓝色；
 * · 松开后 250ms 内整体渐变淡出消失；轨迹点超龄自动裁剪形成拖尾。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.Blade = class Blade {
    constructor(playerIndex) {
      this.player = playerIndex;
      this.color = FN.CONFIG.BLADE.colors[playerIndex === 1 ? 'p2' : 'p1'];
      this.points = [];        // {x, y, t}
      this.active = false;     // 按住中才能切割
      this.releasedAt = 0;
    }

    begin(x, y) {
      this.points.length = 0;
      this.active = true;
      this.releasedAt = 0;
      this.addPoint(x, y);
    }

    addPoint(x, y) {
      const p = this.points[this.points.length - 1];
      if (p && Math.abs(p.x - x) < 1.5 && Math.abs(p.y - y) < 1.5) return; // 过滤微抖动
      this.points.push({ x, y, t: FN.utils.now() });
      if (this.points.length > 28) this.points.shift();
    }

    release() {
      this.active = false;
      this.releasedAt = FN.utils.now();
    }

    /** 裁剪超龄轨迹点；返回 true 表示轨迹已彻底消失可回收 */
    update() {
      const expire = FN.utils.now() - FN.CONFIG.BLADE.pointLife;
      while (this.points.length && this.points[0].t < expire) this.points.shift();
      return this.isGone();
    }

    isGone() {
      return !this.active && this.points.length === 0;
    }

    /** 当前透明度：按住=1；松开后 250ms 内 1→0 */
    alpha() {
      if (this.active) return 1;
      const dt = FN.utils.now() - this.releasedAt;
      return Math.max(0, 1 - dt / FN.CONFIG.BLADE.fadeMs);
    }

    /** 最近一段轨迹线段（供切割判定），点不足或没滑动距离返回 null */
    lastSegment() {
      const n = this.points.length;
      if (n < 2) return null;
      const a = this.points[n - 2], b = this.points[n - 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < FN.CONFIG.BLADE.minSliceDist) return null;   // 单纯点击不算切割
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }

    /** 中点平滑二次贝塞尔路径 */
    _path(ctx) {
      const p = this.points;
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i].x + p[i + 1].x) / 2;
        const my = (p[i].y + p[i + 1].y) / 2;
        ctx.quadraticCurveTo(p[i].x, p[i].y, mx, my);
      }
      const last = p[p.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    render(ctx) {
      if (this.points.length < 2) return;
      const a = this.alpha();
      if (a <= 0) return;
      const B = FN.CONFIG.BLADE;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 第一遍：彩色发光层
      ctx.strokeStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = B.glow;
      ctx.lineWidth = B.width;
      ctx.globalAlpha = 0.85 * a;
      this._path(ctx);
      ctx.stroke();

      // 第二遍：白色高亮内核
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = B.coreWidth;
      ctx.globalAlpha = 0.95 * a;
      this._path(ctx);
      ctx.stroke();

      ctx.restore();
    }
  };
})();
