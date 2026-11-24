/* ============================================================
   Chengfa · 站内问卷答题页
   题目从 /api/surveys/paper 取，结局由服务端判定，这里只管画和报。
   ============================================================ */
(function () {
  'use strict';

  /* /en 与中文页共用这一份脚本，页面文字都过 T() */
  var IS_EN = /^\/en(\/|$)/.test(location.pathname);
  function T(zh, en) { return IS_EN ? en : zh; }

  var $ = function (id) { return document.getElementById(id); };

  var id = Number(new URLSearchParams(location.search).get('id')) || 0;
  var query = new URLSearchParams(location.search);
  var pageStatus = query.get('status') || '';   /* 回调带回来的结局，有它就只画结果，不再开卷 */
  var paper = null;
  var startedAt = '';
  var attempt = 0;          /* 本轮答卷的编号：站长每测一遍就是新的一条 */
  var myUid = 0;            /* 回传里的 pid */
  var rewardText = '';      /* 回传里的 revenue */
  var ticker = 0;
  var poller = 0;

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function note(text, bad) {
    var el = $('svNote');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('is-bad', !!bad);
  }

  /* 用时按开卷时间算，跟服务端一致 */
  function secondsSince(ts) {
    if (!ts) return 0;
    var t = Date.parse(String(ts).replace(' ', 'T') + '+08:00');
    if (isNaN(t)) return 0;
    return Math.max(0, Math.round((Date.now() - t) / 1000));
  }

  function startTimer() {
    clearInterval(ticker);
    var el = $('svTimer');
    var tick = function () {
      if (!el) return;
      var s = secondsSince(startedAt);
      el.textContent = T('用时 ', 'Time ') + Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    };
    tick();
    ticker = setInterval(tick, 1000);
  }

  function paintQuestions(qs) {
    var box = $('svQs');
    if (!box) return;

    box.innerHTML = qs.map(function (q, i) {
      var opts = q.options.map(function (o, j) {
        return '<label class="paper-opt">' +
          '<input type="radio" name="q' + i + '" value="' + j + '" data-q="' + i + '" data-o="' + j + '">' +
          '<span class="paper-opt__dot" aria-hidden="true"></span>' +
          '<span class="paper-opt__t">' + esc(o) + '</span>' +
          '</label>';
      }).join('');

      return '<div class="paper-q" data-i="' + i + '">' +
        '<div class="paper-q__l">' +
          '<span class="paper-q__n">' + ('0' + (i + 1)).slice(-2) + '</span>' +
          '<span class="paper-q__t">' + esc(q.q) + '</span>' +
        '</div>' +
        '<div class="paper-opts">' + opts + '</div>' +
        '</div>';
    }).join('');

    updateProgress();
  }

  function picked() {
    var out = {};
    [].forEach.call(document.querySelectorAll('#svQs input[type=radio]:checked'), function (r) {
      out[r.getAttribute('data-q')] = Number(r.getAttribute('data-o'));
    });
    return out;
  }

  function updateProgress() {
    var total = paper ? paper.questions.length : 0;
    var done = Object.keys(picked()).length;
    var el = $('svProgress');
    if (el) el.textContent = T(done + ' / ' + total + ' 题', 'Question ' + done + ' of ' + total);
    var btn = $('svSend');
    if (btn) btn.disabled = done < total;
  }

  /* ---------- 结果 ---------- */

  var KIND = {
    success: T('通过','Passed'),
    fail: T('失败','Failed'),
    speed: T('超速','Too fast'),
    quota: T('满额','Full'),
    kick: T('被踢','Terminated'),
    reject: T('打回','Rejected'),
    rejected: T('被打回','Rejected'),
    bot: T('机器作答','Bot detected')
  };

  var DESC = {
    success: T('答卷通过质检，奖励已经入账。','Passed the quality check — reward credited.'),
    fail: T('问卷商那边接口出错，答卷没能保存。','The provider API errored and this response was not saved.'),
    speed: T('答得太快，被判超速作废。','Answered too quickly — voided for speed.'),
    quota: T('这份问卷的名额刚好在提交前收满了。','This survey filled up just before you submitted.'),
    kick: T('答题过程中命中了排除条件，会话被终止。','You hit an exclusion condition mid-survey; the session was terminated.'),
    reject: T('问卷商说这份要过质检，先入账，过一会儿再看结果。','The provider flags this response for review — credited now, rechecked shortly.'),
    rejected: T('质检没过：奖励已经扣回，经验 −8。','Quality check failed — the reward was reversed and 8 experience deducted.'),
    bot: T('表单里有不该被填的字段，被判成脚本作答。','A field that should have stayed empty was filled — flagged as scripted.')
  };

  /* 回传码照行业惯例来（InnovateMR / Cint 那一套）：
     1 完成 · 2 中途终止 · 3 配额满 · 4 质检终止（0 是我们自己的接口异常）。
     终止类带一个 reason，对应到这边具体是哪一种。 */
  var CODE = {
    success: 1,
    reject: 1,      /* 先入账，此刻对问卷商来说就是完成 */
    kick: 2,
    quota: 3,
    speed: 4,
    rejected: 4,
    bot: 4,         /* 作弊/机器作答在行业里统一按质检终止处理 */
    fail: 0
  };

  var REASON = {
    rejected: 'quality',
    speed: 'speeder',
    kick: 'screenout',
    quota: 'quota',
    bot: 'fraud',
    fail: 'error'
  };

  var CODE_DESC = {
    0: T('接口异常','API error'),
    1: T('完成','Completed'),
    2: T('中途终止','Terminated'),
    3: T('配额已满','Quota full'),
    4: T('质检终止','QC terminated')
  };

  /* 结局要落到地址栏上（?status=1&pid=&tid= 这种），刷新也还是这张结果页。
     真问卷商就是这么回调的，我们自己也照这个来。
     答卷的明细放 sessionStorage，免得刷新后再向服务端要一份已经结算过的。 */
  function resKey() {
    return 'sv:res:' + id;
  }

  function saveResult(d) {
    try {
      sessionStorage.setItem(resKey(), JSON.stringify({
        result: d.result || 'success',
        code: CODE[d.result || 'success'],
        elapsed: d.elapsed || 0,
        steps: d.steps || [],
        pending: !!d.pending,
        delay: d.delay || 0,
        reward: d.reward || '',
        at: Date.now()
      }));
    } catch (e) {}
  }

  function loadResult() {
    try {
      var raw = sessionStorage.getItem(resKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* tid 拿答卷行号，pid 拿用户 id —— 跟上游回传的字段名对齐 */
  function callbackUrl(kind) {
    var code = CODE[kind] == null ? 1 : CODE[kind];
    var qs = '?id=' + id + '&status=' + code
      + '&pid=' + (myUid || 0)
      + '&tid=' + (attempt ? (id + '-' + attempt) : String(id));
    if (rewardText) qs += '&revenue=' + encodeURIComponent(rewardText);
    if (REASON[kind]) qs += '&reason=' + REASON[kind];
    return qs;
  }

  function showCallbackStatus(kind) {
    try {
      history.replaceState(null, '', location.pathname + callbackUrl(kind));
    } catch (e) {}
  }

  /* 数字码 + reason 反推回这边的结局；老链接里写的是 success 这种词也认 */
  function kindFromQuery(status, reason) {
    if (!status || isNaN(Number(status))) return status || 'success';
    if (reason === 'quality') return 'rejected';
    if (reason === 'speeder') return 'speed';
    if (reason === 'screenout') return 'kick';
    if (reason === 'quota') return 'quota';
    if (reason === 'error') return 'fail';
    if (reason === 'fraud') return 'bot';
    var n = Number(status);
    if (n === 1) return 'success';
    if (n === 2) return 'kick';
    if (n === 3) return 'quota';
    if (n === 4) return 'speed';
    return 'fail';
  }

  function showResult(d) {
    $('svForm').hidden = true;
    $('svResult').hidden = false;
    clearInterval(ticker);

    var kind = d.result || 'success';
    var code = d.code == null ? CODE[kind] : d.code;
    $('svResKind').textContent = 'STATUS ' + code + ' · '
      + (CODE_DESC[code] || (KIND[kind] || kind)) + T(' / ' + (d.elapsed || 0) + ' 秒',
        ' / ' + (d.elapsed || 0) + 's');
    $('svResTitle').textContent = KIND[kind] || kind;
    $('svResDesc').textContent = DESC[kind] || '';

    var steps = (d.steps || []).map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('');
    $('svSteps').innerHTML = steps;

    if (d.pending) waitReject(d.delay);
  }

  /* 打回：前端只做倒计时，到点问服务端，冲正由后端做 */
  function waitReject(delay) {
    var left = Number(delay) || 30;
    var due = Date.now() + left * 1000;

    var tip = $('svResDesc');
    var base = tip ? tip.textContent : '';

    var tick = function () {
      var s = Math.max(0, Math.round((due - Date.now()) / 1000));
      if (tip) tip.textContent = base + T(' 质检还剩 ' + s + ' 秒。', ' Quality check in ' + s + 's.');
    };
    tick();
    clearInterval(poller);
    poller = setInterval(tick, 1000);

    var ask = function () {
      var qs = '?id=' + id + (attempt ? '&attempt=' + attempt : '');
      fetch('/api/surveys/poll' + qs, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) return;
          if (d.done) {
            clearInterval(poller);
            if (d.rejected) {
              /* 回调跟着改：地址栏从 status=1 变成 status=4&reason=quality */
              var keep = loadResult() || { elapsed: 0, steps: [] };
              keep.result = 'rejected';
              keep.code = 4;
              keep.pending = false;
              keep.at = Date.now();
              try { sessionStorage.setItem(resKey(), JSON.stringify(keep)); } catch (e) {}

              $('svResKind').textContent = T('STATUS 4 · 质检终止 / ' + (keep.elapsed || 0) + ' 秒',
      'STATUS 4 · QC terminated / ' + (keep.elapsed || 0) + 's');
              $('svResTitle').textContent = T('被打回了', 'Rejected');
              if (tip) tip.textContent = T('质检没通过：奖励已经扣回，经验 −8。',
      'Quality check failed — reward reversed, 8 experience deducted.');
              var ul = $('svSteps');
              if (ul) {
                ul.insertAdjacentHTML('beforeend',
                  T('<li>质检结论：答卷无效</li><li>奖励冲正，经验 −8，参与记录标记为打回</li>','<li>Verdict: response invalid</li><li>Reward reversed, 8 experience deducted, the attempt is marked as rejected</li>'));
              }
              showCallbackStatus('rejected');
            }
            return;
          }
          setTimeout(ask, 1200);
        })
        .catch(function () { setTimeout(ask, 2000); });
    };
    setTimeout(ask, Math.min(4000, (left + 1) * 1000));
  }

  /* ---------- 启动 ---------- */

  function loadMe() {
    fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.replace((window.CF && CF.goto ? CF.goto('/login') : '/login') + '?next=' + encodeURIComponent(location.pathname + location.search)); return null; }
        return r.json();
      })
      .then(function (d) {
        var u = d && d.user;
        if (!u) return;
        myUid = u.uid || 0;
        if (window.CF && CF.cache) CF.cache.set(u);
        var bal = $('navBal');
        if (bal) bal.textContent = u.fc;
        var nm = $('navName');
        if (nm) nm.textContent = u.username || T('我','Me');
      })
      .catch(function () {});
  }

  /* 回调进来（?status=1&pid=…&tid=…）：只画结果，绝不再开一份新卷子 */
  function renderCallback() {
    var saved = loadResult();
    var kind = kindFromQuery(pageStatus, query.get('reason') || '');
    var d;

    if (saved && saved.result === kind) {
      d = saved;
      if (d.pending) {
        /* 刷新前已经在等质检：按当时的时间点接着倒数，不重新给 30 秒 */
        var left = Math.round((d.at + (d.delay || 30) * 1000 - Date.now()) / 1000);
        d.delay = Math.max(1, left);
      }
    } else {
      d = {
        result: kind,
        code: Number(pageStatus) || CODE[kind],
        elapsed: Number(query.get('elapsed')) || 0,
        steps: []
      };
    }

    $('svTitle').textContent = T('答卷已提交','Response submitted');
    $('svMeta').textContent = T('结局由问卷商回调带回','The outcome arrives via the provider callback')
      + (query.get('tid') ? ' · tid ' + query.get('tid') : '');
    var tm = $('svTimer');
    if (tm) tm.hidden = true;   /* 已经交卷了，别再挂个「用时 0 秒」 */
    showResult(d);
  }

  function boot() {
    if (!id) {
      note(T('地址里少了问卷编号。回大厅重新点一次。','The survey ID is missing from the URL. Go back to the hall and click again.'), true);
      return;
    }

    loadMe();

    if (pageStatus) {
      renderCallback();
      return;
    }

    fetch('/api/surveys/paper?id=' + id + (window.CF_FP ? '&fp=' + encodeURIComponent(window.CF_FP) : ''), { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { location.replace((window.CF && CF.goto ? CF.goto('/login') : '/login') + '?next=' + encodeURIComponent(location.pathname + location.search)); return null; }
        return r.json();
      })
      .then(function (d) {
        if (!d) return;

        if (!d.ok) {
          if (d.error === 'already_done' && d.reason === 'device') {
            $('svTitle').textContent = T('这台设备已经交过这份问卷','This device already completed this survey');
            $('svMeta').textContent = T('同一台机器只能算一次，换网络也一样。','One response per machine — changing network does not help.');
            note(T('想再做一份，得换台设备。','To do another, use a different device.'), false);
          } else if (d.error === 'already_done') {
            $('svTitle').textContent = T('这个网络已经交过这份问卷','This network already completed this survey');
            $('svMeta').textContent = T('同一份问卷同一个 IP 只能参与一次。','One response per survey per IP address.');
            note(T('换了网络之后可以再来一次。','You can try again on a different network.'), false);
          } else if (d.error === 'risk_limited') {
            $('svTitle').textContent = T('开卷太频繁','Too many starts');
            $('svMeta').textContent = d.message || '';
          } else if (d.error === 'not_inline') {
            $('svTitle').textContent = T('这份问卷要跳转到问卷商页面','This survey opens on the provider page');
            $('svMeta').textContent = T('回大厅点入口就能进去。','Go back to the hall and use the entry there.');
          } else if (d.error === 'not_found') {
            $('svTitle').textContent = T('问卷不存在或已下架','Survey missing or delisted');
          } else {
            $('svTitle').textContent = T('这份问卷现在打不开','This survey cannot be opened right now');
            $('svMeta').textContent = d.error || '';
          }
          return;
        }

        paper = d.survey;
        paper.questions = d.questions;   /* 题面在 d.questions 里，surevy 只有基本信息 */
        startedAt = d.startedAt;
        attempt = Number(d.attempt) || 0;

        $('svTitle').textContent = paper.title;
        $('svMeta').textContent = [
          T(d.questions.length + ' 题', d.questions.length + (d.questions.length === 1 ? ' question' : ' questions')),
          paper.durationMin ? T('约 ' + paper.durationMin + ' 分钟', 'about ' + paper.durationMin + ' min') : '',
          paper.provider || ''
        ].filter(Boolean).join(' · ');
        $('svReward').textContent = '+' + paper.price;
        rewardText = String(paper.price || '').replace(/[^\d.]/g, '');
        if (paper.requirement) {
          var req = $('svReq');
          req.hidden = false;
          req.textContent = '';
          var lab = document.createElement('span');
          lab.className = 'sv-req__k';
          lab.textContent = T('要求：', 'Requires:');
          req.appendChild(lab);
          /* 样本条件是问卷商写的原文，标记跳过翻译 */
          var rv = document.createElement('span');
          rv.setAttribute('data-tr-skip', '');
          rv.textContent = paper.requirement;
          req.appendChild(rv);
        }

        paintQuestions(d.questions);
        $('svForm').hidden = false;
        startTimer();
      })
      .catch(function () {
        note(T('载入失败，刷新一下再试。','Load failed. Refresh and retry.'), true);
      });
  }

  var form = $('svForm');
  if (form) {
    form.addEventListener('change', updateProgress);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var pick = picked();
      var total = paper ? paper.questions.length : 0;
      if (Object.keys(pick).length < total) {
        say(T('还有题目没选','Some questions are unanswered'));
        return;
      }

      var answers = paper.questions.map(function (q, i) {
        return { q: i, o: pick[i] };
      });

      var btn = $('svSend');
      if (btn) { btn.disabled = true; btn.textContent = T('提交中…','Submitting…'); }
      $('svTip').textContent = T('正在交给问卷商核验…','Verifying with the provider…');

      fetch('/api/surveys/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: id, answers: answers, attempt: attempt,
          fp: window.CF_FP || '',
          hp: (($('svHp') || {}).value) || ''
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok) {
            if (btn) { btn.disabled = false; btn.textContent = T('提交答卷','Submit'); }
            $('svTip').textContent = '';
            if (d && d.error === 'already_done') {
              note(T('这个 IP 已经交过这份问卷了，换个网络可以再来一次。','This IP already completed this survey — try again on another network.'), true);
              $('svForm').hidden = true;
              return;
            }
            if (d && d.error === 'proxy_banned') {
              note(T('检测到代理 / VPN 网络，账号已被封禁。去设置页看封禁记录。','Proxy or VPN detected — the account is banned. See the ban log in settings.'), true);
              $('svForm').hidden = true;
              return;
            }
            if (d && d.error === 'risk_limited') {
              note(d.message || T('先歇一会儿再交。','Take a short break before submitting.'), true);
              return;
            }
            say('提交失败：' + ((d && d.error) || T('未知错误','Unknown error')));
            return;
          }
          /* 打回时这笔钱确实到账了，revenue 照报价报；其余失败结局报 0 */
          if (!d.pending && d.reward) rewardText = String(d.reward).replace(/[^\d.]/g, '');
          saveResult(d);
          showCallbackStatus(d.result || 'success');
          showResult(d);
          if (window.CF && CF.cache) CF.cache.clear();
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = T('提交答卷','Submit'); }
          $('svTip').textContent = T('网络不稳，再点一次提交。','The network is unstable — submit again.');
        });
    });
  }

  boot();
})();
