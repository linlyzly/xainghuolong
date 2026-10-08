/* ============================================================
   P5「万火为鳞」点火仪式引擎（p5fire.js）
   —— 夜空为纸，玩家是点火人。不做任何具象龙形。
      每次点击：一支香从天坠落 → 落地生根（火星迸溅/光环扩散/烟雾升腾/香火呼吸）。
      攒够 18 支（十八人，一刻钟）→ 万火齐燃：
      白热炽亮、火星漫天、夜空映暖、标题让位、「万火为鳞」浮现、落款按序显影。
   三种香火微差异：楠竹香（骨·青白）/ 稻草香（肤·暖金）/ 龙香（鳞·橙红）。
   龙小香：一团有灵性的火（不具象），游动引导、嗅香、齐燃时融入大字。
   纯原生 Canvas 2D · 断网可用 · 尊重 prefers-reduced-motion。
   接口：window.P5Fire = { build, start, stop, onResize, debug }
   ============================================================ */
(function () {
'use strict';

/* ================= 常量与工具 ================= */
var MAX = 18;                       /* 齐燃阈值：十八人，一刻钟，千六百支香（每节两支，九节龙身） */
var SEG = 9;                        /* 点燃节数：九节龙身，一节一燃（尾→头，龙头点睛） */
var REDUCED = false;
try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, k) { return a + (b - a) * k; }
function rnd() { return Math.random(); }
function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

/* 三种香火（骨 / 肤 / 鳞）：仅光晕主色与核心色微差，统一火光质感 */
var TYPES = [
  { name: '楠竹', halo: [186, 214, 216], mid: [222, 238, 240], core: [248, 253, 253] },  /* 骨 · 青白 */
  { name: '稻草', halo: [216, 168, 88],  mid: [255, 214, 120], core: [255, 243, 205] },  /* 肤 · 暖金 */
  { name: '龙香', halo: [206, 96, 42],   mid: [255, 148, 64],  core: [255, 224, 184] }   /* 鳞 · 橙红 */
];

/* ================= 引擎状态 ================= */
var cvs = null, ctx = null, W = 0, H = 0, U = 1, DPR = 1;
var built = false, running = false, _bound = false;
var raf = 0, last = 0, T = 0;
var pendingTap = null;              /* 引擎未就绪时的点击暂存：{x,y,t} */
var READY_MS = 700;                 /* 暂存有效期；超过视为陈旧点击丢弃 */

var incenses = [];                  /* 已燃香：{x,y,type,ph,seed} */
var falling = [];                   /* 下坠香：{x,ty,t0,dur,len,type} */
var sparks = [];                    /* 火星：{x,y,vx,vy,g,life,age,sz} */
var smokes = [];                    /* 烟雾：{x,y,vx,vy,r,life,age,a} */
var rings = [];                     /* 落地光环：{x,y,r,vr,a,va} */

var fireCount = 0;                  /* 累计点燃支数（内部持续增长） */
var segCur = 0;                     /* 下一节索引（0=龙尾 … 8=龙头） */
var ritual = null;                  /* 一键点火仪式：spark→flight→burn */
var fireLine = -1;                  /* 齐燃金线淡出计时（-1=未启用） */
var ignited = false, bangT = 0, burstHeat = 0, pulseT = -1;   /* pulseT：齐燃瞬间一次性光晕脉冲 */

/* 龙小香：一团灵动的火（不画脸不画形） */
var guide = { x: 0, y: 0, a: 1, mode: 'wander', tgt: null, st: 0, trail: [] };
var trailLen = 0;                  /* 尾迹累计长度（保持约 10% 画面宽） */

var bgCvs = null;                   /* 静态夜空（离屏） */
var SP = { haloOut: null, mid: [], core: [], smoke: null };   /* 预渲染辉光 sprite */

var uiProg = null, uiHint = null, uiWhisper = null, uiCredits = null, uiHead = null, uiAwake = null;
var timers = [];                    /* 齐燃时序 DOM 定时器（stop 时清理） */
var whisperT = 0;

/* ================= DOM 文案 ================= */
function setProg(n) {
  if (!uiProg) return;
  uiProg.textContent = '已燃香 ' + Math.min(n, MAX) + ' / ' + MAX;
  uiProg.classList.remove('pop');
  void uiProg.offsetWidth;
  uiProg.classList.add('pop');
}
function setHint(s) { if (uiHint) uiHint.textContent = s; }

/* 「又一位点火人」轻语：每次点香短暂浮现（呼应十八人仪式） */
function whisper(n) {
  if (!uiWhisper || ignited) return;
  uiWhisper.textContent = n === 0 ? '火种已起 · 沿龙身而去' : '龙身第 ' + n + ' / ' + SEG + ' 节';
  uiWhisper.classList.add('on');
  clearTimeout(whisperT);
  whisperT = setTimeout(function () { uiWhisper.classList.remove('on'); }, 1400);
}

/* ================= 尺寸与静态夜空 ================= */
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  var r = cvs.getBoundingClientRect();
  W = Math.max(80, Math.round(r.width || window.innerWidth));
  H = Math.max(120, Math.round(r.height || window.innerHeight));
  U = W / 375;
  cvs.width = Math.round(W * DPR);
  cvs.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildDragon();
  buildBg();
}

