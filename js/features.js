/* ============================================================
   features.js — 音频 / 守火人 / 线上草龙定制 / 承诺卡 / 页内交互
   - 音频：Web Audio 全合成，零音频文件，默认静音
   - 守火人：纯本地问答库（15 条 + 兜底），不接任何 API，断网可用
   - 草龙定制：B 方案（本地组合 + 随机编号），不接任何生成 API
   ============================================================ */
(function () {
'use strict';

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

/* ================= 5.6 音乐与音效（Web Audio 合成，零文件） ================= */
/* 音量偏好记忆键：'1' 想听 / '0' 已静音。默认「想听」，用户显式关过才保持静音。
   真正出声仍受浏览器自动播放策略约束——首次用户手势后才解锁。 */
var AUDIO_KEY = 'xfh.audio';
/* 五声音阶（宫商角徵羽）C D E G A × 两八度，古琴式拨弦取音 */
var PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

var SfxAudio = {
  on: false, _want: false, _unlocked: false,
  ctx: null, master: null, noiseBuf: null,
  _ambient: [], _drumTimer: 0, _pluckTimer: 0,

  init: function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    /* 1 秒白噪声buffer，供鼓 / whoosh / 爆裂 / 香火沙沙底噪复用 */
    var len = this.ctx.sampleRate;
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  },

  _markOn: function (v) {
    var b = document.getElementById('audioToggle');
    if (b) b.classList.toggle('on', !!v);
  },

  /* 记忆恢复：只决定「是否想听」，不等同于已出声（要等手势解锁） */
  restore: function () {
    var v = null;
    try { v = localStorage.getItem(AUDIO_KEY); } catch (e) {}
    if (v === '0') return;                 /* 用户关过：保持静音 */
    this.on = true; this._want = true;
    this._markOn(true);
  },

  /* 首次任意交互解锁（自动播放策略）：手势后首页淡入氛围乐，之后各屏保持 */
  unlock: function () {
    if (this._unlocked) return;
    this._unlocked = true;
    if (!this._want) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume();
    this.on = true; this._markOn(true);
    this._startAmbient();
    this._ramp(0.32, 1.8);                 /* 缓起 1.8s，不突兀 */
  },

  /* master 总音量渐变 */
  _ramp: function (to, dur) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime, g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(to, t + dur);
  },

  toggle: function () {
    this.on = !this.on;
    this._want = this.on;
    this._unlocked = true;                 /* 手动开过即视为已解锁 */
    try { localStorage.setItem(AUDIO_KEY, this.on ? '1' : '0'); } catch (e) {}
    this._markOn(this.on);
    if (this.on) {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.resume) this.ctx.resume();
      this._startAmbient();
      this._ramp(0.32, 1.2);               /* 缓起至 0.32 */
    } else {
      if (!this.ctx) return;
      this._stopAmbient();
      this._ramp(0.0001, 0.4);
    }
  },

  /* 氛围乐层 V2（全合成，整层音量极轻，始终压在音效之下）：
     ① 低频 drone：A1–E2–A2 五度和声（55 / 82.41 / 110.5Hz），庙堂哼鸣更有层次
     ② 香火沙沙底噪：白噪过低通（460Hz），如满堂香火细响
     ③ 古琴式拨弦：宫调动机旋律线（见 _scheduleMelody V2），非随机滴答
     ④ 舞龙双记鼓：每 3.6s「咚-哒」两步，每 4 记加重鼓标段（见 _drum V2）
     ⑤ 清磬：约 9s 一记，庙宇仪式感点缀（见 _qing V2） */
  _startAmbient: function () {
    var c = this.ctx;
    this._stopAmbient();
    var o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
    var o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.41;
    var o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110.5;
    var gH = c.createGain(); gH.gain.value = 0.075;
    o1.connect(gH); o2.connect(gH); o3.connect(gH); gH.connect(this.master);
    var ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460; lp.Q.value = .7;
    var gN = c.createGain(); gN.gain.value = 0.045;
    ns.connect(lp); lp.connect(gN); gN.connect(this.master);
    o1.start(); o2.start(); o3.start(); ns.start();
    this._ambient = [o1, o2, o3, ns];
    var self = this;
    this._drum(); this._drumTimer = setInterval(function () { self._drum(); }, 3600);
    this._scheduleMelody();
    this._qingTimer = setInterval(function () { self._qing(); }, 9000);
  },

  _stopAmbient: function () {
    this._ambient.forEach(function (n) { try { n.stop(); } catch (e) {} });
    this._ambient = [];
    clearInterval(this._drumTimer);
    clearTimeout(this._pluckTimer);
    clearInterval(this._qingTimer);
    this._drumTimer = 0; this._pluckTimer = 0; this._qingTimer = 0;
  },

  /* 古琴式拨弦：三角波基音 + 更轻的二次泛音，指数长衰减（余韵长、留白多） */
  _pluck: function (f) {
    if (!this.on || !this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    var o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.004;
    var g2 = c.createGain(); g2.gain.value = 0.30;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.014);   /* 起振：指甲触弦 */
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);   /* 长衰减 */
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = .5;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(lp); lp.connect(this.master);
    o1.start(t); o2.start(t);
    o1.stop(t + 2.7); o2.stop(t + 2.7);
  },

  /* 拨弦排程：2–3.2s 一次；多数落低音区（琴身按弦），偶尔挑高八度（挑音） */
  /* V2 宫调动机：宫商角徵羽上行后下行回环成旋律线，偶尔挑高八度（挑音） */
  _scheduleMelody: function () {
    var self = this;
    clearTimeout(this._pluckTimer);
    this._pluckTimer = setTimeout(function () {
      if (!self.on || !self.ctx) return;
      var seq = [0, 1, 2, 3, 4, 3, 2, 1];
      var i = seq[self._melIdx % seq.length];
      self._melIdx = (self._melIdx || 0) + 1;
      if (Math.random() < 0.22) i += 5;
      self._pluck(PENTA[i]);
      self._scheduleMelody();
    }, 2000 + Math.random() * 1200);
  },

  /* 通用噪声打击：滤波类型 + 扫频 + 包络 */
  _hit: function (o) {
    if (!this.on || !this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var src = c.createBufferSource(); src.buffer = this.noiseBuf;
    var f = c.createBiquadFilter(); f.type = o.type; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.g, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + o.dur + 0.05);
  },

  /* V2 舞龙双记：主鼓（咚）+ 0.28s 轻鼓（哒），如舞龙步伐；每 4 记加重鼓标段 */
  _drum: function () {
    var self = this;
    this._hit({ type: 'lowpass', f0: 240, f1: 70, dur: 0.16, g: 0.52, q: 1.2 });
    setTimeout(function () { self._hit({ type: 'lowpass', f0: 520, f1: 180, dur: 0.12, g: 0.3, q: 1.4 }); }, 280);
    this._drumCount = (this._drumCount || 0) + 1;
    if (this._drumCount % 4 === 0) {
      setTimeout(function () { self._hit({ type: 'lowpass', f0: 200, f1: 50, dur: 0.22, g: 0.66, q: 1.1 }); }, 560);
    }
  },
  whoosh: function () { this._hit({ type: 'bandpass', f0: 300, f1: 900, dur: 0.3, g: 0.4, q: 1.5 }); },
  tick: function () {
    if (!this.on || !this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.06);
    var g = c.createGain();
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.08);
  },
  /* 点亮爆裂：6 个高通短噪声 */
  crackle: function () {
    for (var i = 0; i < 6; i++) {
      (function (k) {
        setTimeout(function () {
          this._hit({ type: 'highpass', f0: 1800 + Math.random() * 2500, dur: 0.045, g: 0.16 });
        }.bind(this), k * 45);
      }).call(this, i);
    }
  },
  /* 锣：220→196Hz 正弦 1.4s */
  gong: function () {
    if (!this.on || !this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(196, t + 1.4);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.45);
  },
  /* V2 清磬：庙宇仪式感点缀（约 9s 一记，极轻不抢戏） */
  _qing: function () {
    if (!this.on || !this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    var o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1760;
    var g2 = c.createGain(); g2.gain.value = 0.35;
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.master);
    o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
  },

  /* 全亮爆发：锣 + 8 连鼓 */
  crescendo: function () {
    var self = this;
    this.gong();
    for (var i = 0; i < 8; i++) setTimeout(function () { self._drum(); }, i * 180);
  },
  /* 草龙生成：双音钟 */
  chime: function () {
    if (!this.on || !this.ctx) return;
    var c = this.ctx, self = this;
    [660, 880].forEach(function (fq, i) {
      setTimeout(function () {
        var t = c.currentTime;
        var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq;
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g); g.connect(self.master); o.start(t); o.stop(t + 0.55);
      }, i * 130);
    });
  }
};
window.Audio = SfxAudio; /* 全局对象，供 app.js 调用 */

