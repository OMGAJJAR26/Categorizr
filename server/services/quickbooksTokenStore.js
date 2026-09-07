// server/services/quickbooksTokenStore.js
//
// QuickBooks OAuth tokens are stored in SiteGround MySQL table
// `tbl_quickbooks_token` (one row per Categorizr user).
// Linked receipts live in `tbl_quickbooks_linked_receipt`.
//
// Required env vars (set in Render — never hardcode secrets):
//   DB_HOST, DB_PORT (default 3306), DB_USER, DB_PASS, DB_NAME
//   QB_CLIENT_ID, QB_CLIENT_SECRET
// Optional:
//   QB_TOKEN_TABLE=tbl_quickbooks_token
//
// SiteGround: Site Tools > MySQL > Remote — allow-list the Render outbound IP.

import mysql from "mysql2/promise";
import axios from "axios";

const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TABLE = "tbl_quickbooks_token";
const FALLBACK_TOKEN_TABLES = ["tbl_quickbooks_online", "quickbooks_tokens"];
const LINKED_RECEIPT_TABLE = "tbl_quickbooks_linked_receipt";

let pool = null;
let cachedTokenTable = null;
const columnCache = new Map();
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

function preferredTokenTable() {
  return String(process.env.QB_TOKEN_TABLE || DEFAULT_TOKEN_TABLE).trim() || DEFAULT_TOKEN_TABLE;
}

async function listQuickBooksTables() {
  const [rows] = await getPool().query(
    `SELECT TABLE_NAME AS name
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND LOWER(TABLE_NAME) LIKE '%quickbooks%'`
  );
  return (rows || []).map((row) => row.name).filter(Boolean);
}

async function tableExists(tableName) {
  const [rows] = await getPool().query(
    `SELECT TABLE_NAME AS name
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1`,
    [tableName]
  );
  return Boolean(rows?.[0]);
}

async function resolveTokenTable() {
  if (cachedTokenTable) return cachedTokenTable;
  const candidates = [
    preferredTokenTable(),
    DEFAULT_TOKEN_TABLE,
    ...FALLBACK_TOKEN_TABLES,
  ].filter((name, idx, arr) => name && arr.indexOf(name) === idx);

  for (const tableName of candidates) {
    if (await tableExists(tableName)) {
      cachedTokenTable = tableName;
      console.log(`Using QuickBooks token table: ${tableName}`);
      return cachedTokenTable;
    }
  }

  const existing = await listQuickBooksTables();
  const usable = existing.filter(
    (name) => String(name).toLowerCase() !== LINKED_RECEIPT_TABLE
  );
  if (usable.length) {
    console.warn(
      `Preferred QuickBooks token tables not found. Using existing table "${usable[0]}". Found: ${existing.join(", ")}`
    );
    cachedTokenTable = usable[0];
    return cachedTokenTable;
  }

  try {
    await ensureTokenTable();
    cachedTokenTable = DEFAULT_TOKEN_TABLE;
    return cachedTokenTable;
  } catch (err) {
    throw new Error(
      `QuickBooks token table "${DEFAULT_TOKEN_TABLE}" does not exist and could not be created: ${err.message}`
    );
  }
}

