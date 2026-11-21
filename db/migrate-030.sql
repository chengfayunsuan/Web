-- TheoremReach Webhook 的幂等台账 + 用户资料预填需要的三个字段
--
-- hook_event：对方的事件推送会重试一周、还可能乱序到达，同一个 enc_salt 只会处理一次。
--              enc_salt 由对方生成，重发时值不变，正好当唯一键。
--
-- users 三列：update_profile 要的年龄 / 性别 / 邮编。TR 官方明确建议在拉问卷列表前
--             先把这三项注册给它，用户进卷后就不用再被问一遍，转化率明显更好。
--             没有就用空串，别默认成 0 或别的值 —— 空表示「没填」，0 岁是脏数据。

CREATE TABLE IF NOT EXISTS hook_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT '',
  enc_salt TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT '',
  uid INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_hook_event_uid ON hook_event (uid);
CREATE INDEX IF NOT EXISTS idx_hook_event_type ON hook_event (event_type);

ALTER TABLE users ADD COLUMN tr_age TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN tr_gender TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN tr_postal TEXT NOT NULL DEFAULT '';
