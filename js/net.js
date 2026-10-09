/* =========================================================================
 * net.js —— Socket.IO 网络房间联机模块（客户端）
 *
 * · 依赖 index.html 引入的 socket.io 4.x CDN；
 * · 本地直接双击打开（file://）或 CDN 加载失败时：typeof io === 'undefined'，
 *   模块标记 available=false → ui.js 把联机按钮置灰并提示
 *   "需要启动Node后端服务"；
 * · 联机对战逻辑复用双人分屏的对战规则（MODES.net：3 生命 / 90 秒 / 炸弹扣命），
 *   双方各自本地模拟自己的水果，分数通过 socket 实时同步，结束比较总分；
 * · 配套服务端：server/server.js（最小可运行 NodeJS 示例，见文件内注释）。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  FN.net = {
    available: false,     // 是否具备联机条件（CDN 加载成功 且 http/https 协议）
    socket: null,
    roomCode: null,
    peerScore: 0,
    peerLeft: false,

    init() {
      this.available =
        /^https?:$/.test(location.protocol) && typeof io !== 'undefined';
    },

    /** 懒连接：首次创建/加入房间时才建立 socket */
    ensure() {
      if (this.socket) return this.socket;
      try {
        // 限制重连次数：服务器未启动时避免控制台反复刷 polling 连接失败
        this.socket = io({ reconnectionAttempts: 3, reconnectionDelay: 800 });
        this._bind(this.socket);
      } catch (e) {
        this.socket = null;
        this._status('无法创建连接：' + e.message);
      }
      return this.socket;
    },

    _bind(s) {
      s.on('connect_error', () => {
        this._status('无法连接服务器，请先启动 Node 后端（node server/server.js）');
      });
      // 房间满员后服务端向双方广播开局 → 关闭弹窗、同步开始联机对局
      s.on('matchStart', () => {
        this.peerScore = 0;
        this.peerLeft = false;
        FN.ui.closeModal();
        FN.ui.hideMenu();
        FN.game.startMode('net');
      });
      // 对手分数实时同步
      s.on('peerScore', (d) => {
        if (FN.game && FN.game.mode === 'net' && d && typeof d.score === 'number') {
          FN.game.peerScore = d.score;
        }
      });
      // 对手终局分数（若我方已结算则刷新结算弹窗）
      s.on('peerGameOver', (d) => {
        if (FN.game && FN.game.mode === 'net' && d && typeof d.score === 'number') {
          FN.game.peerScore = d.score;
          if (FN.game.state === 'GAMEOVER') {
            FN.game.results = FN.game.buildResults();
            FN.ui.showGameOver(FN.game.results);
          }
        }
      });
      // 对手中途离开
      s.on('peerLeft', () => {
        if (FN.game && FN.game.mode === 'net') {
          if (FN.game.state === 'PLAYING') {
            FN.game.peerLeft = true;
            FN.game.end('peerLeft');
          }
        }
        this._status('对手已离开房间');
      });
      s.on('leftRoom', () => { this.roomCode = null; });
    },

    _status(msg) {
      const el = document.getElementById('netStatus');
      if (el) el.textContent = msg || '';
    },

    /** 创建房间：服务端生成 4 位数字房间码 */
    create(cb) {
      const s = this.ensure();
      if (!s) return cb && cb({ ok: false, msg: 'socket 不可用' });
      s.emit('createRoom', (res) => {
        if (res && res.ok) {
          this.roomCode = res.code;
          this._status('房间已创建，等待对手加入…');
        }
        cb && cb(res);
      });
    },

    /** 加入房间：输入 4 位数字房间码 */
    join(code, cb) {
      const s = this.ensure();
      if (!s) return cb && cb({ ok: false, msg: 'socket 不可用' });
      s.emit('joinRoom', String(code), (res) => {
        if (res && res.ok) {
          this.roomCode = String(code);
          this._status('加入成功，即将开始对战…');
        } else {
          this._status((res && res.msg) || '加入失败');
        }
        cb && cb(res);
      });
    },

    /** 实时分数同步 */
    sendScore(score) {
      if (this.socket && this.roomCode) {
        this.socket.emit('score', { score: score });
      }
    },

    /** 终局分数 */
    sendFinal(score) {
      if (this.socket && this.roomCode) {
        this.socket.emit('gameOver', { score: score });
      }
    },

    /** 退出房间（关闭联机弹窗时调用） */
    leaveRoom() {
      if (this.socket && this.roomCode) {
        this.socket.emit('leaveRoom');
      }
      this.roomCode = null;
    },

    /** 开单机局前清理联机状态 */
    reset() {
      this.peerScore = 0;
      this.peerLeft = false;
      this._status('');
    },
  };
})();
