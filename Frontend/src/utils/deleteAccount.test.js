import test from "node:test";
import assert from "node:assert/strict";
import { deleteAccountOnServer } from "./deleteAccount.js";

// A fake network: `replies` maps "METHOD url" to the reply for that call, and every
// call is recorded so a test can prove exactly what was (and was not) requested.
const fakeNetwork = (replies) => {
  const calls = [];
  const doFetch = async (url, options = {}) => {
    const key = `${options.method || "GET"} ${url}`;
    calls.push({ key, headers: options.headers });
    const reply = replies[key];
    if (reply instanceof Error) throw reply;
    if (!reply) throw new Error(`unexpected call: ${key}`);
    return {
      ok: reply.ok ?? true,
      text: async () => (reply.body === undefined ? "" : JSON.stringify(reply.body)),
    };
  };
  return { doFetch, calls };
};

const DELETE = "DELETE /api/user/deleteuser";
const DETAILS = "POST /api/user/getuserdetails";
const SESSION_GONE = { code: "010", message: "Session Token Invalid" };

test("deleted: the server stops recognising the account afterwards", async () => {
  const net = fakeNetwork({
    [DELETE]: { body: { code: "000", message: "User deleted successfully" } },
    [DETAILS]: { body: SESSION_GONE },
  });
  assert.deepEqual(await deleteAccountOnServer("tok", net.doFetch), { status: "deleted" });
  assert.deepEqual(net.calls.map((c) => c.key), [DELETE, DETAILS]);
  assert.equal(net.calls[0].headers.Accesstoken, "tok");
});

test("deleted even when the delete reply is empty, if the account is gone afterwards", async () => {
  const net = fakeNetwork({ [DELETE]: {}, [DETAILS]: { body: { message: "User not found" } } });
  assert.deepEqual(await deleteAccountOnServer("tok", net.doFetch), { status: "deleted" });
});

test("failed: the account is still there, and the server's message is passed on", async () => {
  const net = fakeNetwork({
    [DELETE]: { body: { code: "005", message: "Could not delete user right now" } },
    [DETAILS]: { body: { id: 7, userName: "sam" } },
  });
  assert.deepEqual(await deleteAccountOnServer("tok", net.doFetch), {
    status: "failed",
    message: "Could not delete user right now",
  });
});

test("failed with a generic message when the server gives none", async () => {
  const net = fakeNetwork({ [DELETE]: { ok: false }, [DETAILS]: { body: { id: 7 } } });
  const result = await deleteAccountOnServer("tok", net.doFetch);
  assert.equal(result.status, "failed");
  assert.match(result.message, /could not be deleted/i);
});

test("an over-long server message is not shown to the user", async () => {
  const net = fakeNetwork({
    [DELETE]: { body: { message: "x".repeat(300) } },
    [DETAILS]: { body: { id: 7 } },
  });
  const result = await deleteAccountOnServer("tok", net.doFetch);
  assert.match(result.message, /could not be deleted/i);
});

test("session-ended: the login had already expired, so nothing was deleted", async () => {
  const net = fakeNetwork({ [DELETE]: { body: SESSION_GONE } });
  assert.deepEqual(await deleteAccountOnServer("tok", net.doFetch), { status: "session-ended" });
  assert.deepEqual(net.calls.map((c) => c.key), [DELETE]);
});

test("a network error on the delete call is a failure and nothing else is requested", async () => {
  const net = fakeNetwork({ [DELETE]: new Error("offline") });
  const result = await deleteAccountOnServer("tok", net.doFetch);
  assert.equal(result.status, "failed");
  assert.match(result.message, /connection/i);
  assert.equal(net.calls.length, 1);
});

test("tie-breaker: an explicit success reply counts when the follow-up check proves nothing", async () => {
  const soft = fakeNetwork({
    [DELETE]: { body: { success: true } },
    [DETAILS]: { body: { id: 7 } },
  });
  assert.deepEqual(await deleteAccountOnServer("tok", soft.doFetch), { status: "deleted" });

  const unreachable = fakeNetwork({
    [DELETE]: { body: { code: "000", message: "Account deleted" } },
    [DETAILS]: new Error("offline"),
  });
  assert.deepEqual(await deleteAccountOnServer("tok", unreachable.doFetch), { status: "deleted" });
});

test("tie-breaker never turns an ambiguous or failing reply into a deletion", async () => {
  const ambiguous = fakeNetwork({ [DELETE]: {}, [DETAILS]: new Error("offline") });
  assert.equal((await deleteAccountOnServer("tok", ambiguous.doFetch)).status, "failed");

  const failing = fakeNetwork({
    [DELETE]: { body: { message: "Delete failed: user not allowed" } },
    [DETAILS]: { body: { id: 7 } },
  });
  assert.equal((await deleteAccountOnServer("tok", failing.doFetch)).status, "failed");
});

test("without a token nothing is requested", async () => {
  const net = fakeNetwork({});
  const result = await deleteAccountOnServer("", net.doFetch);
  assert.equal(result.status, "failed");
  assert.equal(net.calls.length, 0);
});