function buildBg() {
  bgCvs = document.createElement('canvas');
  bgCvs.width = cvs.width; bgCvs.height = cvs.height;
  var g = bgCvs.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  /* 夜空：极深蓝黑 → 微暖暗底，不是死黑 */
  var gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#05060d');
  gr.addColorStop(0.5, '#0b0a10');
  gr.addColorStop(1, '#140e08');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  /* 极淡星点 40–70 颗 */
  var nStar = 40 + Math.floor(rnd() * 31);
  for (var i = 0; i < nStar; i++) {
    g.globalAlpha = 0.04 + rnd() * 0.10;
    g.fillStyle = 'rgba(240,232,214,0.7)';
    g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.6, 0.4 + rnd() * 1.1, 0, 6.283); g.fill();
  }
  g.globalAlpha = 1;
  /* 远山三叠（透明度 0.03–0.06 级，几乎隐没） */
  var layers = [
    { y: 0.875, amp: 0.05,  a: 0.055 },
    { y: 0.92,  amp: 0.04,  a: 0.05 },
    { y: 0.958, amp: 0.028, a: 0.045 }
  ];
  for (var L = 0; L < layers.length; L++) {
    var ly = layers[L];
    g.fillStyle = 'rgba(5,4,7,' + ly.a + ')';
    g.beginPath(); g.moveTo(0, H);
    for (var x = 0; x <= W; x += Math.max(8, W / 44)) {
      g.lineTo(x, H * ly.y - Math.abs(Math.sin(x / W * 5.1 + L * 1.8)) * H * ly.amp);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  /* 一间极暗村舍 + 一盏极淡暖窗（呼应汝城夜色，不喧宾夺主） */
  var hx = W * 0.11, hy = H * 0.972, ww = W * 0.055, hh = H * 0.022;
  g.fillStyle = 'rgba(3,3,5,0.9)';
  g.fillRect(hx, hy - hh, ww, hh);
  g.beginPath();
  g.moveTo(hx - ww * 0.1, hy - hh);
  g.lineTo(hx + ww * 0.5, hy - hh - hh * 0.62);
  g.lineTo(hx + ww * 1.1, hy - hh);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,172,92,0.09)';
  g.fillRect(hx + ww * 0.32, hy - hh * 0.7, ww * 0.18, hh * 0.3);
}

/* ================= 预渲染辉光 sprite（三层 × 三类 + 烟） ================= */
function radialSprite(rgbStops) {
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var g = c.getContext('2d');
  var r = 64;
  var gr = g.createRadialGradient(r, r, 0, r, r, r);
  for (var i = 0; i < rgbStops.length; i++) gr.addColorStop(rgbStops[i][0], rgbStops[i][1]);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
/* ================= 龙形轨迹：香火沿龙身燃起（尾在左低，头在右上扬） ================= */
var DRAGON = [
  [0.055,0.60],[0.07,0.52],[0.10,0.58],[0.14,0.70],[0.19,0.74],
  [0.25,0.68],[0.30,0.76],[0.36,0.70],[0.42,0.78],[0.49,0.70],
  [0.55,0.76],[0.61,0.68],[0.67,0.74],[0.72,0.62],[0.77,0.66],
  [0.82,0.56],[0.86,0.48],[0.89,0.40],[0.90,0.32],[0.88,0.26]
];
var dragonPts = [], dragonSegs = [], dragonParts = [];   /* dragonParts：星火龙影粒子 */
var HEAD_CLOUD = 46;                        /* 龙头星云粒子数 */
function crPt(p0, p1, p2, p3, t) {
  var t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  ];
}
function buildDragon() {
  var a = DRAGON, pts = [], i, s;
  for (i = 0; i < a.length - 3; i++)
    for (s = 0; s <= 24; s++) pts.push(crPt(a[i], a[i + 1], a[i + 2], a[i + 3], s / 24));
  for (s = 0; s <= 24; s++) pts.push(crPt(a[a.length - 3], a[a.length - 2], a[a.length - 1], a[a.length - 1], s / 24));
  var acc = 0, lens = [], k;
  for (k = 1; k < pts.length; k++) { var dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1]; lens.push(Math.hypot(dx, dy)); acc += lens[lens.length - 1]; }
  var step = acc / MAX, rem = step, idx = 1, cx = pts[0][0], cy = pts[0][1], out = [];
  out.push([cx * W, cy * H]);
  while (idx < pts.length && out.length < MAX) {
    var d0 = Math.hypot(pts[idx][0] - cx, pts[idx][1] - cy);
    if (d0 >= rem) { var t = rem / d0; cx += (pts[idx][0] - cx) * t; cy += (pts[idx][1] - cy) * t; out.push([cx * W, cy * H]); rem = step; }
    else { rem -= d0; cx = pts[idx][0]; cy = pts[idx][1]; idx++; }
  }
  while (out.length < MAX) out.push([pts[pts.length - 1][0] * W, pts[pts.length - 1][1] * H]);
  dragonPts = out;
  dragonSegs = [];
  for (var j = 0; j < SEG; j++) dragonSegs.push([out[j * 2], out[j * 2 + 1]]);
  buildParts();
}

/* 星火龙影：沿龙身曲线与龙头生成粒子群（未燃=星雾暗影，燃起=金火） */
function buildParts() {
  var i, j, t, L;
  dragonParts = [];
  /* 三层龙身：0 核心亮脊 / 1 中晕暖光 / 2 外晕暗影 —— 宽身立体火带 */
  var layers = [
    { w: 0.35, off: 3.4,  sz: 0 },
    { w: 0.35, off: 9.5,  sz: 1 },
    { w: 0.30, off: 20.0, sz: 2 }
  ];
  var per = Math.max(3, Math.floor(900 / Math.max(1, dragonPts.length - 1)));
  for (i = 0; i < dragonPts.length - 1; i++) {
    for (L = 0; L < layers.length; L++) {
      var nL = Math.max(2, Math.round(per * layers[L].w));
      for (j = 0; j < nL; j++) {
        t = j / nL;
        var ang = rnd() * 6.283;
        var rr = Math.pow(rnd(), 0.7) * layers[L].off * U;   /* 中心密、边缘疏：光带自然衰减 */
        var x = lerp(dragonPts[i][0], dragonPts[i + 1][0], t) + Math.cos(ang) * rr;
        var y = lerp(dragonPts[i][1], dragonPts[i + 1][1], t) + Math.sin(ang) * rr * 0.62;
        var seg = Math.min(SEG - 1, Math.floor(i / 2));
        dragonParts.push({ x: x, y: y, ox: x, oy: y, seg: seg, ph: rnd() * 6.283, sp: 0.7 + rnd() * 1.3, tw: 0, lit: 0, layer: layers[L].sz });
      }
    }
  }
  /* 龙头星云：聚焦于龙头两点的密集星火团（点睛位），略扩大 */
  if (dragonPts.length >= 18) {
    var hx = dragonPts[17][0], hy = dragonPts[17][1];
    for (var k = 0; k < HEAD_CLOUD; k++) {
      var a3 = rnd() * 6.283, rr2 = Math.pow(rnd(), 0.6) * U * 26;
      var px = hx + Math.cos(a3) * rr2, py = hy + Math.sin(a3) * rr2 * 0.6;
      dragonParts.push({ x: px, y: py, ox: px, oy: py, seg: SEG - 1, ph: rnd() * 6.283, sp: 0.5 + rnd() * 1.0, tw: 0, lit: 0, layer: 0 });
    }
  }
}

