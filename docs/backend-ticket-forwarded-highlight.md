# Backend bug: `getreceiptfromdatev1` marks receipts read on fetch (breaks forwarded "New" highlight)

**Severity:** High — the forwarded-receipt "New" highlight is unusable on every platform.
**Area:** `GET /user/getreceiptfromdatev1`
**Reported:** 2026-10-14 (verified live against staging backend)

## Summary

Listing receipts with `getreceiptfromdatev1` **changes data**: it marks any unread
receipt (`status: "0"`) as read (`status: "1"`) as a side-effect of returning it.
Because the client must fetch the list to display a receipt, the act of showing a
forwarded receipt immediately clears its unread flag — so the blue "New" highlight
disappears within ~2–3 seconds (on the next refresh/sync), without the user ever
opening the receipt.

## Expected behavior

- Listing (`getreceiptfromdatev1`) is a **read** operation and must **not** modify
  `status` (or any other field).
- A receipt's `status` should change `0 → 1` **only** on an explicit
  `updateReceiptv1` with `status: 1` — i.e. when the user actually opens the
  receipt. (The web/iOS/Android clients already send this on open/edit/swipe.)

## Actual behavior

- A received forwarded copy is created with `status: "0"`.
- The **first** `getreceiptfromdatev1` call returns `status: "0"` **but flips it to
  `"1"` server-side**. Every subsequent call returns `"1"`.
- This is not forward-specific: a plain, non-forwarded `status: "0"` receipt is also
  flipped to `"1"` on the next listing. Listing marks everything it returns as read.

## Reproduction (verified live, recipient-side, no client app running)

Acting only with raw API calls (so no frontend write can be involved):

1. `POST /user/forwardreceiptv2` a receipt to user B with `status: 0`.
2. Wait 3.5s doing **no** reads → first `GET /user/getreceiptfromdatev1` for user B
   returns the copy with `status: "0"`. (Proves it is **not** a timer — it stays
   unread while untouched.)
3. Call `GET /user/getreceiptfromdatev1` again → the copy now returns `status: "1"`,
   and stays `"1"` on all further reads.

Observed sequence of the copy's `status` across back-to-back reads right after the
forward: `["0", "1", "1", "1", ...]` — it flips between read #1 and read #2.

During the whole window, a network trace showed **only GET requests** — zero writes
(`updateReceiptv1`/`editReceiptv1`) — confirming the mutation happens inside the
listing endpoint, server-side.

## Impact

- **Forwarded "New" highlight** (keyed off `status !== 1`) renders on the first
  render after arrival, then vanishes on the next list refresh (~2–3s) even though
  nobody opened the receipt. This is the tester's "highlight disappears after 2–3
  seconds" report.
- **Multi-device is worse:** whichever device lists first consumes the unread flag,
  so the other devices read `status: "1"` and never highlight at all — the receipt
  can't be shown as new on both web and the phone.

## Fix

Remove the read-side-effect from `getreceiptfromdatev1` (and any other list/detail
GET): listing must return `status` unchanged. Read-status transitions belong solely
to `updateReceiptv1` (`status: 1`), which clients already call when the user opens,
edits, or swipes to a receipt — and which is confirmed to persist correctly.

## Related items (same area, separate from this bug)

- `receipt_forwarded` "Forwarded" badge — **RESOLVED on the frontend (2026-10-14),
  no backend change needed.** The backend already persists it correctly: when
  `forwardreceiptv2` receives `receipt_forwarded: "1"` in the request body, it sets
  `receipt_forwarded = 1` on the source receipt (`fk_original_receipt_id`) and leaves
  the recipient's new copy at `"0"`. The web was sending `receipt_forwarded: 0` in the
  forward body and relying on a follow-up `updateReceiptv1` (which *does* ignore the
  field) — so the source was never marked. Fixed by sending `"1"` in the forward body,
  matching iOS/Android. Note for reference: `updateReceiptv1` does not persist
  `receipt_forwarded`; the forward body is the only path that marks the source.
- Rows saved before 2026-10-13 may carry doubled apostrophes (`Lowe''s`) from the
  old escaping; a one-time `'' → '` migration on the text columns is still needed.
