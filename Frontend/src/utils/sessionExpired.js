// The backend answers a missing, expired or invalid session token with HTTP 200 and a
// small error body, e.g. {"code":"010","message":"Session Token Invalid"}. Code that only
// checks `res.ok` then treats that body as "no data", so an expired login shows up as an
// empty receipt list. This recognises that reply so the app can send the user to log in.
//
// Deliberately narrow: only a plain object (never a list of receipts) that carries the
// session code "010", or a message that is plainly about the session token.
const SESSION_MESSAGE = /session\s+token\s+(is\s+)?(invalid|expired)|token\s+(is\s+)?expired/i;

export const isSessionExpiredResponse = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (String(data.code ?? data.error_code ?? "").trim() === "010") return true;
  const message = data.message ?? data.msg;
  return typeof message === "string" && SESSION_MESSAGE.test(message);
};