async function ensureTokenTable() {
  await getPool().execute(`
    CREATE TABLE IF NOT EXISTS \`${DEFAULT_TOKEN_TABLE}\` (
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
}

async function getTableColumns(tableName) {
  if (columnCache.has(tableName)) return columnCache.get(tableName);
  const [rows] = await getPool().query(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, EXTRA AS extra, COLUMN_KEY AS columnKey
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  const columns = (rows || []).map((row) => ({
    name: row.name,
    dataType: String(row.dataType || "").toLowerCase(),
    extra: String(row.extra || "").toLowerCase(),
    columnKey: String(row.columnKey || "").toLowerCase(),
  }));
  if (!columns.length) {
    throw new Error(`Could not read columns for ${tableName}. Check DB_NAME and table name.`);
  }
  columnCache.set(tableName, columns);
  return columns;
}

function pickColumn(columns, aliases) {
  const wanted = aliases.map((name) => name.toLowerCase());
  return columns.find((col) => wanted.includes(col.name.toLowerCase())) || null;
}

function valueForColumn(column, unixSeconds, datetimeUtc) {
  if (["datetime", "timestamp", "date"].includes(column.dataType)) return datetimeUtc;
  return unixSeconds;
}

function tokenFieldMap(row) {
  if (!row) return null;
  const accessToken = row.access_token || row.accessToken || row.qb_access_token || null;
  const refreshToken = row.refresh_token || row.refreshToken || row.qb_refresh_token || null;
  const realmId = row.realm_id || row.realmId || row.company_id || row.qb_realm_id || null;
  const fkUserId = row.fk_user_id || row.user_id || row.fkUserId || null;
  let accessExpiresAt = row.access_token_expires_at || null;
  if (!accessExpiresAt && row.expires_at) {
    const raw = Number(row.expires_at);
    accessExpiresAt = raw > 1e12 ? toMysqlUTC(new Date(raw)) : toMysqlUTC(new Date(raw * 1000));
  }
  return {
    ...row,
    fk_user_id: fkUserId,
    realm_id: realmId,
    access_token: accessToken,
    refresh_token: refreshToken,
    access_token_expires_at: accessExpiresAt,
  };
}

async function saveToResolvedTable({
  fkUserId,
  realmId,
  accessToken,
  refreshToken,
  expiresIn = 3600,
  xRefreshExpiresIn = 8726400,
  tokenJson = null,
}) {
  const table = await resolveTokenTable();
  const columns = await getTableColumns(table);
  const writable = columns.filter((col) => !col.extra.includes("auto_increment"));

  const nowUnix = Math.floor(Date.now() / 1000);
  const accessUnix = nowUnix + Number(expiresIn || 3600);
  const refreshUnix = nowUnix + Number(xRefreshExpiresIn || 8726400);
  const accessUtc = toMysqlUTC(new Date(accessUnix * 1000));
  const refreshUtc = toMysqlUTC(new Date(refreshUnix * 1000));
  const nowUtc = toMysqlUTC(new Date());

  const userCol = pickColumn(writable, ["fk_user_id", "user_id", "fkUserId"]);
  if (!userCol) {
    throw new Error(
      `${table} has no user id column (expected fk_user_id). Columns: ${columns.map((c) => c.name).join(", ")}`
    );
  }

  const assignments = new Map();
  const setIfPresent = (aliases, value) => {
    const col = pickColumn(writable, aliases);
    if (col && value != null) assignments.set(col.name, value);
  };

  setIfPresent(["fk_user_id", "user_id", "fkUserId"], String(fkUserId));
  setIfPresent(["realm_id", "realmId", "company_id", "qb_realm_id", "qb_company_id"], String(realmId));
  setIfPresent(["access_token", "accessToken", "qb_access_token"], accessToken);
  setIfPresent(["refresh_token", "refreshToken", "qb_refresh_token"], refreshToken);
  setIfPresent(["token_json", "token_data", "tokens", "raw_token"], tokenJson ? JSON.stringify(tokenJson) : null);

  const accessExpCol = pickColumn(writable, ["access_token_expires_at", "expires_at", "expiry", "token_expiry"]);
  if (accessExpCol) {
    assignments.set(accessExpCol.name, valueForColumn(accessExpCol, accessUnix, accessUtc));
  }
  const refreshExpCol = pickColumn(writable, ["refresh_token_expires_at"]);
  if (refreshExpCol) {
    assignments.set(refreshExpCol.name, valueForColumn(refreshExpCol, refreshUnix, refreshUtc));
  }
  const createdCol = pickColumn(writable, ["created_at", "createdAt"]);
  const updatedCol = pickColumn(writable, ["updated_at", "updatedAt"]);
  if (updatedCol) {
    assignments.set(updatedCol.name, valueForColumn(updatedCol, nowUnix, nowUtc));
  }

  const insertAssignments = new Map(assignments);
  if (createdCol) {
    insertAssignments.set(createdCol.name, valueForColumn(createdCol, nowUnix, nowUtc));
  }

  if (insertAssignments.size < 4) {
    throw new Error(
      `${table} does not have enough token columns to save a connection. Columns: ${columns.map((c) => c.name).join(", ")}`
    );
  }

  const updateCols = [...assignments.keys()].filter(
    (name) => name.toLowerCase() !== userCol.name.toLowerCase()
  );
  if (updateCols.length) {
    const [updateResult] = await getPool().execute(
      `UPDATE \`${table}\`
          SET ${updateCols.map((name) => `\`${name}\` = ?`).join(", ")}
        WHERE \`${userCol.name}\` = ?`,
      [...updateCols.map((name) => assignments.get(name)), String(fkUserId)]
    );
    if (updateResult.affectedRows > 0) {
      console.log(`Saved QuickBooks token for user ${fkUserId} in ${table} (update)`);
      return table;
    }
  }

  const insertCols = [...insertAssignments.keys()];
  await getPool().execute(
    `INSERT INTO \`${table}\` (${insertCols.map((name) => `\`${name}\``).join(", ")})
     VALUES (${insertCols.map(() => "?").join(", ")})`,
    insertCols.map((name) => insertAssignments.get(name))
  );
  console.log(`Saved QuickBooks token for user ${fkUserId} in ${table} (insert)`);
  return table;
}

export async function saveQuickBooksToken(payload) {
  if (!payload?.fkUserId || !payload?.realmId || !payload?.accessToken || !payload?.refreshToken) {
    throw new Error("Cannot save QuickBooks token: missing user id, company id, or tokens.");
  }
  await saveToResolvedTable(payload);
}

export async function getQuickBooksToken(fkUserId) {
  if (!fkUserId) return null;
  const table = await resolveTokenTable();
  const columns = await getTableColumns(table);
  const userCol = pickColumn(columns, ["fk_user_id", "user_id", "fkUserId"]);
  if (!userCol) return null;
  const [rows] = await getPool().execute(
    `SELECT * FROM \`${table}\` WHERE \`${userCol.name}\` = ? LIMIT 1`,
    [String(fkUserId)]
  );
  return tokenFieldMap(rows[0] || null);
}

