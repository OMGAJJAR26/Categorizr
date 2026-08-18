// server/services/quickbooksTokenStore.js
//
// QuickBooks OAuth token store + auto-refresh — all in Node, backed by MySQL.
// Writes to BOTH tables so a SiteGround handoff of either name still works:
//   - quickbooks_tokens        (staging’s original table)
//   - tbl_quickbooks_token     (SQL handoff table)
// Linked receipts live in tbl_quickbooks_linked_receipt (one row per receipt).
//
// Required env vars (set in Render — never hardcode secrets):
//   DB_HOST, DB_PORT (default 3306), DB_USER, DB_PASS, DB_NAME
//   QB_CLIENT_ID, QB_CLIENT_SECRET   (already set for the OAuth flow)
//
// NOTE: the MySQL host must allow remote connections from the Node host
// (SiteGround: Site Tools > MySQL > Remote — allow-list the Render outbound IP).

import mysql from "mysql2/promise";
import axios from "axios";

const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh when <5 min of access-token life left
const LEGACY_TOKEN_TABLE = "quickbooks_tokens";
const PRIMARY_TOKEN_TABLE = "tbl_quickbooks_token";
const LINKED_RECEIPT_TABLE = "tbl_quickbooks_linked_receipt";

let pool = null;
let tokenTablesReady = false;
let linkedTableReady = false;

export function isMysqlConfigured() {
  return Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
}

function getPool() {
  if (!isMysqlConfigured()) {
    throw new Error("MySQL is not configured (set DB_HOST, DB_USER, DB_PASS, DB_NAME on Render).");
  }
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      charset: "utf8mb4",
      timezone: "Z",
      connectTimeout: 8000,
    });
  }
  return pool;
}

const toMysqlUTC = (date) => date.toISOString().slice(0, 19).replace("T", " ");

