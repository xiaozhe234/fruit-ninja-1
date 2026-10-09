/* =========================================================================
 * entities.js —— 实体模块：水果 / 炸弹 / 增益香蕉 / 切割两半碎片
 * · 生成：底部抛出，抛物线（重力 + 旋转角速度 + 朝中心牵引）；
 * · 切割：由 game.js 的轨迹线段判定调用 createFragments / 触发特效；
 * · 渲染：优先外部 Image 素材；onerror 缺失时降级为 Canvas 色块图形，
 *   没有任何图片素材也能完整运行。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.entities = {

    /* ======================= 生成 ======================= */

    /**
     * 在区域底部抛出一个实体
     * @param field   所属区域（双人对战时为左右半屏之一）
     * @param desc    {kind:'fruit'|'bomb'|'bonus', type, bonusType}
     */
    createFruit(field, desc) {
      const C = FN.CONFIG;
      const o = FN.pools.fruit.obtain();
      o.kind = desc.kind;
      o.type = desc.type || '';
      o.bonusType = desc.bonusType || null;
      o.alive = true;

      if (desc.kind === 'bomb') {
        o.r = C.BOMB.r;
      } else if (desc.kind === 'bonus') {
        o.r = C.BONUS.r;
      } else {
        o.r = C.FRUITS[desc.type].r * FN.utils.rand(0.92, 1.08);
      }

      // 出生位置：区域底部、水平随机
      o.x = FN.utils.rand(field.x + o.r + 8, field.x + field.w - o.r - 8);
      o.y = field.bottom + o.r + 12;

      // 垂直初速度：让最高点落在区域高度的 50%~82%（难度 speed 系数加成）
      const apex = field.h * FN.utils.rand(C.PHYSICS.launchApexMin, C.PHYSICS.launchApexMax);
      o.vy = -Math.sqrt(2 * C.PHYSICS.gravity * apex) * field.speedMul;

      // 水平初速度：随机抖动 + 朝区域中心牵引，防止飞出边界
      const bias = (field.cx - o.x) * C.PHYSICS.vxBiasToCenter;
      o.vx = FN.utils.clamp(
        FN.utils.rand(-1, 1) * C.PHYSICS.vxJitter + bias,
        -C.PHYSICS.maxVx, C.PHYSICS.maxVx
      );

      o.rot = Math.random() * Math.PI * 2;
      o.vrot = FN.utils.rand(C.PHYSICS.spinMin, C.PHYSICS.spinMax);

      field.fruits.push(o);
    },

    /* ======================= 运动 / 回收 ======================= */

    /** 水果物理更新：重力 + 位移 + 自转；落出底部回调 onMiss（漏接扣命） */
    updateFruits(field, dt) {
      const g = FN.CONFIG.PHYSICS.gravity;
      const arr = field.fruits;
      for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        if (!o.alive) {                     // 已被切掉 → 归还对象池
          arr[i] = arr[arr.length - 1]; arr.pop();
          FN.pools.fruit.release(o);
          continue;
        }
        o.vy += g * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.rot += o.vrot * dt;
        if (o.vy > 0 && o.y > field.bottom + o.r + 40) {
          o.alive = false;
          field.onMiss(o);                  // 漏掉水果（炸弹漏掉无惩罚）
        }
      }
    },

    /** 碎片物理更新：重力下落，飞出画布边界自动销毁 */
    updateFragments(field, dt) {
      const g = FN.CONFIG.PHYSICS.gravity;
      const arr = field.fragments;
      for (let i = arr.length - 1; i >= 0; i--) {
        const o = arr[i];
        o.vy += g * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.rot += o.spin * dt;
        if (o.y > field.bottom + o.r * 2 + 60) {
          arr[i] = arr[arr.length - 1]; arr.pop();
          FN.pools.fragment.release(o);
        }
      }
    },

    /**
     * 切割成功：沿切割线生成带分离初速度的两半碎片
     * @param cutAngle 刀光线段角度（半圆平面沿该角度放置）
     */
    createFragments(field, ent, cutAngle) {
      // 增益香蕉等实体没有 FRUITS 外观定义：兜底按香蕉外观出碎片，防止渲染崩溃
      const type = FN.CONFIG.FRUITS[ent.type] ? ent.type : 'banana';
      const nx = -Math.sin(cutAngle), ny = Math.cos(cutAngle);   // 切割线法线
      for (let s = 1; s >= -1; s -= 2) {
        const o = FN.pools.fragment.obtain();
        const push = FN.utils.rand(90, 200);
        o.type = type;
        o.r = ent.r;
        o.x = ent.x + nx * s * 3;
        o.y = ent.y + ny * s * 3;
        o.vx = ent.vx + nx * push * s;                          // 垂直切割线向两侧分离
        o.vy = ent.vy + ny * push * s - FN.utils.rand(30, 100); // 附加向上弹起
        o.cutAngle = cutAngle;
        o.side = s;
        o.rot = 0;
        o.spin = FN.utils.rand(1.5, 4.2) * s;
        o.alive = true;
        field.fragments.push(o);
      }
    },

    /* ======================= 渲染 ======================= */

    renderFruits(ctx, arr) {
      const t = FN.utils.now() / 1000;
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (!o.alive) continue;
        ctx.save();
        ctx.translate(o.x, o.y);

        if (o.kind === 'bomb') {
          this._drawBomb(ctx, o, t);
        } else if (o.kind === 'bonus') {
          this._drawBonus(ctx, o, t);
        } else {
          ctx.rotate(o.rot);
          const img = FN.images.get(o.type);
          if (img) {
            const d = o.r * 2.1;
            ctx.drawImage(img, -d / 2, -d / 2, d, d);
          } else {
            this._drawFruitFallback(ctx, o.type, o.r);   // ⚠️ 图片缺失降级：色块绘制
          }
        }
        ctx.restore();
      }
    },

    renderFragments(ctx, arr) {
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        const def = FN.CONFIG.FRUITS[o.type];
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(o.cutAngle + o.rot);

        const halfImg = FN.images.get(o.type + 'Half');
        if (halfImg) {
          if (o.side < 0) ctx.rotate(Math.PI);           // 另一半旋转 180°
          ctx.drawImage(halfImg, -o.r, -o.r, o.r * 2, o.r * 2);
        } else {
          // 降级：半圆色块（果肉填充 + 果皮描边），flat 面即切割面
          ctx.beginPath();
          if (o.side > 0) ctx.arc(0, 0, o.r, 0, Math.PI);
          else ctx.arc(0, 0, o.r, Math.PI, Math.PI * 2);
          ctx.closePath();
          ctx.fillStyle = def.flesh;
          ctx.fill();
          ctx.lineWidth = Math.max(4, o.r * 0.18);
          ctx.strokeStyle = def.skin;
          ctx.stroke();
          // 果肉高光
          ctx.beginPath();
          ctx.arc(0, o.side * o.r * 0.45, o.r * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fill();
        }
        ctx.restore();
      }
    },

    /* ======================= 降级绘制（无图片素材时） ======================= */

    _drawFruitFallback(ctx, type, r) {
      switch (type) {
        case 'watermelon': {           // 深绿圆 + 墨绿条纹
          const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
          grad.addColorStop(0, '#66bb6a');
          grad.addColorStop(1, '#2e7d32');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = r * 0.14;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.95, r * (0.3 + i * 0.3), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        }
        case 'apple': {                // 红圆 + 果柄 + 绿叶
          const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r);
          grad.addColorStop(0, '#ef5350');
          grad.addColorStop(1, '#b71c1c');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#5d4037'; ctx.lineWidth = r * 0.12; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.lineTo(r * 0.12, -r * 1.25); ctx.stroke();
          ctx.fillStyle = '#66bb6a';
          ctx.beginPath();
          ctx.ellipse(r * 0.42, -r * 1.05, r * 0.32, r * 0.15, -0.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'orange': {               // 橙圆 + 细点 + 绿叶
          const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.15, 0, 0, r);
          grad.addColorStop(0, '#ffb74d');
          grad.addColorStop(1, '#ef6c00');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          for (let i = 0; i < 6; i++) {
            const a = i * 1.05;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.08, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#43a047';
          ctx.beginPath();
          ctx.ellipse(r * 0.3, -r * 0.95, r * 0.3, r * 0.14, -0.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'banana': {               // 黄色月牙（粗弧线）
          ctx.strokeStyle = '#fdd835'; ctx.lineCap = 'round';
          ctx.lineWidth = r * 0.72;
          ctx.beginPath();
          ctx.arc(0, -r * 0.35, r * 0.8, 0.35, Math.PI - 0.35);
          ctx.stroke();
          ctx.strokeStyle = '#8d6e3f'; ctx.lineWidth = r * 0.16;
          ctx.beginPath(); ctx.moveTo(-r * 0.72, r * 0.05); ctx.lineTo(-r * 0.8, r * 0.2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(r * 0.72, r * 0.05); ctx.lineTo(r * 0.8, r * 0.2); ctx.stroke();
          break;
        }
        case 'peach': {                // 粉红圆 + 中缝
          const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.15, 0, 0, r);
          grad.addColorStop(0, '#ff9ff3');
          grad.addColorStop(1, '#e91e63');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(136,14,79,0.55)'; ctx.lineWidth = r * 0.1;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.9);
          ctx.quadraticCurveTo(r * 0.28, 0, 0, r * 0.9);
          ctx.stroke();
          break;
        }
      }
    },

    _drawBomb(ctx, o, t) {
      const img = FN.images.get('bomb');
      if (img) {
        ctx.rotate(o.rot);
        const d = o.r * 2.1;
        ctx.drawImage(img, -d / 2, -d / 2, d, d);
        return;
      }
      // 降级：黑球 + 引信 + 火花（闪烁）
      const r = o.r;
      const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      grad.addColorStop(0, '#616161');
      grad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.55, -r * 1.35, r * 0.85, -r * 1.1);
      ctx.stroke();
      const flick = 0.6 + 0.4 * Math.sin(t * 22);
      ctx.fillStyle = 'rgba(255,152,0,' + flick + ')';
      ctx.beginPath(); ctx.arc(r * 0.9, -r * 1.12, r * 0.22 * flick + r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,238,88,0.9)';
      ctx.beginPath(); ctx.arc(r * 0.9, -r * 1.12, r * 0.1 * flick + 2, 0, Math.PI * 2); ctx.fill();
    },

    _drawBonus(ctx, o, t) {
      const def = FN.CONFIG.BONUS.types[o.bonusType];
      const r = o.r;
      // 呼吸发光外圈（提示这是特殊增益）
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.strokeStyle = def.color;
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * (1.25 + 0.12 * pulse), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      // 彩色月牙本体（按增益类型着色）
      ctx.strokeStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 12;
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 0.62;
      ctx.beginPath();
      ctx.arc(0, -r * 0.3, r * 0.78, 0.35, Math.PI - 0.35);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 头顶标注增益名称
      ctx.font = 'bold ' + Math.max(12, r * 0.5) + 'px ' + FN.CONFIG.HUD.fontStack;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText(def.name, 0, -r * 1.35);
      ctx.fillStyle = def.color;
      ctx.fillText(def.name, 0, -r * 1.35);
    },

    /** 爱心图标（HUD 生命值）：图片缺失时 Canvas 路径绘制 */
    drawHeart(ctx, x, y, size, color, filled) {
      const img = FN.images.get('heart');
      if (filled && img) {
        ctx.drawImage(img, x - size, y - size, size * 2, size * 2);
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 10, size / 10);
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(-11, -6, -6, -12, 0, -6);
      ctx.bezierCurveTo(6, -12, 11, -6, 0, 3);
      ctx.closePath();
      if (filled) {
        ctx.fillStyle = color;
        ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    },
  };
})();