function buildSprites() {
  /* 外层大光晕统一暖橙（三香一体，不分裂色调）；差异只在中层与核心色 */
  SP.haloOut = radialSprite([[0, 'rgba(255,138,52,0.55)'], [0.4, 'rgba(255,120,44,0.18)'], [1, 'rgba(255,120,44,0)']]);
  SP.mid = []; SP.core = [];
  for (var t = 0; t < TYPES.length; t++) {
    var c = TYPES[t];
    SP.mid.push(radialSprite([[0, rgba(c.mid, 0.9)], [0.5, rgba(c.mid, 0.24)], [1, rgba(c.mid, 0)]]));
    SP.core.push(radialSprite([[0, 'rgba(255,255,255,0.98)'], [0.3, rgba(c.core, 0.88)], [1, rgba(c.core, 0)]]));
  }
  SP.smoke = radialSprite([[0, 'rgba(140,118,96,0.5)'], [0.55, 'rgba(140,118,96,0.16)'], [1, 'rgba(140,118,96,0)']]);
}

/* ================= 交互：点击 → 点香 ================= */
function tapAt(mx, my) {
  /* 首帧点击防护：进屏（滚动途中 / 首帧）引擎尚未 running 时点击先暂存坐标，
     start() 就绪后自动补执行一次，避免进屏立即点火被静默吞掉 */
  if (!running) { pendingTap = { x: mx, y: my, t: Date.now() }; return; }
  if (ignited || ritual) return;                  /* 一键点火：一触即发，仪式进行中不再响应 */
  var fx = clamp(mx, U * 10, W - U * 10), fy = clamp(my, H * 0.12, H * 0.92);
  /* 指尖火苗：涟漪 + 火星迸开（你在此点火） */
  rings.push({ x: fx, y: fy, r: U * 4, vr: (U * 22 - U * 4) / 0.45, a: 0.34, va: 0.34 / 0.45 });
  for (var i = 0; i < 8; i++) {
    var a2 = rnd() * 6.283, sp2 = U * (30 + rnd() * 80);
    if (sparks.length < 900) sparks.push({ x: fx, y: fy, vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2 - U * 46, g: U * 280, life: 0.4 + rnd() * 0.35, age: 0, sz: 1.4 + rnd() * 2.4 });
  }
  whisper(0);
  /* 仪式启动：火种 0.5s 凝 → 1.5s 飞向龙尾 → 沿龙身逐节燃烧 */
  ritual = { phase: 'spark', t: 0, sx: fx, sy: fy, _lit: -1 };
}

/* 点燃一节：两支香在龙身落点生根（龙头一节用龙香·橙红），星火爆开 */
function lightSeg(k) {
  var pts = dragonSegs[k];
  /* 星火粒子点亮本节（龙影随节燃亮） */
  for (var pi = 0; pi < dragonParts.length; pi++) {
    if (dragonParts[pi].seg === k) dragonParts[pi].lit = 1;
  }
  for (var j = 0; j < pts.length; j++) {
    fireCount++;
    if (incenses.length >= 140) incenses.shift();
    incenses.push({ x: pts[j][0], y: pts[j][1], type: k === SEG - 1 ? 2 : Math.floor(rnd() * 3), ph: rnd() * 6.283, seed: rnd(), filN: 1, filA: [rnd() * 6.283] });
    for (var i = 0; i < 5; i++) {
      var a3 = rnd() * 6.283, sp3 = U * (42 + rnd() * 92);
      if (sparks.length < 900) sparks.push({ x: pts[j][0], y: pts[j][1], vx: Math.cos(a3) * sp3, vy: Math.sin(a3) * sp3 - U * 42, g: U * 300, life: 0.4 + rnd() * 0.4, age: 0, sz: 1.4 + rnd() * 2.4 });
    }
    rings.push({ x: pts[j][0], y: pts[j][1], r: U * 5, vr: (U * 34 - U * 5) / 0.5, a: 0.42, va: 0.42 / 0.5 });
  }
  segCur = k + 1;
  setProg(fireCount);
  setHint(k === SEG - 1 ? '龙头点睛 · 万火将燃' : '火沿龙身蔓延 · 第 ' + (k + 1) + ' / ' + SEG + ' 节');
  if (window.Audio && window.Audio.tick) window.Audio.tick();
}

function onTap(e) {
  var r = cvs.getBoundingClientRect();
  tapAt(e.clientX - r.left, e.clientY - r.top);
}

