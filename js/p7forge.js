/* ============================================================
 * p7forge.js — 第 7 屏「会展 · 铸龙工坊」交互与视觉引擎
 *
 * 设计原则：东方非遗神圣感，非赛博科技
 *  - 中央「香火为魂」朱砂金印方印（沿龙脊方向的星火点阵）
 *  - 9 个选项均为「图片占位框」：data-img 非空显示真图，否则显示
 *    「香火铸形 · 待传图」；用户后期传图即可替换，不改 JS
 *  - 生成 → 金光汇聚 → 弹出暗金相框照片占位（待上传真图替换）
 *  - 全屏香火浮尘 + 底部暗角，氛围克制
 *  - 性能：CSS 驱动；尊重 prefers-reduced-motion
 * ============================================================ */
(function () {
'use strict';

var $  = function (s, c) { return (c || document).querySelector(s); };
var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ============================================================
 * 一、ForgeDragon — 状态机
 * ============================================================ */
var ForgeDragon = {
  _stage: null,
  _atmo:  null,

  /* ---------- 初始化 ---------- */
  init: function () {
    if (!$('#p7')) return;
    this._fillThumbs();
    this._buildStage();
    this._bind();
    this.reset();
  },

  /* ---------- 占位缩略图：图片占位框 + data-img 换图接口 ----------
   * .opt-thumb 默认空框：四角回纹 + 极淡占位字「香火铸形 · 待传图」
   * 若 .opt-thumb 上有 data-img="assets/images/xxx.jpg"，则用
   * <img class="opt-img"> 铺满占位框；图片加载失败时自动回退占位
   * 整个三步共 9 个选项一视同仁，无任何插画/SVG/字符图
   */
  _fillThumbs: function () {
    $$('#p7 .opt').forEach(function (opt) {
      var th = opt.querySelector('.opt-thumb');
      if (!th || th._done) return;
      th._done = true;
      th.innerHTML = '';

      var imgPath = (th.getAttribute('data-img') || '').trim();
      if (imgPath) {
        var img = document.createElement('img');
        img.className = 'opt-img';
        img.alt = opt.dataset.val || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('load', function () { th.classList.add('has-img'); });
        img.addEventListener('error', function () {
          /* 真图加载失败 → 退回占位（断网/路径错都安全） */
          th.classList.remove('has-img');
          th.classList.add('opt-thumb-fb');
          th.innerHTML = '';
          th.appendChild(phEl());
        });
        th.classList.add('has-img');
        img.src = imgPath;
        th.appendChild(img);
      } else {
        th.classList.add('opt-thumb-fb');
        th.appendChild(phEl());
      }
    });

    function phEl() {
      var s = document.createElement('span');
      s.className = 'opt-thumb-ph';
      s.textContent = '香火铸形 · 待传图';
      return s;
    }
  },

  /* ---------- 铸造台：方印 + 沿龙脊星火点阵（无具象龙形） ---------- */
  _buildStage: function () {
    this._stage = $('#gdStage');
    if (!this._stage) return;
    this._stage.className = 'gd-stage waiting';
    this._stage.innerHTML =
      '<div class="gd-altar" aria-hidden="true">' +
        '<span class="gd-altar-seal"><i>香</i><i>火</i><i>为</i><i>魂</i></span>' +
      '</div>';

    /* 浮尘：全屏微光上浮，仅注入一次 */
    if (!this._atmo && $('#p7')) {
      this._atmo = document.createElement('div');
      this._atmo.className = 'p7-atmo';
      this._atmo.setAttribute('aria-hidden', 'true');
      var h = '';
      for (var i = 0; i < 8; i++) h += '<i style="--i:' + i + '"></i>';
      this._atmo.innerHTML = h;
      $('#p7').appendChild(this._atmo);
    }
  },

  /* ---------- 事件绑定 ---------- */
  _bind: function () {
    var self = this;
    $$('#p7 .step .opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var step = opt.closest('.step');
        if (!step) return;
        self.pick(parseInt(step.dataset.step, 10), opt.dataset.val, opt);
      });
    });
    var gen = $('#gdGenBtn');
    if (gen) gen.addEventListener('click', function () { self.cast(); });
    var exp = $('#gdExperience');
    if (exp) exp.addEventListener('click', function () { self.experience(); });

    /* 照片弹窗关闭时撤销专属样式（避免影响后续其它弹窗） */
    var modalEl = $('#modal');
    if (modalEl && !modalEl._p7hook) {
      modalEl._p7hook = true;
      modalEl.addEventListener('click', function (e) {
        var isClose = e.target === modalEl ||
          (e.target.closest && e.target.closest('.modal-close'));
        if (!isClose) return;
        var mb = modalEl.querySelector('.modal-box');
        if (mb) mb.classList.remove('gd-photo-modal');
      });
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { self.visible = e.isIntersecting; });
      }, { threshold: .08 });
      io.observe($('#p7'));
    }
  },

  /* ---------- 状态：重置 ---------- */
  reset: function () {
    this.picks = [null, null, null];
    this.ready = false; this.done = false; this.casting = false;

    $$('#p7 .opt').forEach(function (o) { o.classList.remove('sel', 'tap'); });
    var steps = $$('#p7 .step');
    if (steps[1]) steps[1].classList.add('locked');
    if (steps[2]) steps[2].classList.add('locked');

    var pi = $$('#wbProg .wb-prog-i');
    pi.forEach(function (p) { p.classList.remove('on', 'done'); });
    if (pi[0]) pi[0].classList.add('on');
    $$('#wbProg .wb-prog-line').forEach(function (l) { l.classList.remove('on'); });

    var pvLine = $('#pvLine'); if (pvLine) pvLine.textContent = '已选：＿ · ＿ · ＿';
    var pvHead = $('#pvHead'); if (pvHead) pvHead.textContent = '三步铸龙 · 一念成形';
    var pvTap  = $('#pvTap');  if (pvTap)  pvTap.textContent  = '轻触上方卡片 · 开启第一步';

    var ph = $('#gdPvPh'); if (ph) ph.style.display = '';
    var dn = $('#gdPvDone'); if (dn) dn.classList.remove('show');
    var gl = $('#gdLine'); if (gl) gl.textContent = '';
    var gn = $('#gdNo');   if (gn) gn.textContent = '';

    var btn = $('#gdGenBtn'); if (btn) btn.classList.remove('ready', 'casting');
    var pv  = $('#gdPv');     if (pv)  pv.classList.remove('lifting', 'forging', 'done-state');
    var mb  = $('#modal .modal-box'); if (mb) mb.classList.remove('gd-photo-modal');

    if (this._stage) {
      this._stage.className = 'gd-stage waiting';
      this._stage.innerHTML =
        '<div class="gd-altar" aria-hidden="true">' +
          '<span class="gd-altar-seal"><i>香</i><i>火</i><i>为</i><i>魂</i></span>' +
        '</div>';
    }
  },

  /* ---------- 状态：选择 ---------- */
  pick: function (stepIdx, val, btn) {
    if (this.done || this.casting) {
      /* 已铸成后再点：开启新一轮 */
      this.reset();
    }
    this.picks[stepIdx] = val;

    var step = $$('#p7 .step')[stepIdx];
    if (step) {
      $$('.opt', step).forEach(function (o) { o.classList.remove('sel'); });
      btn.classList.add('sel');
    }
    /* 涟漪反馈 */
    btn.classList.remove('tap'); void btn.offsetWidth; btn.classList.add('tap');

    var next = $$('#p7 .step')[stepIdx + 1];
    if (next && stepIdx < 2) next.classList.remove('locked');

    /* 进度条 */
    var pi = $$('#wbProg .wb-prog-i');
    pi.forEach(function (p, i) {
      p.classList.remove('on');
      if (i <= stepIdx) p.classList.add('done');
      if (i === stepIdx + 1) p.classList.add('on');
    });
    var lines = $$('#wbProg .wb-prog-line');
    if (lines[stepIdx]) lines[stepIdx].classList.add('on');

    /* 实时已选 */
    var filled = this.picks.filter(function (p) { return !!p; }).length;
    var pvLine = $('#pvLine');
    if (pvLine) {
      pvLine.textContent = '已选：' + this.picks.map(function (p) { return p || '＿'; }).join(' · ');
    }
    var pvTap = $('#pvTap');
    if (pvTap) {
      pvTap.textContent = ['已定骨架 · 请择材料', '已定材料 · 请定龙头', '三步皆成 · 请落铸龙印'][stepIdx] || pvTap.textContent;
    }

    /* 方印随步渐亮 */
    if (this._stage) {
      this._stage.style.setProperty('--reveal', String(0.3 + filled * 0.2));
      if (filled >= 3) this._stage.classList.add('lit');
      else this._stage.classList.remove('lit');
    }

    if (filled >= 3) {
      this.ready = true;
      var b = $('#gdGenBtn');
      if (b) b.classList.add('ready');
      var pv = $('#gdPv');
      if (pv) pv.classList.add('lifting');
      var pvHead = $('#pvHead');
      if (pvHead) pvHead.textContent = '三步铸龙 · 一念成形';
      try { window.Audio && window.Audio.chime && window.Audio.chime(); } catch (e) {}
    } else {
      var pv2 = $('#gdPv');
      if (pv2) pv2.classList.remove('lifting');
      try { window.Audio && window.Audio.tick && window.Audio.tick(); } catch (e) {}
    }
  },

  /* ---------- 状态：铸龙 ----------
   * 第一拍（≈760ms）：方印吸光摆动 + 星火向心收拢 + 锻造台金环脉动
   * 第二拍：金光爆开 + 弹出暗金相框（照片占位）
   */
  cast: function () {
    if (!this.ready || this.casting || this.done) return;
    this.casting = true;

    var pv = $('#gdPv');
    if (pv) pv.classList.add('forging');
    if (this._stage) {
      this._stage.className = 'gd-stage waiting absorb';
      this._stage.style.setProperty('--reveal', '1');
    }
    var btn = $('#gdGenBtn');
    if (btn) btn.classList.add('casting');
    var tap = $('#pvTap');
    if (tap) tap.textContent = '香火汇聚 · 龙形渐成';

    var self = this;
    setTimeout(function () {
      if (self._stage) {
        self._stage.classList.remove('absorb');
        self._stage.classList.add('cast');
      }
      var ph = $('#gdPvPh'); if (ph) ph.style.display = 'none';
      var dn = $('#gdPvDone'); if (dn) dn.classList.add('show');
      self._writeDone();
      self._openPhoto();
    }, REDUCED ? 90 : 760);

    setTimeout(function () {
      self.casting = false;
      self.done = true;
      if (pv) pv.classList.remove('forging'), pv.classList.add('done-state');
      if (btn) btn.classList.remove('casting');
    }, REDUCED ? 320 : 1180);
  },

  /* 弹出暗金相框（占位，后期上传真图替换） */
  _openPhoto: function () {
    var picks = this.picks || [null, null, null];
    var line = '你的草龙：' + picks.join(' · ');
    var no = 'No.' + (Math.floor(Math.random() * 9000) + 1000);
    var html =
      '<div class="gd-photo-frame">' +
        '<div class="gd-photo-box">' +
          '<span class="gd-photo-ph">香火铸形 · 照片待上传</span>' +
        '</div>' +
        '<div class="gd-photo-cap">汝城香火龙 · 你的定制草龙</div>' +
      '</div>' +
      '<p class="gd-photo-line">' + line + '</p>' +
      '<p class="gd-photo-no">' + no + '</p>' +
      '<p class="gd-photo-tip">◈ 后期将在此展示你的草龙实拍图</p>';
    if (window.Modal) window.Modal.open(html);
    /* 给该次弹窗打标：去掉玻璃拟态，改沉稳暗金（只作用于相框弹窗） */
    var mb = $('#modal .modal-box');
    if (mb) mb.classList.add('gd-photo-modal');
  },

  _writeDone: function () {
    var line = $('#gdLine');
    if (line) line.textContent = '你的草龙：' + this.picks.join(' · ');
    var no = $('#gdNo');
    if (no) no.textContent = 'No.' + (Math.floor(Math.random() * 9000) + 1000);
  },

  /* 「我要体验」弹窗 */
  experience: function () {
    if (window.Modal) {
      window.Modal.open(
        '<p style="font-family:var(--serif);color:#ffd49a;letter-spacing:6px;margin-bottom:12px;font-size:18px">体验工坊</p>' +
        '<p style="font-size:14px;line-height:2;color:#f4ebd8">会展现场可亲手扎制迷你草龙：稻草、麻绳、龙香，三步成龙。<br>线上定制的这条草龙，也请带去现场点亮。</p>'
      );
    }
  }
};

window.ForgeDragon = ForgeDragon;

/* ============================================================
 * 二、启动
 * ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { ForgeDragon.init(); });
} else {
  ForgeDragon.init();
}

})();
