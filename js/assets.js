/* =========================================================================
 * assets.js —— 图片素材加载器（全部外部 Image 对象，禁止 base64 内嵌）
 *
 * 素材来源（免费商用）：
 *   · pixabay.com        搜索 fruit png / wood texture background
 *   · itch.io            搜索 "free fruit ninja assets" 等 2D 免费精灵包
 *   · 爱给网 aigei.com    开源游戏素材频道
 *
 * ⚠️ 降级容错（必须）：每张图 onerror 时标记失败，渲染层用 Canvas
 *    色块图形代替水果 / 木纹背景 / 爱心，没有图片素材游戏也能完整运行。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.images = {
    _imgs: {},   // key -> HTMLImageElement
    _ok: {},     // key -> 是否加载成功

    /** 启动时异步加载全部图片；成功/失败都只记标记，绝不阻断游戏 */
    loadAll() {
      const list = FN.CONFIG.IMAGES;
      for (const key in list) {
        try {
          const img = new Image();
          img.onload = () => { this._ok[key] = true; };
          img.onerror = () => { this._ok[key] = false; };   // 降级：Canvas 绘制代替
          img.src = list[key];
          this._imgs[key] = img;
          this._ok[key] = false;   // 加载完成前先按"未就绪"处理
        } catch (e) {
          this._ok[key] = false;
        }
      }
    },

    /** 取可用图片；未加载成功返回 null（调用方必须做 null 降级） */
    get(key) {
      return this._ok[key] ? this._imgs[key] : null;
    },

    has(key) { return !!this._ok[key]; },
  };
})();