/* 香落地：生根 + 火星迸溅 + 光环 + 烟雾 */
function plant(f) {
  fireCount++;
  /* 超上限时回收最旧的香，保证性能与画面不淤积 */
  if (incenses.length >= 140) incenses.shift();
  var filN = 1 + Math.floor(rnd() * 2), filA = [];   /* 1–2 根短火舌（多了密集时会成星象连线） */
  for (var fi = 0; fi < filN; fi++) filA.push(rnd() * 6.283);
  incenses.push({ x: f.x, y: f.ty, type: f.type, ph: rnd() * 6.283, seed: rnd(), filN: filN, filA: filA });

  /* 火星迸溅 12–20 颗（带重力、衰减） */
  var n = REDUCED ? 7 : 12 + Math.floor(rnd() * 9);
  for (var i = 0; i < n; i++) {
    var a = rnd() * 6.283, sp = U * (70 + rnd() * 150);
    if (sparks.length < 900) sparks.push({
      x: f.x, y: f.ty, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - U * 60,
      g: U * 420, life: 0.5 + rnd() * 0.7, age: 0, sz: 1.1 + rnd() * 2.2
    });
  }
  /* 光晕环：半径 30–50px 扩散淡出 */
  var r1 = U * (34 + rnd() * 16);
  rings.push({ x: f.x, y: f.ty, r: U * 5, vr: (r1 - U * 5) / 0.7, a: 0.5, va: 0.5 / 0.7 });
  /* 烟雾 2–4 团（寿命 1.6–3s） */
  var m = REDUCED ? 1 : 2 + Math.floor(rnd() * 3);
  for (var j = 0; j < m; j++) {
    if (smokes.length >= 150) break;
    smokes.push({
      x: f.x + (rnd() - 0.5) * U * 10, y: f.ty - U * 6,
      vx: (rnd() - 0.5) * U * 10, vy: -U * (16 + rnd() * 14),
      r: U * (5 + rnd() * 7), life: 1.6 + rnd() * 1.4, age: 0, a: 0.16
    });
  }

  setProg(fireCount);
  if (!ignited) setHint('火沿龙身蔓延 · 第 ' + Math.min(segCur, SEG) + ' / ' + SEG + ' 节');

  /* 龙小香凑近嗅香 */
  guide.mode = 'sniff';
  guide.tgt = { x: f.x, y: f.ty };
  guide.st = T;

  if (fireCount >= MAX && !ignited) igniteAll();
}

/* ================= 万火齐燃（第 18 支触发） ================= */
function igniteAll() {
  ignited = true; bangT = 0; burstHeat = 0; pulseT = 0; fireLine = 0;   /* 触发一次性光晕脉冲 + 龙形金线 */
  for (var pi = 0; pi < dragonParts.length; pi++) dragonParts[pi].lit = 1;   /* 整条龙星火齐亮 */
  /* 全屏火星爆发 150–250 颗（从各香火点与夜空各处），带拖尾、寿命 +25% */
  var n = REDUCED ? 100 : 190 + Math.floor(rnd() * 70);
  for (var i = 0; i < n; i++) {
    var fromFire = i < incenses.length && rnd() < 0.6;
    var ox = fromFire ? incenses[i].x : W * (0.1 + rnd() * 0.8);
    var oy = fromFire ? incenses[i].y : H * (0.18 + rnd() * 0.62);
    var a = rnd() * 6.283, sp = U * (130 + rnd() * 320);
    if (sparks.length < 900) sparks.push({
      x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - U * 110,
      g: U * 300, life: 1.6 + rnd() * 2.4, age: 0, sz: 2.2 + rnd() * 5.0, tail: true
    });
  }
  /* 龙头龙息：向上喷涌金焰（齐燃专属，46 颗） */
  var hx = dragonPts[17][0], hy = dragonPts[17][1];
  for (var hi = 0; hi < 46; hi++) {
    var ha = -Math.PI / 2 + (rnd() - 0.5) * 1.1;
    var hsp = U * (150 + rnd() * 280);
    if (sparks.length < 900) sparks.push({
      x: hx, y: hy, vx: Math.cos(ha) * hsp, vy: Math.sin(ha) * hsp,
      g: U * 240, life: 1.2 + rnd() * 1.6, age: 0, sz: 2.0 + rnd() * 4.2, tail: true
    });
  }
  /* 龙小香游向画面中央，融入大字光晕 */
  guide.mode = 'merge';

  /* 时序：夜空先暖 → 标题淡出 → 大字浮现 → 落款按序 → 提示收束 → 落款转常驻 */
  clearTimers();
  var hd = uiHead; if (hd) hd.classList.add('fade-out');                 /* 顶部让位（CSS 1.4s 淡出） */
  timers.push(setTimeout(function () {                                   /* +1.5s 夜空左上浮现大字（题签淡出完成后） */
    if (uiAwake) uiAwake.classList.add('show');
  }, 1500));
  timers.push(setTimeout(function () {                                   /* +1.4s 提示收束 */
    setHint('万火为鳞 · 龙在香火里，不在形状里');
  }, 1400));
  var lines = uiCredits ? uiCredits.querySelectorAll('p') : [];
  var delays = [1800, 2400, 3000, 3600];                                 /* 落款按序错开 0.6s */
  for (var k = 0; k < lines.length; k++) {
    (function (el, d) {
      timers.push(setTimeout(function () { el.classList.add('on'); }, d));
    })(lines[k], delays[k] || 4200);
  }
  timers.push(setTimeout(function () {                                   /* 落款保持约 4s 后转 35% 常驻 */
    if (uiCredits) uiCredits.classList.add('dim');
  }, 7800));

  setProg(fireCount);
  if (window.Audio && window.Audio.crescendo) window.Audio.crescendo();
}

function clearTimers() {
  for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
  timers = [];
}

/* ================= 龙小香 ================= */
function stepGuide(dt) {
  var tx, ty, sp;
  if (guide.mode === 'merge') {
    tx = W / 2; ty = H * 0.33; sp = U * 74;
    guide.a = Math.max(0, guide.a - dt * 0.42);          /* 融入大字光晕后淡出 */
  } else if (guide.mode === 'sniff' && guide.tgt) {
    tx = guide.tgt.x; ty = guide.tgt.y - U * 18; sp = U * 98;
    if (T - guide.st > 1.3) { guide.mode = 'wander'; guide.tgt = null; }
  } else {
    /* 平滑游动：多频正弦叠加，慢速不跟随鼠标；叠加轻微上下浮动（呼吸感） */
    tx = W * (0.30 + 0.26 * Math.sin(T * 0.12 + 1.7) + 0.13 * Math.sin(T * 0.033 + 0.5));
    ty = H * (0.36 + 0.22 * Math.sin(T * 0.15 + 0.6) + 0.11 * Math.cos(T * 0.027 + 2.0))
       + H * 0.030 * Math.sin(T * 0.85);
    sp = U * 26;
  }
  if (REDUCED) sp *= 0.35;
  var dx = tx - guide.x, dy = ty - guide.y, d = Math.hypot(dx, dy) || 1;
  var step = Math.min(sp * dt, d);
  guide.x += dx / d * step;
  guide.y += dy / d * step;
  /* 尾迹按距离采样，保留约 10% 画面宽的轨迹（8–12%） */
  var lp = guide.trail[guide.trail.length - 1];
  if (!lp || Math.hypot(guide.x - lp.x, guide.y - lp.y) > U * 3) {
    guide.trail.push({ x: guide.x, y: guide.y });
    trailLen += lp ? Math.hypot(guide.x - lp.x, guide.y - lp.y) : 0;
  }
  var wantLen = W * 0.10;
  while (guide.trail.length > 1 && trailLen > wantLen) {
    var p0 = guide.trail[0], p1 = guide.trail[1];
    trailLen -= Math.hypot(p1.x - p0.x, p1.y - p0.y);
    guide.trail.shift();
  }
}

