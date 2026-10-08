/* ambient-fire.js —— 全站香火微光氛围层
   职责：整部作品上浮的暖金光尘 + 极淡的远火光晕，制造"火在呼吸"的空间感。
   约束：纯本地零依赖、极低透明度不干扰阅读、尊重 prefers-reduced-motion、console 零报错。
   用法：index.html 中 <canvas id="ambientFire"> 已就位，本文件在 features.js 之前加载。 */
(function () {
  'use strict';
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = document.getElementById('ambientFire');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;

    var W = 0, H = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var DUST = 14, HALOS = 2;                 /* 光尘数量刻意少：极淡才是氛围 */
    var dust = [], halos = [], raf = 0, running = true;
    var t0 = performance.now();
    var rand = function (a, b) { return a + Math.random() * (b - a); };

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawnDust(init) {
      return {
        x: rand(0, W), y: init ? rand(0, H) : H + rand(10, 60),
        r: rand(1.2, 3.6),
        vx: rand(-0.08, 0.08), vy: rand(-0.22, -0.08),
        ph: rand(0, 6.28), sp: rand(0.4, 0.9),
        ba: rand(0.028, 0.07)                 /* 基础透明度：肉眼几乎不可见 */
      };
    }

    function spawnHalo() {
      return {
        x: rand(0.15, 0.85) * W, y: rand(0.2, 0.8) * H,
        r: rand(50, 110),
        vx: rand(-0.06, 0.06), vy: rand(-0.05, 0.03),
        ph: rand(0, 6.28), sp: rand(0.25, 0.5),
        ba: rand(0.012, 0.022)
      };
    }

    resize();
    var i, j;
    for (i = 0; i < DUST; i++) dust.push(spawnDust(true));
    for (j = 0; j < HALOS; j++) halos.push(spawnHalo());

    window.addEventListener('resize', function () { try { resize(); } catch (e) {} });

    function frame(ts) {
      if (!running) return;
      var t = (ts - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      /* 远火光晕：极淡大光团缓缓漂移——"远处有火在烧"的空间纵深 */
      for (var h = 0; h < halos.length; h++) {
        var hh = halos[h];
        hh.x += hh.vx; hh.y += hh.vy;
        if (hh.x < -hh.r) hh.x = W + hh.r; else if (hh.x > W + hh.r) hh.x = -hh.r;
        if (hh.y < -hh.r) hh.y = H + hh.r; else if (hh.y > H + hh.r) hh.y = -hh.r;
        var ha = hh.ba * (0.65 + 0.35 * Math.sin(t * hh.sp + hh.ph));
        if (ha <= 0.003) continue;
        var g = ctx.createRadialGradient(hh.x, hh.y, 0, hh.x, hh.y, hh.r);
        g.addColorStop(0, 'rgba(255,150,70,' + ha.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,150,70,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hh.x, hh.y, hh.r, 0, 6.283); ctx.fill();
      }

      /* 香火微光尘：上浮 + 漂移 + 明暗呼吸（每一粒都是"活"的火） */
      ctx.fillStyle = '#ffbe78';
      for (var d = 0; d < dust.length; d++) {
        var p = dust[d];
        p.x += p.vx; p.y += p.vy;
        if (p.y < -20) { dust[d] = spawnDust(false); continue; }
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        var a = p.ba * (0.55 + 0.45 * Math.sin(t * p.sp + p.ph));
        if (a <= 0.004) continue;
        ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }

    function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    raf = requestAnimationFrame(frame);
  } catch (e) {
    /* 氛围层失败绝不阻塞主站 */
  }
})();
