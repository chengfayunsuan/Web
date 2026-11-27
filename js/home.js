/* ============================================================
   Chengfa · 账户首页
   读取 /api/auth/me，渲染门面，未登录跳转登录页
   ============================================================ */
(function () {
  'use strict';

  /* /en 与中文页共用这一份脚本，动态生成的文字都要过 T() */
  var IS_EN = /^\/en(\/|$)/.test(location.pathname);
  function T(zh, en) { return IS_EN ? en : zh; }

  var ROLES = IS_EN
    ? { owner: 'Owner', admin: 'Admin', premium: 'Premium', user: 'Member' }
    : { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = IS_EN
    ? { active: 'Active', frozen: 'Frozen', banned: 'Banned' }
    : { active: '正常', frozen: '已冻结', banned: '已封禁' };
  var BIO_MAX = 200;

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var toast = document.getElementById('toast');
  var bioEl = document.getElementById('bioText');

  function $(id) { return document.getElementById(id); }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  /* 余额小数末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  /* ---------- 提示条 ---------- */

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-on');
    }, 2200);
  }

  /* ---------- 退出 ---------- */

  var logoutBtn = $('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logoutBtn.disabled = true;
      logoutBtn.textContent = T('退出中','Signing out…');
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () { location.replace('/'); });
    });
  }

  /* ---------- 个人简介：点击即改 ---------- */

  var bioSaved = '';

  function paintBio(text) {
    bioSaved = text || '';
    bioEl.textContent = bioSaved;
    bioEl.classList.toggle('is-empty', !bioSaved);
  }

  function stopEdit() {
    bioEl.removeAttribute('contenteditable');
    bioEl.classList.remove('is-editing');
  }

  function saveBio(text) {
    bioEl.textContent = text;
    bioEl.classList.toggle('is-empty', !text);

    fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bio: text })
    })
      .then(function (res) {
        return res.json().then(function (d) { return { ok: res.ok, body: d }; });
      })
      .then(function (r) {
        if (r.ok && r.body.ok) {
          paintBio(r.body.user.bio);
          say(T('个人简介已保存','Bio saved.'));
        } else if (r.body && r.body.error === 'unauthorized') {
          paintBio(bioSaved);
          say(T('登录状态已失效，请刷新页面','Session expired. Please refresh.'));
        } else {
          paintBio(bioSaved);
          say(T('保存失败，请重试','Save failed. Try again.'));
        }
      })
      .catch(function () {
        paintBio(bioSaved);
        say(T('网络连接失败，简介未保存','Network error — bio not saved.'));
      });
  }

  if (bioEl) {
    bioEl.addEventListener('click', function () {
      if (bioEl.isContentEditable) return;
      bioEl.setAttribute('contenteditable', 'plaintext-only');
      bioEl.classList.add('is-editing');
      bioEl.focus();

      var range = document.createRange();
      range.selectNodeContents(bioEl);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    bioEl.addEventListener('blur', function () {
      if (!bioEl.isContentEditable) return;
      stopEdit();

      var text = (bioEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
      if (text === bioSaved) {
        paintBio(bioSaved);
        return;
      }
      saveBio(text);
    });

    bioEl.addEventListener('keydown', function (ev) {
      if (!bioEl.isContentEditable) return;

      if (ev.key === 'Escape') {
        ev.preventDefault();
        paintBio(bioSaved);
        stopEdit();
        bioEl.blur();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        bioEl.blur();
      }
    });

    // 粘贴只取纯文本，避免带入外部样式
    bioEl.addEventListener('paste', function (ev) {
      if (!bioEl.isContentEditable) return;
      ev.preventDefault();
      var clip = ev.clipboardData || window.clipboardData;
      var text = clip ? clip.getData('text') : '';
      if (text) document.execCommand('insertText', false, text);
    });
  }

  /* ---------- 换算 ---------- */

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1, 2) + '.' + pad(d.getDate(), 2);
  }

  function daysSince(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 1;
    var n = Math.floor((Date.now() - d.getTime()) / 86400000) + 1;
    return n < 1 ? 1 : n;
  }

  /* 等级阶梯（与后端 levelOf 一致，2026-11-27 主人定）：
     5 级及以下（含 0 与负级）每级 5 分；6–10 每级 10；11–20 每级 20；
     21–30 每级 30 …… 91–100 每级 100；100 级封顶。 */
  var LEVEL_BANDS = [
    { lv: 1, exp: 0, step: 5 },
    { lv: 6, exp: 25, step: 10 },
    { lv: 11, exp: 75, step: 20 },
    { lv: 21, exp: 275, step: 30 },
    { lv: 31, exp: 575, step: 40 },
    { lv: 41, exp: 975, step: 50 },
    { lv: 51, exp: 1475, step: 60 },
    { lv: 61, exp: 2075, step: 70 },
    { lv: 71, exp: 2775, step: 80 },
    { lv: 81, exp: 3575, step: 90 },
    { lv: 91, exp: 4475, step: 100 }
  ];
  var LEVEL_MAX = 100;
  var LEVEL_MAX_EXP = 5375;

  function levelRange(level) {
    var lv = Number(level) || 0;
    if (lv > LEVEL_MAX) lv = LEVEL_MAX;
    if (lv <= 1) {
      var f = (lv - 1) * 5;
      return { from: f, to: f + 5 };
    }
    for (var i = LEVEL_BANDS.length - 1; i >= 0; i--) {
      var b = LEVEL_BANDS[i];
      if (lv >= b.lv) {
        var from = b.exp + (lv - b.lv) * b.step;
        return { from: from, to: Math.min(LEVEL_MAX_EXP, from + b.step) };
      }
    }
    return { from: 0, to: 5 };
  }


  /* ---------- 渲染 ---------- */

  function render(user) {
    $('navName').textContent = user.username || T('未命名','Unnamed');
    if (window.CF && CF.amount) CF.amount($('navBal'), user.fc);
    else $('navBal').textContent = trimNum(user.fc);

    /* 站长与管理员点左上角Chengfa进后台 */
    var brand = document.querySelector('.brand');
    if (brand && (user.role === 'owner' || user.role === 'admin')) brand.setAttribute('href', '/admin');

    $('uidText').textContent = user.uid;
    $('userName').textContent = user.username || T('未命名','Unnamed');
    $('joinedAt').textContent = fmtDate(user.createdAt);
    $('statusText').textContent = STATUS[user.status] || user.status;

    var roleEl = $('roleText');
    roleEl.textContent = ROLES[user.role] || user.role;
    roleEl.setAttribute('data-role', user.role);

    paintBio(user.bio || '');

    var fcEl = $('fcText');
    var fcShown = window.CF && CF.money ? CF.money(user.fc) : trimNum(user.fc);
    fcEl.textContent = fcShown;
    /* 位数多时收一号字，避免大额余额把小窗口入口挤掉 */
    fcEl.classList.toggle('is-long', fcShown.length > 8);
    fcEl.setAttribute('data-cfb', user.fc);
    fcEl.setAttribute('data-cur', 'amount');
    if (window.CF && CF.amount) CF.amount($('fcFrozen'), user.fcFrozen);
    else $('fcFrozen').textContent = trimNum(user.fcFrozen);

    $('statDays').textContent = daysSince(user.createdAt);
    $('statLevel').textContent = user.level;
    $('statAff').textContent = user.affinity;

    var range = levelRange(user.level);
    var span = range.to - range.from;
    /* 只显示本级内的进度：不把前面等级攒的分算进来 */
    var inLevel = Math.max(0, Math.min(span, user.exp - range.from));
    var pct = span > 0 ? (inLevel / span) * 100 : 0;
    pct = Math.max(0, Math.min(100, pct));

    $('expText').textContent = inLevel;
    $('expNext').textContent = span;

    requestAnimationFrame(function () {
      $('expBar').style.width = pct + '%';
    });
  }

  /* ---------- 本地预览 ---------- */
  /* 仅在本地开发服务器上带 ?preview 生效，用于检查版面，线上不触发 */

  var DEMO = {
    uid: 1,
    username: 'Chengfa',
    role: 'owner',
    status: 'active',
    fc: '128.4500',
    fcFrozen: '20.0000',
    affinity: 12,
    exp: 520,
    level: 3,
    bio: T('这里填写个人简介。这段文字用于检查较长内容在版面中的换行表现。','Write your bio here. This sentence is long on purpose, to check how wrapping looks.'),
    createdAt: '2026-11-16T08:00:46Z'
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    loading.hidden = true;
    app.hidden = false;
    return;
  }

  /* ---------- 启动：缓存秒显，后台校验 ---------- */


  /* ---------- 公告 ---------- */

  function loadNotices() {
    var box = document.getElementById('homeNotice');
    if (!box) return;

    fetch('/api/announcements', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) { box.textContent = ''; return; }

        var items = d.items || [];
        box.textContent = '';

        if (!items.length) {
          var p0 = document.createElement('p');
          p0.className = 'hm-notice__i';
          p0.textContent = T('暂时没有公告。','No announcements yet.');
          box.appendChild(p0);
          return;
        }

        items.slice(0, 2).forEach(function (n) {
          var p = document.createElement('p');
          p.className = 'hm-notice__i';
          p.setAttribute('data-lv', n.level || 'info');

          if (n.title) {
            var t = document.createElement('span');
            t.className = 'hm-notice__t';
            t.textContent = n.title + '：';
            p.appendChild(t);
          }

          p.appendChild(document.createTextNode(n.body));
          box.appendChild(p);
        });

        var more = document.createElement('a');
        more.className = 'hm-notice__more';
        more.href = '/notices';
        more.textContent = items.length > 2
          ? T('查看全部 ' + items.length + ' 条公告 →',
              'View all ' + items.length + ' announcements →')
          : T('查看公告 →','View announcements →');
        box.appendChild(more);
      })
      .catch(function () { box.textContent = ''; });
  }

  /* ---------- 最近入账展览 ---------- */
  /* 数据来自 /api/feed/recent：只收问卷墙的 reward 与 reverse，
     被筛掉（disqualified）的本来就没有流水，封禁与已注销用户后端已滤掉。 */

  function ago(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return T('刚刚', 'just now');
    if (s < 3600) return Math.floor(s / 60) + T(' 分钟前', 'm ago');
    if (s < 86400) return Math.floor(s / 3600) + T(' 小时前', 'h ago');
    if (s < 86400 * 30) return Math.floor(s / 86400) + T(' 天前', 'd ago');
    return fmtDate(iso);
  }

  /* 流水来源：kind → 问卷商名。reverse 与对应 reward 同源 */
  var SRC = {
    survey_reward: { zh: '自营', en: 'In-house' },
    cpx_reward: { zh: 'CPX', en: 'CPX' },
    theoremreach_reward: { zh: 'TheoremReach', en: 'TheoremReach' },
    opinionuniverse_reward: { zh: 'Opinion Universe', en: 'Opinion Universe' },
    moonetix_reward: { zh: 'Moonetix', en: 'Moonetix' },
    cpx_reverse: { zh: 'CPX', en: 'CPX' },
    theoremreach_reverse: { zh: 'TheoremReach', en: 'TheoremReach' },
    opinionuniverse_reverse: { zh: 'Opinion Universe', en: 'Opinion Universe' },
    moonetix_reverse: { zh: 'Moonetix', en: 'Moonetix' }
  };

  function loadExhibit() {
    var list = $('exhList');
    if (!list) return;

    fetch('/api/feed/recent', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;

        var items = d.items || [];
        var count = $('exhCount');
        var empty = $('exhEmpty');

        if (count) count.textContent = String(items.length);
        if (!items.length) {
          if (empty) empty.hidden = false;
          return;
        }

        list.textContent = '';
        items.forEach(function (it) {
          var li = document.createElement('li');
          li.className = 'exh__c';

          var who = document.createElement('span');
          who.className = 'exh__who';
          who.textContent = it.name;
          li.appendChild(who);

          var amt = document.createElement('span');
          amt.className = 'exh__amt ' + (it.up ? 'exh__amt--up' : 'exh__amt--dn');
          amt.textContent = (it.up ? '+' : '-') + trimNum(it.xd) + ' XD';
          li.appendChild(amt);

          var src = SRC[it.kind];
          var srcName = src ? (IS_EN ? src.en : src.zh) : '';
          var srcEl = document.createElement('span');
          srcEl.className = 'exh__src';
          srcEl.textContent = it.up
            ? srcName
            : T(srcName + ' · 冲回', srcName + ' · reversed');
          li.appendChild(srcEl);

          var when = document.createElement('span');
          when.className = 'exh__when';
          when.textContent = ago(it.at);
          li.appendChild(when);

          list.appendChild(li);
        });
      })
      .catch(function () { /* 展览是装饰性的，失败就空着 */ });
  }

  function show(user) {
    render(user);
    loadNotices();
    loadExhibit();
    loading.hidden = true;
    app.hidden = false;
  }

  var cached = window.CF && CF.cache ? CF.cache.get() : null;
  if (cached) show(cached);

  fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (res) {
      if (res.status === 401) {
        if (window.CF && CF.cache) CF.cache.clear();
        location.replace('/login');
        return null;
      }
      return res.json();
    })
    .then(function (data) {
      if (!data) return;
      if (!data.ok || !data.user) {
        loading.hidden = true;
        if (!cached) say(T('账户载入失败，请刷新页面重试。','Could not load your account. Refresh and try again.'));
        return;
      }
      if (window.CF && CF.cache) CF.cache.set(data.user);
      show(data.user);
    })
    .catch(function () {
      loading.hidden = true;
      if (!cached) say(T('网络连接失败，请检查网络后刷新。','Network error — check your connection and refresh.'));
    });
})();