function drawGuide() {
  if (guide.a <= 0.01) return;
  var halo = SP.haloOut, mid = SP.mid[1], core = SP.core[1];
  /* 嗅香反馈：0.4s 内光晕扩大再回缩，让“凑近一支香”被看见 */
  var sniffPulse = 1;
  if (guide.mode === 'sniff') {
    var spk = clamp((T - guide.st) / 0.4, 0, 1);
    sniffPulse = 1 + 0.55 * Math.sin(spk * Math.PI);
  }
  /* 尾迹：加长（约 10% 画面宽）加亮 */
  for (var i = 0; i < guide.trail.length; i++) {
    var p = guide.trail[i], k = i / guide.trail.length;
    var s1 = U * 26 * (0.35 + 0.65 * k);
    ctx.globalAlpha = 0.16 * k * guide.a;
    ctx.drawImage(halo, p.x - s1 / 2, p.y - s1 / 2, s1, s1);
  }
  /* 本体：核心 ×1.5、亮度 +40%，带呼吸；仍是一团不具象的火 */
  var br = REDUCED ? 1 : 0.94 + 0.10 * Math.sin(T * 2.2);
  var s2 = U * 64 * br * sniffPulse, s3 = U * 30 * br * sniffPulse, s4 = U * 14 * br;
  ctx.globalAlpha = clamp(0.42 * guide.a, 0, 1);
  ctx.drawImage(halo, guide.x - s2 / 2, guide.y - s2 / 2, s2, s2);
  ctx.globalAlpha = clamp(0.78 * guide.a, 0, 1);
  ctx.drawImage(mid, guide.x - s3 / 2, guide.y - s3 / 2, s3, s3);
  ctx.globalAlpha = clamp(0.98 * guide.a, 0, 1);
  ctx.drawImage(core, guide.x - s4 / 2, guide.y - s4 / 2, s4, s4);
  ctx.globalAlpha = clamp(0.55 * guide.a, 0, 1);                 /* 再叠一层小核心增亮 */
  ctx.drawImage(core, guide.x - s4 * 0.55, guide.y - s4 * 0.55, s4 * 1.1, s4 * 1.1);
  ctx.globalAlpha = 1;
}

/* ================= 更新 ================= */
function update(dt) {
  var i;
  /* 星火渐亮：已燃段粒子向金火过渡 */
  for (i = 0; i < dragonParts.length; i++) {
    var dpx = dragonParts[i];
    dpx.tw += (dpx.lit - dpx.tw) * Math.min(1, dt * 3.0);
  }
  /* 下坠香：轻微加速，0.8–1.2s 落地 */
  for (i = falling.length - 1; i >= 0; i--) {
    var f = falling[i];
    var p = clamp((T - f.t0) / f.dur, 0, 1);
    f.y = lerp(-30, f.ty, Math.pow(p, 1.18));
    if (p >= 1) { falling.splice(i, 1); plant(f); }
  }
  /* 火星：重力 + 寿命 */
  for (i = sparks.length - 1; i >= 0; i--) {
    var s = sparks[i];
    s.age += dt;
    if (s.age >= s.life) { sparks.splice(i, 1); continue; }
    s.vy += s.g * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
  }
  /* 烟雾：上升扩散淡出 */
  for (i = smokes.length - 1; i >= 0; i--) {
    var m = smokes[i];
    m.age += dt;
    if (m.age >= m.life) { smokes.splice(i, 1); continue; }
    m.x += (m.vx + Math.sin(T * 1.1 + m.r) * U * 4) * dt;
    m.y += m.vy * dt;
    m.r += U * 7 * dt;
  }
  /* 光环 */
  for (i = rings.length - 1; i >= 0; i--) {
    var rg = rings[i];
    rg.r += rg.vr * dt; rg.a -= rg.va * dt;
    if (rg.a <= 0) rings.splice(i, 1);
  }
  /* 齐燃热度 1.8s 渐满 + 余烬火星持续 */
  if (ignited) {
    bangT += dt;
    burstHeat = clamp(bangT / 1.8, 0, 1);
    if (pulseT >= 0) { pulseT += dt; if (pulseT > 0.6) pulseT = -1; }   /* 脉冲仅 0.6s 一次 */
    if (!REDUCED && rnd() < dt * 5 && incenses.length && sparks.length < 900) {
      var it = incenses[Math.floor(rnd() * incenses.length)];
      sparks.push({
        x: it.x, y: it.y, vx: (rnd() - 0.5) * U * 60, vy: -U * (40 + rnd() * 80),
        g: U * 260, life: 0.7 + rnd() * 0.8, age: 0, sz: 1.6 + rnd() * 3.2, tail: true
      });
    }
    /* 齐燃余烬雨：龙身星火如香灰飘落，动态光影 */
    if (!REDUCED && rnd() < dt * 16 && sparks.length < 880 && dragonPts.length) {
      var ep = dragonPts[Math.floor(rnd() * dragonPts.length)];
      sparks.push({
        x: ep[0] + (rnd() - 0.5) * U * 34, y: ep[1] + (rnd() - 0.5) * U * 34,
        vx: (rnd() - 0.5) * U * 16, vy: U * (14 + rnd() * 22), g: U * 5,
        life: 1.6 + rnd() * 1.2, age: 0, sz: 0.9 + rnd() * 1.1, tail: false
      });
    }
  }
  /* 一键点火仪式：spark 凝火 → flight 火种飞向龙尾 → burn 逐节燃烧 */
  if (ritual) {
    ritual.t += dt;
    if (ritual.phase === 'spark' && ritual.t >= 0.5) { ritual.phase = 'flight'; ritual.t = 0; }
    if (ritual.phase === 'flight' && ritual.t >= 1.5) { ritual.phase = 'burn'; ritual.t = 0; ritual._lit = -1; }
    if (ritual.phase === 'burn') {
      var segNow = Math.floor(ritual.t / 0.3);
      if (segNow > ritual._lit) {
        ritual._lit = segNow;
        lightSeg(Math.min(segNow, SEG - 1));
        if (ritual._lit >= SEG) { ritual = null; igniteAll(); }
      }
    }
  }
  /* 齐燃金线淡出 */
  if (fireLine >= 0) { fireLine += dt; if (fireLine > 1.2) fireLine = -1; }
  stepGuide(dt);
}