export async function deleteQuickBooksToken(fkUserId) {
  const userId = String(fkUserId || "").trim();
  if (!userId) return { deleted: 0, revoked: false, realmId: null };

  let stored = null;
  if (isMysqlConfigured()) {
    try {
      stored = await getQuickBooksToken(userId);
    } catch (err) {
      console.warn("Could not load QuickBooks token before delete:", err.message);
    }
  }

  let revoked = false;
  const tokenToRevoke = stored?.refresh_token || stored?.access_token;
  if (tokenToRevoke) {
    revoked = await revokeIntuitToken(tokenToRevoke);
  }

  let deleted = 0;
  if (isMysqlConfigured()) {
    deleted = await deleteTokenRowsForUser(userId);
  }

  console.log(
    `QuickBooks disconnect for user ${userId}: deleted ${deleted} row(s), intuit_revoked=${revoked}`
  );
  return { deleted, revoked, realmId: stored?.realm_id || null };
}

async function revokeIntuitToken(token) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  if (!clientId || !clientSecret || !token) return false;
  try {
    await axios.post(
      "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
      { token },
      {
        auth: { username: clientId, password: clientSecret },
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        timeout: 10000,
      }
    );
    return true;
  } catch (err) {
    console.warn("Intuit token revoke failed:", err.response?.data || err.message);
    return false;
  }
}

async function deleteTokenRowsForUser(userId) {
  const tables = new Set();
  for (const name of [preferredTokenTable(), DEFAULT_TOKEN_TABLE, ...FALLBACK_TOKEN_TABLES]) {
    if (name) tables.add(name);
  }
  try {
    tables.add(await resolveTokenTable());
  } catch (err) {
    console.warn("Could not resolve QuickBooks token table:", err.message);
  }
  try {
    for (const name of await listQuickBooksTables()) {
      if (String(name).toLowerCase() !== LINKED_RECEIPT_TABLE) tables.add(name);
    }
  } catch (err) {
    console.warn("Could not list QuickBooks tables:", err.message);
  }

  let deleted = 0;
  const ids = [userId];
  if (/^\d+$/.test(userId)) ids.push(Number(userId));

  for (const table of tables) {
    try {
      if (!(await tableExists(table))) continue;
      const columns = await getTableColumns(table);
      const userCol = pickColumn(columns, ["fk_user_id", "user_id", "fkUserId"]);
      if (!userCol) continue;
      const placeholders = ids.map(() => "?").join(", ");
      const [result] = await getPool().execute(
        `DELETE FROM \`${table}\` WHERE \`${userCol.name}\` IN (${placeholders})`,
        ids
      );
      deleted += Number(result?.affectedRows || 0);
      console.log(
        `Deleted QuickBooks token for user ${userId} from ${table} (affected ${result?.affectedRows || 0})`
      );
    } catch (err) {
      console.warn(`Failed deleting QuickBooks token from ${table}:`, err.message);
    }
  }
  return deleted;
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

export async function getValidQuickBooksToken(fkUserId) {
  let row = await getQuickBooksToken(fkUserId);
  if (!row) return null;

  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (expiresAt && expiresAt <= Date.now() + REFRESH_BUFFER_MS) {
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

// Return the QuickBooks purchase_id a receipt is already linked to, or null.
export async function getLinkedPurchaseId(fkUserId, receiptId) {
  const userId = String(fkUserId || "").trim();
  const receipt = String(receiptId || "").trim();
  if (!userId || !receipt) return null;
  try {
    await ensureLinkedReceiptTable();
    const [rows] = await getPool().execute(
      `SELECT purchase_id FROM ${LINKED_RECEIPT_TABLE}
        WHERE fk_user_id = ? AND fk_receipt_id = ? LIMIT 1`,
      [userId, receipt]
    );
    const pid = rows?.[0]?.purchase_id;
    return pid ? String(pid) : null;
  } catch (err) {
    console.warn("QuickBooks linked purchase lookup failed:", err.message);
    return null;
  }
}

// Remove the link row for a receipt (used after deleting the QB expense).
export async function removeLinkedReceipt(fkUserId, receiptId) {
  const userId = String(fkUserId || "").trim();
  const receipt = String(receiptId || "").trim();
  if (!userId || !receipt) return;
  try {
    await ensureLinkedReceiptTable();
    await getPool().execute(
      `DELETE FROM ${LINKED_RECEIPT_TABLE} WHERE fk_user_id = ? AND fk_receipt_id = ?`,
      [userId, receipt]
    );
  } catch (err) {
    console.warn("QuickBooks remove linked receipt failed:", err.message);
  }
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
  getLinkedPurchaseId,
  removeLinkedReceipt,
};
