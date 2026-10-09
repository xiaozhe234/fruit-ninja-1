/* =========================================================================
 * audio.js —— 音效管理（HTML Audio 标签，不使用 base64 内嵌）
 *
 * 音效清单与 Freesound.org 搜索关键词（自行下载 mp3 放到 assets/audio/）：
 *   slice.mp3        切水果    搜索 "fruit slice splat" / "sword slash"
 *   combo.mp3        连击      搜索 "combo chime" / "arcade bonus"
 *   bomb_explode.mp3 炸弹爆炸  搜索 "explosion boom"
 *   game_over.mp3    游戏结束  搜索 "game over jingle"
 *   bonus.mp3        增益香蕉  搜索 "power up sparkle"
 *
 * 容错策略：素材缺失 / 浏览器拦截播放时全部 try-catch + promise.catch，
 * 绝不抛错阻断游戏；静音状态下所有音效直接跳过不播放。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.sounds = {
    muted: false,
    _els: {},
    _missing: {},   // 已确认缺失的音效名（首次播放探测失败后标记，后续直接跳过）

    /* 收集 index.html 里的 <audio> 标签引用（preload=none：进页面不发起请求） */
    init() {
      const map = FN.CONFIG.AUDIO;
      for (const name in map) {
        try {
          const el = document.getElementById(map[name]);
          if (el) this._els[name] = el;
        } catch (e) { /* 资源异常不阻断游戏 */ }
      }
    },

    setMuted(m) {
      this.muted = !!m;
      FN.store.set(FN.CONFIG.STORAGE.mute, this.muted);
    },

    /**
     * 播放音效：cloneNode 生成副本实现快速连击时的音效重叠。
     * 首次播放若素材缺失（404/网络错误），一次性探测到后：
     * 清除模板 src 并标记缺失，之后不再发起任何请求（控制台不再刷 404）。
     * 失败（素材缺失 / 自动播放策略）静默忽略，绝不抛错。
     */
    play(name) {
      if (this.muted) return;                 // 静音状态全部音效不播放
      if (this._missing[name]) return;        // 已确认缺失：直接跳过
      const base = this._els[name];
      if (!base) return;
      try {
        const node = base.cloneNode();
        node.volume = 0.85;
        node.addEventListener('error', () => {
          this._missing[name] = true;
          try { base.removeAttribute('src'); base.load(); } catch (e2) {}
        }, { once: true });
        const p = node.play();
        if (p && p.catch) p.catch(function () { /* 素材缺失或被浏览器拦截 */ });
      } catch (e) { /* 资源异常不阻断游戏 */ }
    },
  };
})();
