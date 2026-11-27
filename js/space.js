/* ============================================================
   Chengfa · 用户公开主页
   数据来自 /api/pub/user；关注与粉丝只占两行数字，
   点开是小窗口，列表来自 /api/follow
   ============================================================ */
(function () {
  'use strict';
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


  /* /en 与中文页共用这一份脚本，页面文字都过 T() */
  var IS_EN = /^\/en(\/|$)/.test(location.pathname);
  function T(zh, en) { return IS_EN ? en : zh; }

  var ROLES = IS_EN
    ? { owner: 'Owner', admin: 'Admin', premium: 'Premium', user: 'Member' }
    : { owner: '站长', admin: '管理员', premium: '大会员', user: '用户' };
  var STATUS = IS_EN
    ? { active: 'Active', frozen: 'Frozen', banned: 'Banned' }
    : { active: '正常', frozen: '已冻结', banned: '已封禁' };
  var RESTRICT_TEXT = {
    banned: T('该账户已被封禁，公开资料不再展示。','This account is banned; the public profile is hidden.'),
    frozen: T('该账户已被冻结，公开资料暂停展示。','This account is frozen; the public profile is paused.')
  };

  var app = document.getElementById('app');
  var loading = document.getElementById('loading');
  var none = document.getElementById('none');
  var toast = document.getElementById('toast');

  var relList = document.getElementById('relList');
  var relEmpty = document.getElementById('relEmpty');
  var relMore = document.getElementById('relMore');
  var sheet = document.getElementById('relSheet');

  var state = {
    uid: null,
    social: { followers: 0, following: 0 },
    viewer: { self: false, signedIn: false, following: false }
  };

  var REL = { scope: 'following', offset: 0, total: 0, busy: false };

  function $(id) { return document.getElementById(id); }


  /* 金额显示统一走 CF，切换币种时由 CF.refresh 重刷所有 data-cfb 节点 */
  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* 余额小数末尾的 0 不显示：0.0000 -> 0，128.4500 -> 128.45 */
  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  /* 切币种后数字长度会变（12.6 → 189.2），余额的字号判断要跟着重算 */
  if (window.CF && CF.onChange) {
    CF.onChange(function () {
      var el = $('fc');
      if (el) el.classList.toggle('is-long', el.textContent.length > 7);
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }

  /* ---------- 提示条 ---------- */

  var toastTimer = null;

  function say(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
  }

  /* ---------- 空态 ---------- */

  function showNone(title, desc) {
    loading.hidden = true;
    app.hidden = true;
    none.hidden = false;
    $('noneT').textContent = title;
    $('noneD').textContent = desc;
    document.title = title + ' · Chengfa';
  }

  /* ---------- 关注与粉丝数字 ---------- */

  function paintSocial() {
    var f = state.social;
    $('fansN').textContent = f.followers;
    $('followN').textContent = f.following;
    $('tabFans').textContent = f.followers;
    $('tabFollow').textContent = f.following;
  }

  /* ---------- 关注按钮 ---------- */

  function paintFollow(on) {
    state.viewer.following = on;
    var btn = $('followBtn');
    if (!btn) return;
    btn.textContent = on ? T('已关注','Following') : T('关注','Follow');
    btn.classList.toggle('is-on', on);
    btn.disabled = false;
  }

  function setupFollow() {
    var box = $('followBox');
    var btn = $('followBtn');

    if (state.viewer.self) {
      box.hidden = true;
      return;
    }

    box.hidden = false;

    if (!state.viewer.signedIn) {
      btn.textContent = T('登录后关注','Sign in to follow');
      btn.addEventListener('click', function () {
        location.href = window.CF && CF.goto ? CF.goto('/login') : '/login';
      });
      return;
    }

    paintFollow(state.viewer.following);

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;

      var act = state.viewer.following ? 'unfollow' : 'follow';

      fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: Number(state.uid), act: act })
      })
        .then(function (res) {
          return res.json().then(function (d) { return { ok: res.ok, body: d }; });
        })
        .then(function (r) {
          if (r.ok && r.body.ok) {
            state.social.followers = r.body.followers;
            state.social.following = r.body.followees;
            paintSocial();
            paintFollow(r.body.following);
            say(r.body.following ? T('已关注该用户','Now following') : T('已取消关注','Unfollowed'));

            /* 关系变了，窗口开着就按新状态重取 */
            if (!sheet.hidden) loadRel(REL.scope, false);
            return;
          }

          btn.disabled = false;

          var err = r.body && r.body.error;
          if (err === 'unauthorized') {
            say(T('登录状态已失效，请刷新页面','Session expired. Please refresh.'));
          } else if (err === 'self') {
            say(T('不能关注自己','You cannot follow yourself.'));
          } else if (err === 'restricted') {
            say(T('该账户当前状态不可关注','This account cannot be followed in its current state.'));
          } else if (err === 'too_many') {
            say(T('关注人数已达上限','Follower limit reached.'));
          } else if (err === 'not_found') {
            say(T('该用户不存在','No such user.'));
          } else {
            say(T('操作失败，请重试','Action failed. Try again.'));
          }
        })
        .catch(function () {
          btn.disabled = false;
          say(T('网络连接失败，操作未生效','Network error — nothing was changed.'));
        });
    });
  }

  /* ---------- 小窗口 ---------- */

  var lastFocus = null;

  function openSheet(scope) {
    if (!sheet) return;

    lastFocus = document.activeElement;
    sheet.hidden = false;
    document.body.classList.add('is-locked');

    var x = $('sheetClose');
    if (x) x.focus();

    loadRel(scope, false);
  }

  function closeSheet() {
    if (!sheet || sheet.hidden) return;

    sheet.hidden = true;
    document.body.classList.remove('is-locked');

    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (sheet) {
    $('sheetClose').addEventListener('click', closeSheet);

    var mask = sheet.querySelector('.sheet__mask');
    if (mask) mask.addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeSheet();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.sp-soc__i'), function (b) {
    b.addEventListener('click', function () {
      openSheet(b.getAttribute('data-scope'));
    });
  });

  /* ---------- 关系列表 ---------- */

  function setTabs(scope) {
    Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (t) {
      t.classList.toggle('is-on', t.getAttribute('data-scope') === scope);
    });
  }

  function emptyText(scope) {
    if (state.viewer.self) {
      return scope === 'followers' ? T('还没有人关注你。','No followers yet.') : T('还没有关注任何人。','Not following anyone yet.');
    }
    return scope === 'followers' ? T('该账户还没有粉丝。','This account has no followers yet.') : T('该账户还没有关注任何人。','This account is not following anyone yet.');
  }

  function relItem(it) {
    var li = document.createElement('li');
    li.className = 'rel__i';

    var a = document.createElement('a');
    a.className = 'rel__a';
    a.href = '/space?uid=' + encodeURIComponent(it.uid);

    var uid = document.createElement('span');
    uid.className = 'rel__uid';
    uid.textContent = 'UID ' + it.uid;

    var name = document.createElement('span');
    name.className = 'rel__name';
    name.textContent = it.username || T('未命名','Unnamed');

    var role = document.createElement('span');
    role.className = 'face__role rel__role';
    role.setAttribute('data-role', it.role || 'user');
    role.textContent = ROLES[it.role] || it.role || T('用户','Member');

    var lv = document.createElement('span');
    lv.className = 'rel__lv';
    lv.textContent = 'LV ' + (it.level == null ? 1 : it.level);

    var at = document.createElement('span');
    at.className = 'rel__at';
    at.textContent = fmtDate(it.at);

    a.appendChild(uid);
    a.appendChild(name);
    a.appendChild(role);
    a.appendChild(lv);
    a.appendChild(at);
    li.appendChild(a);

    var isSelfRow = String(it.uid) === String(state.uid);

    if (state.viewer.signedIn && !isSelfRow) {
      var act = document.createElement('button');
      act.className = 'rel__act';
      act.type = 'button';
      act.setAttribute('data-uid', it.uid);
      act.setAttribute('data-following', it.following ? '1' : '0');
      act.textContent = it.following ? T('取消关注','Unfollow') : T('关注','Follow');
      li.appendChild(act);
    }

    return li;
  }

  function loadRel(scope, append) {
    if (REL.busy) return;

    REL.busy = true;
    REL.scope = scope;

    if (!append) {
      REL.offset = 0;
      relList.textContent = '';
      relEmpty.hidden = true;
      relMore.hidden = true;
    } else {
      relMore.disabled = true;
    }

    setTabs(scope);

    var url =
      '/api/follow?scope=' + encodeURIComponent(scope) +
      '&uid=' + encodeURIComponent(state.uid) +
      '&offset=' + REL.offset;

    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (d) { return { status: res.status, body: d }; });
      })
      .then(function (r) {
        REL.busy = false;
        relMore.disabled = false;

        if (!r.body || !r.body.ok) {
          relEmpty.hidden = false;
          relEmpty.textContent = r.status === 401
            ? T('登录状态已失效，请重新登录。','Your session expired. Please sign in again.')
            : T('列表载入失败，稍后重试。','Could not load the list. Try again shortly.');
          return;
        }

        if (r.body.counts) {
          state.social.followers = r.body.counts.followers;
          state.social.following = r.body.counts.following;
          paintSocial();
        }

        var items = r.body.items || [];
        REL.total = r.body.total || 0;
        REL.offset += items.length;

        items.forEach(function (it) { relList.appendChild(relItem(it)); });

        if (!REL.offset) {
          relEmpty.hidden = false;
          relEmpty.textContent = emptyText(scope);
        }

        relMore.hidden = !(r.body.hasMore && REL.offset < REL.total);
      })
      .catch(function () {
        REL.busy = false;
        relMore.disabled = false;
        relEmpty.hidden = false;
        relEmpty.textContent = T('网络连接失败，请稍后刷新。','Network error. Please refresh.');
      });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.rel__tab'), function (tab) {
    tab.addEventListener('click', function () {
      var scope = tab.getAttribute('data-scope');
      if (scope === REL.scope && REL.offset > 0) return;
      loadRel(scope, false);
    });
  });

  if (relMore) {
    relMore.addEventListener('click', function () {
      loadRel(REL.scope, true);
    });
  }

  relList.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('.rel__act') : null;
    if (!btn || btn.disabled) return;

    var uid = Number(btn.getAttribute('data-uid'));
    var wasFollowing = btn.getAttribute('data-following') === '1';

    btn.disabled = true;

    fetch('/api/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid, act: wasFollowing ? 'unfollow' : 'follow' })
    })
      .then(function (res) {
        return res.json().then(function (d) { return { ok: res.ok, body: d }; });
      })
      .then(function (r) {
        btn.disabled = false;

        if (!r.ok || !r.body.ok) {
          var err = r.body && r.body.error;
          if (err === 'unauthorized') say(T('登录状态已失效，请刷新页面','Session expired. Please refresh.'));
          else if (err === 'too_many') say(T('关注人数已达上限','Follower limit reached.'));
          else if (err === 'self') say(T('不能关注自己','You cannot follow yourself.'));
          else if (err === 'restricted') say(T('该账户当前状态不可关注','This account cannot be followed in its current state.'));
          else say(T('操作失败，请重试','Action failed. Try again.'));
          return;
        }

        /* 在自己的关注列表里取关，条目应当消失 */
        if (state.viewer.self && REL.scope === 'following' && wasFollowing) {
          var li = btn.closest('.rel__i');
          if (li) li.remove();

          REL.total = Math.max(0, REL.total - 1);
          REL.offset = Math.max(0, REL.offset - 1);
          state.social.following = Math.max(0, state.social.following - 1);
          paintSocial();

          if (!relList.children.length) {
            relEmpty.hidden = false;
            relEmpty.textContent = emptyText('following');
          }

          say(T('已取消关注','Unfollowed'));
          return;
        }

        btn.setAttribute('data-following', r.body.following ? '1' : '0');
        btn.textContent = r.body.following ? T('取消关注','Unfollow') : T('关注','Follow');
        say(r.body.following ? T('已关注','Following') : T('已取消关注','Unfollowed'));
      })
      .catch(function () {
        btn.disabled = false;
        say(T('网络连接失败，操作未生效','Network error — nothing was changed.'));
      });
  });

  /* ---------- 提现记录 ---------- */

  function renderPayouts(p) {
    var data = p || { count: 0, total: '0.0000', lastAt: null, items: [] };

    $('poCount').textContent = data.count || 0;
    setAmt($('poTotal'), data.total || '0');
    $('poLast').textContent = data.lastAt ? fmtDate(data.lastAt) : '—';

    var list = $('poList');
    list.textContent = '';

    var items = data.items || [];

    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'po__i';

      var amt = document.createElement('span');
      amt.className = 'po__amt';
      setAmt(amt, it.amount);
      var unit = document.createElement('i');
      unit.setAttribute('data-cur', 'code');
      unit.textContent = 'FC';
      amt.appendChild(unit);

      var ch = document.createElement('span');
      ch.className = 'po__ch';
      ch.textContent = it.channel;

      var at = document.createElement('span');
      at.className = 'po__at';
      at.textContent = fmtDate(it.at);

      li.appendChild(amt);
      li.appendChild(ch);
      li.appendChild(at);
      list.appendChild(li);
    });

    $('poEmpty').hidden = items.length > 0;
  }

  /* ---------- 渲染 ---------- */

  function render(u) {
    document.title = (u.username || T('用户','Member')) + ' · Chengfa';

    state.uid = u.uid;
    state.viewer = u.viewer || { self: false, signedIn: false, following: false };
    state.social = u.social || { followers: 0, following: 0 };

    $('uid').textContent = u.uid;
    $('name').textContent = u.username || T('未命名','Unnamed');

    var role = u.role || 'user';
    var roleEl = $('role');
    roleEl.textContent = ROLES[role] || role;
    roleEl.setAttribute('data-role', role);

    $('status').textContent = STATUS[u.status] || u.status || '—';
    $('statusBox').classList.toggle('is-bad', u.status !== 'active');

    if (u.restricted) {
      $('sub').hidden = true;
      $('restrictNote').hidden = false;
      $('restrictNote').textContent = RESTRICT_TEXT[u.status] || T('该账户当前状态异常，公开资料不展示。','This account is in an unusual state; the profile is hidden.');
      $('bio').hidden = true;
      $('socialRow').hidden = true;
      $('followBox').hidden = true;
      $('payoutSec').hidden = true;
      var lvBox = document.querySelector('.sp-side');
      if (lvBox) lvBox.hidden = true;
      var heroIn = document.querySelector('.sp-hero__in');
      if (heroIn) heroIn.classList.add('is-single');
      return;
    }

    $('sub').textContent =
      T('注册于 ' + (u.joinedMonth || '未记录') + ' · 已加入 ' + (u.joinedDays || 1) + ' 天',
        'Joined ' + (u.joinedMonth || 'unknown') + ' · ' + (u.joinedDays || 1) + ' days');

    /* 经验区间走统一阶梯（与后端 levelOf 一致），负等级同样有进度条 */
    var lv = u.level == null ? 1 : Number(u.level);
    var exp = u.exp || 0;
    var range = levelRange(lv);
    var start = range.from;
    var next = range.to;
    var span = next - start;
    var pct = span > 0 ? ((exp - start) / span) * 100 : 100;
    pct = Math.max(0, Math.min(100, pct));

    /* 余额是这块的主数字，位数多了要缩字号，免得撑破格子。
       必须走 CF.amount：只写 textContent、不写 data-cfb 的话，
       切到 XD 时单位跟着变了、数字还是 XB，就成了「12.6308 XD」。 */
    var fcEl = $('fc');
    var fcVal = u.fc == null ? '0' : u.fc;
    if (window.CF && CF.amount) CF.amount(fcEl, fcVal);
    else fcEl.textContent = trimNum(fcVal);
    fcEl.classList.toggle('is-long', fcEl.textContent.length > 7);

    setAmt($('fcFrozen'), u.fcFrozen == null ? '0' : u.fcFrozen);

    $('lv').textContent = lv;
    $('expNow').textContent = exp;
    $('expNext').textContent = next;
    $('aff').textContent = u.affinity || 0;

    var hint = $('expHint');
    if (exp >= next) {
      hint.textContent = T('已达到当前等级上限，等待等级结算。','Level cap reached — waiting for the level to settle.');
    } else {
      hint.textContent = T('再获得 ' + (next - exp) + ' 点经验升至 LV' + (lv + 1) + '。',
        (next - exp) + ' more experience to reach LV' + (lv + 1) + '.');
    }

    var bar = $('expBar');
    requestAnimationFrame(function () { bar.style.width = pct + '%'; });

    var bio = $('bio');
    if (u.bio && u.bio.trim()) {
      bio.textContent = u.bio;
    } else {
      bio.textContent = T('该用户还没有填写个人简介。','This user has not written a bio yet.');
      bio.classList.add('is-empty');
    }

    paintSocial();
    setupFollow();
    renderPayouts(u.payouts);

    if (state.viewer.self) {
      $('selfNote').hidden = false;
    }
  }

  /* ---------- 导航 ---------- */

  var logoutBtn = $('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logoutBtn.disabled = true;
      logoutBtn.textContent = T('退出中','Signing out…');
      fetch('/api/auth/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () { location.replace(window.CF && CF.goto ? CF.goto('/') : '/'); });
    });
  }

  /* ---------- 复制链接 ---------- */

  $('copyLink').addEventListener('click', function () {
    var url = location.origin + '/space?uid=' + encodeURIComponent(uid);
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      say(T('当前浏览器不支持自动复制，请手动复制地址栏','This browser cannot copy automatically — copy the address bar manually'));
      return;
    }
    navigator.clipboard.writeText(url).then(
      function () { say(T('主页链接已复制','Profile link copied')); },
      function () { say(T('复制被拒绝，请手动复制地址栏','Copy was blocked — copy the address bar manually')); }
    );
  });

  /* ---------- 取数 ---------- */

  var params = new URLSearchParams(location.search);
  var uid = (params.get('uid') || '').trim();

  if (!uid) {
    showNone(T('缺少 UID','Missing UID'), T('主页地址需要带上 UID，例如 /space?uid=1。','The profile URL needs a UID, e.g. /space?uid=1.'));
    return;
  }
  if (!/^\d+$/.test(uid)) {
    showNone(T('UID 格式不正确','Invalid UID'), T('UID 是一串数字，从 1 开始。检查地址里的 uid 参数。','UIDs are numbers starting at 1 — check the uid parameter in the URL.'));
    return;
  }

  /* ---------- 本地预览 ---------- */

  var DEMO = {
    uid: 2,
    username: '林一舟',
    role: 'user',
    status: 'active',
    fc: '218.65',
    fcFrozen: '20',
    level: 2,
    exp: 240,
    affinity: 7,
    bio: '抽空填问卷，偶尔写点东西。对长问卷有耐心，对诱导性提问没有。',
    joinedMonth: '2026 年 10 月',
    joinedDays: 28,
    social: { followers: 12, following: 5 },
    payouts: {
      count: 3,
      total: '46.5000',
      lastAt: '2026-11-12T09:20:00Z',
      items: [
        { amount: '20.0000', channel: '支付宝', at: '2026-11-12T09:20:00Z' },
        { amount: '16.5000', channel: '微信', at: '2026-10-28T14:02:00Z' },
        { amount: '10.0000', channel: '支付宝', at: '2026-10-05T11:41:00Z' }
      ]
    },
    viewer: { self: false, signedIn: true, following: false }
  };

  var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocal && /[?&]preview\b/.test(location.search)) {
    render(DEMO);
    loading.hidden = true;
    app.hidden = false;
    return;
  }

  /* ---------- 启动 ---------- */

  var cachedMe = window.CF && CF.cache ? CF.cache.get() : null;

  var meReq;
  if (cachedMe) {
    /* 缓存里的访客身份直接用，不占一个网络往返 */
    meReq = Promise.resolve(cachedMe);
    fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (d) {
        var user = d && d.ok ? d.user : null;
        if (window.CF && CF.cache) {
          if (user) CF.cache.set(user); else CF.cache.clear();
        }
      })
      .catch(function () {});
  } else {
    meReq = fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().then(function (d) {
          if (d && d.ok && window.CF && CF.cache) CF.cache.set(d.user);
          return d && d.ok ? d.user : null;
        });
      })
      .catch(function () { return null; });
  }

  var userReq = fetch('/api/pub/user?uid=' + encodeURIComponent(uid), {
    headers: { Accept: 'application/json' }
  })
    .then(function (res) {
      return res.json().then(function (d) { return { status: res.status, body: d }; });
    })
    .catch(function () { return { status: 0, body: null }; });

  Promise.all([meReq, userReq]).then(function (out) {
    var me = out[0];
    var r = out[1];

    if (me) {
      $('navGuest').hidden = true;
      $('navAuthed').hidden = false;
      setAmt($('navBal'), me.fc);
      $('navName').textContent = me.username || T('我','Me');

      /* 站长与管理员点左上角Chengfa进后台 */
      var brand = document.querySelector('.brand');
      if (brand && (me.role === 'owner' || me.role === 'admin')) brand.setAttribute('href', '/admin');
      if (String(me.uid) === uid) $('selfNote').hidden = false;
    }

    if (r.status === 0) {
      loading.hidden = true;
      say(T('网络连接失败，请检查网络后刷新','Network error — check your connection and refresh'));
      return;
    }

    if (r.status === 200 && r.body && r.body.ok && r.body.user) {
      render(r.body.user);
      loading.hidden = true;
      app.hidden = false;

      /* 本地开发：?sheet=following|followers 直接展开小窗口，便于检查版面 */
      if (isLocal) {
        var m = location.search.match(/[?&]sheet=(following|followers)\b/);
        if (m) setTimeout(function () { openSheet(m[1]); }, 400);
      }

      return;
    }

    var err = r.body && r.body.error;
    if (err === 'gone') {
      showNone(T('该账户已注销','This account is closed'), T('账户注销后主页不再公开，相关内容也不再展示。','Closed accounts no longer have a public profile or content.'));
    } else if (err === 'not_found') {
      showNone(T('没有这个用户','No such user'), T('UID 可能写错了。UID 从 1 开始，按注册顺序发放。','The UID may be wrong — UIDs start at 1 in signup order.'));
    } else if (err === 'invalid_query') {
      showNone(T('UID 格式不正确','Invalid UID'), T('UID 是一串数字，从 1 开始。','UIDs are numbers starting at 1.'));
    } else {
      showNone(T('主页载入失败','Could not load the profile'), T('服务暂时不可用，稍后刷新重试。','Service unavailable. Refresh and retry later.'));
    }
  });
})();
