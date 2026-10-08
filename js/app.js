/* ============================================================
   app.js — 翻页引擎 / 粒子 / P5 香火龙点亮 / P6 龙影
   翻页方案（定稿，不可改）：原生滚动 + JS 完全接管
   - 禁止 scroll-snap-type、禁止整页 transform
   - 滚轮 / 触摸 / 键盘全部捕获后调用 window.scrollTo({behavior:'smooth'})
   - 260ms 节流 + 640ms 兜底 + scrollend 兜底对齐，绝不回弹、绝不卡中间
   ============================================================ */
(function () {
'use strict';

/* ================= 工具 ================= */
function $(sel) { return document.querySelector(sel); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
var SUPPORTS_SMOOTH = 'scrollBehavior' in document.documentElement.style;

/* ================= 触感反馈（安卓 vibrate，不支持则静默） ================= */
function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
}
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('.opt,.move-card,.fs-arrow,#keeperSend,.btn-gold,.btn-ghost,.fire-entry,.chip')) buzz(12);
}, true);

/* ================= 5.1 翻页系统 ================= */
var Deck = {
  cur: 1, total: 10, moving: false,
  pageH: window.innerHeight, targetY: 0, pending: 1,
  pages: [], _t: 0,

  init: function () {
    this.pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
    this.total = this.pages.length;
    this.measure();
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    /* 滚轮：绑定在 deck 上（守火人面板在 deck 外，不受影响） */
    var lastWheel = 0, self = this;
    $('#deck').addEventListener('wheel', function (e) {
      e.preventDefault();
      var now = Date.now();
      if (self.moving || now - lastWheel < 260) return;
      lastWheel = now;
      self.goTo(self.cur + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });

    /* 触摸：touchstart 记录起点，touchmove 阻断原生滚动，touchend 判定翻页
       （P3 横滑区在自己的 touchmove 里 stopPropagation 放行，见 features.js） */
    var startY = 0, tracking = false;
    $('#deck').addEventListener('touchstart', function (e) {
      startY = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    $('#deck').addEventListener('touchmove', function (e) {
      if (!tracking) return;
      e.preventDefault();
    }, { passive: false });
    $('#deck').addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (self.moving) return;
      var dy = startY - e.changedTouches[0].clientY;
      if (dy > 48) self.goTo(self.cur + 1);
      else if (dy < -48) self.goTo(self.cur - 1);
    });

    /* 键盘 */
    window.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (self.moving) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); self.goTo(self.cur + 1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); self.goTo(self.cur - 1); }
      else if (e.key === 'Home') { e.preventDefault(); self.goTo(1); }
      else if (e.key === 'End') { e.preventDefault(); self.goTo(self.total); }
    });

        /* 滚动进度金线：随翻页推进更新顶部细线 */
    function updProg() {
      var bar = document.getElementById('scrollProg');
      if (!bar) return;
      var max = (self.total - 1) * self.pageH;
      bar.style.width = (max > 0 ? Math.min(window.scrollY / max, 1) * 100 : 0) + '%';
    }
    window.addEventListener('scroll', updProg, { passive: true });
    updProg();
    this._updProg = updProg;

/* scrollend 兜底（不支持的浏览器走 640ms 定时兜底） */
    window.addEventListener('scrollend', function () { if (self.moving) self._settle(); });
    window.addEventListener('resize', function () {
      self.measure();
      window.scrollTo(0, (self.cur - 1) * self.pageH);
      if (window.P5Fire) P5Fire.onResize && P5Fire.onResize();
      DragonCanvas.onResize();
    });

    this._goPage(1, true);
  },

  measure: function () {
    this.pageH = this.pages[0] ? this.pages[0].offsetHeight : window.innerHeight;
  },

  /* 目标页顶部 = (n-1)*页高，smooth 滚过去；moving 锁 + 双兜底 */
  goTo: function (n) {
    if (this.moving) return;
    n = clamp(n, 1, this.total);
    if (n === this.cur) return;
    if (window.Audio && window.Audio.on) window.Audio.whoosh();
    /* 暗幕过渡：翻页瞬间画面微暗再亮起（电影换场感） */
    var dim = document.getElementById('deckDim');
    if (dim) {
      dim.classList.add('dim-on');
      clearTimeout(dim._t);
      dim._t = setTimeout(function () { dim.classList.remove('dim-on'); }, 320);
    }
    this.pending = n;
    this.moving = true;
    this.targetY = (n - 1) * this.pageH;
    var self = this;
    if (SUPPORTS_SMOOTH) {
      window.scrollTo({ top: this.targetY, behavior: 'smooth' });
    } else {
      /* iOS 14 等不支持 behavior:'smooth' 的浏览器：rAF 平滑滚动兜底（仍走 window.scrollTo） */
      this._animScroll(this.targetY);
    }
    clearTimeout(this._t);
    this._t = setTimeout(function () { self._settle(); }, 640);
  },

  _animScroll: function (to) {
    var self = this, from = window.scrollY, start = performance.now(), dur = 460;
    (function step(ts) {
      if (!self.moving) return;
      var k = Math.min((ts - start) / dur, 1);
      var e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else self._settle();
    })(start);
  },

  _settle: function () {
    clearTimeout(this._t);
    var diff = Math.abs(window.scrollY - this.targetY);
    if (diff > 6) window.scrollTo({ top: this.targetY, behavior: 'auto' }); /* 强制补齐，绝不卡中间 */
    this.moving = false;
    if (this._updProg) this._updProg();
    if (this.pending !== this.cur) this._goPage(this.pending, false);
  },

  /* 页面切换：active 类驱动 CSS 动画；粒子 / 引擎 / 钩子按页启停 */
  _goPage: function (n, first) {
    var prev = this.cur;
    this.cur = n;
    var self = this;
    this.pages.forEach(function (p, i) {
      p.classList.toggle('active', i === n - 1);
    });
    LazyImg.load(n - 1, n, n + 1);

    /* 粒子按页启停（离开视口立即 cancelAnimationFrame） */
    Fx.stopAll();
    if (n === 1) FxSparks.start();
    if (n === 4) FxAsh.start();
    if (n === 10) FxAshUp.start();

    if (n === 6) ShadowDragon.start(); else ShadowDragon.stop();
    if (n === 5) {
      /* P5 点火·万火引擎（p5fire.js，接口 start/stop/onResize）：进屏启动，离屏停止 */
      if (window.P5Fire) { P5Fire.start(); P5Fire.enterPage(); }
    } else {
      if (window.P5Fire) P5Fire.stop();
      DragonCanvas.stop();
    }

    if (!first && window.PageHooks) {
      if (PageHooks.onLeave) PageHooks.onLeave(prev);
      if (PageHooks.onEnter) PageHooks.onEnter(n);
    }
    if (first && window.PageHooks && PageHooks.onEnter) PageHooks.onEnter(n);
  }
};

