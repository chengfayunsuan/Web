/* ============================================================
   Chengfa · 后台审核中心
   提现与兑换订单合并到一页，这里只管两件事：
   1) 一级标签切换（提现 / 兑换）
   2) 把两个模块各自算出的待办数汇总到页头与标签上
   业务逻辑仍在 admin.js（提现）与 admin-shop.js（订单）里。
   ============================================================ */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var wdBox = $('wdPending');
  var ordBox = $('ordPending');
  var total = $('rvPending');
  var wdN = $('rvWdN');
  var ordN = $('rvOrdN');

  function num(el) {
    if (!el) return 0;
    var v = parseInt(String(el.textContent || '').replace(/[^0-9]/g, ''), 10);
    return isNaN(v) ? 0 : v;
  }

  /* 两个模块各自异步写自己的待办数，这里跟着它们的文本变化汇总 */
  function sync() {
    var a = num(wdBox);
    var b = num(ordBox);

    if (total) total.textContent = String(a + b);
    if (wdN) { wdN.textContent = String(a); wdN.hidden = a === 0; }
    if (ordN) { ordN.textContent = String(b); ordN.hidden = b === 0; }
  }

  [wdBox, ordBox].forEach(function (el) {
    if (!el || !window.MutationObserver) return;
    new MutationObserver(sync).observe(el, {
      childList: true, characterData: true, subtree: true
    });
  });

  var tabs = document.querySelectorAll('[data-rv]');
  var wdPanel = $('rvWdPanel');
  var ordPanel = $('rvOrdPanel');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('is-on'); });
      tab.classList.add('is-on');

      var k = tab.getAttribute('data-rv');
      if (wdPanel) wdPanel.hidden = k !== 'wd';
      if (ordPanel) ordPanel.hidden = k !== 'ord';

      /* 切过去时把面板带到视口内，手机上不至于停在空白处 */
      var panel = k === 'wd' ? wdPanel : ordPanel;
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  });

  sync();
})();
