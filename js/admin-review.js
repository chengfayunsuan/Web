/* ============================================================
   Chengfa · 后台「提现」
   用户只做一件事：把余额提出来。打钱、换卡密、换实物只是到账形式，
   所以这张表把 withdrawals 与 orders 摊平成同一张单子。
   数据仍然分开存，处置各走各的接口，只是不再让你在两个页面之间切。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var CHANNEL = { alipay: '支付宝', wechat: '微信', paypal: 'PayPal', payoneer: 'Payoneer' };

  function trimNum(v) {
    var s = String(v == null ? '' : v);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  function setAmt(el, v) {
    if (window.CF && CF.amount) CF.amount(el, v);
    else if (el) el.textContent = trimNum(v);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  var toastEl = $('toast');
  var toastTimer = null;

  function say(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .catch(function () { return { status: 0, body: null }; });
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data || {})
    }).then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .catch(function () { return { status: 0, body: null }; });
  }

  /* ---------- 状态归一 ----------
     两个来源的 status 说法不一样，这里统一成 pending / done / back 三种，
     文案照各自的业务说人话：钱叫打款，卡密叫发卡密。 */

  var PHASE = {
    wd: { pending: 'pending', approved: 'done', paid: 'done', rejected: 'back' },
    ord: { pending: 'pending', paid: 'done', refunded: 'back' }
  };

  var STATUS_TEXT = {
    wd: { pending: '待处理', approved: '已通过', paid: '已打款', rejected: '已退回' },
    ord: { pending: '待处理', paid: '已发卡密', refunded: '已退回' }
  };

  var TAG = { pending: 'is-pending', done: 'is-paid', back: 'is-rejected' };

  var filter = 'pending';
  var rows = [];

  /* ---------- 摊平 ---------- */

  function fromWd(w) {
    return {
      src: 'wd',
      key: 'W-' + w.id,
      id: w.id,
      uid: w.uid,
      user: w.username || ('UID ' + w.uid),
      target: (CHANNEL[w.channel] || w.channel || '未知渠道') +
        (w.account ? ' · ' + w.account : ''),
      account: w.account || '',
      channel: w.channel || '',
      amount: w.amount,
      at: w.createdAt || w.at,
      status: w.status,
      phase: PHASE.wd[w.status] || 'pending',
      note: w.reviewNote || '',
      code: ''
    };
  }

  function fromOrd(o) {
    return {
      src: 'ord',
      key: 'O-' + o.id,
      id: o.id,
      uid: o.uid,
      user: o.username || ('UID ' + o.uid),
      target: o.title || '兑换商品',
      account: '',
      channel: '',
      amount: o.price,
      at: o.at || o.createdAt,
      status: o.status,
      phase: PHASE.ord[o.status] || 'pending',
      note: o.memo || '',
      code: o.code || ''
    };
  }

  /* ---------- 行 ---------- */

  function cell(text, cls) {
    var s = document.createElement('span');
    s.className = 'adm-cell' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }

  function amountCell(v) {
    var s = document.createElement('span');
    s.className = 'adm-cell adm-cell--num';
    setAmt(s, v);
    var u = document.createElement('i');
    u.setAttribute('data-cur', 'code');
    u.textContent = 'XD';
    s.appendChild(u);
    return s;
  }

  function statusCell(r) {
    var s = document.createElement('span');
    var tag = document.createElement('span');
    tag.className = 'adm-tag ' + TAG[r.phase];
    tag.textContent = (STATUS_TEXT[r.src] || {})[r.status] || r.status;
    s.appendChild(tag);
    return s;
  }

  function actionCell(r) {
    var s = document.createElement('span');
    s.className = 'adm-acts';

    if (r.phase !== 'pending') {
      var done = document.createElement('span');
      done.className = 'adm-sub';
      done.textContent = '已处理';
      s.appendChild(done);
      return s;
    }

    var main = document.createElement('button');
    main.className = 'btn btn--red btn--s';
    main.type = 'button';
    main.textContent = r.src === 'wd' ? '打款' : '发货';
    main.addEventListener('click', function () { openDecide(r, 'paid'); });
    s.appendChild(main);

    var no = document.createElement('button');
    no.className = 'btn btn--ghost btn--s';
    no.type = 'button';
    no.textContent = r.src === 'wd' ? '驳回' : '退款';
    no.addEventListener('click', function () { openDecide(r, r.src === 'wd' ? 'rejected' : 'refunded'); });
    s.appendChild(no);

    return s;
  }

  function rowNode(r) {
    var row = document.createElement('div');
    row.className = 'adm-tr adm-tr--rv';

    row.appendChild(cell(r.key, 'adm-cell--mono'));
    row.appendChild(cell(r.user));
    row.appendChild(cell(r.target));
    row.appendChild(amountCell(r.amount));
    row.appendChild(cell(fmtTime(r.at), 'adm-cell--mono adm-cell--hide-s'));
    row.appendChild(statusCell(r));
    row.appendChild(cell(r.note || '—', 'adm-note__t'));
    row.appendChild(actionCell(r));

    return row;
  }

  function paint() {
    var list = $('rvList');
    if (!list) return;

    var shown = rows.filter(function (r) { return !filter || r.phase === filter; });

    list.textContent = '';
    shown.forEach(function (r) { list.appendChild(rowNode(r)); });

    var empty = $('rvEmpty');
    if (empty) {
      empty.hidden = shown.length > 0;
      empty.textContent = filter ? '这个状态下没有提现单。' : '还没有提现单。';
    }

    if ($('rvPending')) {
      $('rvPending').textContent = String(rows.filter(function (r) { return r.phase === 'pending'; }).length);
    }
    if ($('rvTotal')) $('rvTotal').textContent = String(rows.length);
  }

  /* ---------- 处置弹窗 ----------
     钱：把收款账号摆在眼前，打完再点确认；
     卡密：手工填码，留空才由后端从码池取。
     两者都带内部备注，用户看不到。 */
  function openDecide(r, action) {
    var isWd = r.src === 'wd';
    var money = isWd && action === 'paid';
    var rejectWd = isWd && action === 'rejected';
    var deliver = !isWd && action === 'paid';
    var refund = !isWd && action === 'refunded';

    var title = money ? '确认打款 · ' + r.user
      : rejectWd ? '驳回提现 · ' + r.user
      : deliver ? '确认发货 · ' + r.user
      : '确认退款 · ' + r.user;

    var desc = money
      ? '按下面账号打款 ' + trimNum(r.amount) + ' XD（' + (CHANNEL[r.channel] || r.channel) + '），打完再回来点确认。'
      : rejectWd
        ? '驳回后 ' + trimNum(r.amount) + ' XD 退回用户可用余额。'
        : deliver
          ? '「' + r.target + '」· ' + trimNum(r.amount) + ' XD。填了兑换码就用它，留空自动从码池取。'
          : '退款会把 ' + trimNum(r.amount) + ' XD 退回用户余额，已发出的卡密一并作废。';

    var fields = [];

    if (isWd) {
      fields.push({
        name: 'account',
        label: '收款账号（' + (CHANNEL[r.channel] || r.channel || '未知渠道') + '）',
        value: r.account || '',
        readonly: true,
        hint: '只读，选中即可复制；打款前核对姓名与账号一致'
      });
    }

    if (deliver) {
      fields.push({
        name: 'code',
        label: '兑换码（留空自动从码池取）',
        type: 'text',
        value: r.code || '',
        maxlength: 200,
        placeholder: '例如：XXXX-XXXX-XXXX'
      });
    }

    fields.push({
      name: 'note',
      label: money || rejectWd ? '备注（内部，用户看不到，会写进流水）' : '备注（内部，用户看不到）',
      type: 'text',
      maxlength: 300,
      placeholder: money ? '例如：支付宝已转，回单号 xx' : '可选'
    });

    CF.modal({
      kicker: money ? 'PAY OUT' : rejectWd ? 'REJECT' : deliver ? 'DELIVER' : 'REFUND',
      title: title,
      desc: desc,
      fields: fields,
      submitText: money ? '确认已打款' : rejectWd ? '确认驳回' : deliver ? '确认发货' : '确认退款',
      onSubmit: function (v, api) {
        api.setBusy(true);

        var url = isWd ? '/api/admin/withdrawals/decide' : '/api/admin/orders/decide';
        var payload = isWd
          ? { id: r.id, action: action, note: v.note || '' }
          : { id: r.id, action: action, code: v.code || '', note: v.note || '' };

        postJSON(url, payload).then(function (res) {
          if (res.body && res.body.ok) {
            api.close();
            say(money ? '已确认打款' : rejectWd ? '已驳回，余额已退回' : deliver ? '已发货' : '已退款');
            load();
          } else {
            api.setBusy(false);
            api.setError('操作失败：' + ((res.body && res.body.error) || '网络错误'));
          }
        });
      }
    });
  }

  /* ---------- 载入 ---------- */

  function load() {
    Promise.all([
      getJSON('/api/admin/withdrawals?status=all'),
      getJSON('/api/admin/orders')
    ]).then(function (res) {
      var a = res[0] || {};
      var b = res[1] || {};
      var wd = (a.body && a.body.ok && a.body.items) || [];
      var od = (b.body && b.body.ok && b.body.items) || [];

      rows = wd.map(fromWd).concat(od.map(fromOrd));
      rows.sort(function (x, y) {
        return String(y.at || '').localeCompare(String(x.at || ''));
      });

      paint();

      if (!a.body || !a.body.ok || !b.body || !b.body.ok) {
        say('部分数据载入失败，请刷新重试');
      }
    });
  }

  /* ---------- 启动 ---------- */

  document.querySelectorAll('#rvFilters .adm-f').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#rvFilters .adm-f').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      filter = b.getAttribute('data-s') || '';
      paint();
    });
  });

  getJSON('/api/auth/me').then(function (r) {
    if (r.status === 401) {
      location.replace('/login?next=' + encodeURIComponent(location.pathname));
      return;
    }
    if (r.status !== 200 || !r.body || !r.body.ok) {
      say('账户信息载入失败，请刷新重试');
      return;
    }

    var me = r.body.user;
    if (me.role !== 'owner' && me.role !== 'admin') {
      location.replace('/home');
      return;
    }

    if (window.CF && CF.cache) CF.cache.set(me);
    if ($('navName')) $('navName').textContent = me.username || '我';
    if ($('navBal') && me.fc) setAmt($('navBal'), me.fc);

    load();
  });
})();