/* ================= 通用弹窗 / 轻提示 ================= */
var Modal = {
  open: function (html) {
    $('#modalContent').innerHTML = html;
    $('#modal').classList.add('open');
  },
  close: function () { $('#modal').classList.remove('open'); }
};
var toastT = 0;
function Toast(text) {
  var el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove('show'); }, 2000);
}

/* ================= 5.3 守火人（纯本地问答库） ================= */
/* 克制档案体：不用语气词、不自称 AI，自称「守火人」 */
var QA = [
  { k: ['是什么', '什么是', '介绍'], a: '香火龙是湖南汝城的国家级非物质文化遗产，每年元宵夜舞。稻草为身，龙香为鳞，夜里只见香火不见人。', go: 2 },
  { k: ['在哪', '哪里', '汝城', '地方'], a: '湖南省郴州市汝城县，每年正月十五夜在各村祠前和街巷舞龙。它也曾走出汝城，参加佛山秋色巡游。', go: 7 },
  { k: ['什么时候', '时间', '元宵'], a: '每年正月十五，元宵节夜里。扎一条龙要全村忙活二十天，就为那一夜。', go: 2 },
  { k: ['怎么做', '制作', '扎', '材料'], a: '楠竹为骨，稻草为肤，龙香为鳞。龙身必须单数节，乒乓球涂黑做龙眼，麻丝做龙须。数万支香密插龙身，间距不过两三厘米。', go: 3 },
  { k: ['为什么烧', '化龙', '烧龙', '归天'], a: '舞毕烧龙叫「化龙」，也叫「龙归天」。次日龙灰倒入溪流，寓意龙归大海。年年烧，年年扎，火才不灭。', go: 6 },
  { k: ['多长', '多大', '重量', '尺寸'], a: '公龙 9.9 米，母龙 9 米，每条重约 29 公斤。汝城大龙变体可达四十多米、七万余支香。', go: 9 },
  { k: ['多少人', '舞者', '几个人'], a: '18 名舞者，约 15 分钟为两条龙插上 1600 到 1800 支香。', go: 9 },
  { k: ['多少香', '几支香', '香火'], a: '两条龙共插 1600 到 1800 支香。大龙变体可达七万余支。', go: 9 },
  { k: ['会展', '展览', '出去', '佛山'], a: '香火龙曾受邀参加佛山秋色巡游。我们的会展体验工坊也让游客亲手扎一条迷你草龙。', go: 7 },
  { k: ['体验', '工坊', '亲手'], a: '会展现场有体验工坊，不用竹篾，稻草加麻绳加香，三步就能扎一条迷你草龙。', go: 7 },
  { k: ['我能做什么', '怎么帮', '参与'], a: '四件事：了解（和我聊）、体验（会展工坊扎草龙）、传播（分享火种承诺卡）、传承（明年元宵去汝城）。', go: 8 },
  { k: ['点亮', '点火'], a: '你可以在第五页亲手点亮这条龙。从尾到头，九段香火，一支一支燃起来。', go: 5 },
  { k: ['承诺', '传承', '接棒'], a: '你可以在最后一页签下你的火种承诺，生成专属承诺卡，分享给更多人。', go: 10 },
  { k: ['历史', '多久', '起源'], a: '香火龙有 300 多年历史，最早起源于祀龙止雨和祀龙止水的民俗活动，2011 年列入国家级非遗。', go: 2 },
  { k: ['套路', '舞法', '怎么舞'], a: '双龙戏珠、跳跃龙门、双龙出海、云游四海，四套套路。', go: 6 }
];
var QA_FALLBACK = '我是守火人，知道的都告诉你。你可以问：香火龙是什么？怎么做？为什么要烧龙？或者点下方的快捷问题。';

var FireKeeper = {
  _tw: 0, _greeted: false,
  open: function () {
    $('#keeperPanel').classList.add('open');
    if (!this._greeted) {
      this._greeted = true;
      this.say('我是守火人。这条龙的事，问我就好。');
    }
    setTimeout(function () { $('#keeperInput').focus(); }, 380);
  },
  close: function () { $('#keeperPanel').classList.remove('open'); },
  _user: function (text) {
    var box = $('#keeperMsgs');
    var m = document.createElement('div');
    m.className = 'msg msg-user';
    m.textContent = text;
    box.appendChild(m);
    box.scrollTop = box.scrollHeight;
  },
  /* 打字机逐字（30ms/字），答完若带跳转页则追加「去看看」 */
  say: function (text, go) {
    var box = $('#keeperMsgs');
    var m = document.createElement('div');
    m.className = 'msg msg-ai';
    box.appendChild(m);
    var i = 0, self = this;
    clearInterval(this._tw);
    this._tw = setInterval(function () {
      i++;
      m.textContent = text.slice(0, i);
      box.scrollTop = box.scrollHeight;
      if (i >= text.length) {
        clearInterval(self._tw);
        if (go) {
          var b = document.createElement('button');
          b.className = 'go-btn';
          b.textContent = '去看看';
          b.addEventListener('click', function () {
            FireKeeper.close();
            window.Deck.goTo(go);
          });
          m.appendChild(document.createElement('br'));
          m.appendChild(b);
          box.scrollTop = box.scrollHeight;
        }
      }
    }, 30);
  },
  ask: function (raw) {
    var q = (raw || '').toLowerCase().replace(/\s+/g, '');
    if (!q) return;
    this._user(raw);
    var hit = null;
    for (var i = 0; i < QA.length; i++) {
      var ks = QA[i].k;
      for (var j = 0; j < ks.length; j++) {
        if (q.indexOf(ks[j]) !== -1) { hit = QA[i]; break; }
      }
      if (hit) break;
    }
    var self = this;
    setTimeout(function () {
      if (hit) self.say(hit.a, hit.go);
      else self.say(QA_FALLBACK);
    }, 260);
  }
};

