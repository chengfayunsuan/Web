/* ============================================================
   Chengfa · 建设中公告 + 匿名建议
   - 每次打开站点弹一次（30 分钟内不重复），关掉只是这次不看了
   - 「以后不再显示」写 localStorage，永久静音
   - 内置建议输入框：不登录、不填邮箱、不填 UID，直接发文字
   - 落地页不加载 core.js，所以这个文件完全自包含
   ============================================================ */
(function () {
  'use strict';

  var KEY_AT = 'cf-build-notice-at';    /* 上次弹出的时间 */
  var KEY_OFF = 'cf-build-notice-off';  /* 以后不再显示 */
  var GAP = 30 * 60 * 1000;             /* 30 分钟内不重复弹 */

  /* 后台不弹，免得自己干活被挡 */
  if (location.pathname.indexOf('/admin') === 0) return;

  try {
    if (localStorage.getItem(KEY_OFF) === '1') return;
    var at = parseInt(localStorage.getItem(KEY_AT) || '0', 10);
    if (at && Date.now() - at < GAP) return;
  } catch (e) { /* 隐私模式：localStorage 会抛错，照常弹一次 */ }

  var EN = /^\/en(\/|$)/.test(location.pathname);

  var TXT = EN ? {
    kicker: 'NOTICE',
    title: 'Site under construction',
    lead: 'We are still building.',
    body: 'Signing up, email verification, the survey walls and withdrawals all work, '
        + 'but the site is still being polished. Tell us what is broken or missing — '
        + 'no account needed.',
    ok: 'Got it',
    suggest: 'Send a suggestion',
    never: 'Do not show again',
    formTitle: 'What should we fix?',
    formHint: 'A sentence is enough. You do not need to sign in, and we cannot reply, '
            + 'so leave an email in the text if you want an answer.',
    placeholder: 'Something felt broken when…',
    submit: 'Send',
    sending: 'Sending…',
    back: 'Back',
    doneTitle: 'Got it — thank you.',
    doneBody: 'We read every message. It goes straight to the owner.',
    doneBtn: 'Close',
    tooShort: 'A couple more characters, please.',
    tooMany: 'Sent a few already — try again in 10 minutes.',
    failed: 'Could not send. Try again in a moment.',
    netFail: 'Network error. Try again in a moment.'
  } : {
    kicker: '公告',
    title: '网站正在建设中',
    lead: '部分功能仍在补齐。',
    body: '注册、邮箱验证、问卷墙、兑换与提现已经能正常使用，但整体仍在打磨。'
        + '哪里不好用、想要什么功能，直接说一句就行，不用注册也不用留邮箱。',
    ok: '我知道了',
    suggest: '提个建议',
    never: '以后不再显示',
    formTitle: '哪里需要改？',
    formHint: '一句话就够。不用登录，我们也没法回复你；想要回音就在文字里留个邮箱。',
    placeholder: '比如：兑换页的按钮点了没反应……',
    submit: '发送',
    sending: '发送中…',
    back: '返回',
    doneTitle: '收到了，谢谢。',
    doneBody: '每一条都会看，直接到站长手里。',
    doneBtn: '关闭',
    tooShort: '再多写几个字。',
    tooMany: '刚发过了，10 分钟后再来。',
    failed: '没发出去，稍后再试。',
    netFail: '网络连接失败，稍后再试。'
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
    + 'padding:38px 34px 26px;transform:translateY(14px) scale(.985);'
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
    + '.bn__foot{margin-top:26px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}'
    + '.bn__btn{appearance:none;border:2px solid #1C1A16;background:#1C1A16;color:#F5F1E8;'
    + 'font:700 14px/1 inherit;letter-spacing:.06em;padding:14px 30px;cursor:pointer;'
    + 'transition:background .15s,color .15s,border-color .15s}'
    + '.bn__btn:hover{background:#E0291E;border-color:#E0291E;color:#fff}'
    + '.bn__btn[disabled]{opacity:.5;cursor:default}'
    + '.bn__btn--ghost{background:none;color:#1C1A16;border-color:#1C1A16;'
    + 'padding:13px 20px;font-weight:700}'
    + '.bn__btn--ghost:hover{background:#1C1A16;color:#F5F1E8;border-color:#1C1A16}'
    + '.bn__never{appearance:none;border:0;background:none;padding:6px 0;margin-top:14px;'
    + 'cursor:pointer;font:400 12px/1 inherit;color:#8A8377;text-decoration:underline;'
    + 'text-underline-offset:3px}'
    + '.bn__never:hover{color:#1C1A16}'
    + '.bn__sp{flex:1 1 auto}'
    + '.bn__x{position:absolute;top:12px;right:14px;width:34px;height:34px;'
    + 'border:0;background:none;font-size:22px;line-height:1;color:#8A8377;'
    + 'cursor:pointer;padding:0}'
    + '.bn__x:hover{color:#1C1A16}'
    + '.bn__ft{display:flex;align-items:baseline;justify-content:space-between;'
    + 'margin:8px 0 0;font-size:11.5px;color:#8A8377}'
    + '.bn__ta{width:100%;box-sizing:border-box;min-height:118px;resize:vertical;'
    + 'border:1.5px solid #1C1A16;background:#FBF8F1;color:#1C1A16;'
    + 'font:400 14px/1.7 inherit;padding:12px 14px;outline:none;margin-top:16px}'
    + '.bn__ta:focus{border-color:#E0291E;box-shadow:0 0 0 3px rgba(224,41,30,.12)}'
    + '.bn__hint{margin:12px 0 0;font-size:12px;line-height:1.7;color:#8A8377}'
    + '.bn__err{margin:10px 0 0;font-size:12.5px;line-height:1.6;color:#E0291E;font-weight:600}'
    + '.bn__err[hidden]{display:none}'
    + '@media(max-width:480px){.bn{padding:30px 22px 22px}'
    + '.bn__foot{gap:10px}.bn__btn{flex:1 1 100%;padding:16px}'
    + '.bn__sp{display:none}}';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount() {
    var style = document.createElement('style');
    style.id = 'build-notice-css';
    style.appendChild(document.createTextNode(CSS));
    document.head.appendChild(style);

    var back = el('div', 'bn-back');
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-label', TXT.title);

    var box = el('div', 'bn');
    var body = el('div', 'bn__view');
    box.appendChild(body);
    back.appendChild(box);
    document.body.appendChild(back);

    try { localStorage.setItem(KEY_AT, String(Date.now())); } catch (e) {}

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      back.classList.remove('bn-in');
      setTimeout(function () {
        if (back.parentNode) back.parentNode.removeChild(back);
      }, 220);
      document.removeEventListener('keydown', onKey);
    }

    function mute() {
      try { localStorage.setItem(KEY_OFF, '1'); } catch (e) {}
      close();
    }

    function onKey(ev) {
      if (ev.key !== 'Escape') return;
      if (box.getAttribute('data-view') === 'form') { viewMain(); return; }
      close();
    }
    document.addEventListener('keydown', onKey);

    /* ---------- 主页 ---------- */
    function viewMain() {
      box.setAttribute('data-view', 'main');
      body.textContent = '';

      var x = el('button', 'bn__x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', EN ? 'Close' : '关闭');
      x.addEventListener('click', close);

      body.appendChild(x);
      body.appendChild(el('span', 'bn__k', TXT.kicker));
      var ico = el('span', 'bn__ico', '📢');
      ico.setAttribute('aria-hidden', 'true');
      body.appendChild(ico);
      body.appendChild(el('h2', 'bn__t', TXT.title));
      body.appendChild(el('p', 'bn__lead', TXT.lead));
      body.appendChild(el('p', 'bn__d', TXT.body));

      var foot = el('div', 'bn__foot');
      var ok = el('button', 'bn__btn', TXT.ok);
      ok.type = 'button';
      ok.addEventListener('click', close);
      foot.appendChild(ok);

      var sug = el('button', 'bn__btn bn__btn--ghost', TXT.suggest);
      sug.type = 'button';
      sug.addEventListener('click', viewForm);
      foot.appendChild(sug);

      foot.appendChild(el('span', 'bn__sp'));
      body.appendChild(foot);

      var never = el('button', 'bn__never', TXT.never);
      never.type = 'button';
      never.addEventListener('click', mute);
      body.appendChild(never);

      ok.focus();
    }

    /* ---------- 建议表单 ---------- */
    function viewForm() {
      box.setAttribute('data-view', 'form');
      body.textContent = '';

      body.appendChild(el('span', 'bn__k', TXT.kicker));
      body.appendChild(el('h2', 'bn__t', TXT.formTitle));
      body.appendChild(el('p', 'bn__hint', TXT.formHint));

      var ta = el('textarea', 'bn__ta');
      ta.maxLength = 1000;
      ta.placeholder = TXT.placeholder;
      ta.setAttribute('aria-label', TXT.formTitle);
      body.appendChild(ta);

      var meta = el('div', 'bn__ft');
      var count = el('span', '', '0 / 1000');
      meta.appendChild(count);
      body.appendChild(meta);

      ta.addEventListener('input', function () {
        count.textContent = ta.value.length + ' / 1000';
      });

      var err = el('p', 'bn__err');
      err.hidden = true;
      body.appendChild(err);

      var foot = el('div', 'bn__foot');
      var send = el('button', 'bn__btn', TXT.submit);
      send.type = 'button';
      foot.appendChild(send);

      var backBtn = el('button', 'bn__btn bn__btn--ghost', TXT.back);
      backBtn.type = 'button';
      backBtn.addEventListener('click', viewMain);
      foot.appendChild(backBtn);
      body.appendChild(foot);

      var busy = false;
      function fail(msg) {
        err.textContent = msg;
        err.hidden = false;
      }

      send.addEventListener('click', function () {
        if (busy) return;
        var text = String(ta.value || '').trim();
        if (text.length < 2) { fail(TXT.tooShort); ta.focus(); return; }

        busy = true;
        err.hidden = true;
        send.disabled = true;
        send.textContent = TXT.sending;

        fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ text: text })
        }).then(function (r) {
          return r.json().then(function (d) { return { ok: r.ok, d: d }; });
        }).then(function (res) {
          var d = res.d || {};
          if (res.ok && d.ok) { viewDone(); return; }
          if (d.error === 'too_many') fail(TXT.tooMany);
          else if (d.error === 'invalid_text') fail(TXT.tooShort);
          else fail(TXT.failed);
        }).catch(function () {
          fail(TXT.netFail);
        }).then(function () {
          busy = false;
          send.disabled = false;
          send.textContent = TXT.submit;
        });
      });

      ta.focus();
    }

    /* ---------- 已收到 ---------- */
    function viewDone() {
      box.setAttribute('data-view', 'done');
      body.textContent = '';

      body.appendChild(el('span', 'bn__k', TXT.kicker));
      var ico = el('span', 'bn__ico', '✅');
      ico.setAttribute('aria-hidden', 'true');
      body.appendChild(ico);
      body.appendChild(el('h2', 'bn__t', TXT.doneTitle));
      body.appendChild(el('p', 'bn__d', TXT.doneBody));

      var foot = el('div', 'bn__foot');
      var b = el('button', 'bn__btn', TXT.doneBtn);
      b.type = 'button';
      b.addEventListener('click', close);
      foot.appendChild(b);
      body.appendChild(foot);
      b.focus();
    }

    viewMain();
    requestAnimationFrame(function () { back.classList.add('bn-in'); });

    /* 点遮罩空白关闭；表单里不关，免得白写一段 */
    back.addEventListener('click', function (ev) {
      if (ev.target !== back) return;
      if (box.getAttribute('data-view') === 'form') return;
      close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
