-- 提现单加收款码图片（base64 dataURL，只有站长审核时用）
ALTER TABLE withdrawals ADD COLUMN qr TEXT NOT NULL DEFAULT '';
