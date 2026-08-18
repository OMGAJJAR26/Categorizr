-- Categorizr QuickBooks tables (SiteGround MySQL, same DB as tbl_user)

-- Staging already uses `quickbooks_tokens` for OAuth (one row per user).
-- Keep that table. Add this second table for linked receipts (one row per receipt).

CREATE TABLE IF NOT EXISTS `tbl_quickbooks_linked_receipt` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fk_user_id` VARCHAR(64) NOT NULL COMMENT 'Categorizr user id (tbl_user.id)',
  `fk_receipt_id` VARCHAR(64) NOT NULL COMMENT 'Categorizr receipt id',
  `purchase_id` VARCHAR(64) DEFAULT NULL COMMENT 'QuickBooks Purchase transaction id',
  `created_at` BIGINT NOT NULL COMMENT 'UNIX seconds',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_receipt` (`fk_user_id`, `fk_receipt_id`),
  KEY `idx_user` (`fk_user_id`),
  KEY `idx_receipt` (`fk_receipt_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- After login:
-- SELECT * FROM quickbooks_tokens WHERE fk_user_id = ? LIMIT 1;
-- SELECT fk_receipt_id FROM tbl_quickbooks_linked_receipt WHERE fk_user_id = ?;