/* ================= 5.4 线上草龙定制（B 方案：本地组合，不接 API） ================= */
var GrassDragon = {
  picks: [null, null, null],
  pick: function (stepIdx, val, btn) {
    if (this.picks[stepIdx]) { /* 已选过可改选 */
      var step = $all('.step')[stepIdx];
      $all('.opt').forEach(function (o) { if (step.contains(o)) o.classList.remove('sel'); });
    }
    this.picks[stepIdx] = val;
    btn.classList.add('sel');
    var next = $all('.step')[stepIdx + 1];
    if (next) next.classList.remove('locked');
    /* 进度条：当前步完成、下一步点亮 */
    var prog = $all('#wbProg .wb-prog-i');
    for (var pi = 0; pi < prog.length; pi++) {
      prog[pi].classList.remove('on');
      if (pi <= stepIdx) prog[pi].classList.add('done');
      if (pi === stepIdx + 1) prog[pi].classList.add('on');
    }
    /* 铸龙台实时预览 */
    var pvLine = document.getElementById('pvLine');
    if (pvLine) {
      var picks = this.picks.map(function (p) { return p || '＿'; });
      pvLine.textContent = '已选：' + picks.join(' · ');
    }
    if (this.picks.every(function (p) { return p; })) {
      $('#gdGenBtn').classList.add('ready');
    }
    window.Audio.tick();
  },
  generate: function () {
    if (!this.picks.every(function (p) { return p; })) return;
    var no = 'No.' + (Math.floor(Math.random() * 9000) + 1000); /* 本地随机，不持久化 */
    $('#gdLine').textContent = '你的草龙：' + this.picks.join(' · ');
    $('#gdNo').textContent = no;
    var r = $('#gdResult');
    r.classList.remove('show');
    void r.offsetWidth; /* 重放扫描动画 */
    r.classList.add('show');
    window.Audio.chime();
    var stage = document.getElementById('gdPvPh');
    var done = document.getElementById('gdPvDone');
    if (stage) stage.style.display = 'none';
    if (done) { done.classList.remove('show'); void done.offsetWidth; done.classList.add('show'); }
  },
  experience: function () {
    Modal.open('会展现场可亲手扎制迷你草龙，关注后续巡展信息。线上定制的这条，也请带去现场点亮。');
  }
};


