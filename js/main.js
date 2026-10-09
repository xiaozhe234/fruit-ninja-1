/* =========================================================================
 * main.js —— 启动引导 / 窗口自适应 / 横竖屏检测 / 全屏 API / 后台自动暂停
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.main = {

    init() {
      /* ---------- 读取持久化设置（页面加载读取 localStorage） ---------- */
      FN.settings = {
        muted: !!FN.store.get(FN.CONFIG.STORAGE.mute, false),
        difficulty: FN.store.get(FN.CONFIG.STORAGE.difficulty, 'normal'),
      };
      if (!FN.CONFIG.DIFFICULTY[FN.settings.difficulty]) FN.settings.difficulty = 'normal';

      /* ---------- 资源加载（全部异步降级，不阻断游戏） ---------- */
      FN.images.loadAll();
      FN.sounds.init();
      FN.sounds.muted = FN.settings.muted;

      /* ---------- 核心对象 ---------- */
      const canvas = document.getElementById('gameCanvas');
      FN.game = new FN.Game(canvas);          // 内部启动全局唯一 rAF 循环
      FN.input.init(canvas, FN.game);
      FN.ui.init(FN.game);

      /* ---------- 联机可用性检测：本地静态打开则按钮置灰 ---------- */
      FN.net.init();
      FN.ui.setNetAvailable(FN.net.available);

      /* ---------- 竖屏检测：手机竖屏禁止游戏 ---------- */
      const checkOrientation = () => {
        // 仅触屏设备（手机/平板）启用竖屏限制，PC 窄窗口不受影响
        const isTouch = ('ontouchstart' in window) ||
          (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const blocked = isTouch && window.innerHeight > window.innerWidth;
        FN.ui.setRotateBlocked(blocked);
      };
      window.addEventListener('resize', checkOrientation);
      window.addEventListener('orientationchange', () => {
        // orientationchange 后浏览器尺寸更新有延迟，下一帧再检测
        setTimeout(checkOrientation, 120);
        setTimeout(checkOrientation, 400);
      });
      checkOrientation();

      /* ---------- 切到后台自动暂停 ---------- */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && FN.game.state === 'PLAYING') {
          FN.ui.openModal('pauseModal');
        }
      });

      /* ---------- 窗口 resize：画布自适应（game 内部已监听） ---------- */
      // FN.Game 构造时已绑定 window resize → canvas 重设尺寸 + 区域重新布局
    },

    /**
     * 进入游戏时尝试全屏 + 锁定横屏（移动端体验最佳）。
     * 全屏 API 容错：部分浏览器（iOS Safari）不支持则静默失败，降级为普通横屏布局。
     */
    tryEnterFullscreen() {
      try {
        // 全屏 API 只能在用户手势中调用：
        // 联机开局等由 socket 回调触发的 startMode 不是手势，直接跳过（避免控制台报错）
        if (document.userActivation && !document.userActivation.isActive) return;
        const el = document.documentElement;
        if (el.requestFullscreen) {
          const p = el.requestFullscreen();
          if (p && p.catch) {
            p.then(() => this._lockLandscape()).catch(() => { /* 降级：不开全屏 */ });
          } else {
            this._lockLandscape();
          }
        }
      } catch (e) { /* 全屏 API 异常不阻断游戏 */ }
    },

    _lockLandscape() {
      try {
        if (screen.orientation && screen.orientation.lock) {
          const r = screen.orientation.lock('landscape');
          if (r && r.catch) r.catch(() => { /* 不支持锁定则忽略 */ });
        }
      } catch (e) { /* 忽略 */ }
    },
  };

  window.addEventListener('DOMContentLoaded', () => FN.main.init());
})();
