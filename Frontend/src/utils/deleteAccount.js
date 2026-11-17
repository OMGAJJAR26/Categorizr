import { isSessionExpiredResponse } from "./sessionExpired.js";
import { isAccountGoneResponse } from "./accountGone.js";

// Permanently deletes the signed-in user's account (DELETE /user/deleteuser).
//
// The backend's success reply for this call is not documented, so the reply alone is not
// trusted. After the call we ask the server about the same account again: once the account
// is gone the token stops being accepted ("Session Token Invalid") or the user is "not
// found". That is the proof the deletion happened.
//
// Resolves to one of:
//   { status: "deleted" }                  - the account is gone
//   { status: "session-ended" }            - the login had already expired, nothing was deleted
//   { status: "failed", message }          - the account still exists; message is for the user
const DELETE_URL = "/api/user/deleteuser";
const DETAILS_URL = "/api/user/getuserdetails";
const GENERIC_FAILURE =
  "Your account could not be deleted. Please try again, or contact Customer Care.";

const readJson = async (res) => {
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

const FAILURE_WORDS = /fail|error|invalid|unable|denied|unauthori[sz]ed|not\b/i;
const SUCCESS_WORDS = /success|deleted|removed/i;

// Only used as a tie-breaker when the follow-up check cannot prove anything.
const looksSuccessful = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (body.success === true) return true;
  if (String(body.status ?? "").toLowerCase() === "success") return true;
  const message = body.message ?? body.msg;
  return typeof message === "string" && SUCCESS_WORDS.test(message) && !FAILURE_WORDS.test(message);
};

const userFacingMessage = (body) => {
  const message = body && typeof body === "object" ? (body.message ?? body.msg) : null;
  return typeof message === "string" && message.trim() && message.length <= 140
    ? message.trim()
    : GENERIC_FAILURE;
};

export const deleteAccountOnServer = async (token, doFetch = (...args) => fetch(...args)) => {
  if (!token) return { status: "failed", message: "You are not signed in." };
  const headers = { "Content-Type": "application/json", Accesstoken: token };

  let deleteOk = false;
  let deleteBody = null;
  try {
    const res = await doFetch(DELETE_URL, { method: "DELETE", headers });
    deleteOk = res.ok;
    deleteBody = await readJson(res);
  } catch {
    return {
      status: "failed",
      message: "Could not reach the server. Please check your connection and try again.",
    };
  }

  // The login was already invalid before we asked, so this request deleted nothing.
  if (isSessionExpiredResponse(deleteBody)) return { status: "session-ended" };

  let verification = null;
  try {
    const res = await doFetch(DETAILS_URL, { method: "POST", headers });
    verification = await readJson(res);
  } catch {
    /* fall through to the tie-breaker below */
  }

  if (isSessionExpiredResponse(verification) || isAccountGoneResponse(verification)) {
    return { status: "deleted" };
  }
  if (deleteOk && looksSuccessful(deleteBody)) return { status: "deleted" };
  return { status: "failed", message: userFacingMessage(deleteBody) };
};