/* 引导虚线：未燃节极淡虚线沿龙身，已燃节淡去（香火替代）；龙头两粒淡点暗示点睛 */
function drawGuideLine() {
  if (!dragonParts.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var i, p;
  for (i = 0; i < dragonParts.length; i++) {
    p = dragonParts[i];
    /* 缓慢漂移：每颗粒子绕初始点做微幅呼吸运动（星雾感）；外晕漂移更大 */
    var wob = (p.layer === 2) ? 2.4 : 1;
    p.x = p.ox + Math.sin(T * 0.9 + p.ph) * U * p.sp * wob;
    p.y = p.oy + Math.cos(T * 0.7 + p.ph * 1.3) * U * p.sp * 0.7 * wob;
    var tw = p.tw;
    var flick = 0.5 + 0.5 * Math.sin(T * 1.6 + p.ph);
    var a, r, col;
    if (tw > 0.01) {
      /* 已燃：分层火带 —— 核心金亮 / 中晕暖橙 / 外晕暗红（宽身立体） */
      var k = Math.min(1, tw * 1.6);
      if (p.layer === 0) {
        a = 0.12 + k * (0.40 + 0.20 * Math.sin(T * 2.2 + p.ph));
        r = U * (1.0 + 1.4 * k);
        col = 'rgba(255,' + Math.floor(178 + 46 * k) + ',100,' + clamp(a, 0, 0.62).toFixed(3) + ')';
      } else if (p.layer === 1) {
        a = 0.07 + k * (0.26 + 0.14 * Math.sin(T * 2.2 + p.ph));
        r = U * (1.6 + 1.7 * k);
        col = 'rgba(255,150,74,' + clamp(a, 0, 0.42).toFixed(3) + ')';
      } else {
        a = 0.04 + k * (0.14 + 0.08 * Math.sin(T * 2.2 + p.ph));
        r = U * (2.2 + 2.2 * k);
        col = 'rgba(212,96,44,' + clamp(a, 0, 0.24).toFixed(3) + ')';
      }
      ctx.fillStyle = col;
    } else {
      /* 未燃：分层星雾 —— 宽身暗影 + 亮脊 */
      if (p.layer === 2) {
        a = 0.05 + 0.11 * flick;
        r = U * (1.2 + 0.9 * flick);
        ctx.fillStyle = 'rgba(200,192,176,' + clamp(a, 0, 0.18).toFixed(3) + ')';
      } else if (p.layer === 1) {
        a = 0.05 + 0.12 * flick;
        r = U * (0.9 + 0.6 * flick);
        ctx.fillStyle = 'rgba(205,196,178,' + clamp(a, 0, 0.20).toFixed(3) + ')';
      } else {
        a = 0.07 + 0.15 * flick;
        r = U * (0.7 + 0.5 * flick);
        ctx.fillStyle = 'rgba(215,205,185,' + clamp(a, 0, 0.24).toFixed(3) + ')';
      }
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

/* ================= 绘制 ================= */
function draw() {
  var i;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bgCvs, 0, 0, W, H);
  drawGuideLine();

  /* 齐燃：夜空泛暖橙径向光（1.8s 渐满，之后缓慢呼吸；强度翻倍、覆盖全屏） */
  if (ignited && burstHeat > 0) {
    var k = burstHeat * (0.9 + 0.1 * Math.sin(T * 1.3));
    var g0 = ctx.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, Math.max(W, H) * 0.98);
    g0.addColorStop(0, 'rgba(255,128,48,' + (0.055 * k).toFixed(3) + ')');
    g0.addColorStop(0.55, 'rgba(255,110,40,' + (0.026 * k).toFixed(3) + ')');
    g0.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
  }

  /* 齐燃瞬间一次性光晕脉冲：0.6s 从中央扩散至全屏再淡出（克制、仅一次） */
  if (pulseT >= 0 && !REDUCED) {
    var pk = clamp(pulseT / 0.6, 0, 1);
    var ease = 1 - Math.pow(1 - pk, 3);
    var pr = Math.max(W, H) * 0.78 * ease;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,172,84,' + (0.09 * (1 - pk)).toFixed(3) + ')';
    ctx.lineWidth = U * 30 * (1 - pk * 0.45);
    ctx.beginPath(); ctx.arc(W / 2, H * 0.5, pr, 0, 6.283); ctx.stroke();
  }

  /* 齐燃龙头点睛光晕：缓慢呼吸的暖金焦点（光影高级感） */
  if (ignited && !REDUCED && dragonPts.length >= 18 && burstHeat > 0) {
    var hxb = dragonPts[17][0], hyb = dragonPts[17][1];
    var hk = 0.7 + 0.3 * Math.sin(T * 1.5);
    var hg = ctx.createRadialGradient(hxb, hyb, 0, hxb, hyb, U * 58 * hk);
    hg.addColorStop(0, 'rgba(255,196,116,' + (0.055 * burstHeat * hk).toFixed(3) + ')');
    hg.addColorStop(0.6, 'rgba(255,150,70,' + (0.022 * burstHeat * hk).toFixed(3) + ')');
    hg.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hg; ctx.fillRect(hxb - U * 62, hyb - U * 62, U * 124, U * 124);
  }

  ctx.globalCompositeOperation = 'lighter';

  /* 齐燃龙形金线：万火成形的一瞬，整条龙轮廓亮起再淡出（1.2s） */
  if (fireLine >= 0 && !REDUCED && dragonPts.length >= 18) {
    var fk = 1 - fireLine / 1.2;
    ctx.strokeStyle = 'rgba(255,170,90,' + (0.12 * fk).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, U * 1.2);
    ctx.beginPath();
    ctx.moveTo(dragonPts[0][0], dragonPts[0][1]);
    for (var pi = 1; pi < dragonPts.length; pi++) ctx.lineTo(dragonPts[pi][0], dragonPts[pi][1]);
    ctx.stroke();
  }

  /* 落地光环 */
  for (i = 0; i < rings.length; i++) {
    var rg = rings[i];
    ctx.strokeStyle = 'rgba(255,178,96,' + Math.max(0, rg.a).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, U * 1.5);
    ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, 6.283); ctx.stroke();
  }

  /* 已燃香火：四层光焰（外晕 / 中暖 / 白热核心 / 极细光丝）+ 独立相位呼吸 + 齐燃白热 */
  var bo = 1 + 0.12 * burstHeat;                          /* 齐燃亮度 ×1.12（克制不曝光） */
  for (i = 0; i < incenses.length; i++) {
    var it = incenses[i];
    /* 呼吸幅度 0.7–1.15，每支香独立相位，像火焰在活着 */
    var br = REDUCED
      ? 0.98
      : (ignited
          ? 1.0 + 0.10 * Math.sin(T * 2.6 + it.ph)
          : 0.925 + 0.225 * Math.sin(T * (1.3 + it.seed) + it.ph));
    var sOut = U * 110 * br * (1 + 0.22 * (bo - 1));    /* 外层大光晕（放大 1.45×） */
    ctx.globalAlpha = clamp(0.10 * bo * br, 0, 1);
    ctx.drawImage(SP.haloOut, it.x - sOut / 2, it.y - sOut / 2, sOut, sOut);
    var sMid = sOut * 0.55;                             /* 中层暖光（外层 55%） */
    ctx.globalAlpha = clamp(0.28 * bo * br, 0, 1);
    ctx.drawImage(SP.mid[it.type], it.x - sMid / 2, it.y - sMid / 2, sMid, sMid);
    var sCore = sOut * 0.20;                            /* 内层白热核心（外层 20%） */
    ctx.globalAlpha = clamp(0.92 * br, 0, 1);
    ctx.drawImage(SP.core[it.type], it.x - sCore / 2, it.y - sCore / 2, sCore, sCore);
    /* 极短火舌 1–2 根：贴核心轻舔，取消全局旋转（防密集时成星象连线） */
    if (!REDUCED) {
      var col = TYPES[it.type].mid;
      ctx.strokeStyle = rgba(col, 0.12 * br);
      ctx.lineWidth = Math.max(0.6, U * 0.9);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (var q = 0; q < it.filN; q++) {
        var ang = it.filA[q] + 0.09 * Math.sin(T * 2.1 + q * 1.7 + it.ph);   /* 仅原位轻摆 */
        var len = sCore * (1.2 + 0.8 * it.seed) * (0.85 + 0.15 * Math.sin(T * 3.1 + q + it.ph));
        var r0 = sCore * 0.55;
        ctx.moveTo(it.x + Math.cos(ang) * r0, it.y + Math.sin(ang) * r0);
        ctx.lineTo(it.x + Math.cos(ang) * (r0 + len), it.y + Math.sin(ang) * (r0 + len));
      }
      ctx.stroke();
    }
    if (burstHeat > 0) {                                 /* 齐燃白热 overlay */
      var sW = sCore * 1.8;
      ctx.globalAlpha = clamp(0.30 * burstHeat, 0, 1);
      ctx.drawImage(SP.core[it.type], it.x - sW / 2, it.y - sW / 2, sW, sW);
    }
  }
  ctx.globalAlpha = 1;

  /* 下坠香：细长光柱 + 尾焰 + 亮头 */
  for (i = 0; i < falling.length; i++) {
    var f = falling[i];
    var grad = ctx.createLinearGradient(f.x, f.y - f.len, f.x, f.y);
    grad.addColorStop(0, 'rgba(255,190,110,0)');
    grad.addColorStop(1, 'rgba(255,152,64,0.8)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1.2, U * 2);
    ctx.beginPath(); ctx.moveTo(f.x, f.y - f.len); ctx.lineTo(f.x, f.y); ctx.stroke();
    var hs = U * 14;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(SP.core[f.type], f.x - hs / 2, f.y - hs / 2, hs, hs);
    ctx.globalAlpha = 1;
  }

  /* 火种飞行：从指尖到龙尾，一线星光（点火仪式核心动效） */
  if (ritual && ritual.phase === 'flight') {
    var k2 = clamp(ritual.t / 1.5, 0, 1);
    var ex2 = lerp(ritual.sx, dragonPts[0][0], k2), ey2 = lerp(ritual.sy, dragonPts[0][1], k2);
    var grad2 = ctx.createLinearGradient(ritual.sx, ritual.sy, ex2, ey2);
    grad2.addColorStop(0, 'rgba(255,170,90,0)');
    grad2.addColorStop(1, 'rgba(255,190,110,0.55)');
    ctx.strokeStyle = grad2;
    ctx.lineWidth = Math.max(1.2, U * 1.6);
    ctx.beginPath(); ctx.moveTo(ritual.sx, ritual.sy); ctx.lineTo(ex2, ey2); ctx.stroke();
    var hs2 = U * 12 * (1 + 0.15 * Math.sin(T * 18));
    ctx.globalAlpha = 0.95;
    ctx.drawImage(SP.core[2], ex2 - hs2 / 2, ey2 - hs2 / 2, hs2, hs2);
    ctx.globalAlpha = 1;
  }

  /* 火星（金色小点，闪烁衰减；齐燃火星带 3 段运动反方向渐隐拖尾） */
  for (i = 0; i < sparks.length; i++) {
    var s = sparks[i];
    var fade = 1 - s.age / s.life;
    var fl = 0.65 + 0.35 * Math.sin(T * 22 + s.sz * 9);
    if (s.tail && !REDUCED) {
      for (var q2 = 1; q2 <= 3; q2++) {
        var b1 = q2 * 0.052, b2 = (q2 - 1) * 0.052;
        ctx.strokeStyle = 'rgba(255,' + Math.floor(160 + 70 * fade) + ',70,' + (fade * fl * Math.max(0, 0.42 - q2 * 0.11)).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.5, s.sz * fade * (1.1 - q2 * 0.24));
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * b1, s.y - s.vy * b1);
        ctx.lineTo(s.x - s.vx * b2, s.y - s.vy * b2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,' + Math.floor(150 + 80 * fade) + ',58,' + (fade * 0.9 * fl).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.4, s.sz * fade), 0, 6.283); ctx.fill();
  }

  /* 龙小香 */
  drawGuide();

  /* 烟雾（普通混合，柔和暖灰，低透明） */
  ctx.globalCompositeOperation = 'source-over';
  for (i = 0; i < smokes.length; i++) {
    var m = smokes[i];
    var fd = 1 - m.age / m.life;
    var sz5 = m.r * 2.6;
    ctx.globalAlpha = clamp(m.a * fd, 0, 1);
    ctx.drawImage(SP.smoke, m.x - sz5 / 2, m.y - sz5 / 2, sz5, sz5);
  }
  ctx.globalAlpha = 1;
}

/* ================= 主循环 ================= */
function loop(ts) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  if (!last) last = ts;
  var dt = Math.min(0.045, (ts - last) / 1000) || 0.016;
  last = ts;
  T += dt;
  update(dt);
  draw();
}

