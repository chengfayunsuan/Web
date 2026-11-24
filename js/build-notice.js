/* ============================================================
   Chengfa · 建设中公告
   所有页面统一弹一次，关掉后 7 天内不再打扰。
   独立文件：落地页不加载 core.js，这里不依赖任何其它脚本。
   中英按路径自动分：/en 开头的出英文。
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'cf-build-notice-v1';      /* 改版本号 = 让所有人重新看到一次 */
  var DAYS = 7;

  /* 后台不弹，免得自己干活被挡 */
  if (location.pathname.indexOf('/admin') === 0) return;

  var EN = /^\/en(\/|$)/.test(location.pathname);

  /* 已经关过且未过期 */
  try {
    var seen = parseInt(localStorage.getItem(KEY) || '0', 10);
    if (seen && Date.now() - seen < DAYS * 86400000) return;
  } catch (e) { /* 隐私模式下 localStorage 会抛错，照常弹一次 */ }

  var TXT = EN ? {
    kicker: 'NOTICE',
    title: 'Site under construction',
    lead: 'We are still building.',
    body: 'Signing up, email verification, the survey walls and withdrawals all work, '
        + 'but the site is still being polished. If something breaks, open a ticket — we read every one.',
    btn: 'Got it'
  } : {
    kicker: '公告',
    title: '网站正在建设中',
    lead: '部分功能仍在补齐。',
    body: '注册、邮箱验证、问卷墙、兑换与提现已经能正常使用，但整体仍在打磨。'
        + '遇到问题请提交工单，每一条都会看。',
    btn: '我知道了'
  };

  var CSS = ''
    + '.bn-back{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;'
    + 'justify-content:center;padding:20px;background:rgba(22,20,16,.62);'
    + '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);'
    + 'opacity:0;transition:opacity .22s ease}'
    + '.bn-back.bn-in{opacity:1}'
    + '.bn{position:relative;width:100%;max-width:560px;max-height:calc(100vh - 40px);'
    + 'box-sizing:border-box;overflow-y:auto;background:#F5F1E8;color:#1C1A16;'
    + 'border:2px solid #1C1A16;box-shadow:10px 10px 0 rgba(28,26,22,.22);'
    + 'padding:38px 34px 30px;transform:translateY(14px) scale(.985);'
    + 'transition:transform .26s cubic-bezier(.2,.9,.25,1)}'
    + '.bn-back.bn-in .bn{transform:none}'
    + '.bn__k{display:inline-block;font:700 11px/1 ui-monospace,Menlo,monospace;'
    + 'letter-spacing:.22em;text-transform:uppercase;color:#8A8377;margin-bottom:16px}'
    + '.bn__ico{font-size:34px;line-height:1;display:block;margin-bottom:14px}'
    + '.bn__t{margin:0;font-size:clamp(30px,8vw,52px);line-height:1.02;'
    + 'font-weight:900;letter-spacing:-.03em}'
    + '.bn__lead{margin:14px 0 0;font-size:clamp(15px,3.6vw,19px);font-weight:700;'
    + 'color:#E0291E;letter-spacing:.01em}'
    + '.bn__d{margin:16px 0 0;font-size:14px;line-height:1.85;color:#3A362D}'
    + '.bn__foot{margin-top:26px;display:flex;justify-content:flex-end}'
    + '.bn__btn{appearance:none;border:2px solid #1C1A16;background:#1C1A16;color:#F5F1E8;'
    + 'font:700 14px/1 inherit;letter-spacing:.06em;padding:14px 30px;cursor:pointer;'
    + 'transition:background .15s,color .15s}'
    + '.bn__btn:hover{background:#E0291E;border-color:#E0291E;color:#fff}'
    + '.bn__x{position:absolute;top:12px;right:14px;width:34px;height:34px;'
    + 'border:0;background:none;font-size:22px;line-height:1;color:#8A8377;'
    + 'cursor:pointer;padding:0}'
    + '.bn__x:hover{color:#1C1A16}'
    + '@media(max-width:480px){.bn{padding:30px 22px 24px}'
    + '.bn__foot{justify-content:stretch}.bn__btn{width:100%;padding:16px}}';

  function mount() {
    var style = document.createElement('style');
    style.id = 'build-notice-css';
    style.appendChild(document.createTextNode(CSS));
    document.head.appendChild(style);

    var back = document.createElement('div');
    back.className = 'bn-back';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-label', TXT.title);

    var box = document.createElement('div');
    box.className = 'bn';

    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'bn__x';
    x.setAttribute('aria-label', EN ? 'Close' : '关闭');
    x.textContent = '×';

    var k = document.createElement('span');
    k.className = 'bn__k';
    k.textContent = TXT.kicker;

    var ico = document.createElement('span');
    ico.className = 'bn__ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = '📢';

    var t = document.createElement('h2');
    t.className = 'bn__t';
    t.textContent = TXT.title;

    var lead = document.createElement('p');
    lead.className = 'bn__lead';
    lead.textContent = TXT.lead;

    var d = document.createElement('p');
    d.className = 'bn__d';
    d.textContent = TXT.body;

    var foot = document.createElement('div');
    foot.className = 'bn__foot';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bn__btn';
    btn.textContent = TXT.btn;

    box.appendChild(x);
    box.appendChild(k);
    box.appendChild(ico);
    box.appendChild(t);
    box.appendChild(lead);
    box.appendChild(d);
    foot.appendChild(btn);
    box.appendChild(foot);
    back.appendChild(box);
    document.body.appendChild(back);

    /* 先渲染一帧再加 bn-in，否则过渡不会触发 */
    requestAnimationFrame(function () { back.classList.add('bn-in'); });

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
      back.classList.remove('bn-in');
      setTimeout(function () {
        if (back.parentNode) back.parentNode.removeChild(back);
      }, 220);
      document.removeEventListener('keydown', onKey);
    }

    function onKey(ev) {
      if (ev.key === 'Escape' || ev.key === 'Enter') close();
    }

    x.addEventListener('click', close);
    btn.addEventListener('click', close);
    back.addEventListener('click', function (ev) {
      if (ev.target === back) close();
    });
    document.addEventListener('keydown', onKey);
    btn.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