/* ================= 5.5 承诺卡（写名即生成 · 本地 Canvas 保存） ================= */
var PromiseCard = {
  name: '', no: 0, _auto: 0,
  SERIF: '"Songti SC","SimSun","STSong",Georgia,serif',

  reset: function () { /* 进入 P10 时重置 */
    clearTimeout(this._auto);
    var card = $('#promiseCard');
    if (card) card.classList.remove('done', 'flipping', 'focus', 'shake', 'inked', 'sealed');
    var inp = $('#pName');
    if (inp) { inp.value = ''; inp.style.width = ''; }
    var no = $('#pcNo'); if (no) no.textContent = '火种 No.____';
    var sb = $('#pcSaveBtn'); if (sb) sb.disabled = true;
    var hb = $('#pcShareBtn'); if (hb) hb.disabled = true;
    this.name = ''; this.no = 0;
  },

  /* 输入防抖 600ms：名字非空 → 自动生成；清空 → 自动复原 */
  onInput: function () {
    var self = this;
    clearTimeout(this._auto);
    var inp = $('#pName');
    if (!inp) return;
    this.fit(inp);
    var v = inp.value.trim();
    if (!v) { this._auto = setTimeout(function () { self.reset(); }, 220); return; }
    if (v === this.name) return;
    this._auto = setTimeout(function () {
      var now = ($('#pName').value || '').trim();
      if (now && now !== self.name) self.generate(now);
    }, 600);
  },

  /* 输入框按字数自适应宽度，长名不溢出卡片 */
  fit: function (inp) {
    var slot = inp.parentNode;
    var avail = (slot && slot.clientWidth) || 250;
    var n = (inp.value || '').length;
    inp.style.width = Math.min(avail, Math.max(96, n * 34 + 18)) + 'px';
  },

  warn: function () { /* 空名抖动 + 温和提示 */
    var card = $('#promiseCard'), inp = $('#pName');
    if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
    if (inp) inp.focus();
    Toast('先写下你的名字');
  },

  generate: function (forced) {
    var card = $('#promiseCard'), inp = $('#pName');
    if (!card || !inp) return;
    var name = (typeof forced === 'string' ? forced : inp.value).trim();
    if (!name) { this.warn(); return; }

    var first = !card.classList.contains('done');
    if (name === this.name && this.no && !first) return; /* 名字没变：不重复触发 */
    this.name = name;
    if (!this.no) this.no = Math.floor(Math.random() * 9000) + 1000;
    $('#pcNo').textContent = '火种 No.' + this.no;

    card.classList.add('done');
    card.classList.remove('flipping', 'inked', 'sealed');
    void card.offsetWidth;
    if (first) card.classList.add('flipping');   /* 首次落卡：翻转 0.95s */
    card.classList.add('inked');                 /* 名字墨迹渐显 */
    setTimeout(function () { card.classList.add('sealed'); }, 460); /* 编号刻出 + 印章定妆 */

    $('#pcSaveBtn').disabled = false;
    $('#pcShareBtn').disabled = false;
    window.Audio.gong();
  },

  /* ---------- 离屏 Canvas 手工绘制承诺卡（零外部依赖，断网可用） ---------- */
  renderCard: function (name, no) {
    var W = 720, H = 960, SS = 2;             /* 逻辑 720×960，2 倍超采样 */
    var cv = document.createElement('canvas');
    cv.width = W * SS; cv.height = H * SS;
    var c = cv.getContext('2d');
    c.scale(SS, SS);
    var SERIF = this.SERIF;

    /* 1) 深棕渐变底 + 中心暖光 */
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#251b12'); g.addColorStop(.5, '#1b130c'); g.addColorStop(1, '#110c07');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rg = c.createRadialGradient(W / 2, H * .40, 0, W / 2, H * .40, W * .86);
    rg.addColorStop(0, 'rgba(255,150,70,.15)'); rg.addColorStop(1, 'rgba(255,150,70,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);

    /* 2) 香火金尘点阵（克制） */
    for (var i = 0; i < 52; i++) {
      c.globalAlpha = .10 + Math.random() * .38;
      c.fillStyle = (i % 3) ? '#FFAE63' : '#FFE3B4';
      c.beginPath();
      c.arc(Math.random() * W, Math.random() * H, .7 + Math.random() * 1.9, 0, 6.2832);
      c.fill();
    }
    c.globalAlpha = 1;

    /* 3) 双金线边框 + 四角回纹 */
    c.strokeStyle = 'rgba(201,162,39,.72)'; c.lineWidth = 2;
    c.strokeRect(26, 26, W - 52, H - 52);
    c.strokeStyle = 'rgba(201,162,39,.30)'; c.lineWidth = 1;
    c.strokeRect(38, 38, W - 76, H - 76);
    this.meander(c, 62, 62, 1, 1);
    this.meander(c, W - 62, 62, -1, 1);
    this.meander(c, 62, H - 62, 1, -1);
    this.meander(c, W - 62, H - 62, -1, -1);

    /* 4) 朱砂印章「火种」 */
    var sw = 64, sx = (W - sw) / 2, sy = 92;
    var sg = c.createLinearGradient(sx, sy, sx + sw, sy + sw);
    sg.addColorStop(0, 'rgba(150,38,24,.95)'); sg.addColorStop(1, 'rgba(92,20,12,.96)');
    c.fillStyle = sg;
    this.rr(c, sx, sy, sw, sw, 4); c.fill();
    c.strokeStyle = 'rgba(255,205,130,.55)'; c.lineWidth = 1.4;
    this.rr(c, sx, sy, sw, sw, 4); c.stroke();
    c.fillStyle = '#FFE6BC';
    c.font = '600 26px ' + SERIF;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('火', W / 2, sy + 18);
    c.fillText('种', W / 2, sy + 46);

    /* 5) 标题「火种承诺」+ 左右金线 */
    var ty = 210;
    c.font = '400 27px ' + SERIF;
    c.fillStyle = 'rgba(240,206,134,.92)';
    this.spaced(c, '火种承诺', W / 2, ty, 12);
    var half = this.spacedW(c, '火种承诺', 12) / 2;
    c.strokeStyle = 'rgba(201,162,39,.42)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(W / 2 - half - 92, ty); c.lineTo(W / 2 - half - 26, ty);
    c.moveTo(W / 2 + half + 26, ty); c.lineTo(W / 2 + half + 92, ty);
    c.stroke();

    /* 6) 主体句：我，/ 名字 / 愿接香火一棒。 */
    c.font = '400 34px ' + SERIF;
    c.fillStyle = 'rgba(244,235,216,.70)';
    this.spaced(c, '我，', W / 2, 318, 10);

    var fs = 118, maxW = W - 200;
    c.font = '600 ' + fs + 'px ' + SERIF;
    while (fs > 44 && c.measureText(name).width > maxW) {
      fs -= 4; c.font = '600 ' + fs + 'px ' + SERIF;
    }
    var nameW = Math.min(c.measureText(name).width, maxW);
    var ng = c.createLinearGradient(0, 424 - fs * .72, 0, 424 + fs * .34);
    ng.addColorStop(0, '#FFEFC4'); ng.addColorStop(.46, '#F0C572'); ng.addColorStop(1, '#C08F1B');
    c.fillStyle = ng;
    c.shadowColor = 'rgba(255,170,70,.5)'; c.shadowBlur = 26;
    c.fillText(name, W / 2, 424);
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(201,162,39,.5)'; c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(W / 2 - nameW / 2 - 34, 424 + fs * .62);
    c.lineTo(W / 2 + nameW / 2 + 34, 424 + fs * .62);
    c.stroke();

    c.font = '400 34px ' + SERIF;
    c.fillStyle = 'rgba(244,235,216,.70)';
    this.spaced(c, '愿接香火一棒。', W / 2, 552, 10);

    /* 7) 编号铭牌：火种 No.XXXX */
    var label = '火种 No.' + no;
    c.font = '400 30px ' + SERIF;
    var lw = this.spacedW(c, label, 8) + 56, lh = 68;
    var lx = (W - lw) / 2, ly = 634;
    var pg = c.createLinearGradient(0, ly, 0, ly + lh);
    pg.addColorStop(0, 'rgba(96,70,22,.55)'); pg.addColorStop(1, 'rgba(38,27,10,.66)');
    c.fillStyle = pg;
    this.rr(c, lx, ly, lw, lh, 3); c.fill();
    c.strokeStyle = 'rgba(201,162,39,.46)'; c.lineWidth = 1;
    this.rr(c, lx, ly, lw, lh, 3); c.stroke();
    c.fillStyle = '#F0CE86';
    this.spaced(c, label, W / 2, ly + lh / 2 + 1, 8);

    /* 8) 分隔金线 + 底部落款 */
    c.strokeStyle = 'rgba(201,162,39,.22)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(120, 792); c.lineTo(W - 120, 792); c.stroke();
    c.font = '400 22px ' + SERIF;
    c.fillStyle = 'rgba(244,235,216,.44)';
    this.spaced(c, '以展兴遗 · 香火龙数字传承馆', W / 2, 848, 4);

    return cv.toDataURL('image/png');
  },

  /* 逐字等距绘制（canvas 无 letter-spacing 时的等效实现） */
  spacedW: function (c, str, sp) {
    var a = str.split(''), t = 0, i;
    for (i = 0; i < a.length; i++) t += c.measureText(a[i]).width;
    return t + sp * Math.max(0, a.length - 1);
  },
  spaced: function (c, str, cx, y, sp) {
    var a = str.split(''), x = cx - this.spacedW(c, str, sp) / 2;
    var old = c.textAlign; c.textAlign = 'left';
    for (var i = 0; i < a.length; i++) {
      c.fillText(a[i], x, y);
      x += c.measureText(a[i]).width + sp;
    }
    c.textAlign = old;
  },
  rr: function (c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  },
  /* 四角回纹：方形螺旋 */
  meander: function (c, cx, cy, sx, sy) {
    var size = 26, turns = 3, k = size / turns, len = size;
    var dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    c.save();
    c.translate(cx, cy); c.scale(sx, sy);
    c.beginPath(); c.moveTo(0, 0);
    var x = 0, y = 0, d = 0;
    for (var i = 0; i < turns * 2; i++) {
      if (i > 0 && i % 2 === 0) len -= k;
      if (len <= .5) break;
      x += dirs[d % 4][0] * len; y += dirs[d % 4][1] * len;
      c.lineTo(x, y); d++;
    }
    c.strokeStyle = 'rgba(201,162,39,.55)'; c.lineWidth = 1.6; c.lineJoin = 'miter';
    c.stroke();
    c.restore();
  },

  /* 一键下载 PNG */
  save: function () {
    var inp = $('#pName');
    var name = inp ? inp.value.trim() : '';
    if (!name) { this.warn(); return; }
    if (!this.no) this.generate(name);
    try {
      var url = this.renderCard(name, this.no);
      if (!url || url.indexOf('data:image/png') !== 0) throw new Error('render failed');
      var a = document.createElement('a');
      a.href = url;
      a.download = '火种承诺卡-' + name + '.png';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      Toast('承诺卡已保存');
    } catch (e) {
      Toast('保存失败，请长按屏幕截图');
    }
  },

  blob: function (cb) { /* 生成 PNG Blob（供分享文件用） */
    try {
      var b64 = this.renderCard(this.name, this.no).split(',')[1];
      var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
      for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
      cb(new Blob([u8], { type: 'image/png' }));
    } catch (e) { cb(null); }
  },

  share: function () {
    var name = ($('#pName').value || '').trim();
    if (!name) { this.warn(); return; }
    if (!this.no) this.generate(name);
    var title = '以展兴遗 · 香火龙数字传承馆';
    var text = '我，' + name + '，愿接香火一棒。（火种 No.' + this.no + '）';
    var fallback = function () { Modal.open('承诺卡已生成，可点「保存卡片」后截图或发送文件分享'); };
    if (!navigator.share) { fallback(); return; }
    var textShare = function () {
      navigator.share({ title: title, text: text }).then(null, function (err) {
        if (err && err.name !== 'AbortError') fallback();
      });
    };
    this.blob(function (blob) {
      try { /* 优先分享图片文件（浏览器支持时） */
        if (blob && window.File && navigator.canShare) {
          var f = new File([blob], '火种承诺卡-' + name + '.png', { type: 'image/png' });
          if (navigator.canShare({ files: [f] })) {
            navigator.share({ title: title, text: text, files: [f] }).then(null, function (err) {
              if (err && err.name !== 'AbortError') textShare();
            });
            return;
          }
        }
      } catch (e) { /* 忽略，走文本分享 */ }
      textShare();
    });
  }
};

/* ================= P4 打字机（每字约 42ms，换行停顿） ================= */
var TypeWriter = {
  _t: 0, _ps: [], _texts: [], _li: 0, _ci: 0,
  start: function () {
    this.stop();
    /* P4 \u65b0\u7248\uff08\u65e7\u7167\u4f59\u71ac\uff09\u4e0d\u518d\u4f7f\u7528\u6253\u5b57\u673a\uff1aCSS .page.active \u9a71\u52a8\u9010\u5c42\u6d6e\u73b0\uff0c\u5224\u7a7a\u9632\u6b62\u65e7\u8c03\u7528\u62a5\u9519 */
    if (!$('#fireEntry') || !$('#twWrap')) return;
    this._ps = $all('#twWrap .tw-line');
    this._texts = this._ps.map(function (p) { return p.textContent; });
    this._ps.forEach(function (p) { p.textContent = ''; });
    this._li = 0; this._ci = 0;
    $('#fireEntry').classList.remove('show');
    var self = this;
    (function tick() {
      if (self._li >= self._texts.length) { $('#fireEntry').classList.add('show'); return; }
      var text = self._texts[self._li], p = self._ps[self._li];
      self._ci++;
      if (self._ci >= text.length) {
        p.textContent = text;
        self._li++; self._ci = 0;
        self._t = setTimeout(tick, 380);
      } else {
        p.textContent = text.slice(0, self._ci);
        self._t = setTimeout(tick, 42);
      }
    })();
  },
  stop: function () { clearTimeout(this._t); }
};

/* ================= P9 数字滚动（rAF 0.5s，依次延迟 0.04s，评委打开即读） ================= */
var Roll = {
  start: function () {
    $all('#p9 .roll').forEach(function (el, i) {
      var val = parseFloat(el.dataset.val);
      var dec = parseInt(el.dataset.dec || '0', 10);
      var range = el.dataset.range || '';
      var suf = el.dataset.suffix || '';
      setTimeout(function () {
        var t0 = performance.now();
        (function frame(ts) {
          var k = Math.min((ts - t0) / 500, 1);
          var e = 1 - Math.pow(1 - k, 3);
          var v = val * e;
          el.textContent = dec ? v.toFixed(dec) : Math.round(v);
          if (k < 1) requestAnimationFrame(frame);
          else if (range) el.textContent = val + '–' + range; /* 范围数字：滚到下限再跳上限 */
          else el.textContent = (dec ? val.toFixed(dec) : String(val)) + suf;
        })(t0);
      }, i * 40);
    });
  }
};

/* ================= P3 工艺细节弹窗文案（唯一来源：提示词附注） ================= */
var CRAFT_DETAILS = [
  ['选骨', '楠竹破篾，扎出龙的脊梁。竹圈为骨，一节一节撑起龙身。'],
  ['为肤', '稻草浸泡晒干，编织龙身。龙身必须单数节，是祖辈传下的规矩。'],
  ['排香', '千六百至千八百支特制龙香，以指尖之力密密插入龙身，间距不过两三厘米，如披赤金铠甲。汝城大龙更可插香数万支。'],
  ['点睛', '乒乓球涂黑做龙眼，麻丝做龙须。龙头龙身龙尾分别扎制，再组装成一条完整的龙。']
];

/* ================= P3 交互式扎龙工作台（从骨到活：选骨→为肤→排香→点睛） ================= */
var CraftForge = {
  cvs: null, ctx: null, W: 0, H: 0, dpr: 1,
  stage: -1, playing: false, t: 0, last: 0, raf: 0, sway: 0, _inited: false,
  DUR: 1.3,

  init: function () {
    if (!this.cvs) this.cvs = $('#forgeCanvas');
    if (!this.cvs) return;
    if (!this.ctx) {
      this.ctx = this.cvs.getContext('2d');
      var self = this;
      if (!this.cvs._feHandler) {
        this.cvs._feHandler = function () { self.resize(); };
        window.addEventListener('resize', this.cvs._feHandler);
      }
    }
    this.resize();
    if (!this._inited) { this._inited = true; this.reset(); }
  },

  resize: function () {
    if (!this.cvs) return;
    var r = this.cvs.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(40, r.width); this.H = Math.max(40, r.height);
    this.cvs.width = Math.round(this.W * this.dpr);
    this.cvs.height = Math.round(this.H * this.dpr);
    this.ctx && this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.build();
  },

  /* 龙形锚点（侧视：头左上 → 尾右下，身体波浪）——归一化坐标 */
  _anchors: [
    [0.06, 0.42], [0.10, 0.36], [0.14, 0.40], [0.18, 0.48],
    [0.24, 0.56], [0.32, 0.62], [0.40, 0.54], [0.48, 0.64],
    [0.56, 0.56], [0.64, 0.66], [0.72, 0.58], [0.80, 0.66],
    [0.88, 0.58], [0.93, 0.48]
  ],

  _cr: function (p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return [
      0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  },

  build: function () {
    var a = this._anchors, n = a.length, pts = [], i, s, t, k;
    for (i = 0; i < n - 3; i++) {
      for (s = 0; s <= 12; s++) pts.push(this._cr(a[i], a[i + 1], a[i + 2], a[i + 3], s / 12));
    }
    for (s = 0; s <= 12; s++) pts.push(this._cr(a[n - 3], a[n - 2], a[n - 1], a[n - 1], s / 12));
    var spine = [];
    for (k = 0; k < pts.length; k++) {
      if (!spine.length || Math.abs(pts[k][0] - spine[spine.length - 1][0]) > 1 || Math.abs(pts[k][1] - spine[spine.length - 1][1]) > 1) spine.push(pts[k]);
    }
    this.spine = spine.map(function (p) { return [p[0] * this.W, p[1] * this.H]; }, this);
    this.dots = [];
    var acc = 0;
    for (var j = 1; j < this.spine.length; j++) {
      var dx = this.spine[j][0] - this.spine[j - 1][0], dy = this.spine[j][1] - this.spine[j - 1][1];
      acc += Math.sqrt(dx * dx + dy * dy);
      if (acc >= 15) { this.dots.push(this.spine[j]); acc = 0; }
    }
  },

  reset: function () {
    this.stage = -1; this.playing = false; this.t = 0; this.sway = 0;
    this._stopRaf();
    $all('.fstep').forEach(function (b, i) {
      b.classList.remove('done', 'cur');
      if (i > 0) b.classList.add('locked');
    });
    $('#forgeMsg').innerHTML = '点击步骤，看一条龙怎么从无到有';
    $('#p3Index').textContent = '01 / 04';
    this.drawFrame();
  },

  /* 推进当前步骤（只允许顺序执行） */
  forge: function () {
    if (this.playing) return;
    var next = this.stage + 1;
    if (next > 3) return;
    this.stage = next;
    this.playing = true; this.t = 0; this.last = performance.now();
    $all('.fstep').forEach(function (b, i) {
      b.classList.remove('cur');
      if (i < next) b.classList.add('done');
    });
    var btn = $all('.fstep')[next];
    if (btn) btn.classList.add('cur');
    $('#forgeMsg').innerHTML = this._msgs[next][0] + '…';
    window.Audio.tick();
    this._stopRaf();
    var self = this;
    (function loop(now) {
      var dt = (now - self.last) / 1000;
      self.last = now;
      self.t += dt;
      self.drawFrame();
      if (self.t >= self.DUR) {
        self.playing = false;
        self._finish();
      } else {
        self.raf = requestAnimationFrame(loop);
      }
    })(this.last);
  },

  _finish: function () {
    var n = this.stage;
    var btn = $all('.fstep')[n];
    if (btn) { btn.classList.remove('cur'); btn.classList.add('done'); }
    $('#p3Index').textContent = '0' + (n + 2) + ' / 04';
    if (n < 3) {
      var nb = $all('.fstep')[n + 1];
      if (nb) nb.classList.remove('locked');
      $('#forgeMsg').innerHTML = '<b>' + this._msgs[n][1] + '</b>';
    } else {
      $('#forgeMsg').innerHTML = '<b>点睛，龙活了。它等你点火。</b>';
      this.sway = 1;
      this._swayLoop();
    }
    this.drawFrame();
  },

  _msgs: [
    ['楠竹为骨', '骨成了 · 楠竹为骨，扎出龙的脊梁'],
    ['稻草为肤', '肤覆了 · 稻草编织龙身，单数节'],
    ['龙香为鳞', '香满了 · 数万支龙香，密插龙身'],
    ['乒乓点睛', '点睛，龙活了 · 它等你点火']
  ],

  drawFrame: function () {
    if (!this.ctx) return;
    var ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    var sway = this.sway ? Math.sin(performance.now() / 420) * 1.6 : 0;
    ctx.save();
    ctx.translate(0, sway);
    var st = this.stage;
    var p = this.playing ? Math.min(1, this.t / this.DUR) : 1;
    if (st >= 0) this._drawBone(ctx, st === 0 ? p : 1);
    if (st >= 1) this._drawSkin(ctx, p);
    if (st >= 2) this._drawDots(ctx, p);
    if (st >= 3) this._drawHead(ctx, p);
    ctx.restore();
  },

  _drawBone: function (ctx, p) {
    var sp = this.spine;
    if (!sp.length) return;
    ctx.beginPath();
    var n = Math.max(1, Math.round(sp.length * p));
    ctx.moveTo(sp[0][0], sp[0][1]);
    for (var i = 1; i < n; i++) ctx.lineTo(sp[i][0], sp[i][1]);
    ctx.strokeStyle = 'rgba(201,162,39,.85)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(201,162,39,.5)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  },

  _drawSkin: function (ctx, p) {
    var sp = this.spine;
    if (sp.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(sp[0][0], sp[0][1] - 16);
    for (var i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1] - 12);
    var last = sp[sp.length - 1];
    ctx.lineTo(last[0] + 4, last[1]);
    for (var j = sp.length - 1; j >= 0; j--) ctx.lineTo(sp[j][0], sp[j][1] + 22);
    ctx.closePath();
    ctx.fillStyle = 'rgba(244,235,216,' + (0.10 * p) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(244,235,216,' + (0.28 * p) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  },

  _drawDots: function (ctx, p) {
    var total = Math.round(this.dots.length * p);
    for (var i = 0; i < total; i++) {
      var d = this.dots[i];
      var flick = 0.85 + Math.sin(performance.now() / 180 + i * 1.7) * 0.15;
      ctx.beginPath();
      ctx.arc(d[0], d[1], 3.4 * flick, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,154,77,.95)';
      ctx.shadowColor = 'rgba(255,154,77,.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(d[0] - 0.8, d[1] - 0.8, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,226,176,.95)';
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  },

  _drawHead: function (ctx, p) {
    var h0 = this.spine[0], h1 = this.spine[1] || h0;
    if (!h0) return;
    var ang = Math.atan2(h1[1] - h0[1], h1[0] - h0[0]);
    ctx.save();
    ctx.translate(h0[0], h0[1]);
    ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(201,162,39,' + (0.9 * p) + ')';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-16, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-11, -12); ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -6, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,226,176,' + (0.95 * p) + ')';
    ctx.shadowColor = 'rgba(255,226,176,.9)';
    ctx.shadowBlur = 12 * p;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(244,235,216,' + (0.7 * p) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(6, -2); ctx.quadraticCurveTo(14, 6, 20, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(13, 10, 18, 8); ctx.stroke();
    ctx.restore();
  },

  _swayLoop: function () {
    this._stopRaf();
    var self = this;
    (function loop(now) {
      self.drawFrame();
      self.raf = requestAnimationFrame(loop);
    })(performance.now());
  },

  stop: function () { this._stopRaf(); },
  _stopRaf: function () {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
};

/* ================= P6 套路详解文案 ================= */
/* 叙事区切换的长句（点招式卡联动） */
var MOVE_DETAILS = [
  '两龙相对，争抢一颗燃烧的龙珠。',
  '龙身跃过火光之门，如鲤鱼化龙。',
  '两龙并排翻腾，如出海之势。',
  '龙身蜿蜒游走街巷，送福四方。'
];
/* 卡片内的极短注解（与招式同名同序） */
var MOVE_BRIEF = ['双龙交缠 · 珠走龙随', '腾身跃火 · 鲤跃化龙', '双龙并腾 · 出海之势', '蜿蜒游街 · 送福四方'];

/* P6 招式卡：选中态 + 金线反馈 + 背景强调色 + 龙影形态，四处联动 */
function p6Select(i) {
  var cards = $all('#p6 .move-card');
  cards.forEach(function (c) { c.classList.remove('on'); });
  if (cards[i]) {
    cards[i].classList.add('on');
    cards[i].classList.remove('flash'); void cards[i].offsetWidth;
    cards[i].classList.add('flash');
  }
  var d = $('#moveDetail');
  if (d) {
    d.textContent = MOVE_DETAILS[i];
    d.classList.remove('show'); void d.offsetWidth;
    d.classList.add('show');
  }
  var e = $('#p6Emph');
  if (e) e.dataset.m = String(i);
  if (window.ShadowDragon && ShadowDragon.setMode) ShadowDragon.setMode(i);
}

/* ================= 5.6 守火人悬浮球：可拖拽移动 ================= */
/* 默认按 CSS 的 right/bottom 锚定在右下角；一旦拖动即切换为 left/top 并保持，
   视口尺寸变化时自动夹回可视范围。位移小于 TH 视为「轻点」，仍打开守火人面板。 */
var KeeperDrag = {
  TH: 6,                       /* 判定「拖拽」而非「轻点」的位移阈值(px) */
  _fab: null, _bubble: null, _on: false, _moved: false,
  _sx: 0, _sy: 0, _ox: 0, _oy: 0,

  init: function () {
    var self = this;
    this._fab = $('#keeperFab');
    this._bubble = $('#askBubble');
    if (!this._fab) return;

    this._fab.addEventListener('pointerdown', function (e) { self._down(e); });
    this._fab.addEventListener('pointermove', function (e) { self._move(e); });
    this._fab.addEventListener('pointerup', function () { self._up(); });
    this._fab.addEventListener('pointercancel', function () { self._up(); });
    window.addEventListener('resize', function () { self._reflow(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { self._reflow(); }, 320);
    });
  },

  _pin: function (el, l, t) {
    if (!el) return;
    el.style.left = Math.round(l) + 'px';
    el.style.top = Math.round(t) + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  },
  _clamp: function (el, l, t) {
    var maxL = Math.max(0, window.innerWidth - el.offsetWidth);
    var maxT = Math.max(0, window.innerHeight - el.offsetHeight);
    return { l: l < 0 ? 0 : (l > maxL ? maxL : l), t: t < 0 ? 0 : (t > maxT ? maxT : t) };
  },

  _down: function (e) {
    if (e.button != null && e.button !== 0) return;
    /* 取布局位置而非 getBoundingClientRect()：fixed 元素在入场淡入(translateY+scale)
       过程中按下时，rect 是中间帧，会把悬浮球"定格"在偏移位置 */
    var l, t;
    if (!this._fab.offsetParent) { l = this._fab.offsetLeft; t = this._fab.offsetTop; }
    else { var r = this._fab.getBoundingClientRect(); l = r.left; t = r.top; }
    this._on = true; this._moved = false;
    this._sx = e.clientX; this._sy = e.clientY;
    this._ox = l; this._oy = t;
    this._pin(this._fab, l, t);            /* 先落成 left/top，避免与 right/bottom 打架 */
    try { this._fab.setPointerCapture(e.pointerId); } catch (err) { }
  },

  _move: function (e) {
    if (!this._on) return;
    var dx = e.clientX - this._sx, dy = e.clientY - this._sy;
    if (!this._moved && Math.abs(dx) + Math.abs(dy) < this.TH) return;
    if (!this._moved) { this._moved = true; this._fab.classList.add('dragging'); }
    var p = this._clamp(this._fab, this._ox + dx, this._oy + dy);
    this._pin(this._fab, p.l, p.t);
    var b = this._bubbleXY(p.l, p.t);
    if (b) this._pin(this._bubble, b.l, b.t);
  },

  /* 气泡跟随：与悬浮球垂直居中；左侧放不下就翻到右侧，且绝不越出视口 */
  _bubbleXY: function (l, t) {
    if (!this._bubble) return null;
    var fw = this._fab.offsetWidth, fh = this._fab.offsetHeight;
    var bw = this._bubble.offsetWidth, bh = this._bubble.offsetHeight;
    var bx = -(bw + 8);                              /* 默认贴球左侧 */
    if (l + bx < 6) bx = fw + 8;                     /* 左边没位置 → 翻到右侧 */
    if (l + bx + bw > window.innerWidth - 6) bx = -(bw + 8);
    var by = Math.round((fh - bh) / 2);
    if (t + by < 0) by = -t;
    if (t + by + bh > window.innerHeight) by = window.innerHeight - bh - t;
    return { l: l + bx, t: t + by };
  },

  _up: function () {
    if (!this._on) return;
    this._on = false;
    this._fab.classList.remove('dragging');
  },

  /* 已拖过位置后遇视口变化，重新夹回可视范围 */
  _reflow: function () {
    if (!this._fab.style.left) return;     /* 没拖过：继续走 CSS 锚定 */
    var p = this._clamp(this._fab, parseFloat(this._fab.style.left) || 0, parseFloat(this._fab.style.top) || 0);
    this._pin(this._fab, p.l, p.t);
    var b = this._bubbleXY(p.l, p.t);
    if (b) this._pin(this._bubble, b.l, b.t);
  },

  /* 拖拽抬手后紧随的 click 要吞掉，避免误开面板 */
  consume: function () {
    if (!this._moved) return false;
    this._moved = false;
    return true;
  }
};

/* ================= 页面进出钩子（app.js 的 Deck 调用） ================= */
var askBubbleShown = false;
window.PageHooks = {
  onEnter: function (n) {
    /* 守火人悬浮：仅 P2–P9 */
    var fab = $('#keeperFab');
    if (n >= 2 && n <= 9) fab.classList.add('show');
    else fab.classList.remove('show');

    if (n === 4) TypeWriter.start();
    if (n === 8 && !askBubbleShown) { /* 首次进入 P8：问我气泡 3 秒淡出 */
      askBubbleShown = true;
      var b = $('#askBubble');
      b.classList.add('show');
      setTimeout(function () { b.classList.remove('show'); }, 3000);
    }
    if (n === 6 && !window._p6Inited) {
      /* P6 夜舞：进入即点亮首招并显示文案，暗示可点击（评委第一眼就能看到交互） */
      window._p6Inited = true;
      p6Select(0);
    }
    if (n === 9) Roll.start();
    if (n === 10) PromiseCard.reset();
  },
  onLeave: function (n) {
    if (n === 4) TypeWriter.stop();
  }
};

/* 弹窗 / 轻提示也暴露出来，便于团队后续维护调试 */
window.CraftForge = CraftForge;
window.FireKeeper = FireKeeper;
window.Modal = Modal;
window.Toast = Toast;

/* ================= DOM 绑定 ================= */
document.addEventListener('DOMContentLoaded', function () {

  /* P1 音乐开关：静音状态由 localStorage 记忆（默认开，用户关过则保持静音） */
  SfxAudio.restore();
  $('#audioToggle').addEventListener('click', function () { SfxAudio.toggle(); });
  /* 首次任意交互解锁音频（浏览器自动播放策略）：进站首个手势即淡入氛围乐。
     「音」开关自身除外——点它应当直接切换，避免先起乐再静音的空响。 */
  ['pointerdown', 'touchend', 'keydown', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('#audioToggle')) return;
      SfxAudio.unlock();
    }, { passive: true });
  });

  /* P3：四步扎龙题跋横滑（选骨→为肤→排香→点睛，v18 定稿版）
     交互：左右箭头 / 顶部工序索引条 / 横向滑动 / 点挂画看详情 */
  var p3Track = $('#p3Track');
  if (p3Track) {
    var P3_N = 4;
    var p3Frames = $all('#p3 .pg-frame');
    var p3Steps = $all('#p3Steps .pg-step');
    var p3Prog = $('#p3Prog');
    var p3Pline = $('#p3Pline');
    var p3Cn = $('#p3Cn'), p3Idx = $('#p3Idx');
    var p3Prev = $('#p3Prev'), p3Next = $('#p3Next');
    var P3_CN = ['壹', '贰', '叁', '肆'];
    var p3I = 0;
    function p3Go(i) {
      i = Math.max(0, Math.min(P3_N - 1, i));
      p3I = i;
      p3Track.scrollTo({ left: i * (p3Track.clientWidth || 480), behavior: 'smooth' });
    }
    function p3Update() {
      var w = p3Track.clientWidth || 480;
      var i = Math.max(0, Math.min(P3_N - 1, Math.round(p3Track.scrollLeft / w)));
      p3I = i;
      p3Frames.forEach(function (f, k) { f.classList.toggle('cur', k === i); });
      p3Steps.forEach(function (s, k) { s.classList.toggle('on', k === i); });
      if (p3Prog) {
        var pts = p3Prog.children;
        for (var k = 0; k < P3_N && k < pts.length; k++) pts[k].classList.toggle('on', k === i);
      }
      if (p3Pline) p3Pline.style.width = ((i + 1) / P3_N * 100) + '%';
      if (p3Cn) p3Cn.textContent = P3_CN[i];
      if (p3Idx) p3Idx.textContent = '0' + (i + 1) + ' / 04';
      if (p3Prev) p3Prev.style.opacity = i === 0 ? '.4' : '1';
      if (p3Next) p3Next.style.opacity = i === P3_N - 1 ? '.4' : '1';
    }
    /* 触摸分流：横向主导 → 放行屏内横滑（阻断 deck 翻页）；竖向主导 → 不拦截，交给 app.js 翻页接管
       （避免竖向手势绕过 deck 的原生滚动拦截导致页面乱滚） */
    var _p3sx = 0, _p3sy = 0;
    p3Track.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      _p3sx = t.clientX; _p3sy = t.clientY;
    }, { passive: true });
    p3Track.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      if (Math.abs(t.clientX - _p3sx) > Math.abs(t.clientY - _p3sy)) e.stopPropagation();
    }, { passive: true });
    p3Track.addEventListener('scroll', p3Update, { passive: true });
    if (p3Prev) p3Prev.addEventListener('click', function (e) { e.preventDefault(); p3Go(p3I - 1); });
    if (p3Next) p3Next.addEventListener('click', function (e) { e.preventDefault(); p3Go(p3I + 1); });
    p3Steps.forEach(function (s) {
      s.addEventListener('click', function () { p3Go(parseInt(s.getAttribute('data-s'), 10)); });
    });
    /* 点挂画 / 点整屏热区：工艺详情弹窗（复用全站 Modal 与 CRAFT_DETAILS） */
    $all('#p3 .pg-art, #p3 .pg-hotzone').forEach(function (el) {
      el.addEventListener('click', function () {
        var d = CRAFT_DETAILS[parseInt(el.getAttribute('data-step'), 10)];
        if (d) Modal.open('<p style="font-family:var(--serif);color:var(--gold);letter-spacing:4px;margin-bottom:8px">' + d[0] + '</p><p>' + d[1] + '</p>');
        window.Audio.tick();
      });
    });
    p3Update();
  }

  /* P4：火种入口 → P5 */
  $('#fireEntry').addEventListener('click', function () { window.Deck.goTo(5); });

  /* P6：招式卡（点卡 → 卡片选中 + 说明联动 + 背景强调色 + 龙影形态） */
  $all('#p6 .move-card').forEach(function (card) {
    card.addEventListener('click', function () {
      p6Select(parseInt(card.dataset.move, 10));
      window.Audio.tick();
    });
  });

  /* P7：草龙定制（视觉与流程已迁移到 p7forge.js，事件也由其接管；
     此处保留空操作避免重复绑定即可 —— p7forge.js 自行 addEventListener） */
  // （保留此处仅作为位置标记；实际绑定由 p7forge.js 完成）

  /* P8：行动卡（四件事各自对应一个关联入口，卡片内「关联入口」一行即提示） */
  $all('.action-card').forEach(function (card) {
    card.addEventListener('click', function () {
      card.classList.add('flash');
      setTimeout(function () { card.classList.remove('flash'); }, 320);
      window.Audio.tick();
      var act = card.dataset.act;
      if (act === 'learn') FireKeeper.open();           /* 了解 → 守火人面板 */
      else if (act === 'make') window.Deck.goTo(7);     /* 体验 → 卷三 · 会展 */
      else if (act === 'share') window.Deck.goTo(10);   /* 传播 → 卷四 · 传承之约 */
      else if (act === 'keep') window.Deck.goTo(5);     /* 传承 → 卷三 · 点亮 */
    });
  });

  /* 守火人面板 */
  KeeperDrag.init();   /* 悬浮球可拖拽；拖动后的 click 由 consume() 吞掉 */
  $('#keeperFab').addEventListener('click', function () {
    if (KeeperDrag.consume()) return;   /* 刚才是拖拽，不是轻点 */
    FireKeeper.open();
  });
  $('#keeperClose').addEventListener('click', function () { FireKeeper.close(); });
  $('#keeperSend').addEventListener('click', function () {
    var input = $('#keeperInput');
    FireKeeper.ask(input.value);
    input.value = '';
  });
  $('#keeperInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      FireKeeper.ask($('#keeperInput').value);
      $('#keeperInput').value = '';
    }
  });
  $all('#keeperChips .chip').forEach(function (chip) {
    chip.addEventListener('click', function () { FireKeeper.ask(chip.textContent); });
  });

  /* 承诺卡：写名即自动生成 / 保存 / 分享 */
  var pcName = $('#pName'), pcCard = $('#promiseCard');
  var pcSaveBtn = $('#pcSaveBtn'), pcShareBtn = $('#pcShareBtn');
  if (pcName) {
    pcName.addEventListener('input', function () { PromiseCard.onInput(); });
    pcName.addEventListener('compositionend', function () { PromiseCard.onInput(); }); /* 中文输入法 */
    pcName.addEventListener('focus', function () { pcCard.classList.add('focus'); });
    pcName.addEventListener('blur', function () { pcCard.classList.remove('focus'); });
    pcName.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); PromiseCard.generate(); pcName.blur(); }
    });
  }
  if (pcSaveBtn) pcSaveBtn.addEventListener('click', function () { PromiseCard.save(); });
  if (pcShareBtn) pcShareBtn.addEventListener('click', function () { PromiseCard.share(); });
  if (pcCard && pcName) { /* 未完成时点卡面即聚焦输入 */
    pcCard.addEventListener('click', function (e) {
      if (e.target === pcName) return;
      if (!pcCard.classList.contains('done')) pcName.focus();
    });
  }

  /* 弹窗关闭 */
  $('#modalClose').addEventListener('click', Modal.close);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) Modal.close(); });
});

})();

