# 水果忍者 · HTML5 Canvas 网页游戏

原生 JavaScript + HTML5 Canvas 实现，**不使用任何前端框架**，仅引入 socket.io 4.x CDN（联机模式用）。
无图片、无音频素材也能完整运行（全部降级为 Canvas 绘制 / 静音）。

---

## 一、运行方式

### 方式 1：本地直接打开（单机全部功能）
直接双击 `index.html` 即可游玩。
> 联机按钮会**置灰**并提示「需要启动Node后端服务」——这是正常行为。

### 方式 2：启动 Node 服务（含网络联机）
```bash
npm install       # 首次（package.json 已带 socket.io 依赖）
npm start         # 或 node server/server.js（默认端口 8080）
```
浏览器访问 `http://localhost:8080`（可用环境变量覆盖端口，如 `PORT=3000 npm start`）：
一台设备点「创建房间」得到 4 位数字房间码，另一台设备输入房间码「加入房间」即可异地对战。

---

## 二、项目结构

```
shuiguorenzhe/
├── index.html            入口页面（含"合并成单文件"的注释说明）
├── css/
│   └── style.css         DOM UI 样式（菜单/弹窗/竖屏提示）
├── js/
│   ├── config.js         ★ 全局参数配置中心（物理/分数/难度/连击/增益/存储key，改参先看这里）
│   ├── utils.js          工具函数 + localStorage 安全封装
│   ├── pool.js           对象池（水果/碎片/粒子/飘字复用，减少 GC 卡顿）
│   ├── audio.js          音效管理（HTML Audio 标签 + 静音开关 + 容错）
│   ├── assets.js         图片加载器（onerror 自动降级标记）
│   ├── blade.js          刀光轨迹（贝塞尔平滑 + 发光 + 250ms 淡出）
│   ├── fx.js             粒子系统（果汁飞溅/爆炸/冲击波/飘浮文字）
│   ├── entities.js       水果/炸弹/增益/两半碎片：生成、物理、渲染与降级绘制
│   ├── input.js          鼠标 + 多点触控输入（双人分屏归属/钳制，阻止右键菜单）
│   ├── game.js           ★ 核心：状态机 MENU/PLAYING/PAUSE/GAMEOVER、Field 区域、
│   │                       碰撞判定、HUD 绘制、唯一 rAF 游戏循环
│   ├── net.js            Socket.IO 客户端（房间码创建/加入/分数同步）
│   ├── ui.js             DOM 弹窗互斥、自动暂停/恢复、结算弹窗
│   └── main.js           启动引导、横竖屏检测、全屏 API、后台自动暂停
├── server/
│   └── server.js         最小 NodeJS socket.io 服务端（含静态托管，见文件头注释）
└── assets/
    ├── images/           图片素材（可选，缺失自动降级）
    └── audio/            音效素材（可选，缺失自动静音）
```

---

## 三、素材放置（全部可选）

### 图片 → `assets/images/`
| 文件名 | 用途 |
|---|---|
| `background.jpg` | 木纹背景（缺失→程序化木板纹理） |
| `watermelon.png` / `apple.png` / `orange.png` / `banana.png` / `peach.png` | 完整水果 |
| `watermelon_half.png` 等 `*_half.png` | 两半切割碎片（缺失→半圆色块） |
| `bomb.png` | 炸弹 |
| `heart.png` | 爱心生命图标 |

免费商用素材来源：**pixabay.com**（搜 fruit png / wood texture）、**itch.io**（搜 free fruit 2D sprite pack）、**爱给网 aigei.com**（开源游戏素材）。

### 音效 → `assets/audio/`（**已内置 5 个免费音效**，来自 Mixkit License，可商用无需署名）
| 文件名 | 用途 | 来源 |
|---|---|---|
| `slice.mp3` | 切水果 | Mixkit "Sword slash swoosh" |
| `combo.mp3` | 连击 | Mixkit "Winning chimes" |
| `bomb_explode.mp3` | 炸弹爆炸 | Mixkit "Arcade game explosion" |
| `game_over.mp3` | 游戏结束 | Mixkit "Arcade game over" |
| `bonus.mp3` | 增益香蕉 | Mixkit "Bonus earned in video game" |

> 想换音效：直接用同名 mp3 覆盖即可；全部删掉则自动静音降级，游戏不受影响。
> 更多免费音效来源：**mixkit.co/free-sound-effects**（免登录直链）、**freesound.org**（CC0/CC-BY）、**pixabay.com/sound-effects**。

---

## 四、游戏模式与操作

| 模式 | 规则 | 操作 |
|---|---|---|
| 经典 | 3 生命，漏水果/切炸弹扣命，难度随时间上升 | 左键/手指滑动切割 |
| 街机 | 90 秒限时，切炸弹 -30 分，3 种增益香蕉（双倍得分/时间减速/水果风暴） | 同上 |
| 禅 | 无炸弹无生命不限时，「结束本局」按钮手动结算 | 同上 |
| **双人分屏** | 画布左右对半，双方独立生成/物理/生命/计分/连击，同步 3-2-1 开局与 90 秒倒计时，同时结束 | PC：左半区**左键**=P1黄刀，右半区**右键**=P2蓝刀；手机：左半屏=P1，右半屏=P2，双指同时对战 |
| 网络联机 | 复用双人对战规则，4 位房间码匹配，分数实时同步 | 各自在自己屏幕上切割 |

- 单纯点击**不算**切割，必须有滑动轨迹；
- 连击：800ms 窗口内连续切水果累积倍数，上限 x5，得分=基础分×倍数；
- 分数：西瓜 20 / 苹果 10 / 橙子 12 / 香蕉 8 / 桃子 15；
- 各模式最高分存 localStorage，结算弹窗展示历史最高分。

---

## 五、如何合并成单个 index.html（双击直接运行）

1. 把 `css/style.css` 全部内容复制进 `index.html` 的 `<style>` 标签，删除 `<link>`；
2. 按 `index.html` 底部 `<script>` 引入顺序（config → utils → pool → audio → assets → blade → fx → entities → input → game → net → ui → main），把各 js 文件内容依次拼进一个 `<script>` 标签；
3. 删除所有外部 `<script src>`（含 socket.io CDN）。所有模块挂载在 `window.FN` 命名空间，普通脚本无模块依赖，顺序拼接即可；
4. 无素材也能玩：图片/音频均有降级逻辑。

---

## 六、调参指南

全部数值集中在 `js/config.js`：
- `PHYSICS`：重力、抛出高度比例、旋转速度；
- `DIFFICULTY` / `RAMP`：三档难度基础参数 + 每 10 秒自动爬升系数；
- `SCORE` / `COMBO`：分数表、连击窗口与上限；
- `BONUS`：三种增益香蕉的持续时间/减速系数/风暴生成间隔；
- `BLADE`：刀光宽度、发光、淡出时长、最短滑动切割距离；
- `MODES`：各模式生命/限时/炸弹/增益开关。

---

## 七、浏览器兼容

- PC：Chrome / Edge / Firefox（右键已被游戏接管为玩家 2 操作）；
- 手机：强制横屏（竖屏弹窗禁止游戏）、进入游戏自动尝试全屏 API（不支持则降级普通布局）、
  viewport 禁止缩放/双击放大/下拉滚动、多点触控双指同时操作、画布跟随窗口 resize。
