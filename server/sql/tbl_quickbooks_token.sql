-- Categorizr QuickBooks tables (SiteGround MySQL, same DB as tbl_user)
-- The Node app reads/writes `tbl_quickbooks_token` (one row per user).

CREATE TABLE IF NOT EXISTS `tbl_quickbooks_token` (
  `fk_user_id` VARCHAR(64) NOT NULL,
  `realm_id` VARCHAR(128) DEFAULT NULL,
  `access_token` TEXT DEFAULT NULL,
  `refresh_token` TEXT DEFAULT NULL,
  `token_json` LONGTEXT DEFAULT NULL,
  `expires_at` BIGINT DEFAULT NULL,
  `created_at` BIGINT NOT NULL,
  `updated_at` BIGINT NOT NULL,
  PRIMARY KEY (`fk_user_id`),
  KEY `idx_realm_id` (`realm_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- After a successful connect:
-- SELECT * FROM tbl_quickbooks_token WHERE fk_user_id = ?;