/* ============================================================
   布局美化补充（纯展示类）：P5 点火完成文案校准 + 进度数字金辉标记
   —— 追加式；不改既有函数体，不触碰点火仪式引擎
   ============================================================ */
(function () {
  try {
    var prog = document.getElementById('p5Progress');
    var hint = document.getElementById('p5Hint');
    if (!prog || !hint) return;

    var TARGET = '万火齐燃 · 龙身尽亮';
    var isFull = false;
    /* 兼容「已燃香 18 / 18」与旧实现的「已点燃 9 / 9」 */
    function isComplete(text) { return /(18\s*\/\s*18|9\s*\/\s*9)/.test(text || ''); }

    /* 完成态期间，守护提示文案：仪式引擎在 +1.4s 会改写一次，这里持续校准回来 */
    new MutationObserver(function () {
      if (!isFull) return;
      if (hint.textContent !== TARGET) hint.textContent = TARGET;
    }).observe(hint, { childList: true, characterData: true, subtree: true });

    function sync() {
      var full = isComplete(prog.textContent);
      if (full === isFull) return;
      isFull = full;
      if (full) { prog.classList.add('full'); hint.textContent = TARGET; }
      else prog.classList.remove('full');
    }

    new MutationObserver(sync).observe(prog, { childList: true, characterData: true, subtree: true });
    sync();
  } catch (e) { /* 静默：纯展示增强，失败不影响主流程 */ }
})();
