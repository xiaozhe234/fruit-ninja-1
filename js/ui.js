/* =========================================================================
 * ui.js —— DOM UI 管理器
 * · 主菜单显示 / 隐藏；
 * · 弹窗互斥：同一时间只能打开一个弹窗；
 * · 弹窗打开自动暂停游戏（PLAYING→PAUSE），关闭自动恢复（PAUSE→PLAYING）；
 * · 设置持久化（静音 / 难度 → localStorage）；
 * · 结算弹窗动态内容（单人 / 双人 / 联机）；
 * · 联机弹窗交互与按钮置灰控制。
 * 【合并单文件】按 index.html 引入顺序把本文件内容拼接进 <script> 即可。
 * ========================================================================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  FN.ui = {
    game: null,
    currentModal: null,     // 弹窗互斥：当前打开的弹窗 id
    autoPaused: false,      // 因弹窗打开而自动暂停（关闭时需恢复）

    init(game) {
      this.game = game;
      this._bindMenu();
      this._bindSettings();
      this._bindPause();
      this._bindGameOver();
      this._bindNetModal();
    },

    /* ---------------- 主菜单 ---------------- */
    _bindMenu() {
      const g = this.game;
      $('btnClassic').addEventListener('click', () => g.startMode('classic'));
      $('btnArcade').addEventListener('click', () => g.startMode('arcade'));
      $('btnZen').addEventListener('click', () => g.startMode('zen'));
      $('btnVersus').addEventListener('click', () => g.startMode('versus'));
      // 联机：置灰时点击只弹提示，不进入游戏
      $('btnNet').addEventListener('click', () => {
        if (!FN.net.available) return;
        this.openModal('netModal');
      });
      $('btnSettings').addEventListener('click', () => this.openModal('settingsModal'));
      $('btnHelp').addEventListener('click', () => this.openModal('helpModal'));
    },

    showMenu() { $('menuScreen').classList.remove('hidden'); },
    hideMenu() { $('menuScreen').classList.add('hidden'); },

    /** 联机可用性：本地直接打开静态 html（file:// 或 CDN 加载失败）时按钮置灰 */
    setNetAvailable(ok) {
      const btn = $('btnNet'), hint = $('netHint'), online = $('netOnlineArea');
      if (ok) {
        btn.classList.remove('disabled');
        hint.classList.add('hidden');
        online.classList.remove('hidden');
        $('netOfflineHint').classList.add('hidden');
      } else {
        btn.classList.add('disabled');
        hint.classList.remove('hidden');
        online.classList.add('hidden');
        $('netOfflineHint').classList.remove('hidden');
      }
    },

    /* ---------------- 弹窗互斥 + 自动暂停/恢复 ---------------- */
    openModal(id) {
      // 互斥：同一时间只能打开一个弹窗
      this._hideAllModals();
      $('modalWrap').classList.remove('hidden');
      $(id).classList.remove('hidden');
      this.currentModal = id;
      // 弹窗打开自动暂停游戏
      if (this.game.state === 'PLAYING') {
        this.game.setPaused(true);
        this.autoPaused = true;
      }
    },

    closeModal() {
      // 自动恢复：仅当游戏仍处于因弹窗而暂停的状态（结算后是 GAMEOVER 不恢复）
      if (this.currentModal && this.game.state === 'PAUSE' && this.autoPaused) {
        this.game.setPaused(false);
      }
      this.autoPaused = false;
      this._hideAllModals();
      $('modalWrap').classList.add('hidden');
      this.currentModal = null;
    },

    _hideAllModals() {
      ['settingsModal', 'helpModal', 'pauseModal', 'overModal', 'netModal']
        .forEach((id) => $(id).classList.add('hidden'));
    },

    /* ---------------- 设置弹窗 ---------------- */
    _bindSettings() {
      const muteSel = $('selMute'), diffSel = $('selDiff');
      // 页面加载时从 localStorage 读取并回显
      muteSel.value = FN.settings.muted ? 'on' : 'off';
      diffSel.value = FN.settings.difficulty;

      muteSel.addEventListener('change', () => {
        FN.settings.muted = muteSel.value === 'on';
        FN.sounds.setMuted(FN.settings.muted);
      });
      diffSel.addEventListener('change', () => {
        FN.settings.difficulty = diffSel.value;
        FN.store.set(FN.CONFIG.STORAGE.difficulty, diffSel.value);
      });
      $('btnSettingsClose').addEventListener('click', () => this.closeModal());
    },

    /* ---------------- 暂停弹窗 ---------------- */
    _bindPause() {
      // HUD 暂停按钮 → ui.openModal('pauseModal') 在 game.hudPress 中触发
      $('btnResume').addEventListener('click', () => this.closeModal());  // 关闭弹窗自动恢复
      $('btnQuit').addEventListener('click', () => {
        this.game.exitToMenu();   // 先回菜单（状态 MENU），再关弹窗避免被自动恢复
        this.closeModal();
      });
    },

    /* ---------------- 结算弹窗 ---------------- */
    _bindGameOver() {
      $('btnAgain').addEventListener('click', () => {
        const mode = this.game.lastMode;
        this.closeModal();
        if (mode === 'net') {
          // 联机再来一局需要重新匹配：打开联机弹窗
          FN.net.reset();
          this.openModal('netModal');
        } else {
          this.game.startMode(mode);
        }
      });
      $('btnHome').addEventListener('click', () => {
        this.game.exitToMenu();
        this.closeModal();
      });
    },

    showGameOver(res) {
      const body = $('overBody'), title = $('overTitle'), again = $('btnAgain');

      if (res.type === 'single') {
        title.textContent = res.modeLabel + '结束';
        again.textContent = '重新开始';
        body.innerHTML =
          '<div class="result-title draw">本局得分 ' + res.score + '</div>' +
          '<div class="score-row"><span>历史最高分</span><b>' + res.best + '</b></div>' +
          '<div class="score-row"><span>本局最高连击</span><b>x' + (res.maxCombo || 1) + '</b></div>' +
          (res.isNew ? '<div class="new-record">★ 新纪录 ★</div>' : '');
      } else if (res.type === 'versus') {
        title.textContent = '双人对战结算';
        again.textContent = '再来一局';
        const cls = res.resultText === '平局' ? 'draw' : 'win';
        body.innerHTML =
          '<div class="result-title ' + cls + '">' + res.resultText + '</div>' +
          '<div class="score-row"><span>玩家1 得分（黄刀）</span><b>' + res.p1 + '</b></div>' +
          '<div class="score-row"><span>玩家2 得分（蓝刀）</span><b>' + res.p2 + '</b></div>' +
          '<div class="score-row"><span>双人模式最高分</span><b>' + res.best + '</b></div>' +
          (res.isNew ? '<div class="new-record">★ 新纪录 ★</div>' : '');
      } else {
        // 联机
        title.textContent = '联机对战结算';
        again.textContent = '再来一局';
        let cls = 'draw';
        if (res.resultText === '平局') cls = 'draw';
        else if (res.resultText.indexOf('对手获胜') >= 0) cls = 'lose';
        else if (res.resultText.indexOf('赢') >= 0 || res.resultText.indexOf('获胜') >= 0) cls = 'win';
        body.innerHTML =
          '<div class="result-title ' + cls + '">' + res.resultText + '</div>' +
          '<div class="score-row"><span>我方得分</span><b>' + res.me + '</b></div>' +
          '<div class="score-row"><span>对方得分</span><b>' + res.peer + '</b></div>' +
          '<div class="score-row"><span>联机最高分</span><b>' + res.best + '</b></div>' +
          (res.isNew ? '<div class="new-record">★ 新纪录 ★</div>' : '');
      }
      this.openModal('overModal');
    },

    /* ---------------- 联机弹窗 ---------------- */
    _bindNetModal() {
      $('btnCreateRoom').addEventListener('click', () => {
        $('roomCodeBox').classList.add('hidden');
        FN.net.create((res) => {
          if (res && res.ok) {
            $('roomCodeText').textContent = res.code;
            $('roomCodeBox').classList.remove('hidden');
          } else {
            FN.net._status && FN.net._status((res && res.msg) || '创建房间失败');
          }
        });
      });
      $('btnJoinRoom').addEventListener('click', () => {
        const code = $('inputRoomCode').value.trim();
        if (!/^\d{4}$/.test(code)) {
          $('netStatus').textContent = '请输入 4 位数字房间码';
          return;
        }
        FN.net.join(code);
      });
      $('btnNetClose').addEventListener('click', () => {
        FN.net.leaveRoom();
        this.closeModal();
      });
    },

    /* ---------------- 竖屏禁止提示 ---------------- */
    setRotateBlocked(blocked) {
      const el = $('rotateOverlay');
      el.classList.toggle('hidden', !blocked);
      if (blocked && this.game && this.game.state === 'PLAYING') {
        this.openModal('pauseModal');   // 竖屏时自动暂停
      }
    },
  };
})();