/* ================= 背景图懒加载（data-img + 邻页预载） ================= */
var LazyImg = {
  _map: {},
  init: function () {
    var self = this;
    document.querySelectorAll('.page').forEach(function (page, i) {
      var els = Array.prototype.slice.call(page.querySelectorAll('[data-img]'));
      self._map[i + 1] = els;
    });
  },
  load: function () {
    var self = this;
    Array.prototype.forEach.call(arguments, function (n) {
      if (n < 1 || n > Deck.total) return;
      (self._map[n] || []).forEach(function (el) {
        if (el.dataset.loaded) return;
        el.dataset.loaded = '1';
        var url = el.getAttribute('data-img');
        var img = new Image();
        img.onload = function () {
          el.style.backgroundImage = 'url("' + url + '")';
          el.classList.add('bg-loaded');
        };
        img.src = url;
      });
    });
  }
};

/* ================= 通用粒子画布（P1 / P4 / P10 各自独立 rAF） ================= */
function sizeCanvas(cvs) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = cvs.clientWidth, h = cvs.clientHeight;
  cvs.width = w * dpr; cvs.height = h * dpr;
  var ctx = cvs.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx, w: w, h: h, dpr: dpr };
}

function makeFx(cvsId, count, spawn, step, draw) {
  var cvs = $('#' + cvsId), env = null, raf = 0, ps = [], last = 0;
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min((ts - last) / 1000, 0.05) || 0.016; last = ts;
    env.ctx.clearRect(0, 0, env.w, env.h);
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!step(p, dt, env)) ps[i] = spawn(env); /* 出界即重生 */
      draw(env.ctx, p);
    }
  }
  return {
    start: function () {
      if (raf) return;
      env = sizeCanvas(cvs);
      ps = []; for (var i = 0; i < count; i++) ps.push(spawn(env));
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop: function () { if (raf) { cancelAnimationFrame(raf); raf = 0; env && env.ctx.clearRect(0, 0, env.w, env.h); } }
  };
}

var Fx = {
  _all: [],
  reg: function (fx) { this._all.push(fx); },
  stopAll: function () { this._all.forEach(function (f) { f.stop(); }); }
};