async function ensureTokenTables() {
  if (tokenTablesReady) return;
  const db = getPool();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${LEGACY_TOKEN_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      fk_user_id VARCHAR(64) NOT NULL,
      realm_id VARCHAR(64) NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      access_token_expires_at DATETIME NOT NULL,
      refresh_token_expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_fk_user (fk_user_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${PRIMARY_TOKEN_TABLE} (
      fk_user_id VARCHAR(64) NOT NULL,
      realm_id VARCHAR(128) DEFAULT NULL,
      access_token TEXT DEFAULT NULL,
      refresh_token TEXT DEFAULT NULL,
      token_json LONGTEXT DEFAULT NULL,
      expires_at BIGINT DEFAULT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (fk_user_id),
      KEY idx_realm_id (realm_id)
    )
  `);
  tokenTablesReady = true;
}

function normalizeTokenRow(row) {
  if (!row) return null;
  if (row.access_token_expires_at) return row;
  if (row.expires_at) {
    const accessExpires = new Date(Number(row.expires_at) * 1000);
    return {
      ...row,
      access_token_expires_at: toMysqlUTC(accessExpires),
      refresh_token_expires_at:
        row.refresh_token_expires_at ||
        toMysqlUTC(new Date(Date.now() + 100 * 24 * 3600 * 1000)),
    };
  }
  return row;
}

async function saveToLegacyTable({
  fkUserId,
  realmId,
  accessToken,
  refreshToken,
  accessExpiresAt,
  refreshExpiresAt,
}) {
  await getPool().execute(
    `INSERT INTO ${LEGACY_TOKEN_TABLE}
       (fk_user_id, realm_id, access_token, refresh_token,
        access_token_expires_at, refresh_token_expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       realm_id                 = VALUES(realm_id),
       access_token             = VALUES(access_token),
       refresh_token            = VALUES(refresh_token),
       access_token_expires_at  = VALUES(access_token_expires_at),
       refresh_token_expires_at = VALUES(refresh_token_expires_at)`,
    [fkUserId, realmId, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt]
  );
}

async function saveToPrimaryTable({
  fkUserId,
  realmId,
  accessToken,
  refreshToken,
  tokenJson,
  expiresIn,
}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Number(expiresIn || 3600);
  const json = tokenJson ? JSON.stringify(tokenJson) : null;
  await getPool().execute(
    `INSERT INTO ${PRIMARY_TOKEN_TABLE}
       (fk_user_id, realm_id, access_token, refresh_token, token_json, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       realm_id      = VALUES(realm_id),
       access_token  = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       token_json    = VALUES(token_json),
       expires_at    = VALUES(expires_at),
       updated_at    = VALUES(updated_at)`,
    [fkUserId, realmId, accessToken, refreshToken, json, expiresAt, now, now]
  );
}

export async function saveQuickBooksToken({
  fkUserId,
  realmId,
  accessToken,
  refreshToken,
  expiresIn = 3600,
  xRefreshExpiresIn = 8726400,
  tokenJson = null,
}) {
  if (!fkUserId || !realmId || !accessToken || !refreshToken) {
    throw new Error("Cannot save QuickBooks token: missing user id, company id, or tokens.");
  }

  try {
    await ensureTokenTables();
  } catch (err) {
    console.warn("Could not auto-create QuickBooks token tables:", err.message);
  }

  const accessExpiresAt = toMysqlUTC(new Date(Date.now() + Number(expiresIn) * 1000));
  const refreshExpiresAt = toMysqlUTC(new Date(Date.now() + Number(xRefreshExpiresIn) * 1000));
  const payload = {
    fkUserId: String(fkUserId),
    realmId: String(realmId),
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    tokenJson,
    expiresIn,
  };

  const errors = [];
  try {
    await saveToLegacyTable(payload);
  } catch (err) {
    errors.push(`${LEGACY_TOKEN_TABLE}: ${err.message}`);
  }
  try {
    await saveToPrimaryTable(payload);
  } catch (err) {
    errors.push(`${PRIMARY_TOKEN_TABLE}: ${err.message}`);
  }

  if (errors.length === 2) {
    throw new Error(`QuickBooks token was not saved. ${errors.join(" | ")}`);
  }
  if (errors.length === 1) {
    console.warn("QuickBooks token saved to one table only:", errors[0]);
  }
}

export async function getQuickBooksToken(fkUserId) {
  if (!fkUserId) return null;
  try {
    await ensureTokenTables();
  } catch (err) {
    console.warn("Could not auto-create QuickBooks token tables:", err.message);
  }

  try {
    const [rows] = await getPool().execute(
      `SELECT * FROM ${LEGACY_TOKEN_TABLE} WHERE fk_user_id = ? LIMIT 1`,
      [String(fkUserId)]
    );
    if (rows[0]) return normalizeTokenRow(rows[0]);
  } catch (err) {
    console.warn(`${LEGACY_TOKEN_TABLE} read failed:`, err.message);
  }

  try {
    const [rows] = await getPool().execute(
      `SELECT * FROM ${PRIMARY_TOKEN_TABLE} WHERE fk_user_id = ? LIMIT 1`,
      [String(fkUserId)]
    );
    if (rows[0]) return normalizeTokenRow(rows[0]);
  } catch (err) {
    console.warn(`${PRIMARY_TOKEN_TABLE} read failed:`, err.message);
  }

  return null;
}

export async function deleteQuickBooksToken(fkUserId) {
  const userId = String(fkUserId || "").trim();
  if (!userId) return;
  try {
    await getPool().execute(`DELETE FROM ${LEGACY_TOKEN_TABLE} WHERE fk_user_id = ?`, [userId]);
  } catch (err) {
    console.warn(`${LEGACY_TOKEN_TABLE} delete failed:`, err.message);
  }
  try {
    await getPool().execute(`DELETE FROM ${PRIMARY_TOKEN_TABLE} WHERE fk_user_id = ?`, [userId]);
  } catch (err) {
    console.warn(`${PRIMARY_TOKEN_TABLE} delete failed:`, err.message);
  }
}

export async function exchangeQuickBooksAuthorizationCode(code) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = process.env.QB_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("QuickBooks env vars missing: QB_CLIENT_ID, QB_CLIENT_SECRET, or QB_REDIRECT_URI.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await axios.post(
    QB_TOKEN_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      timeout: 30000,
    }
  );

  const data = res.data || {};
  if (!data.access_token || !data.refresh_token) {
    throw new Error("QuickBooks token exchange returned no access/refresh token.");
  }
  return data;
}

async function refreshQuickBooksToken(row) {
  const basic = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString("base64");

  const res = await axios.post(
    QB_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      timeout: 30000,
    }
  );

  const d = res.data || {};
  if (!d.access_token) {
    throw new Error("QuickBooks refresh returned no access_token; user must reconnect.");
  }

  const accessToken = d.access_token;
  const refreshToken = d.refresh_token || row.refresh_token;
  const expiresIn = Number(d.expires_in) || 3600;
  const xRefreshExpiresIn = Number(d.x_refresh_token_expires_in) || 8726400;

  await saveQuickBooksToken({
    fkUserId: row.fk_user_id,
    realmId: row.realm_id,
    accessToken,
    refreshToken,
    expiresIn,
    xRefreshExpiresIn,
    tokenJson: d,
  });

  return {
    ...row,
    access_token: accessToken,
    refresh_token: refreshToken,
    access_token_expires_at: toMysqlUTC(new Date(Date.now() + expiresIn * 1000)),
  };
}

/**
 * Returns an always-valid token for the user, refreshing automatically.
 *   { accessToken, refreshToken, realmId, fkUserId }  or  null (not connected).
 */
export async function getValidQuickBooksToken(fkUserId) {
  let row = await getQuickBooksToken(fkUserId);
  if (!row) return null;

  const expiresAt = new Date(row.access_token_expires_at).getTime();
  if (!expiresAt || expiresAt <= Date.now() + REFRESH_BUFFER_MS) {
    row = await refreshQuickBooksToken(row);
  }

  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    realmId: row.realm_id,
    fkUserId: row.fk_user_id,
  };
}

async function ensureLinkedReceiptTable() {
  if (linkedTableReady) return;
  await getPool().execute(`
    CREATE TABLE IF NOT EXISTS ${LINKED_RECEIPT_TABLE} (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      fk_user_id VARCHAR(64) NOT NULL,
      fk_receipt_id VARCHAR(64) NOT NULL,
      purchase_id VARCHAR(64) NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_user_receipt (fk_user_id, fk_receipt_id),
      KEY idx_user (fk_user_id),
      KEY idx_receipt (fk_receipt_id)
    )
  `);
  linkedTableReady = true;
}

export async function getLinkedReceiptIds(fkUserId) {
  if (!fkUserId) return [];
  try {
    await ensureLinkedReceiptTable();
    const [rows] = await getPool().execute(
      `SELECT fk_receipt_id FROM ${LINKED_RECEIPT_TABLE} WHERE fk_user_id = ?`,
      [String(fkUserId)]
    );
    return (rows || []).map((row) => String(row.fk_receipt_id));
  } catch (err) {
    console.warn("QuickBooks linked receipts lookup failed:", err.message);
    return [];
  }
}

export async function addLinkedReceipt(fkUserId, receiptId, purchaseId) {
  const userId = String(fkUserId || "").trim();
  const receipt = String(receiptId || "").trim();
  if (!userId || !receipt) return [];
  await ensureLinkedReceiptTable();
  await getPool().execute(
    `INSERT INTO ${LINKED_RECEIPT_TABLE}
      (fk_user_id, fk_receipt_id, purchase_id, created_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE purchase_id = VALUES(purchase_id)`,
    [userId, receipt, purchaseId ? String(purchaseId) : null, Math.floor(Date.now() / 1000)]
  );
  return getLinkedReceiptIds(userId);
}

export default {
  isMysqlConfigured,
  saveQuickBooksToken,
  getQuickBooksToken,
  deleteQuickBooksToken,
  getValidQuickBooksToken,
  exchangeQuickBooksAuthorizationCode,
  getLinkedReceiptIds,
  addLinkedReceipt,
};