/* ================= 状态重置（每次进 P5 都是全新一轮仪式） ================= */
function resetRitual() {
  clearTimers();
  clearTimeout(whisperT);
  incenses = []; falling = []; sparks = []; smokes = []; rings = [];
  fireCount = 0; segCur = 0; ignited = false; bangT = 0; burstHeat = 0; pulseT = -1;
  ritual = null; fireLine = -1;
  for (var dp = 0; dp < dragonParts.length; dp++) { dragonParts[dp].lit = 0; dragonParts[dp].tw = 0; }
  guide.x = W * 0.5; guide.y = H * 0.42; guide.a = 1;
  guide.mode = 'wander'; guide.tgt = null; guide.trail = []; trailLen = 0;
  if (uiProg) { uiProg.textContent = '已燃香 0 / ' + MAX; uiProg.classList.remove('pop'); }
  setHint('点击夜空，引燃龙身 · 九节香火');
  if (uiWhisper) uiWhisper.classList.remove('on');
  if (uiAwake) uiAwake.classList.remove('show');
  if (uiHead) uiHead.classList.remove('fade-out');
  if (uiCredits) {
    uiCredits.classList.remove('dim');
    var ps = uiCredits.querySelectorAll('p');
    for (var i = 0; i < ps.length; i++) ps[i].classList.remove('on');
  }
}

