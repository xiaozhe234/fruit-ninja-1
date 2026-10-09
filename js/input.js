/* =========================================================================
 * input.js —— 输入模块：PC 鼠标 + 手机多点触控
 * · PC：左键=玩家1；双人分屏时右键=玩家2（阻止浏览器右键菜单）；
 * · 手机：多点触控，触摸落在画布左半边=玩家1、右半边=玩家2，双指同时操作；
 * · touch 事件 preventDefault 阻止页面滚动 / 双击放大；
 * · 双人模式下刀光坐标被钳制在各自半区，实现完全隔离操作；
 * · 画布右上角暂停按钮 / 禅模式结束按钮：按下-抬起小位移判定为"点击"。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.input = {
    canvas: null,
    game: null,
    blades: [],      // 全部刀光（含淡出中的）
    sessions: new Map(),   // 指针key -> {blade, player, startX, startY, hud}

    init(canvas, game) {
      this.canvas = canvas;
      this.game = game;

      /* ---------- 阻止浏览器默认行为 ---------- */
      // 右键是玩家2的操作键，必须阻止浏览器右键菜单
      document.addEventListener('contextmenu', (e) => e.preventDefault());
      // 禁止双击选中 / 缩放（部分移动浏览器）
      document.addEventListener('dblclick', (e) => e.preventDefault());
      document.addEventListener('gesturestart', (e) => e.preventDefault());

      /* ---------- PC 鼠标 ---------- */
      canvas.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const player = this._resolveMousePlayer(e.button, e.clientX);
        if (player === null) return;
        this._pointerDown('m' + e.button, player, e.clientX, e.clientY);
      });
      window.addEventListener('mousemove', (e) => {
        // 同步移动所有按下的鼠标键对应的刀光（可能左右键同时按住）
        this._pointerMove('m0', e.clientX, e.clientY);
        this._pointerMove('m2', e.clientX, e.clientY);
      });
      window.addEventListener('mouseup', (e) => {
        this._pointerUp('m' + e.button, e.clientX, e.clientY);
      });

      /* ---------- 手机触屏：多点触控 + preventDefault 阻止滚动 ---------- */
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const player = this._resolveTouchPlayer(t.clientX);
          if (player === null) continue;
          this._pointerDown('t' + t.identifier, player, t.clientX, t.clientY);
        }
      }, { passive: false });

      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();   // 阻止页面滚动 / 下拉刷新
        for (const t of e.changedTouches) {
          this._pointerMove('t' + t.identifier, t.clientX, t.clientY);
        }
      }, { passive: false });

      const touchEnd = (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          this._pointerUp('t' + t.identifier, t.clientX, t.clientY);
        }
      };
      canvas.addEventListener('touchend', touchEnd, { passive: false });
      canvas.addEventListener('touchcancel', touchEnd, { passive: false });
    },

    /**
     * 鼠标按键 → 玩家归属。
     * 双人模式：左键且起点在左半区=玩家1；右键且起点在右半区=玩家2；
     * 起点不在对应半区则忽略（规格要求：左半区左键、右半区右键）。
     * 其他模式：只有左键（玩家1），右键忽略。
     */
    _resolveMousePlayer(button, x) {
      const g = this.game;
      if (g.mode === 'versus') {
        const mid = g.W / 2;
        if (button === 0 && x < mid) return 0;
        if (button === 2 && x >= mid) return 1;
        return null;
      }
      return button === 0 ? 0 : null;
    },

    /** 触摸起点 → 玩家归属：双人模式左半屏=玩家1 / 右半屏=玩家2 */
    _resolveTouchPlayer(x) {
      const g = this.game;
      if (g.mode === 'versus') return x < g.W / 2 ? 0 : 1;
      return 0;
    },

    _pointerDown(key, player, x, y) {
      const g = this.game;
      if (g.state !== 'PLAYING') return;                    // 只在游戏中响应切割
      if (this.sessions.has(key)) return;
      const blade = new FN.Blade(player);
      blade.begin(x, y);
      this.blades.push(blade);
      this.sessions.set(key, {
        blade, player,
        startX: x, startY: y,
        hud: g.hudAt(x, y),                                 // 记录起点是否在 HUD 按钮上
      });
    },

    _pointerMove(key, x, y) {
      const s = this.sessions.get(key);
      if (!s) return;
      // 双人模式：刀光钳制在本人半区内，双方操作完全隔离
      const g = this.game;
      let cx = x;
      if (g.mode === 'versus' && g.fields.length === 2) {
        const f = g.fields[s.player];
        cx = FN.utils.clamp(x, f.x + 2, f.x + f.w - 2);
      }
      s.blade.addPoint(cx, y);
    },

    _pointerUp(key, x, y) {
      const s = this.sessions.get(key);
      if (!s) return;
      this.sessions.delete(key);
      const dist = Math.hypot(x - s.startX, y - s.startY);
      // 点击（非滑动）落在 HUD 按钮上 → 触发按钮，不产生切割
      if (s.hud && dist < 12 && this.game.hudAt(x, y) === s.hud) {
        this.game.hudPress(s.hud);
      }
      s.blade.release();   // 刀光进入 250ms 淡出
    },

    /** 每帧调用：更新并渲染全部刀光，清理彻底消失的刀光 */
    renderBlades(ctx) {
      for (let i = this.blades.length - 1; i >= 0; i--) {
        const b = this.blades[i];
        b.update();
        if (b.isGone()) { this.blades.splice(i, 1); continue; }
        b.render(ctx);
      }
    },

    clear() {
      this.sessions.clear();
      this.blades.length = 0;
    },
  };
})();
