/* =========================================================================
 * server.js —— 最小可运行的 NodeJS Socket.IO 服务端（网络联机模式）
 *
 * 运行方式：
 *   1) npm init -y            （首次）
 *   2) npm install socket.io  （首次）
 *   3) node server/server.js
 *   4) 浏览器访问 http://localhost:8080 即可玩全部功能（含联机）；
 *      另一台设备/浏览器窗口访问同一地址，一人创建房间、一人输入 4 位房间码加入。
 *      （默认端口 8080，可用环境变量 PORT 覆盖，如：PORT=3000 node server/server.js）
 *
 * 功能：
 *   · createRoom：生成 4 位数字房间码（不重复），房主等待对手；
 *   · joinRoom  ：第二名玩家加入后向双方广播 matchStart 同步开局；
 *   · score / gameOver：在两人之间中转实时分数与终局分数；
 *   · leaveRoom / disconnect：通知对方 peerLeft、清理房间；
 *   · 顺带静态托管项目根目录，方便直接开服游玩。
 * ========================================================================= */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');   // 项目根目录（静态托管）

/* ---------------- 最简静态文件服务（index.html / js / css / 素材） ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.md': 'text/plain; charset=utf-8',
};

/* ---------------- 音频素材缺失时的静音降级 ----------------
 * 生成 0.1 秒静音 WAV（8kHz 8bit 单声道）。
 * 素材缺失时用 200 + 静音 WAV 代替 404：浏览器嗅探到合法音频容器即可正常解码，
 * 播放为静音，控制台不再刷 "404 (Not Found)"（若用户后续放入真实 mp3 即恢复正常音效）。 */
function silentWav() {
  const sr = 8000, n = sr / 10;                       // 0.1s
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);                            // fmt chunk 大小
  b.writeUInt16LE(1, 20);                             // PCM
  b.writeUInt16LE(1, 22);                             // 单声道
  b.writeUInt32LE(sr, 24);                            // 采样率
  b.writeUInt32LE(sr, 28);                            // 字节率
  b.writeUInt16LE(1, 32);                             // 块对齐
  b.writeUInt16LE(8, 34);                             // 位深
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  return b;                                           // 采样数据全 0 = 静音
}
const SILENT_WAV = silentWav();

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  // 简单防目录穿越
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    const ext = path.extname(filePath).toLowerCase();
    if (err) {
      // 音频素材缺失：返回内置静音 WAV（200），浏览器可正常解码播放为静音，控制台零 404
      if (ext === '.mp3' || ext === '.ogg' || ext === '.wav') {
        res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': SILENT_WAV.length });
        return res.end(SILENT_WAV);
      }
      // 图片素材缺失：返回 200 + 无效图片数据 → Image.onerror 触发 → 游戏走 Canvas
      // 降级绘制（色块水果/木纹背景），同时控制台不出现 "Failed to load resource: 404"。
      // 注意：不能返回合法透明图，否则会渲染成隐形水果。
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': 1 });
        return res.end(Buffer.from([0]));
      }
      res.writeHead(404); return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------------- Socket.IO 房间逻辑 ---------------- */
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();   // code -> { players: Set<socketId> }

function genRoomCode() {
  // 生成未占用的 4 位数字房间码
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); }
  while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  let joinedCode = null;

  // 创建房间
  socket.on('createRoom', (ack) => {
    const code = genRoomCode();
    rooms.set(code, { players: new Set([socket.id]) });
    joinedCode = code;
    socket.join(code);
    if (typeof ack === 'function') ack({ ok: true, code });
  });

  // 加入房间：满员后向双方广播同步开局
  socket.on('joinRoom', (code, ack) => {
    code = String(code || '');
    const room = rooms.get(code);
    if (!room) { if (ack) ack({ ok: false, msg: '房间不存在' }); return; }
    if (room.players.size >= 2) { if (ack) ack({ ok: false, msg: '房间已满' }); return; }
    room.players.add(socket.id);
    joinedCode = code;
    socket.join(code);
    if (ack) ack({ ok: true });
    io.to(code).emit('matchStart', { startTime: Date.now() });
  });

  // 实时分数中转
  socket.on('score', (data) => {
    if (joinedCode) socket.to(joinedCode).emit('peerScore', data);
  });

  // 终局分数中转
  socket.on('gameOver', (data) => {
    if (joinedCode) socket.to(joinedCode).emit('peerGameOver', data);
  });

  // 主动退出房间
  socket.on('leaveRoom', () => {
    if (!joinedCode) return;
    const room = rooms.get(joinedCode);
    socket.to(joinedCode).emit('peerLeft');
    if (room) {
      room.players.delete(socket.id);
      if (room.players.size === 0) rooms.delete(joinedCode);
    }
    socket.leave(joinedCode);
    joinedCode = null;
  });

  // 断开连接：通知对手并清理
  socket.on('disconnect', () => {
    if (!joinedCode) return;
    socket.to(joinedCode).emit('peerLeft');
    const room = rooms.get(joinedCode);
    if (room) {
      room.players.delete(socket.id);
      if (room.players.size === 0) rooms.delete(joinedCode);
    }
    joinedCode = null;
  });
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  水果忍者联机服务已启动');
  console.log('  本机访问:   http://localhost:' + PORT);
  console.log('  局域网访问: http://<本机IP>:' + PORT);
  console.log('==============================================');
});