/* ================= 生命周期 ================= */
function build() {
  cvs = document.getElementById('dragonCanvas');
  if (!cvs) return false;
  ctx = cvs.getContext('2d');
  if (!ctx) return false;
  uiProg = document.getElementById('p5Progress');
  uiHint = document.getElementById('p5Hint');
  uiWhisper = document.getElementById('p5Whisper');
  uiCredits = document.getElementById('p5Credits');
  uiAwake = document.getElementById('awakeText');
  uiHead = document.querySelector('#p5 .p5-head');
  buildSprites();

  if (!_bound) {
    if (window.PointerEvent) {
      /* PointerEvent：一次手势只触发一次，天然去重 */
      cvs.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        onTap(e);
      }, { passive: false });
    } else {
      /* 旧浏览器：touch + click 双通道去重 */
      var lt = 0, lx = 0, ly = 0;
      cvs.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        lt = Date.now(); lx = t.clientX; ly = t.clientY;
        onTap({ clientX: t.clientX, clientY: t.clientY });
      }, { passive: true });
      cvs.addEventListener('click', function (e) {
        if (Date.now() - lt < 700 && Math.abs(e.clientX - lx) < 36 && Math.abs(e.clientY - ly) < 36) return;
        onTap(e);
      });
    }
    _bound = true;
  }

  resize();
  built = true;
  return true;
}

function start() {
  if (!built && !build()) return;
  var pt = pendingTap; pendingTap = null;
  running = true; last = 0;      /* 先置位：resetRitual 期间到达的点击也认 */
  resetRitual();                 /* 全新一轮：切回 P5 状态归零 */
  if (!raf) raf = requestAnimationFrame(loop);
  /* 补执行进屏时被吞掉的那一次点火（仅认暂存有效期内的） */
  if (pt && Date.now() - pt.t < READY_MS) tapAt(pt.x, pt.y);
}

function stop() {
  running = false;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}

function onResize() { if (built && cvs) resize(); }

function debug() {
  var tailN = 0;
  for (var i = 0; i < sparks.length; i++) if (sparks[i].tail) tailN++;
  return {
    built: built, running: running,
    fire: fireCount, max: MAX, ignited: ignited,
    sparks: sparks.length, tailSparks: tailN, smokes: smokes.length,
    guide: guide.mode, W: W, H: H, reduced: REDUCED
  };
}

/* 进入页面：重播文字入场浮现（位置不动，仅 opacity 淡入） */
function enterPage() {
  var els = [];
  if (uiAwake) els.push(uiAwake);
  if (uiCredits) for (var i = 0; i < uiCredits.children.length; i++) els.push(uiCredits.children[i]);
  var seal = document.querySelector('.p5-seal-mid');
  if (seal) els.push(seal);
  for (var j = 0; j < els.length; j++) {
    els[j].classList.remove('p5-in');
    void els[j].offsetWidth;
    els[j].classList.add('p5-in');
  }
}
window.P5Fire = { build: build, start: start, stop: stop, onResize: onResize, debug: debug, enterPage: enterPage };
})();
