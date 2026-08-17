// server/services/quickbooksTokenStore.js
//
// QuickBooks OAuth token store + auto-refresh — all in Node, backed by MySQL.
// Saves the access + rolling refresh token to `quickbooks_tokens` (keyed by
// fk_user_id) so the connection survives deploys/restarts, and refreshes the
// access token automatically (saving the rotated refresh token back) so the
// user only logs in once.
//
// Required env vars (set in Render — never hardcode secrets):
//   DB_HOST, DB_PORT (default 3306), DB_USER, DB_PASS, DB_NAME
//   QB_CLIENT_ID, QB_CLIENT_SECRET   (already set for the OAuth flow)
//
// NOTE: the MySQL host must allow remote connections from the Node host
// (SiteGround: Site Tools > MySQL > Remote — allow-list the IP).

import mysql from "mysql2/promise";
import axios from "axios";

const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh when <5 min of access-token life left

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
  timezone: "Z",
  connectTimeout: 8000, // fail fast if the DB host is unreachable (e.g. IP not allow-listed)
});

const toMysqlUTC = (date) => date.toISOString().slice(0, 19).replace("T", " ");

export async function saveQuickBooksToken({
  fkUserId,
  realmId,
  accessToken,
  refreshToken,
  expiresIn = 3600,
  xRefreshExpiresIn = 8726400,
}) {
  const accessExpiresAt = toMysqlUTC(new Date(Date.now() + Number(expiresIn) * 1000));
  const refreshExpiresAt = toMysqlUTC(new Date(Date.now() + Number(xRefreshExpiresIn) * 1000));

  await pool.execute(
    `INSERT INTO quickbooks_tokens
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

export async function getQuickBooksToken(fkUserId) {
  const [rows] = await pool.execute(
    "SELECT * FROM quickbooks_tokens WHERE fk_user_id = ? LIMIT 1",
    [fkUserId]
  );
  return rows[0] || null;
}

export async function deleteQuickBooksToken(fkUserId) {
  await pool.execute("DELETE FROM quickbooks_tokens WHERE fk_user_id = ?", [fkUserId]);
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
  const refreshToken = d.refresh_token || row.refresh_token; // QB rotates the refresh token
  const expiresIn = Number(d.expires_in) || 3600;
  const xRefreshExpiresIn = Number(d.x_refresh_token_expires_in) || 8726400;

  await saveQuickBooksToken({
    fkUserId: row.fk_user_id,
    realmId: row.realm_id,
    accessToken,
    refreshToken,
    expiresIn,
    xRefreshExpiresIn,
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

export default pool;
