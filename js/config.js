/* ============================================================
   Chengfa · 全站可配置项

   全站只有一种货币：XD（乘法刀），100 XD = 1 USD。
   接口返回的所有金额都已经是 XD 数值，前端直接显示，不再做汇率换算。

   带 data-cur 的节点由本文件统一套用：
     data-cur="amount"  金额，原始 XD 值存 data-cfb
     data-cur="code"    币种单位，固定 XD
     data-cur="name"    固定显示中文名（乘法刀）
     data-cur="cash"    对应的法币（美元）
     data-cur="pair"    多少单位换 1 法币（100）
   动态插入的节点由 MutationObserver 自动接管，渲染方不用手动刷新。
   ============================================================ */
(function () {
  var CODE = 'XD';
  var NAME = '乘法刀';

  /* 1 美元 = 100 乘法刀。只用于展示「100 XD = 1 美元」这类说明。 */
  var XD_PER_USD = 100;

  var FX_KEY = 'cf-fx';
  var FX_DEFAULT = 7.0;

  function loadFx() {
    try {
      var s = JSON.parse(localStorage.getItem(FX_KEY) || 'null');
      if (s && Number(s.rate) > 0) return Number(s.rate);
    } catch (e) {}
    return FX_DEFAULT;
  }

  function trim(s) {
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  /* 金额显示：入参已经是 XD 数值。
     全站展示只留 1 位小数：库里的账目是 4 位精度（FC_SCALE=10000），
     但 0.0001 这种尾巴对用户没意义，反而让每一笔都变长。
     传 digits 可以再往下压（兑换商品按整数 XD 定价，传 0），但不能超过 1。 */
  function money(v, digits) {
    var n = Number(v) || 0;
    /* 收支明细按 4 位小数原样展示（库内精度就是 4 位），既不舍入也不省略末尾零 */
    if (Number(digits) === 4) return n.toFixed(4);
    var d = digits == null ? 1 : Number(digits);
    if (!(d >= 0)) d = 1;
    if (d > 1) d = 1;
    return trim(n.toFixed(d));
  }

  /* 兼容旧调用：现在入参出参都是 XD，原样返回 */
  function toBase(v) {
    return Number(v) || 0;
  }

  /* 单个节点套用 */
  function applyOne(el) {
    if (!el || el.nodeType !== 1) return;
    var key = el.getAttribute('data-cur');
    if (!key) return;

    if (key === 'amount') {
      if (!el.hasAttribute('data-cfb')) return;
      var raw = Number(el.getAttribute('data-cfb')) || 0;
      var signed = el.getAttribute('data-signed') === '1';
      var digits = el.getAttribute('data-cur-digits');
      var txt = money(signed ? Math.abs(raw) : raw, digits == null ? null : Number(digits));
      if (signed) txt = (raw < 0 ? '−' : '+') + txt;
      el.textContent = txt;
    } else if (key === 'code') {
      el.textContent = CODE;
    } else if (key === 'name') {
      el.textContent = NAME;
    } else if (key === 'cash') {
      el.textContent = document.documentElement.lang === 'en' ? 'USD' : '美元';
    } else if (key === 'pair') {
      el.textContent = String(XD_PER_USD);
    }
  }

  /* 币种 / 显示形式开关已下线：隐藏页面上残留的入口，免得点了没反应 */
  function hideLegacyToggles(root) {
    var els = (root || document).querySelectorAll('[data-cur-toggle],[data-cur-style]');
    for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
  }

  function apply(root) {
    window.CF.currency = { mode: 'XD', code: CODE, name: NAME, style: 'code' };
    hideLegacyToggles(root);
    var nodes = (root || document).querySelectorAll('[data-cur]');
    for (var i = 0; i < nodes.length; i++) applyOne(nodes[i]);
  }

  /* ---------- 动态节点自动接管 ----------
     页面渲染常发生在初始化之后，手动调 refresh 容易漏。
     这里直接盯新增节点，凡带 data-cur 立即套用。 */

  function watchDynamic() {
    if (!window.MutationObserver) return;

    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var added = list[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (!n.getAttribute) continue;
          if (n.getAttribute('data-cur-toggle') != null || n.getAttribute('data-cur-style') != null) {
            n.style.display = 'none';
            continue;
          }
          if (n.hasAttribute && n.hasAttribute('data-cur')) applyOne(n);
          if (n.querySelectorAll) {
            var kids = n.querySelectorAll('[data-cur]');
            for (var q = 0; q < kids.length; q++) applyOne(kids[q]);
          }
        }
      }
    });

    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* 汇率接口保留：/api/fx 仍可用，前端不再拿它换算金额 */
  function loadRate() {
    fetch('/api/fx', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        var v = Number(d.usdCny);
        if (!(v > 0)) return;
        try { localStorage.setItem(FX_KEY, JSON.stringify({ rate: v, at: Date.now() })); } catch (e) {}
        window.CF.rate = v;
      })
      .catch(function () {});
  }

  var listeners = [];

  window.CF = {
    currency: { mode: 'XD', code: CODE, name: NAME, style: 'code' },
    rate: loadFx(),
    /* 1 美元等于多少 XD */
    xdPerUsd: XD_PER_USD,
    /* 金额显示：传 XD 值，返回同样口径的数字字符串 */
    money: money,
    /* 金额录入：入参出参都是 XD */
    toBase: toBase,
    /* 给金额节点标记 XD 值，并立即套用当前显示 */
    amount: function (el, v, digits) {
      if (!el) return;
      el.setAttribute('data-cfb', v == null ? '0' : String(v));
      el.setAttribute('data-cur', 'amount');
      if (digits != null) el.setAttribute('data-cur-digits', String(digits));
      el.textContent = money(v, digits);
    },
    /* 旧接口保留为无操作，避免老页面调用报错 */
    setCurrency: function () { apply(); },
    toggleCurrency: function () { apply(); },
    setStyle: function () { apply(); },
    bindToggles: function () { hideLegacyToggles(); },
    bindStyleButtons: function () { hideLegacyToggles(); },
    refresh: apply,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    loadRate: loadRate
  };

  var rawApply = apply;
  apply = function (root) {
    rawApply(root);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](window.CF.currency.mode); } catch (e) {}
    }
  };
  window.CF.refresh = apply;

  function boot() {
    apply();
    watchDynamic();
    loadRate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
