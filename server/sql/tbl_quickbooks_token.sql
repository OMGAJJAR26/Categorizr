-- Categorizr QuickBooks tables (SiteGround MySQL, same DB as tbl_user)
-- The Node app auto-creates these if the DB user has CREATE TABLE rights.
-- Run this by hand if auto-create is blocked.

-- Staging originally used `quickbooks_tokens`. The handoff table is
-- `tbl_quickbooks_token`. The app writes to BOTH so either view has a row.

CREATE TABLE IF NOT EXISTS `quickbooks_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fk_user_id` VARCHAR(64) NOT NULL,
  `realm_id` VARCHAR(64) NOT NULL,
  `access_token` TEXT NOT NULL,
  `refresh_token` TEXT NOT NULL,
  `access_token_expires_at` DATETIME NOT NULL,
  `refresh_token_expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_fk_user` (`fk_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tbl_quickbooks_token` (
  `fk_user_id` VARCHAR(64) NOT NULL COMMENT 'Categorizr user id (tbl_user.id)',
  `realm_id` VARCHAR(128) DEFAULT NULL COMMENT 'QuickBooks company/realm id',
  `access_token` TEXT DEFAULT NULL COMMENT 'Short-lived QBO access token',
  `refresh_token` TEXT DEFAULT NULL COMMENT 'Long-lived QBO refresh token (~100 days)',
  `token_json` LONGTEXT DEFAULT NULL COMMENT 'Full Intuit OAuth token JSON',
  `expires_at` BIGINT DEFAULT NULL COMMENT 'Access token expiry as UNIX seconds',
  `created_at` BIGINT NOT NULL COMMENT 'UNIX seconds',
  `updated_at` BIGINT NOT NULL COMMENT 'UNIX seconds',
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

-- After a successful connect, you should see a row in BOTH token tables:
-- SELECT * FROM tbl_quickbooks_token WHERE fk_user_id = ?;
-- SELECT * FROM quickbooks_tokens WHERE fk_user_id = ?;
-- SELECT fk_receipt_id FROM tbl_quickbooks_linked_receipt WHERE fk_user_id = ?;
