-- 工单加内部备注列（后台可见，用户看不到），与 reply 分开
ALTER TABLE tickets ADD COLUMN note TEXT NOT NULL DEFAULT '';