/* P1：金色火星自照片飘起（8–14 个） */
var FxSparks = makeFx('fxP1', 12,
  function (env) {
    return { x: Math.random() * env.w, y: env.h * (0.55 + Math.random() * 0.5), vy: -(14 + Math.random() * 22), ph: Math.random() * 6.28, r: 1 + Math.random() * 1.8, a: .5 + Math.random() * .5 };
  },
  function (p, dt, env) {
    p.y += p.vy * dt; p.ph += dt * 1.6; p.x += Math.sin(p.ph) * 12 * dt;
    if (p.y < env.h * 0.1) { var np = null; return false; }
    return true;
  },
  function (ctx, p) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = p.a;
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
    g.addColorStop(0, '#FFE2B0'); g.addColorStop(.4, 'rgba(255,154,77,.55)'); g.addColorStop(1, 'rgba(255,154,77,0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - p.r * 4, p.y - p.r * 4, p.r * 8, p.r * 8);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
);

/* P4：灰白灰烬飘落（25 个） */
var FxAsh = makeFx('fxP4', 25,
  function (env) {
    return { x: Math.random() * env.w, y: -10 - Math.random() * env.h * .3, vy: 18 + Math.random() * 30, ph: Math.random() * 6.28, r: .8 + Math.random() * 1.6, a: .25 + Math.random() * .4 };
  },
  function (p, dt, env) {
    p.y += p.vy * dt; p.ph += dt * 1.1; p.x += Math.sin(p.ph) * 16 * dt;
    if (p.y > env.h + 12) return false;
    return true;
  },
  function (ctx, p) {
    ctx.globalAlpha = p.a;
    ctx.fillStyle = 'rgba(208,204,196,.9)';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1;
  }
);

/* P10：金色灰烬自底上升（金 → 暗 → 透明，25 个） */
var FxAshUp = makeFx('fxP10', 25,
  function (env) {
    return { x: Math.random() * env.w, y: env.h + 10, vy: -(16 + Math.random() * 26), ph: Math.random() * 6.28, r: .9 + Math.random() * 1.8, life: 0, max: 3 + Math.random() * 3 };
  },
  function (p, dt, env) {
    p.life += dt; p.y += p.vy * dt; p.ph += dt; p.x += Math.sin(p.ph) * 10 * dt;
    if (p.y < -12 || p.life > p.max) return false;
    return true;
  },
  function (ctx, p) {
    var t = clamp(p.life / p.max, 0, 1);           /* 生命进度：金 → 暗 → 透明 */
    var a = t < .5 ? (1 - t) : (t - .5) * 2;       /* 先淡金后转暗 */
    var col = t < .5 ? '255,217,138' : '139,69,19';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - t) * .8;
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
    g.addColorStop(0, 'rgba(' + col + ',.9)'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - p.r * 4, p.y - p.r * 4, p.r * 8, p.r * 8);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
);
Fx.reg(FxSparks); Fx.reg(FxAsh); Fx.reg(FxAshUp);

/* ================= 5.2 P5 香火龙点亮引擎（v13：流动的星火香火龙，1600+ 香火点，尾→头 9 段点亮） ================= */
var DragonCanvas = {
  cvs: null, ctx: null, w: 0, h: 0, built: false,
  anchors: [], segPts: [], litSegs: [], lit: 0, awake: false,
  dots: [], head: null,
  darkCvs: null, lightCvs: null,
  darkCtx: null, lightCtx: null,
  spDark: null, spLit: null, spSmoke: null,
  sparks: [], smoke: [], stars: [], bgStars: [], raf: 0, last: 0, floatT: 0, t: 0,

  build: function () {
    var el = document.getElementById('dragonCanvas');
    if (!el) return false;
    this.cvs = el; this.ctx = el.getContext('2d');
    if (!this._clickBound) {
      var self = this;
      el.addEventListener('click', function (e) {
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        var seg = self.hit((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        if (seg) self.lightSegment(seg);
      });
      this._clickBound = true;
    }
    this._resize();
    if (!this.darkCvs) {
      this.darkCvs = document.createElement('canvas');
      this.lightCvs = document.createElement('canvas');
      this.darkCtx = this.darkCvs.getContext('2d');
      this.lightCtx = this.lightCvs.getContext('2d');
      this.darkCvs.width = this.lightCvs.width = this.cvs.width;
      this.darkCvs.height = this.lightCvs.height = this.cvs.height;
    }
    this._makeSprites();
    this._layout();
    this.bgStars = [];
    this._drawScene();
    this._drawDragon();
    this.built = true;
    if (this.litSegs.length) this._restoreLit();
    return true;
  },

  _resize: function () {
    var r = this.cvs.getBoundingClientRect();
    this.w = Math.max(2, Math.round(r.width * (window.devicePixelRatio || 1)));
    this.h = Math.max(2, Math.round(r.height * (window.devicePixelRatio || 1)));
    if (this.cvs.width !== this.w || this.cvs.height !== this.h) {
      this.cvs.width = this.w; this.cvs.height = this.h;
      if (this.darkCvs) {
        this.darkCvs.width = this.w; this.darkCvs.height = this.h;
        this.lightCvs.width = this.w; this.lightCvs.height = this.h;
      }
    }
  },

  /* 预渲染 sprite：暗火头 / 亮火头 / 软烟团（每帧 drawImage，避免渐变风暴） */
  _makeSprites: function () {
    var self = this;
    function sprite(draw) {
      var c = document.createElement('canvas'); c.width = c.height = 48;
      var g = c.getContext('2d');
      draw(g);
      return c;
    }
    this.spDark = sprite(function (g) {
      var rg = g.createRadialGradient(24, 24, 0, 24, 24, 22);
      rg.addColorStop(0, 'rgba(255,120,60,.95)');
      rg.addColorStop(0.28, 'rgba(200,74,34,.65)');
      rg.addColorStop(0.62, 'rgba(140,52,24,.28)');
      rg.addColorStop(1, 'rgba(120,44,20,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 48, 48);
    });
    this.spLit = sprite(function (g) {
      var rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      rg.addColorStop(0, 'rgba(255,244,208,1)');
      rg.addColorStop(0.22, 'rgba(255,208,130,.92)');
      rg.addColorStop(0.5, 'rgba(255,150,70,.42)');
      rg.addColorStop(1, 'rgba(255,130,60,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 48, 48);
    });
    this.spSmoke = sprite(function (g) {
      var rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      rg.addColorStop(0, 'rgba(215,200,180,.55)');
      rg.addColorStop(0.55, 'rgba(190,170,150,.22)');
      rg.addColorStop(1, 'rgba(180,160,140,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 48, 48);
    });
  },

  /* 龙形骨架：尾左下 → 大 S 盘升 → 头右上（Catmull-Rom，80 锚点） */
  _layout: function () {
    var W = this.w, H = this.h;
    var ctl = [
      [0.10 * W, 0.88 * H], [0.16 * W, 0.72 * H], [0.08 * W, 0.62 * H],
      [0.20 * W, 0.52 * H], [0.14 * W, 0.42 * H], [0.32 * W, 0.34 * H],
      [0.50 * W, 0.30 * H], [0.68 * W, 0.40 * H], [0.80 * W, 0.54 * H],
      [0.85 * W, 0.44 * H], [0.88 * W, 0.36 * H]
    ];
    var pts = [];
    var n = ctl.length;
    function cr(p0, p1, p2, p3, t) {
      var t2 = t * t, t3 = t2 * t;
      return [
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ];
    }
    var per = 10;
    for (var i = 0; i < n - 1; i++) {
      var p0 = ctl[Math.max(0, i - 1)], p1 = ctl[i], p2 = ctl[i + 1], p3 = ctl[Math.min(n - 1, i + 2)];
      for (var j = 0; j < per; j++) pts.push(cr(p0, p1, p2, p3, j / per));
    }
    pts.push(ctl[n - 1]);
    this.anchors = pts;
    var total = pts.length;
    this.segPts = [];
    for (var sg = 1; sg <= 9; sg++) {
      this.segPts.push({ a: Math.floor((sg - 1) / 9 * total), b: Math.min(total - 1, Math.floor(sg / 9 * total)) });
    }
    function angAt(k) {
      var a = pts[Math.max(0, k - 1)], b = pts[Math.min(total - 1, k + 1)];
      return Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    /* 龙身宽度（法向半径）：尾细→中粗→颈收→头前再展 */
    var spLocal = this.segPts;
    function segOf(k) {
      for (var s2 = 1; s2 <= 9; s2++) {
        if (k >= spLocal[s2 - 1].a && k <= spLocal[s2 - 1].b) return s2;
      }
      return 9;
    }
    function widthAt(k) {
      var f = segOf(k) / 9;
      /* 真实香火龙：龙头最壮 → 身均匀 → 尾细（尾 0.048W，头前 0.084W） */
      var w = 0.048 + 0.036 * Math.pow(f, 1.5);
      return w * W;
    }
    /* 香火：沿龙身两侧法向插香（香杆+香头，成排成鳞，真实形制） */
    this.dots = [];
    var i2, k2;
    for (k2 = 0; k2 < total; k2++) {
      var p2 = pts[k2];
      var ang2 = angAt(k2);
      var wdt = widthAt(k2);
      var segN = (function (k) {
        for (var s3 = 1; s3 <= 9; s3++) {
          var sp3 = spLocal[s3 - 1];
          if (k >= sp3.a && k <= sp3.b) return s3;
        }
        return 9;
      })(k2);
      var nx = -Math.sin(ang2), ny = Math.cos(ang2);
      for (var side = 0; side < 2; side++) {
        var sgn = side === 0 ? 1 : -1;
        for (var row = 0; row < 2; row++) {
          var baseOff = wdt * 0.5 + (row === 0 ? 0 : wdt * 0.30);
          var ext = wdt * (row === 0 ? 0.5 : 0.34);
          var jt = (Math.random() - 0.5) * W * 0.012;
          this.dots.push({
            x: p2[0] + nx * (baseOff + ext) * sgn + Math.cos(ang2) * jt,
            y: p2[1] + ny * (baseOff + ext) * sgn + Math.sin(ang2) * jt,
            nx: nx * sgn, ny: ny * sgn,      /* 香伸出方向（带侧向） */
            base: baseOff, ext: ext,           /* 香杆：香头 - 法向*ext */
            r: (1.0 + Math.random() * 0.5) * (W / 700 + 0.6),
            ph: Math.random() * 6.28,
            seg: segN, lit: 0
          });
        }
      }
    }
    /* 尾部：扫帚束多插香（三束斜出方向） */
    var tp0 = pts[0], ta0 = angAt(0);
    var tdx = Math.cos(ta0), tdy = Math.sin(ta0);
    for (i2 = 0; i2 < 26; i2++) {
      var rr2 = (0.25 + Math.random() * 0.75) * W * 0.05;
      var aa2 = Math.random() * 6.283;
      var tx2 = Math.cos(aa2) * 0.9 + tdx * 0.4, ty2 = Math.sin(aa2) * 0.55 + tdy * 0.3;
      var tl = Math.sqrt(tx2 * tx2 + ty2 * ty2) || 1;
      this.dots.push({
        x: tp0[0] - tdx * rr2 * 0.9 + tx2 * rr2, y: tp0[1] - tdy * rr2 * 0.9 + ty2 * rr2,
        nx: tx2 / tl, ny: ty2 / tl, base: rr2 * 0.9, ext: W * 0.022,
        r: (0.95 + Math.random() * 0.45) * (W / 700 + 0.6),
        ph: Math.random() * 6.28,
        seg: 1, lit: 0
      });
    }
    /* 龙头：星火剪影（不具象——额弧/鹿角/吻/嘴裂/双须由星火勾勒，火光中见龙头） */
    var hp = pts[total - 1], hang = angAt(total - 2);
    var hs0 = Math.min(W, H) * 0.105;
    var hcx = hp[0], hcy = hp[1] + H * 0.03;
    var hprof = [
      [-0.78, -1.02], [-0.40, -1.10], [0, -1.13], [0.40, -1.10], [0.78, -1.02],
      [-0.92, -0.74], [-0.98, -0.36], [-0.92, -0.08],
      [-0.78, 0.20], [-0.60, 0.40], [-0.36, 0.54], [0, 0.64],
      [0.36, 0.54], [0.60, 0.40], [0.78, 0.20], [0.92, -0.08], [0.98, -0.36], [0.92, -0.74],
      [-0.40, -1.03], [-0.66, -1.50], [-0.52, -2.06],
      [-0.83, -1.36], [-1.16, -1.40], [-0.98, -1.90],
      [0.40, -1.03], [0.66, -1.50], [0.52, -2.06],
      [0.83, -1.36], [1.16, -1.40], [0.98, -1.90],
      [-0.10, -0.13], [0.10, -0.13], [0, -0.02], [0, 0.28],
      [-0.42, 0.57], [0.42, 0.57],
      [-0.64, 0.44], [-0.78, 0.88], [-0.66, 1.44],
      [0.64, 0.44], [0.78, 0.88], [0.66, 1.44]
    ];
    /* 轮廓星火 ×3 微抖（密度足够，火光中可见龙头剪影） */
    for (i2 = 0; i2 < hprof.length; i2++) {
      var hp2 = hprof[i2];
      for (var hk = 0; hk < 3; hk++) {
        this.dots.push({
          x: hcx + hp2[0] * hs0 + (Math.random() - 0.5) * hs0 * 0.14,
          y: hcy + hp2[1] * hs0 + (Math.random() - 0.5) * hs0 * 0.14,
          nx: 0, ny: 0, base: 0, ext: 0,
          r: (1.9 + Math.random() * 0.5) * (W / 700 + 0.6),
          ph: Math.random() * 6.28,
          seg: 9, lit: 0, head: 1
        });
      }
    }
    /* 内部星火：龙头内部稀疏星火，显汇聚之团 */
    for (i2 = 0; i2 < 22; i2++) {
      var ia = Math.random() * 6.28, ir = Math.random() * 0.42 * hs0;
      this.dots.push({
        x: hcx + Math.cos(ia) * ir, y: hcy + Math.sin(ia) * ir * 0.85,
        nx: 0, ny: 0, base: 0, ext: 0,
        r: (1.4 + Math.random() * 0.5) * (W / 700 + 0.6),
        ph: Math.random() * 6.28,
        seg: 9, lit: 0, head: 1
      });
    }
    this.head = { x: hcx, y: hcy, ang: hang };
  },

  /* 背景：夜空渐变 + 远山三层 + 村落灯火 + 薄雾 + 星（静态层） */
  _drawScene: function () {
    var d = this.darkCtx, W = this.w, H = this.h;
    if (!d) return;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    var sky = d.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0A0D14');
    sky.addColorStop(0.5, '#14100B');
    sky.addColorStop(1, '#0C0805');
    d.fillStyle = sky; d.fillRect(0, 0, W, H);
    /* 远山（3 层） */
    var layers = [
      { y: H * 0.66, amp: H * 0.07, col: 'rgba(30,25,20,.8)' },
      { y: H * 0.74, amp: H * 0.10, col: 'rgba(21,17,13,.9)' },
      { y: H * 0.83, amp: H * 0.13, col: 'rgba(11,9,7,1)' }
    ];
    for (var L = 0; L < layers.length; L++) {
      var ly = layers[L];
      d.fillStyle = ly.col;
      d.beginPath(); d.moveTo(0, H);
      for (var x = 0; x <= W; x += Math.max(10, W / 36)) {
        var yy = ly.y + Math.sin(x * 0.004 + L * 2.1) * ly.amp + Math.sin(x * 0.013 + L * 4.3) * ly.amp * 0.4;
        d.lineTo(x, yy);
      }
      d.lineTo(W, H); d.closePath(); d.fill();
    }
    /* 村落灯火 */
    for (var i = 0; i < 16; i++) {
      var lx = Math.random() * W, ly = H * (0.80 + Math.random() * 0.06);
      var r = 1.1 + Math.random() * 1.8;
      var rg = d.createRadialGradient(lx, ly, 0, lx, ly, r * 5);
      rg.addColorStop(0, 'rgba(255,190,120,.7)');
      rg.addColorStop(1, 'rgba(255,190,120,0)');
      d.fillStyle = rg; d.fillRect(lx - r * 5, ly - r * 5, r * 10, r * 10);
    }
    /* 薄雾 */
    for (var m = 0; m < 3; m++) {
      var my = H * (0.30 + m * 0.24), mh = H * 0.09;
      var gg = d.createLinearGradient(0, my - mh, 0, my + mh);
      gg.addColorStop(0, 'rgba(170,150,130,0)');
      gg.addColorStop(0.5, 'rgba(170,150,130,.06)');
      gg.addColorStop(1, 'rgba(170,150,130,0)');
      d.fillStyle = gg; d.fillRect(0, my - mh, W, mh * 2);
    }
  },

  /* 实体稻草龙身：渐变宽度带 + 编织纹理 + 分节扎绳 + 扫帚尾 + 两侧香杆（真实香火龙形制） */
  _drawDragon: function () {
    var d = this.darkCtx, W = this.w, H = this.h;
    if (!d) return;
    var i, k;
    /* 龙头暗衬底：让龙首轮廓在香火中跳出来 */
    if (this.head) {
      var bgR = Math.min(W, H) * 0.30;
      var bgG = d.createRadialGradient(this.head.x, this.head.y, 0, this.head.x, this.head.y, bgR);
      bgG.addColorStop(0, 'rgba(5,3,2,.96)');
      bgG.addColorStop(0.68, 'rgba(5,3,2,.62)');
      bgG.addColorStop(1, 'rgba(5,3,2,0)');
      d.fillStyle = bgG;
      d.fillRect(this.head.x - bgR, this.head.y - bgR, bgR * 2, bgR * 2);
    }
    var A = this.anchors, n = A.length;
    function widthAt2(k) {
      var f = k / (n - 1);
      return (0.048 + 0.036 * Math.pow(f, 1.5)) * W;
    }
    function normalAt(k) {
      var a = A[Math.max(0, k - 1)], b = A[Math.min(n - 1, k + 1)];
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      return [-Math.sin(ang), Math.cos(ang)];
    }
    /* 1) 实体带：尾→头法向双侧闭合多边形（稻草捆扎体积） */
    var topPts = [], botPts = [];
    for (k = 0; k < n; k++) {
      var nm = normalAt(k), wd = widthAt2(k);
      topPts.push([A[k][0] + nm[0] * wd, A[k][1] + nm[1] * wd]);
      botPts.push([A[k][0] - nm[0] * wd, A[k][1] - nm[1] * wd]);
    }
    var grad = d.createLinearGradient(A[0][0], A[0][1], A[n - 1][0], A[n - 1][1]);
    grad.addColorStop(0, '#201207');
    grad.addColorStop(0.45, '#371D0B');
    grad.addColorStop(0.8, '#4C2610');
    grad.addColorStop(1, '#5F2F13');
    d.fillStyle = grad;
    d.lineJoin = 'round';
    d.beginPath();
    d.moveTo(topPts[0][0], topPts[0][1]);
    for (k = 1; k < n; k++) d.lineTo(topPts[k][0], topPts[k][1]);
    for (k = n - 1; k >= 0; k--) d.lineTo(botPts[k][0], botPts[k][1]);
    d.closePath(); d.fill();
    /* 2) 稻草编织纹理：横向捆扎纹 + 斜向编织纹 */
    d.strokeStyle = 'rgba(0,0,0,.20)';
    d.lineWidth = Math.max(1, W * 0.002);
    for (k = 0; k < n; k += 2) {
      var nm2 = normalAt(k), wd2 = widthAt2(k);
      d.beginPath();
      d.moveTo(A[k][0] - nm2[0] * wd2 * 0.9, A[k][1] - nm2[1] * wd2 * 0.9);
      d.lineTo(A[k][0] + nm2[0] * wd2 * 0.9, A[k][1] + nm2[1] * wd2 * 0.9);
      d.stroke();
    }
    d.strokeStyle = 'rgba(150,86,34,.20)';
    d.lineWidth = Math.max(1, W * 0.0016);
    for (k = 0; k < n - 3; k += 3) {
      var nm3 = normalAt(k), wd3 = widthAt2(k) * 0.62;
      var qx = -nm3[1], qy = nm3[0];
      d.beginPath();
      d.moveTo(A[k][0] + nm3[0] * wd3 - qx * W * 0.012, A[k][1] + nm3[1] * wd3 - qy * W * 0.012);
      d.lineTo(A[k + 2][0] - nm3[0] * wd3 + qx * W * 0.012, A[k + 2][1] - nm3[1] * wd3 + qy * W * 0.012);
      d.stroke();
    }
    /* 3) 分节扎绳：9 节，节间一道横向亮箍（呼应 9 段点亮） */
    d.strokeStyle = 'rgba(196,140,72,.45)';
    d.lineWidth = Math.max(1.3, W * 0.0032);
    for (var sg = 1; sg <= 9; sg++) {
      var sp = this.segPts[sg - 1];
      var kk = sp.a;
      var nm4 = normalAt(kk), wd4 = widthAt2(kk);
      d.beginPath();
      d.moveTo(A[kk][0] - nm4[0] * wd4, A[kk][1] - nm4[1] * wd4);
      d.lineTo(A[kk][0] + nm4[0] * wd4, A[kk][1] + nm4[1] * wd4);
      d.stroke();
    }
    /* 4) 尾：扫帚状稻草束（三束斜出）+ 两片尾鳍 */
    var tp = A[0], ta = Math.atan2(A[1][1] - tp[1], A[1][0] - tp[0]);
    var tx = Math.cos(ta), ty = Math.sin(ta), tpx = -ty, tpy = tx;
    var fs = W * 0.030;
    d.fillStyle = 'rgba(64,38,16,.9)';
    for (i = -1; i <= 1; i++) {
      d.beginPath();
      d.moveTo(tp[0], tp[1]);
      d.quadraticCurveTo(tp[0] - tx * fs * 0.8 + tpx * fs * i * 1.5, tp[1] - ty * fs * 0.8 + tpy * fs * i * 1.5,
                         tp[0] - tx * fs * 1.5 + tpx * fs * i * 2.3, tp[1] - ty * fs * 1.5 + tpy * fs * i * 2.3);
      d.quadraticCurveTo(tp[0] - tx * fs * 0.4 + tpx * fs * i, tp[1] - ty * fs * 0.4 + tpy * fs * i, tp[0], tp[1]);
      d.closePath(); d.fill();
    }
    d.fillStyle = 'rgba(70,40,16,.75)';
    for (i = 0; i < 2; i++) {
      var side = i === 0 ? 1 : -1;
      d.beginPath();
      d.moveTo(tp[0], tp[1]);
      d.quadraticCurveTo(tp[0] - tx * fs * 0.6 + tpx * side * fs * 1.7, tp[1] - ty * fs * 0.6 + tpy * side * fs * 1.7,
                         tp[0] - tx * fs * 0.2 + tpx * side * fs * 2.7, tp[1] - ty * fs * 0.2 + tpy * side * fs * 2.7);
      d.quadraticCurveTo(tp[0] + tx * fs * 0.3 + tpx * side * fs * 0.5, tp[1] + ty * fs * 0.3 + tpy * side * fs * 0.5, tp[0], tp[1]);
      d.closePath(); d.fill();
    }
    /* 5) 香杆层：每根香的浅色细杆（暗态也看得到「插满香」） */
    d.lineCap = 'round';
    d.strokeStyle = 'rgba(228,200,152,.30)';
    d.lineWidth = Math.max(0.9, W * 0.0017);
    for (i = 0; i < this.dots.length; i++) {
      var dt = this.dots[i];
      if (!dt.nx) continue;
      d.beginPath();
      d.moveTo(dt.x - dt.nx * dt.ext, dt.y - dt.ny * dt.ext);
      d.lineTo(dt.x, dt.y);
      d.stroke();
    }
  },

  /* 龙头：不具象——星火剪影（星火点已在 dots 中由 _frame 统一绘制），此处只加辉光 */
  _drawHead: function (c, bright) {
    if (!this.head) return;
    var hx = this.head.x, hy = this.head.y;
    var s = clamp(Math.min(this.w, this.h) / 480, 0.85, 1.3) * (bright ? 5.4 : 4.4);
    var ft = this.floatT;
    var bob = Math.sin(ft * 0.02) * 1.5 * s;
    c.save();
    c.translate(hx, hy - bob);
    /* 龙头辉光：星火聚龙之处（亮态火光明亮，暗态极淡） */
    var gr = 46 * s;
    var gg = c.createRadialGradient(0, 0, 8 * s, 0, 0, gr);
    if (bright) {
      gg.addColorStop(0, 'rgba(255,176,96,.18)');
      gg.addColorStop(0.5, 'rgba(255,150,80,.08)');
      gg.addColorStop(1, 'rgba(255,150,80,0)');
    } else {
      gg.addColorStop(0, 'rgba(150,92,50,.10)');
      gg.addColorStop(1, 'rgba(150,92,50,0)');
    }
    c.fillStyle = gg;
    c.fillRect(-gr, -gr, gr * 2, gr * 2);
    c.restore();
  },

  _restoreLit: function () {
    var lc = this.lightCtx;
    if (!lc) return;
    lc.globalCompositeOperation = 'lighter';
    var self = this;
    this.litSegs.forEach(function (s2) { self._paintSeg(lc, s2); });
    if (this.lit >= 9) {
      this.awake = true;
      this._paintFull(lc);
    }
  },

  /* 点亮一段：该段香火转亮（sprite 层） + 段火光带 + 火星 + 烟气 */
  _paintSeg: function (lc, seg) {
    var W = this.w, H = this.h, i, dt;
    for (i = 0; i < this.dots.length; i++) {
      dt = this.dots[i];
      if (dt.seg === seg && !dt.lit) dt.lit = 1;
    }
    /* 段火光带 */
    var sp = this.segPts[seg - 1];
    for (var k = sp.a; k <= sp.b; k += 1) {
      var p = this.anchors[k];
      var rr = clamp(Math.min(W, H) * 0.06, 20, 46);
      var gg = lc.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
      gg.addColorStop(0, 'rgba(255,180,100,.30)');
      gg.addColorStop(0.55, 'rgba(255,150,80,.12)');
      gg.addColorStop(1, 'rgba(255,150,80,0)');
      lc.fillStyle = gg;
      lc.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2);
    }
    /* 火星 + 烟气 burst */
    for (i = 0; i < 26; i++) {
      var p2 = this.anchors[sp.a + Math.floor(Math.random() * (sp.b - sp.a + 1))];
      this.sparks.push({
        x: p2[0] + (Math.random() - .5) * W * 0.03,
        y: p2[1] + (Math.random() - .5) * W * 0.03,
        vx: (Math.random() - .5) * 0.9, vy: -(0.25 + Math.random() * 0.9),
        life: 40 + Math.random() * 70, max: 130, r: (1 + Math.random() * 1.6) * (W / 700 + 0.6),
        col: Math.random() < .5 ? '255,220,160' : '255,150,80'
      });
    }
    for (i = 0; i < 12; i++) {
      var p3 = this.anchors[sp.a + Math.floor(Math.random() * (sp.b - sp.a + 1))];
      this.smoke.push({
        x: p3[0] + (Math.random() - .5) * W * 0.04,
        y: p3[1] + (Math.random() - .5) * W * 0.04,
        vx: (Math.random() - .5) * 0.25, vy: -(0.12 + Math.random() * 0.35),
        life: 120 + Math.random() * 160, max: 300,
        r: (10 + Math.random() * 10) * (W / 700 + 0.6),
        a: 0.12 + Math.random() * 0.14
      });
    }
  },

  /* 全亮：整龙火光走廊 + 龙头辉光 */
  _paintFull: function (lc) {
    var W = this.w, H = this.h;
    for (var k = 0; k < this.anchors.length; k += 1) {
      var p = this.anchors[k];
      var rr = clamp(Math.min(W, H) * 0.065, 22, 52);
      var gg = lc.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
      gg.addColorStop(0, 'rgba(255,196,116,.18)');
      gg.addColorStop(1, 'rgba(255,196,116,0)');
      lc.fillStyle = gg;
      lc.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2);
    }
  },

  hit: function (mx, my) {
    var y = my * this.h;
    for (var s = 1; s <= 9; s++) {
      if (y >= this.h * (1 - s / 9) && y <= this.h * (1 - (s - 1) / 9)) return s;
    }
    return 0;
  },

  lightSegment: function (seg, quiet) {
    if (this.litSegs.indexOf(seg) !== -1 || seg < 1 || seg > 9) return;
    /* 星火汇聚：该段未亮香火点从背景星火征用起点，飞聚龙身 */
    var pool = this.bgStars;
    for (var fi = 0; fi < this.dots.length; fi++) {
      var fd = this.dots[fi];
      if (fd.seg !== seg || fd.lit || fd.flight) continue;
      var star = null;
      for (var fj = 0; fj < pool.length; fj++) {
        if (!pool[fj].used) { star = pool[fj]; pool[fj].used = true; break; }
      }
      if (!star) star = pool[Math.floor(Math.random() * pool.length)];
      fd.fx = star.x; fd.fy = star.y;
      fd.ft = 0; fd.flight = true;
    }
    var lc = this.lightCtx;
    if (lc) {
      lc.globalCompositeOperation = 'lighter';
      this._paintSeg(lc, seg);
    }
    this.litSegs.push(seg);
    this.lit = this.litSegs.length;
    if (this.lit >= 9 && !this.awake) {
      this.awake = true;
      if (lc) this._paintFull(lc);
      this._awake();
    }
    var p = document.getElementById('p5Progress');
    if (p) p.textContent = '已点燃 ' + this.lit + ' / 9';
    var t = document.getElementById('p5Hint');
    if (t) t.textContent = this.lit >= 9 ? '万火归一，龙，醒了。' : (this.lit === 0 ? '点击香火，从尾到头点亮龙身。' : '火已燃起，继续点亮。');
  },

  lightUp: function (quiet) {
    for (var i = 1; i <= 9; i++) this.lightSegment(i, true);
  },

  _awake: function () {
    var t = document.getElementById('awakeText');
    if (t) t.classList.add('show');
  },

  start: function () {
    if (this.raf) return;
    var self = this;
    var loop = function (ts) {
      self.raf = requestAnimationFrame(loop);
      if (!self.last) self.last = ts;
      var dt = Math.min(40, ts - self.last); self.last = ts;
      self._frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  },

  stop: function () {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  },

  _frame: function (dt) {
    var c = this.ctx, W = this.w, H = this.h;
    if (!c) return;
    this.floatT += dt / 16; this.t += dt / 1000;
    var i, dt2;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, W, H);
    /* 底：夜空 + 山 + 龙身暗块 */
    if (this.darkCvs) c.drawImage(this.darkCvs, 0, 0);
    else { c.fillStyle = '#0A0D14'; c.fillRect(0, 0, W, H); }
    /* 香火点：呼吸明灭；汇聚中的星火插值飞向龙身 */
    var lit = this.litSegs.length;
    for (i = 0; i < this.dots.length; i++) {
      dt2 = this.dots[i];
      if (dt2.flight) {
        dt2.ft = Math.min(1, dt2.ft + dt / 420);
        var ee = 1 - Math.pow(1 - dt2.ft, 3);
        var cxp = dt2.fx + (dt2.x - dt2.fx) * ee;
        var cyp = dt2.fy + (dt2.y - dt2.fy) * ee;
        c.globalAlpha = 0.35 + 0.65 * dt2.ft;
        c.drawImage(this.spLit, cxp - dt2.r * 2.4, cyp - dt2.r * 2.4, dt2.r * 4.8, dt2.r * 4.8);
        if (dt2.ft >= 1) { dt2.flight = false; dt2.lit = 1; }
        continue;
      }
      var flick = dt2.lit
        ? (0.92 + 0.16 * Math.sin(this.floatT * 0.055 + dt2.ph))
        : (dt2.head
          ? (0.90 + 0.10 * Math.sin(this.floatT * 0.030 + dt2.ph))
          : (0.50 + 0.16 * Math.sin(this.floatT * 0.020 + dt2.ph)));
      c.globalAlpha = flick;
      if (dt2.head) {
        /* 龙头星火：暗态柔光成团，点亮后放大聚光——满屏火光中龙头最亮 */
        if (!dt2.lit) { c.shadowColor = 'rgba(255,140,70,.85)'; c.shadowBlur = dt2.r * 3; }
        else { c.shadowColor = 'rgba(255,200,130,.95)'; c.shadowBlur = dt2.r * 3.2; }
        var hr = dt2.r * (dt2.lit ? 1.4 : 1.0);
        c.drawImage(dt2.lit ? this.spLit : this.spDark, dt2.x - hr * 2.6, dt2.y - hr * 2.6, hr * 5.2, hr * 5.2);
        c.shadowBlur = 0;
      } else {
        c.drawImage(dt2.lit ? this.spLit : this.spDark, dt2.x - dt2.r * 2.6, dt2.y - dt2.r * 2.6, dt2.r * 5.2, dt2.r * 5.2);
      }
    }
    c.globalAlpha = 1;
    /* 点亮光效层（持久火光带） */
    if (this.lightCvs) {
      c.globalCompositeOperation = 'lighter';
      c.drawImage(this.lightCvs, 0, 0);
      /* 全亮：火光沿龙身流动 */
      if (this.awake) {
        for (var k = 0; k < this.anchors.length; k += 2) {
          var p = this.anchors[k];
          var wave = 0.5 + 0.5 * Math.sin(this.floatT * 0.05 - k * 0.22);
          var rr = clamp(Math.min(W, H) * 0.06, 20, 44);
          var gg = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr);
          gg.addColorStop(0, 'rgba(255,198,122,' + (wave * 0.13).toFixed(3) + ')');
          gg.addColorStop(1, 'rgba(255,198,122,0)');
          c.fillStyle = gg;
          c.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2);
        }
      }
      c.globalCompositeOperation = 'source-over';
    }
    /* 龙头（亮态=金辉+须摆动；暗态=暗红静立） */
    this._drawHead(c, this.awake || this.lit >= 9);
    /* 星 */
    if (!this.stars.length) {
      for (i = 0; i < 24; i++) {
        this.stars.push({ x: Math.random(), y: Math.random() * 0.5, r: 0.4 + Math.random() * 1.1, tw: Math.random() * 6.28 });
      }
    }
    for (i = 0; i < this.stars.length; i++) {
      var st = this.stars[i];
      var sa = 0.16 + 0.13 * Math.sin(st.tw + this.floatT * 0.03);
      c.fillStyle = 'rgba(255,240,215,' + sa.toFixed(2) + ')';
      c.beginPath(); c.arc(st.x * W, st.y * H, st.r, 0, 6.283); c.fill();
    }
    /* 背景星火：散落满地的星火（点亮时飞聚龙身） */
    if (!this.bgStars.length) {
      for (i = 0; i < 150; i++) {
        this.bgStars.push({
          x: Math.random() * W, y: H * (0.14 + Math.random() * 0.78),
          r: (0.9 + Math.random() * 1.7) * (W / 700 + 0.6),
          ph: Math.random() * 6.28, used: false
        });
      }
    }
    for (i = 0; i < this.bgStars.length; i++) {
      var bs = this.bgStars[i];
      if (bs.used) continue;
      var ba = 0.10 + 0.11 * Math.sin(this.floatT * 0.035 + bs.ph);
      c.fillStyle = 'rgba(255,192,132,' + ba.toFixed(2) + ')';
      c.beginPath(); c.arc(bs.x, bs.y, bs.r, 0, 6.283); c.fill();
    }
    /* 烟气（soft 上浮扩散） */
    for (i = this.smoke.length - 1; i >= 0; i--) {
      var sm = this.smoke[i];
      sm.x += sm.vx * dt / 16; sm.y += sm.vy * dt / 16;
      sm.r += dt / 16 * (W / 700 + 0.6) * 0.35;
      sm.life -= dt / 16;
      if (sm.life <= 0) { this.smoke.splice(i, 1); continue; }
      var sga = sm.a * Math.min(1, sm.life / (sm.max * 0.5)) * (sm.life / sm.max);
      c.globalAlpha = Math.max(0, sga);
      c.drawImage(this.spSmoke, sm.x - sm.r, sm.y - sm.r, sm.r * 2, sm.r * 2);
    }
    c.globalAlpha = 1;
    /* 全亮时持续升烟 */
    if (this.awake && this.smoke.length < 60 && Math.random() < 0.35) {
      var pk = Math.floor(Math.random() * this.anchors.length);
      var p4 = this.anchors[pk];
      this.smoke.push({
        x: p4[0] + (Math.random() - .5) * W * 0.03, y: p4[1] + (Math.random() - .5) * W * 0.03,
        vx: (Math.random() - .5) * 0.2, vy: -(0.1 + Math.random() * 0.3),
        life: 130 + Math.random() * 150, max: 300,
        r: (9 + Math.random() * 9) * (W / 700 + 0.6),
        a: 0.1 + Math.random() * 0.12
      });
    }
    /* 火星 */
    c.globalCompositeOperation = 'lighter';
    for (i = this.sparks.length - 1; i >= 0; i--) {
      var sp2 = this.sparks[i];
      sp2.x += sp2.vx * dt / 16; sp2.y += sp2.vy * dt / 16;
      sp2.life -= dt / 16;
      if (sp2.life <= 0) { this.sparks.splice(i, 1); continue; }
      var aa = Math.max(0, sp2.life / sp2.max);
      c.fillStyle = 'rgba(' + sp2.col + ',' + (aa * 0.8).toFixed(2) + ')';
      c.beginPath(); c.arc(sp2.x, sp2.y, sp2.r, 0, 6.283); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  },

  onResize: function () {
    if (!this.built) return;
    this._resize();
    this._layout();
    this._drawScene();
    this._drawDragon();
    if (this.lightCtx) {
      this.lightCtx.clearRect(0, 0, this.w, this.h);
      this._restoreLit();
    }
  }
};

/* ================= P6 动态龙影（64 光点正弦波浪，按页启停） ================= */
var ShadowDragon = (function () {
  var cvs, ctx, w, h, raf = 0, sprite, mode = 3;
  function makeSprite() {
    var c = document.createElement('canvas'); c.width = c.height = 32;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,226,176,.95)');
    grad.addColorStop(.4, 'rgba(255,154,77,.5)');
    grad.addColorStop(1, 'rgba(255,154,77,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    return c;
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var t = ts / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    var cx = w * .5, cy = h * .44;
    var bx, by, i, x, y;
    var N = 100;
    /* 四种招式形态（真实舞龙套路）：
       0 双龙戏珠：珠绕中心旋转，龙身成环相逐
       1 跳跃龙门：龙身上下大起大落，如跃火门
       2 双龙出海：双龙错相翻腾，各占上下
       3 云游四海：舒缓蜿蜒游走，送福四方（默认） */
    if (mode === 0) {
      bx = cx + Math.cos(t * 1.1) * w * .15;
      by = cy + Math.sin(t * 1.1) * h * .14;
      for (i = 0; i < N; i++) {
        var ang = t * 1.7 + (i / (N - 1)) * 6.283;
        x = cx + Math.cos(ang) * w * .36;
        y = cy + Math.sin(ang) * h * .19;
        var ss0 = 6.5 + 5.5 * (0.5 + 0.5 * Math.sin(i * .42 + t * 2.3));
        var aa0 = .42 + .45 * (0.5 + 0.5 * Math.sin(i * .28 + t * 1.9));
        ctx.globalAlpha = aa0;
        ctx.drawImage(sprite, x - ss0 / 2, y - ss0 / 2, ss0, ss0);
      }
    } else if (mode === 1) {
      bx = w - 30; by = h * .30 + Math.sin(t * 1.4) * h * .06;
      for (i = 0; i < N; i++) {
        x = 18 + (i / (N - 1)) * (w - 36);
        y = h * .42 + Math.sin(i * .25 + t * 2.4) * h * .34 + Math.sin(i * .09 + t * 1.1) * h * .10;
        var ss1 = 6.5 + 5.5 * (0.5 + 0.5 * Math.sin(i * .42 + t * 2.3));
        var aa1 = .42 + .45 * (0.5 + 0.5 * Math.sin(i * .28 + t * 1.9));
        ctx.globalAlpha = aa1;
        ctx.drawImage(sprite, x - ss1 / 2, y - ss1 / 2, ss1, ss1);
      }
    } else if (mode === 2) {
      bx = w - 30; by = h * .5 + Math.sin(t * 1.2) * h * .2;
      for (i = 0; i < N; i++) {
        var two = i < N / 2;
        var idx = two ? i : i - N / 2;
        x = 18 + (idx / (N / 2 - 1)) * (w - 36);
        y = h * (two ? .28 : .60) + Math.sin(idx * .30 + t * (two ? 1.7 : 2.0) + (two ? 0 : 3.14)) * h * .13;
        var ss2 = 6.5 + 5.5 * (0.5 + 0.5 * Math.sin(idx * .42 + t * 2.3));
        var aa2 = .42 + .45 * (0.5 + 0.5 * Math.sin(idx * .28 + t * 1.9));
        ctx.globalAlpha = aa2;
        ctx.drawImage(sprite, x - ss2 / 2, y - ss2 / 2, ss2, ss2);
      }
    } else {
      bx = w - 30; by = h * .52 + Math.sin(w * .006 + t * 1.6) * h * .20 + Math.sin(w * .002 - t * .7) * h * .08;
      for (i = 0; i < N; i++) {
        x = 18 + (i / (N - 1)) * (w - 36);
        y = h * .52 + Math.sin(i * .30 + t * 1.6) * h * .20 + Math.sin(i * .11 - t * .9) * h * .09;
        var ss3 = 6.5 + 5.5 * (0.5 + 0.5 * Math.sin(i * .42 + t * 2.3));
        var aa3 = .42 + .45 * (0.5 + 0.5 * Math.sin(i * .28 + t * 1.9));
        ctx.globalAlpha = aa3;
        ctx.drawImage(sprite, x - ss3 / 2, y - ss3 / 2, ss3, ss3);
      }
    }
    /* 香火珠引路：一颗亮珠（真实舞龙以珠引龙） */
    var bg = ctx.createRadialGradient(bx, by, 0, bx, by, 26);
    bg.addColorStop(0, 'rgba(255,240,200,.95)');
    bg.addColorStop(.35, 'rgba(255,170,90,.5)');
    bg.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, 26, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,220,.98)';
    ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, 6.283); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  return {
    start: function () {
      cvs = $('#shadowCanvas');
      var env = sizeCanvas(cvs); ctx = env.ctx; w = env.w; h = env.h;
      if (!sprite) sprite = makeSprite();
      if (raf) return;
      raf = requestAnimationFrame(frame);
    },
    stop: function () { if (raf) { cancelAnimationFrame(raf); raf = 0; if (ctx) ctx.clearRect(0, 0, w, h); } },
    setMode: function (m) { mode = (m === 0 || m === 1 || m === 2 || m === 3) ? m : 3; }
  };
})();

/* ================= 启动 ================= */
document.addEventListener('DOMContentLoaded', function () {
  LazyImg.init();
  Deck.init();
});

/* 暴露给 features.js 使用 */
window.Deck = Deck;
window.DragonCanvas = DragonCanvas;
window.ShadowDragon = ShadowDragon;

})();
