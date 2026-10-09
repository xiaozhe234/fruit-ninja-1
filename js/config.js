/* =========================================================================
 * config.js —— 全局参数配置中心
 * 所有可调参数（物理 / 分数 / 难度 / 连击 / 增益 / 存储 key / 资源路径）集中在此，
 * 方便二次修改调试，无需在业务代码里翻找魔法数字。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
window.FN = window.FN || {};

FN.CONFIG = {

  /* ---------- 物理引擎参数 ---------- */
  PHYSICS: {
    gravity: 1400,            // 重力加速度（px/s^2）：调小→飞行时间更长，更好反应
    launchApexMin: 0.68,      // 水果抛物线最高点 = 区域高度 * [min, max] 随机比例
    launchApexMax: 0.96,      //   （抬得高→水果更多时间停留在画面上半区，易观察易切割）
    vxJitter: 150,            // 水平初速度随机抖动
    vxBiasToCenter: 0.22,     // 朝区域中心的水平牵引系数（避免水果飞出屏幕）
    maxVx: 300,               // 水平速度上限
    spinMin: -3.2,            // 旋转角速度范围（rad/s）
    spinMax: 3.2,
  },

  /* ---------- 分数配置 ---------- */
  SCORE: {
    watermelon: 20,
    apple: 10,
    orange: 12,
    banana: 8,
    peach: 15,
    bombPenalty: 30,          // 街机模式切炸弹扣分
  },

  /* ---------- 水果外观（r 半径 / juice 果汁色 / flesh 果肉色 / skin 果皮色） ---------- */
  FRUITS: {
    watermelon: { r: 46, juice: '#ff4757', flesh: '#ff6b81', skin: '#2e7d32' },
    apple:      { r: 30, juice: '#ffe9a8', flesh: '#fff3c4', skin: '#d32f2f' },
    orange:     { r: 28, juice: '#ffa502', flesh: '#ffbe4a', skin: '#f39c12' },
    banana:     { r: 26, juice: '#f6e58d', flesh: '#f9e79f', skin: '#f1c40f' },
    peach:      { r: 32, juice: '#ff9ff3', flesh: '#ffd6e8', skin: '#ff7edb' },
  },

  /* ---------- 炸弹 / 爆炸特效 ---------- */
  BOMB: {
    r: 27,
    flash: 0.5,               // 红色闪屏初始强度
    flashDecay: 1.8,          // 闪屏衰减速度
    shakeMag: 12,             // 画面震动幅度 px
    shakeDecay: 26,           // 震动衰减速度
  },

  /* ---------- 增益香蕉（街机模式） ---------- */
  BONUS: {
    r: 28,
    chance: 0.06,             // 每个生成位替换为增益香蕉的概率
    types: {
      double: { name: '双倍得分', color: '#ffd54a', duration: 10 },                       // 10 秒得分翻倍
      slow:   { name: '时间减速', color: '#4dd0e1', duration: 7, factor: 0.6 },            // 7 秒全场速度 -40%
      storm:  { name: '水果风暴', color: '#ba68c8', duration: 3, spawnInterval: 0.16 },    // 3 秒大量生成
    },
  },

  /* ---------- 连击系统 ---------- */
  COMBO: {
    windowSec: 0.8,           // 800ms 连击时间窗口
    max: 5,                   // 连击倍数上限 x5
  },

  /* ---------- 刀光轨迹 ---------- */
  BLADE: {
    pointLife: 170,           // 轨迹点存活时长 ms（形成拖尾）
    fadeMs: 250,              // 松开后 250ms 内渐变淡出
    minSliceDist: 7,          // 单纯点击不算切割：线段最短滑动距离 px
    width: 11,                // 发光层线宽
    coreWidth: 4,             // 白色内核线宽
    glow: 16,                 // shadowBlur 发光半径
    colors: { p1: '#ffd54a', p2: '#4fc3f7' },   // 玩家1黄色 / 玩家2蓝色
  },

  /* ---------- 难度档位（主菜单设置里选择，全部参数集中于此） ---------- */
  DIFFICULTY: {
    easy:   { name: '简单', spawnInterval: 1.6,  waveMin: 1, waveMax: 3, speed: 0.9,  bombChance: 0.05 },
    normal: { name: '普通', spawnInterval: 1.25, waveMin: 1, waveMax: 4, speed: 1.0,  bombChance: 0.09 },
    hard:   { name: '困难', spawnInterval: 0.95, waveMin: 2, waveMax: 5, speed: 1.15, bombChance: 0.14 },
  },

  /* ---------- 难度自动爬升（游戏时间越长越难） ---------- */
  RAMP: {
    intervalSec: 10,          // 每 10 秒提升一档
    intervalMul: 0.93,        // 生成间隔 * 0.93（越来越快）
    intervalMin: 0.4,
    speedMul: 1.05,           // 抛出速度 * 1.05
    speedMax: 1.9,
    bombAdd: 0.015,           // 炸弹概率 +0.015
    bombMax: 0.3,
  },

  /* ---------- 各游戏模式规则 ---------- */
  MODES: {
    classic: { label: '经典模式', lives: 3,       timed: false, bombs: true,  bonus: false, missPenalty: true  },
    arcade:  { label: '街机模式', lives: Infinity, timed: true,  time: 90, bombs: true,  bonus: true,  missPenalty: false },
    zen:     { label: '禅模式',   lives: Infinity, timed: false, bombs: false, bonus: false, missPenalty: false, countUp: true },
    versus:  { label: '双人对战', lives: 3,       timed: true,  time: 90, bombs: true,  bonus: false, missPenalty: true  },
    net:     { label: '联机对战', lives: 3,       timed: true,  time: 90, bombs: true,  bonus: false, missPenalty: true  },
  },

  PRE_ROLL: 3.0,              // 开局同步倒数 3-2-1

  /* ---------- 粒子 / 特效 ---------- */
  FX: {
    maxParticles: 450,        // 每个区域粒子上限（性能保护）
    juicePerRadius: 0.35,     // 果汁粒子数 ≈ 半径 * 系数
    explosionCount: 36,       // 爆炸粒子数
  },

  /* ---------- 本地存储 key（localStorage 各模式最高分 / 设置） ---------- */
  STORAGE: {
    best: {
      classic: 'fn_best_classic',
      arcade:  'fn_best_arcade',
      zen:     'fn_best_zen',
      versus:  'fn_best_versus',
      net:     'fn_best_net',
    },
    mute: 'fn_mute',
    difficulty: 'fn_difficulty',
  },

  /* ---------- 音效 <audio> 标签 id 映射 ---------- */
  AUDIO: {
    slice: 'sfx-slice',
    combo: 'sfx-combo',
    bomb:  'sfx-bomb',
    over:  'sfx-over',
    bonus: 'sfx-bonus',
  },

  /* ---------- 图片素材路径（全部外部 Image 加载，onerror 自动降级为 Canvas 色块绘制）
   * 素材可到 pixabay / itch.io 免费精灵包 / 爱给网 下载后按此路径放置（详见 README） ---------- */
  IMAGES: {
    background:    'assets/images/background.jpg',
    watermelon:    'assets/images/watermelon.png',
    watermelonHalf:'assets/images/watermelon_half.png',
    apple:         'assets/images/apple.png',
    appleHalf:     'assets/images/apple_half.png',
    orange:        'assets/images/orange.png',
    orangeHalf:    'assets/images/orange_half.png',
    banana:        'assets/images/banana.png',
    bananaHalf:    'assets/images/banana_half.png',
    peach:         'assets/images/peach.png',
    peachHalf:     'assets/images/peach_half.png',
    bomb:          'assets/images/bomb.png',
    heart:         'assets/images/heart.png',
  },

  HUD: {
    fontStack: '"Microsoft YaHei","PingFang SC",sans-serif',
  },
};

/* ---------- 玩家配色（刀光 / 爱心 / 飘字，双人与单人共用） ---------- */
FN.PALETTES = [
  { blade: '#ffd54a', heart: '#ff5252', text: '#ffe082', label: '玩家1' },  // 玩家1：黄刀光 / 红爱心
  { blade: '#4fc3f7', heart: '#448aff', text: '#82d1ff', label: '玩家2' },  // 玩家2：蓝刀光 / 蓝爱心
];
