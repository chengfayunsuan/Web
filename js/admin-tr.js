/* ============================================================
   Chengfa · 后台问卷墙
   TheoremReach 官方收入报表：按天按国家。数据来自
   /api/admin/theoremreach/reports，是对方结算给我们的美元，
   跟站内入账（已扣分成）不是同一个数，只用来看账对不对。
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

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
    return fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; })
          .then(function (b) { return { status: res.status, body: b }; });
      })
      .catch(function () { return { status: 0, body: {} }; });
  }

  function cell(text, cls) {
    var d = document.createElement('div');
    d.className = 'adm-cell' + (cls ? ' ' + cls : '');
    d.textContent = text == null ? '' : String(text);
    return d;
  }

  /* 报表里的 at 形如 "2020-01-29 00:00:00 UTC"，只取日期够看 */
  function dayOf(s) {
    var t = String(s || '');
    var m = t.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : (t || '—');
  }

  function usd(v) {
    var n = Number(v) || 0;
    return '$' + n.toFixed(2);
  }

  function paint(d) {
    var box = $('trRowsBox');
    var empty = $('trEmpty');
    if (!box) return;

    var rows = (d && d.rows) || [];
    box.textContent = '';

    if ($('trRev')) $('trRev').textContent = usd(d && d.summary ? d.summary.revenue : 0);
    if ($('trConv')) $('trConv').textContent = String(d && d.summary ? d.summary.conversions : 0);
    if ($('trRows')) $('trRows').textContent = String(rows.length);

    if (!rows.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'adm-tr adm-tr--mtx';
      row.appendChild(cell(dayOf(r.at)));
      row.appendChild(cell((r.app || '—') + (r.platform ? ' · ' + r.platform : '')));
      row.appendChild(cell(r.country || '—'));
      row.appendChild(cell(usd(r.revenue)));
      row.appendChild(cell(String(r.conversions || 0)));
      box.appendChild(row);
    });
  }

  getJSON('/api/admin/theoremreach/reports?days=7').then(function (r) {
    if (r.status === 401 || r.status === 403) {
      paint(null);
      say('没有后台权限，用站长账号登录再试');
      return;
    }
    if (!r.body || !r.body.ok) {
      paint(null);
      if (r.body && r.body.error === 'not_configured') {
        say('服务商密钥没配全，报表拉不到');
      } else if (r.body && r.body.error === 'upstream') {
        say('服务商接口返回 ' + (r.body.status || '错误') + '，稍后再看');
      } else {
        say('报表拉取失败');
      }
      return;
    }
    paint(r.body);
  });
})();
