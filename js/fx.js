/* =========================================================================
 * fx.js —— 粒子系统 + 飘浮文字（上浮淡出的得分 / 连击提示）
 * · 果汁飞溅：不同水果不同果汁颜色，受重力下落；
 * · 爆炸粒子：径向飞散 + 扩散冲击波圆环；
 * · 飘浮文字：得分、连击 xN、炸弹惩罚、增益名称；
 * 全部对象来自 FN.pools 对象池。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  const C = () => FN.CONFIG;

  FN.fx = {

    /** 果汁飞溅：以水果中心为圆心向外喷出彩色液滴 */
    juice(field, x, y, color, radius) {
      const cfg = C().FX;
      if (field.particles.length >= cfg.maxParticles) return;   // 粒子上限保护
      const count = Math.round(radius * cfg.juicePerRadius) + 6;
      for (let i = 0; i < count; i++) {
        if (field.particles.length >= cfg.maxParticles) break;
        const p = FN.pools.particle.obtain();
        const ang = Math.random() * Math.PI * 2;
        const spd = FN.utils.rand(70, 330);
        p.kind = 'dot';
        p.x = x + Math.cos(ang) * radius * 0.3;
        p.y = y + Math.sin(ang) * radius * 0.3;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd - FN.utils.rand(30, 140);   // 略微向上喷
        p.maxLife = p.life = FN.utils.rand(0.4, 0.85);
        p.size = FN.utils.rand(2, 5.5);
        p.color = color;
        p.grav = 950;
        p.alive = true;
        field.particles.push(p);
      }
    },

    /** 炸弹爆炸：橙黄黑粒子径向爆开 + 一个扩散圆环冲击波 */
    explosion(field, x, y) {
      const cfg = C().FX;
      const colors = ['#ff9f43', '#ee5253', '#ffd32a', '#576574', '#ffffff'];
      for (let i = 0; i < cfg.explosionCount; i++) {
        if (field.particles.length >= cfg.maxParticles) break;
        const p = FN.pools.particle.obtain();
        const ang = Math.random() * Math.PI * 2;
        const spd = FN.utils.rand(120, 560);
        p.kind = 'dot';
        p.x = x; p.y = y;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.maxLife = p.life = FN.utils.rand(0.3, 0.75);
        p.size = FN.utils.rand(2.5, 7);
        p.color = FN.utils.choice(colors);
        p.grav = 420;
        p.alive = true;
        field.particles.push(p);
      }
      // 冲击波圆环
      const ring = FN.pools.particle.obtain();
      ring.kind = 'ring';
      ring.x = x; ring.y = y; ring.vx = 0; ring.vy = 0;
      ring.maxLife = ring.life = 0.4;
      ring.size = 14;
      ring.color = '#ffb74a';
      ring.grav = 0;
      ring.alive = true;
      field.particles.push(ring);
    },

    /** 飘浮文字（得分 / 连击 / 增益名称 / 惩罚提示） */
    text(field, x, y, str, color, size) {
      const t = FN.pools.ftext.obtain();
      t.x = x; t.y = y;
      t.text = str;
      t.color = color;
      t.size = size || 22;
      t.maxLife = t.life = 0.95;
      t.vy = -52;
      t.alive = true;
      field.texts.push(t);
    },

    /** 粒子运动学更新：重力 + 寿命衰减 + 圆环扩散，死亡对象归还对象池 */
    updateParticles(arr, dt) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt;
        if (p.life <= 0) {
          arr[i] = arr[arr.length - 1]; arr.pop();
          FN.pools.particle.release(p);
          continue;
        }
        if (p.kind === 'ring') {
          p.size += 620 * dt;             // 冲击波半径扩散
        } else {
          p.vy += p.grav * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
    },

    renderParticles(ctx, arr) {
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a;
        if (p.kind === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * a + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },

    updateTexts(arr, dt) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const t = arr[i];
        t.life -= dt;
        if (t.life <= 0) {
          arr[i] = arr[arr.length - 1]; arr.pop();
          FN.pools.ftext.release(t);
          continue;
        }
        t.y += t.vy * dt;
        t.vy *= 0.985;                    // 缓慢减速上浮
      }
    },

    renderTexts(ctx, arr) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        const a = Math.max(0, t.life / t.maxLife);
        ctx.globalAlpha = a;
        ctx.font = 'bold ' + t.size + 'px ' + FN.CONFIG.HUD.fontStack;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 4;
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
  };
})();
