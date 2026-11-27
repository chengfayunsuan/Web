-- ============================================================
-- 031 · 全站统一为 XD（乘法刀）
--
-- 背景：以前内部按 XB（乘法币，锚人民币，1 XB = 1 元）记账，XD 只在展示层按
--       实时汇率换算。现在废掉 XB，库里的金额一律改成 XD（100 XD = 1 美元）。
--
-- 换算公式：new_units = ROUND(old_units * 100 / rate)
--   rate = fx_rate.usd_cny（1 美元兑多少人民币，取 id = 1 那一行）
--   推导：old = 人民币 × 10000；new = XD × 10000 = (人民币 / rate × 100) × 10000
--
-- 一次性：所有 UPDATE 都带 `NOT EXISTS (app_meta.k = 'unit_migrated')` 守卫，
--          末尾写入该标记；脚本重复执行不会二次折算。
--          整段包在事务里，中途失败则整体回滚，不会只折算一半。
--
-- 执行前检查（务必先看）：
--   1) 确认汇率正确：
--        SELECT id, usd_cny FROM fx_rate WHERE id = 1;
--   2) 确认 store_items 有 price_xd 列（代码已在读它，线上通常已有）：
--        PRAGMA table_info(store_items);
--      若没有 price_xd，先单独执行下面这句（SQLite 不支持 ADD COLUMN IF NOT EXISTS，
--      所以只能手动判断，已存在时执行会报 duplicate column 错误）：
--        ALTER TABLE store_items ADD COLUMN price_xd INTEGER NOT NULL DEFAULT 0;
-- ============================================================

BEGIN TRANSACTION;

-- 用户余额
UPDATE users
   SET fc_units  = CAST(ROUND(fc_units  * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER),
       fc_frozen = CAST(ROUND(fc_frozen * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 收支流水（金额与结余快照同比例折算，保持历史一致性）
UPDATE fc_ledger
   SET delta   = CAST(ROUND(delta   * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER),
       balance = CAST(ROUND(balance * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 提现
UPDATE withdrawals
   SET amount = CAST(ROUND(amount * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 兑换订单
UPDATE orders
   SET price_units = CAST(ROUND(price_units * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 站内问卷
UPDATE surveys
   SET price_units = CAST(ROUND(price_units * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 商品：定价真相是 price_xd（整数 XD）。
--   price_xd > 0 的商品直接按整数 XD 换算成 units；
--   老商品（price_xd = 0）沿用按汇率折算 price_units。
UPDATE store_items
   SET price_units = CASE
         WHEN price_xd > 0 THEN price_xd * 10000
         ELSE CAST(ROUND(price_units * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
       END
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 广告墙 / 问卷墙任务流水
UPDATE mo_task
   SET reward_units = CAST(ROUND(reward_units * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 兑换码面额
UPDATE cdk_codes
   SET value_units = CAST(ROUND(value_units * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 好感度日结入账量
UPDATE affinity_daily
   SET earned = CAST(ROUND(earned * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 实验台记录
UPDATE lab_run
   SET reward_units = CAST(ROUND(reward_units * 100.0 / (SELECT usd_cny FROM fx_rate WHERE id = 1)) AS INTEGER)
 WHERE NOT EXISTS (SELECT 1 FROM app_meta WHERE k = 'unit_migrated');

-- 记录本次迁移使用的汇率，供事后核对
INSERT OR IGNORE INTO app_meta (k, v)
SELECT 'unit_migrated', CAST(COALESCE((SELECT usd_cny FROM fx_rate WHERE id = 1), 7.0) AS TEXT);

COMMIT;
