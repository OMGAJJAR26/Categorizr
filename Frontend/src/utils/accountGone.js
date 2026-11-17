import { isSessionExpiredResponse } from "./sessionExpired.js";

// The backend answers requests for an account that no longer exists with a small error
// body, e.g. {"message":"User not found"} or "Account has been deleted". Match those
// phrases narrowly (the subject must be the user/account itself, so "Store not found" or
// "User store deleted successfully" do not count) so an ordinary reply is never mistaken
// for a deleted account.
const ACCOUNT_GONE =
  /\b(?:user|account)\b(?:\s+(?:account|is|has|have|had|was|been|already))*\s+(?:deleted|removed|deactivated|disabled|not found|does not exist|doesn't exist|no longer exists?)\b|\b(?:deleted|deactivated|disabled)\s+(?:user|account)\b/i;

export const isAccountGoneResponse = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const message = data.message ?? data.msg;
  return typeof message === "string" && ACCOUNT_GONE.test(message);
};

// Why the server stopped recognising this login:
//   "gone"    - the account was deleted / is unavailable
//   "expired" - the session token is no longer valid
//   null      - an ordinary reply
export const classifyAuthFailure = (data) => {
  if (isAccountGoneResponse(data)) return "gone";
  if (isSessionExpiredResponse(data)) return "expired";
  return null;
};
