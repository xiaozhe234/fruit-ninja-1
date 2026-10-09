/* =========================================================================
 * game.js —— 游戏核心：严格状态机 + 区域(Field) + 主循环 + 碰撞判定 + Canvas HUD
 *
 * 状态机：MENU / PLAYING / PAUSE / GAMEOVER
 *   · 全程只有一个 requestAnimationFrame 游戏循环（避免多重渲染循环 bug）；
 *   · 非 PLAYING 状态只渲染不更新（暂停=物体冻结、生成器停止）；
 *   · 弹窗打开自动暂停、关闭弹窗自动恢复（互斥逻辑在 ui.js）。
 *
 * Field（对战区域）：
 *   · 单人模式 = 1 个全场区域；双人分屏 = 左右 2 个半屏区域；
 *   · 双方完全隔离：独立生成器 / 独立物理 / 独立生命 / 独立计分 / 独立粒子。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  const C = () => FN.CONFIG;

  /* ================================ Field ================================ */

  class Field {
    constructor(game, index, x, w, h) {
      this.game = game;
      this.index = index;
      this.palette = FN.PALETTES[index];
      this.fruits = [];
      this.fragments = [];
      this.particles = [];
      this.texts = [];
      this.layout(x, w, h);
    }

    /** 窗口 resize 时重新计算区域几何（保留分数等运行时状态） */
    layout(x, w, h) {
      this.x = x; this.w = w; this.h = h;
      this.cx = x + w / 2;
      this.bottom = h;
    }

    reset(modeKey) {
      const cfg = C().MODES[modeKey];
      const diff = C().DIFFICULTY[(FN.settings && FN.settings.difficulty) || 'normal'];

      this.mode = modeKey;
      this.cfg = cfg;
      this.score = 0;
      this.comboCount = 0;
      this.lastSliceAt = -99;
      this.maxCombo = 0;
      this.lives = cfg.lives;
      this.dead = false;

      this.elapsed = 0;
      this.rampStep = 0;
      this.spawnInterval = diff.spawnInterval;
      this.waveMin = diff.waveMin;
      this.waveMax = diff.waveMax;
      this.speedMul = diff.speed;
      this.bombChance = cfg.bombs ? diff.bombChance : 0;   // 禅模式无炸弹
      this.waveTimer = 0.9;

      // 增益状态（街机模式）
      this.doubleTimer = 0;
      this.slowTimer = 0;
      this.stormTimer = 0;

      // 清空实体并归还对象池
      this._releaseAll(this.fruits, 'fruit');
      this._releaseAll(this.fragments, 'fragment');
      this._releaseAll(this.particles, 'particle');
      this._releaseAll(this.texts, 'ftext');
    }

    _releaseAll(arr, poolName) {
      for (const o of arr) FN.pools[poolName].release(o);
      arr.length = 0;
    }

    /** 当前连击倍数（1~5，上限 x5） */
    get comboMult() {
      return Math.min(Math.max(this.comboCount, 1), C().COMBO.max);
    }

    update(dt) {
      this.elapsed += dt;

      /* ---- 难度自动爬升：每 10 秒 提升抛速 / 缩短间隔 / 提高炸弹概率 ---- */
      const R = C().RAMP;
      const step = Math.floor(this.elapsed / R.intervalSec);
      if (step > this.rampStep) {
        this.rampStep = step;
        this.spawnInterval = Math.max(R.intervalMin, this.spawnInterval * R.intervalMul);
        this.speedMul = Math.min(R.speedMax, this.speedMul * R.speedMul);
        if (this.cfg.bombs) this.bombChance = Math.min(R.bombMax, this.bombChance + R.bombAdd);
      }

      /* ---- 增益计时（真实时间流逝） ---- */
      this.doubleTimer = Math.max(0, this.doubleTimer - dt);
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      this.stormTimer = Math.max(0, this.stormTimer - dt);

      /* ---- 时间减速：本区域所有物体速度降低 40%（dt 缩放实现） ---- */
      const fdt = dt * (this.slowTimer > 0 ? C().BONUS.types.slow.factor : 1);

      /* ---- 生成器 ---- */
      if (!this.dead) {
        this.waveTimer -= fdt;
        if (this.waveTimer <= 0) {
          this.spawnWave();
          const base = this.stormTimer > 0
            ? C().BONUS.types.storm.spawnInterval     // 水果风暴：极速生成
            : this.spawnInterval;
          this.waveTimer = base * FN.utils.rand(0.75, 1.25);
        }
      }

      FN.entities.updateFruits(this, fdt);
      FN.entities.updateFragments(this, fdt);
      FN.fx.updateParticles(this.particles, fdt);
      FN.fx.updateTexts(this.texts, dt);
    }

    spawnWave() {
      let n = this.stormTimer > 0
        ? FN.utils.randInt(1, 2)
        : FN.utils.randInt(this.waveMin, this.waveMax);

      while (n-- > 0) {
        if (this.stormTimer > 0) {
          // 风暴期间只出水果，不出炸弹/增益
          FN.entities.createFruit(this, { kind: 'fruit', type: FN.utils.choice(this._fruitKeys) });
          continue;
        }
        const roll = Math.random();
        if (this.cfg.bombs && roll < this.bombChance) {
          FN.entities.createFruit(this, { kind: 'bomb' });
        } else if (this.cfg.bonus && Math.random() < C().BONUS.chance) {
          const bonusType = FN.utils.choice(Object.keys(C().BONUS.types));
          FN.entities.createFruit(this, { kind: 'bonus', bonusType });
        } else {
          FN.entities.createFruit(this, { kind: 'fruit', type: FN.utils.choice(this._fruitKeys) });
        }
      }
    }

    get _fruitKeys() { return Object.keys(C().FRUITS); }

    /* ---------------- 命中 / 漏接 逻辑 ---------------- */

    /** 漏接水果：经典/双人/联机 扣生命；街机/禅 无惩罚；炸弹漏掉不扣 */
    onMiss(ent) {
      if (ent.kind !== 'fruit') return;
      if (!this.cfg.missPenalty || this.dead) return;
      this.loseLife();
      FN.fx.text(this, this.cx, this.h * 0.35, '漏接 -1 生命', '#ff7b72', 20);
    }

    loseLife() {
      if (this.lives === Infinity) return;
      this.lives--;
      if (this.lives <= 0) { this.lives = 0; this.dead = true; }
    }

    /** 切中炸弹：经典/双人/联机扣生命；街机扣 30 分；连击清零 */
    bombHit(ent) {
      this.comboCount = 0;
      if (this.cfg.missPenalty) {
        this.loseLife();
        FN.fx.text(this, ent.x, ent.y - ent.r - 6, '炸弹 -1 生命', '#ff5252', 24);
      } else {
        this.score = Math.max(0, this.score - C().SCORE.bombPenalty);
        FN.fx.text(this, ent.x, ent.y - ent.r - 6, '-' + C().SCORE.bombPenalty, '#ff5252', 26);
        this._sendNetScore();
      }
    }

    /** 切中水果：连击窗口判定 → 得分 = 基础分 x 连击倍数（双倍增益再 x2） */
    fruitSliced(ent) {
      const combo = C().COMBO;
      if (this.elapsed - this.lastSliceAt <= combo.windowSec) this.comboCount++;
      else this.comboCount = 1;
      this.lastSliceAt = this.elapsed;
      this.maxCombo = Math.max(this.maxCombo, this.comboMult);

      const mult = this.comboMult;
      const base = C().SCORE[ent.type];
      const gain = base * mult * (this.doubleTimer > 0 ? 2 : 1);
      this.score += gain;

      FN.fx.text(this, ent.x, ent.y - ent.r, '+' + gain, this.palette.text, 22);
      if (mult >= 2) {
        FN.fx.text(this, ent.x, ent.y + ent.r * 0.6, '连击 x' + mult, '#ffedb0', 28);
        FN.sounds.play('combo');
      }
      FN.sounds.play('slice');
      this._sendNetScore();
    }

    /** 切中增益香蕉：刷新对应增益持续时间 */
    bonusSliced(ent) {
      const def = C().BONUS.types[ent.bonusType];
      if (ent.bonusType === 'double') this.doubleTimer = def.duration;
      if (ent.bonusType === 'slow') this.slowTimer = def.duration;
      if (ent.bonusType === 'storm') this.stormTimer = def.duration;
      FN.fx.text(this, ent.x, ent.y - ent.r, def.name + '！', def.color, 26);
      FN.sounds.play('bonus');
    }

    _sendNetScore() {
      if (this.game.mode === 'net') FN.net.sendScore(this.score);
    }

    render(ctx) {
      FN.entities.renderFruits(ctx, this.fruits);
      FN.entities.renderFragments(ctx, this.fragments);
      FN.fx.renderParticles(ctx, this.particles);
      FN.fx.renderTexts(ctx, this.texts);
    }

    /** HUD：当前生效的增益列表（名称 + 剩余秒） */
    effectList() {
      const out = [];
      if (this.doubleTimer > 0) out.push({ name: '双倍得分 ' + Math.ceil(this.doubleTimer) + 's', color: C().BONUS.types.double.color });
      if (this.slowTimer > 0) out.push({ name: '时间减速 ' + Math.ceil(this.slowTimer) + 's', color: C().BONUS.types.slow.color });
      if (this.stormTimer > 0) out.push({ name: '水果风暴 ' + Math.ceil(this.stormTimer) + 's', color: C().BONUS.types.storm.color });
      return out;
    }
  }

  /* ================================ Game ================================ */

  FN.Game = class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      // ---- 严格状态机：MENU / PLAYING / PAUSE / GAMEOVER ----
      this.state = 'MENU';
      this.mode = null;
      this.lastMode = null;
      this.fields = [];

      this.peerScore = 0;        // 联机对手分数
      this.peerLeft = false;
      this.results = null;

      this.flash = 0;            // 红色闪屏强度
      this.shake = 0;            // 画面震动幅度
      this.preRoll = 0;          // 开局 3-2-1 同步倒数
      this.goTimer = 0;
      this.timeLeft = 0;
      this.elapsed = 0;
      this.hudRects = {};

      this._lastTs = 0;
      this.resize();
      window.addEventListener('resize', () => this.resize());

      // ---- 全局唯一游戏循环 ----
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    /* ---------- 画布自适应：跟随窗口 resize，处理 devicePixelRatio ---------- */
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width = Math.round(this.W * dpr);
      this.canvas.height = Math.round(this.H * dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.dpr = dpr;
      this.layoutFields();
    }

    layoutFields() {
      if (this.mode === 'versus' && this.fields.length === 2) {
        this.fields[0].layout(0, this.W / 2, this.H);
        this.fields[1].layout(this.W / 2, this.W / 2, this.H);
      } else if (this.fields.length === 1) {
        this.fields[0].layout(0, this.W, this.H);
      }
    }

    fieldFor(player) {
      if (this.mode === 'versus') return this.fields[player] || this.fields[0];
      return this.fields[0];
    }

    /* ---------- 开始一局 ---------- */
    startMode(mode) {
      this.mode = mode;
      this.lastMode = mode;
      this.peerScore = 0;
      this.peerLeft = false;
      this.results = null;
      FN.input.clear();

      this.fields = [];
      if (mode === 'versus') {
        // 双人分屏：画布垂直对半分割，双方完全隔离
        this.fields.push(new Field(this, 0, 0, this.W / 2, this.H));
        this.fields.push(new Field(this, 1, this.W / 2, this.W / 2, this.H));
      } else {
        this.fields.push(new Field(this, 0, 0, this.W, this.H));
      }
      const cfg = C().MODES[mode];
      this.fields.forEach((f) => f.reset(mode));

      this.timeLeft = cfg.timed ? cfg.time : 0;
      this.elapsed = 0;
      this.preRoll = C().PRE_ROLL;      // 双方同步开局倒数
      this.goTimer = 0;
      this.flash = 0;
      this.shake = 0;

      this.state = 'PLAYING';
      FN.ui.hideMenu();
      if (FN.main && FN.main.tryEnterFullscreen) FN.main.tryEnterFullscreen();
    }

    /* ---------- 暂停 / 恢复（弹窗互斥联动） ---------- */
    setPaused(p) {
      if (p && this.state === 'PLAYING') this.state = 'PAUSE';
      else if (!p && this.state === 'PAUSE') this.state = 'PLAYING';
    }

    exitToMenu() {
      this.state = 'MENU';
      this.mode = null;
      this.fields = [];
      FN.input.clear();
      if (this.modeWasNet) { this.modeWasNet = false; }
      FN.ui.showMenu();
    }

    /* ---------- 结束并结算 ---------- */
    end(reason) {
      if (this.state !== 'PLAYING') return;
      this.state = 'GAMEOVER';
      FN.sounds.play('over');
      if (this.mode === 'net') {
        FN.net.sendFinal(this.fields[0].score);
        this.modeWasNet = true;
      }
      this.results = this.buildResults();
      FN.ui.showGameOver(this.results);
    }

    /** 组装结算数据（含 localStorage 最高分读取与更新） */
    buildResults() {
      const mode = this.mode;

      if (mode === 'versus') {
        const p1 = this.fields[0].score;
        const p2 = this.fields[1].score;
        const resultText = p1 > p2 ? '玩家1胜利' : (p1 < p2 ? '玩家2胜利' : '平局');
        const prevBest = FN.store.getBest('versus');
        const best = Math.max(prevBest, Math.max(p1, p2));
        FN.store.setBest('versus', best);
        return { type: 'versus', p1, p2, resultText, best, isNew: best > prevBest };
      }

      if (mode === 'net') {
        const me = this.fields[0].score;
        const peer = this.peerScore;
        const resultText = this.peerLeft ? '对手已离开，你获胜！'
          : (me > peer ? '你赢了！' : (me < peer ? '对手获胜' : '平局'));
        const prevBest = FN.store.getBest('net');
        const best = Math.max(prevBest, me);
        FN.store.setBest('net', best);
        return { type: 'net', me, peer, resultText, best, isNew: best > prevBest };
      }

      // 单人模式：经典 / 街机 / 禅
      const score = this.fields[0].score;
      const prevBest = FN.store.getBest(mode);
      const best = Math.max(prevBest, score);
      FN.store.setBest(mode, best);
      return {
        type: 'single', mode,
        modeLabel: C().MODES[mode].label,
        score, best, isNew: score > prevBest,
        maxCombo: this.fields[0].maxCombo,
      };
    }

    /* ---------- 每帧更新（仅 PLAYING 状态执行） ---------- */
    update(dt) {
      // 红闪 / 震动衰减（特效不冻结游戏也要消退）
      this.flash = Math.max(0, this.flash - C().BOMB.flashDecay * dt);
      this.shake = Math.max(0, this.shake - C().BOMB.shakeDecay * dt);

      if (this.state !== 'PLAYING') return;

      // 开局同步倒数 3-2-1（期间不生成、不计时）
      if (this.preRoll > 0) {
        this.preRoll -= dt;
        if (this.preRoll <= 0) { this.preRoll = 0; this.goTimer = 0.6; }
        return;
      }
      if (this.goTimer > 0) this.goTimer -= dt;

      this.elapsed += dt;

      // ---- 刀光切割判定：轨迹线段 vs 水果圆形包围盒 ----
      for (const blade of FN.input.blades) {
        if (!blade.active) continue;
        const seg = blade.lastSegment();
        if (!seg) continue;
        this.sliceSegment(this.fieldFor(blade.player), seg);
      }

      // ---- 限时模式倒计时 ----
      const cfg = C().MODES[this.mode];
      if (cfg.timed) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.end('time'); return; }
      }

      // ---- 各区域独立更新 ----
      for (const f of this.fields) f.update(dt);

      // ---- 结束条件 ----
      if (this.mode === 'versus') {
        if (this.fields.every((f) => f.dead)) this.end('alldead');   // 双方同时死亡，游戏同时结束
      } else if (this.mode === 'classic' || this.mode === 'net') {
        if (this.fields[0].dead) this.end('dead');
      }
    }

    /**
     * 切割判定：一条轨迹线段可同时切开线上的多个水果
     */
    sliceSegment(field, seg) {
      if (!field) return;
      const { x1, y1, x2, y2 } = seg;
      const arr = field.fruits;
      for (let i = arr.length - 1; i >= 0; i--) {
        const ent = arr[i];
        if (!ent.alive) continue;
        if (FN.utils.segPointDist(ent.x, ent.y, x1, y1, x2, y2) <= ent.r) {
          ent.alive = false;
          if (ent.kind === 'bomb') {
            // 切到炸弹：爆炸粒子 + 红色闪屏 + 画面震动
            FN.fx.explosion(field, ent.x, ent.y);
            this.flash = C().BOMB.flash;
            this.shake = C().BOMB.shakeMag;
            FN.sounds.play('bomb');
            field.bombHit(ent);
          } else {
            const angle = FN.utils.segAngle(x1, y1, x2, y2);
            // 两半碎片 + 果汁飞溅（不同水果不同果汁颜色）
            FN.entities.createFragments(field, ent, angle);
            const def = C().FRUITS[ent.type];
            FN.fx.juice(field, ent.x, ent.y, def ? def.juice : '#fff', ent.r);
            if (ent.kind === 'bonus') field.bonusSliced(ent);
            else field.fruitSliced(ent);
          }
        }
      }
    }

    /* ---------- HUD 按钮命中（暂停 / 禅模式结束） ---------- */
    hudAt(x, y) {
      const r = this.hudRects;
      const hit = (b) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      if (hit(r.pause)) return 'pause';
      if (hit(r.end)) return 'end';
      return null;
    }

    hudPress(name) {
      if (name === 'pause') FN.ui.openModal('pauseModal');
      else if (name === 'end' && this.mode === 'zen') this.end('manual');   // 禅模式手动结束本局
    }

    /* ================================ 渲染 ================================ */

    _loop(ts) {
      // dt 上限 50ms：切后台回来避免巨大步长穿透物理
      const dt = this._lastTs ? Math.min((ts - this._lastTs) / 1000, 0.05) : 0;
      this._lastTs = ts;
      this.update(dt);
      this.render();
      requestAnimationFrame(this._loop);
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawBackground(ctx);

      ctx.save();
      // 轻微画面震动（切炸弹）
      if (this.shake > 0) {
        ctx.translate(FN.utils.rand(-1, 1) * this.shake, FN.utils.rand(-1, 1) * this.shake);
      }

      // 各区域渲染（双人模式裁剪在各自半屏，特效互不越界）
      const versus = this.mode === 'versus';
      for (const f of this.fields) {
        ctx.save();
        if (versus) {
          ctx.beginPath();
          ctx.rect(f.x, 0, f.w, this.H);
          ctx.clip();
        }
        f.render(ctx);
        ctx.restore();
      }

      // 刀光轨迹（最上层，带发光）
      FN.input.renderBlades(ctx);
      ctx.restore();

      // 双人分屏：中间白色分割竖线
      if (versus) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.W / 2, 0);
        ctx.lineTo(this.W / 2, this.H);
        ctx.stroke();
        ctx.restore();
      }

      // Canvas 绘制游戏 HUD（得分 / 连击 / 倒计时 / 爱心 / 暂停按钮）
      if (this.state === 'PLAYING' || this.state === 'PAUSE') this.drawHUD(ctx);

      // 屏幕红色闪屏（炸弹）
      if (this.flash > 0) {
        ctx.fillStyle = 'rgba(255,45,45,' + (this.flash * 0.45).toFixed(3) + ')';
        ctx.fillRect(0, 0, this.W, this.H);
      }

      // 开局 3-2-1-GO! 大字
      if (this.preRoll > 0) {
        const n = Math.ceil(this.preRoll);
        const frac = this.preRoll - Math.floor(this.preRoll);
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = Math.min(1, frac * 2.2);
        ctx.font = 'bold ' + Math.round(this.H * 0.22) + 'px ' + C().HUD.fontStack;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 10;
        ctx.strokeText(String(n), this.W / 2, this.H / 2);
        ctx.fillStyle = '#ffd54a';
        ctx.fillText(String(n), this.W / 2, this.H / 2);
        ctx.restore();
      } else if (this.goTimer > 0) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = this.goTimer / 0.6;
        ctx.font = 'bold ' + Math.round(this.H * 0.16) + 'px ' + C().HUD.fontStack;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 10;
        ctx.strokeText('GO!', this.W / 2, this.H / 2);
        ctx.fillStyle = '#7bed9f';
        ctx.fillText('GO!', this.W / 2, this.H / 2);
        ctx.restore();
      }
    }

    /* ---------- 背景：外部图片（缺失降级为 Canvas 木纹） ---------- */
    drawBackground(ctx) {
      const img = FN.images.get('background');
      if (img && img.width) {
        const s = Math.max(this.W / img.width, this.H / img.height);
        const dw = img.width * s, dh = img.height * s;
        ctx.drawImage(img, (this.W - dw) / 2, (this.H - dh) / 2, dw, dh);
        return;
      }
      // 降级：程序化木纹背景（竖条木板 + 暗角）
      ctx.fillStyle = '#6d4426';
      ctx.fillRect(0, 0, this.W, this.H);
      const plank = 88;
      for (let x = 0, i = 0; x < this.W; x += plank, i++) {
        ctx.fillStyle = i % 2 ? '#6a4123' : '#734a2a';
        ctx.fillRect(x, 0, plank - 3, this.H);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(x + plank - 3, 0, 3, this.H);
      }
      const v = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.95);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, this.W, this.H);
    }

    /* ---------- Canvas HUD ---------- */
    drawHUD(ctx) {
      const FS = C().HUD.fontStack;
      const mode = this.mode;
      if (!mode) return;
      this.hudRects = {};

      const drawPauseBtn = (x, y, s) => {
        ctx.save();
        ctx.fillStyle = 'rgba(20,10,4,0.55)';
        ctx.strokeStyle = 'rgba(255,220,160,0.8)';
        ctx.lineWidth = 2;
        this._roundRect(ctx, x, y, s, s, 10);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe9c2';
        const bw = s * 0.14, bh = s * 0.4;
        ctx.fillRect(x + s * 0.32, y + s * 0.3, bw, bh);
        ctx.fillRect(x + s * 0.54, y + s * 0.3, bw, bh);
        ctx.restore();
        this.hudRects.pause = { x, y, w: s, h: s };
      };

      const drawHearts = (field, total, x, y, alignRight) => {
        const gap = 26, size = 10;
        for (let i = 0; i < total; i++) {
          const hx = alignRight ? x - i * gap : x + i * gap;
          const filled = i < field.lives;
          FN.entities.drawHeart(ctx, hx, y, size, field.palette.heart, filled);
        }
      };

      const drawEffects = (field, x, y, alignRight) => {
        ctx.save();
        ctx.font = 'bold 14px ' + FS;
        ctx.textBaseline = 'top';
        ctx.textAlign = alignRight ? 'right' : 'left';
        field.effectList().forEach((e, i) => {
          ctx.fillStyle = e.color;
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
          ctx.strokeText(e.name, x, y + i * 20);
          ctx.fillText(e.name, x, y + i * 20);
        });
        ctx.restore();
      };

      const drawTimer = (text, x, y, size) => {
        ctx.save();
        ctx.font = 'bold ' + size + 'px ' + FS;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5;
        ctx.strokeText(text, x, y);
        ctx.fillStyle = (mode !== 'zen' && this.timeLeft <= 10) ? '#ff5252' : '#ffe9c2';
        ctx.fillText(text, x, y);
        ctx.restore();
      };

      const comboVisible = (f) =>
        f.comboCount >= 2 && (f.elapsed - f.lastSliceAt) <= C().COMBO.windowSec;

      if (mode === 'versus') {
        const f1 = this.fields[0], f2 = this.fields[1];
        // 左上：玩家1 得分 + 红色爱心
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = 'bold 22px ' + FS; ctx.textAlign = 'left';
        ctx.fillStyle = '#ffe082';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
        ctx.strokeText('P1 ' + f1.score, 14, 12);
        ctx.fillText('P1 ' + f1.score, 14, 12);
        if (comboVisible(f1)) {
          ctx.font = 'bold 17px ' + FS; ctx.fillStyle = '#fff';
          ctx.strokeText('连击 x' + f1.comboMult, 14, 42);
          ctx.fillText('连击 x' + f1.comboMult, 14, 42);
        }
        ctx.restore();
        drawHearts(f1, 3, 28, 84, false);
        drawEffects(f1, 14, 100, false);

        // 右上：玩家2 得分 + 蓝色爱心
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = 'bold 22px ' + FS; ctx.textAlign = 'right';
        ctx.fillStyle = '#82d1ff';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
        ctx.strokeText('P2 ' + f2.score, this.W - 14, 12);
        ctx.fillText('P2 ' + f2.score, this.W - 14, 12);
        if (comboVisible(f2)) {
          ctx.font = 'bold 17px ' + FS; ctx.fillStyle = '#fff';
          ctx.strokeText('连击 x' + f2.comboMult, this.W - 14, 42);
          ctx.fillText('连击 x' + f2.comboMult, this.W - 14, 42);
        }
        ctx.restore();
        drawHearts(f2, 3, this.W - 28, 84, true);
        drawEffects(f2, this.W - 14, 100, true);

        // 顶部中间：统一倒计时
        drawTimer(String(Math.ceil(this.timeLeft)), this.W / 2, 10, 38);
        // 暂停按钮：倒计时正下方居中
        drawPauseBtn(this.W / 2 - 23, 58, 46);
        return;
      }

      // ---------- 单人（经典 / 街机 / 禅 / 联机本地视角） ----------
      const f = this.fields[0];
      ctx.save();
      ctx.textBaseline = 'top';
      ctx.font = 'bold 26px ' + FS; ctx.textAlign = 'left';
      const scoreLabel = mode === 'net' ? '我方 ' + f.score : '得分 ' + f.score;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 5;
      ctx.strokeText(scoreLabel, 14, 12);
      ctx.fillStyle = '#ffe9c2';
      ctx.fillText(scoreLabel, 14, 12);
      if (comboVisible(f)) {
        ctx.font = 'bold 19px ' + FS;
        ctx.strokeText('连击 x' + f.comboMult, 14, 48);
        ctx.fillStyle = '#ffedb0';
        ctx.fillText('连击 x' + f.comboMult, 14, 48);
      }
      ctx.restore();

      if (f.lives !== Infinity) drawHearts(f, 3, 28, 92, false);   // 经典/联机显示生命
      drawEffects(f, 14, mode === 'arcade' ? 108 : 66, false);

      // 联机：右上角显示对手分数
      if (mode === 'net') {
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = 'bold 22px ' + FS; ctx.textAlign = 'right';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4;
        ctx.strokeText('对方 ' + this.peerScore, this.W - 76, 14);
        ctx.fillStyle = '#82d1ff';
        ctx.fillText('对方 ' + this.peerScore, this.W - 76, 14);
        ctx.restore();
      }

      // 计时：街机/联机 倒计时；禅模式 正计时
      if (C().MODES[mode].timed) drawTimer(String(Math.ceil(this.timeLeft)), this.W / 2, 10, 38);
      else if (C().MODES[mode].countUp) {
        const s = Math.floor(this.elapsed);
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        drawTimer(mm + ':' + ss, this.W / 2, 10, 32);
      }

      // 右上角暂停按钮
      drawPauseBtn(this.W - 60, 14, 46);

      // 禅模式：手动结束本局按钮
      if (mode === 'zen') {
        ctx.save();
        ctx.fillStyle = 'rgba(20,10,4,0.55)';
        ctx.strokeStyle = 'rgba(255,220,160,0.8)';
        ctx.lineWidth = 2;
        this._roundRect(ctx, this.W - 154, 18, 84, 38, 10);
        ctx.fill(); ctx.stroke();
        ctx.font = 'bold 17px ' + FS;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffe9c2';
        ctx.fillText('结束本局', this.W - 112, 37);
        ctx.restore();
        this.hudRects.end = { x: this.W - 154, y: 18, w: 84, h: 38 };
      }
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  };
})();
